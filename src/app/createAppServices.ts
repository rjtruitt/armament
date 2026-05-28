/**
 * Factory that wires all application services for ArmamentApp.
 * Extracts the ~180-line constructor wiring into a standalone function
 * so the app shell remains thin (import, configure, run).
 */
import { IReplConfig, IUsageStats, IMessage } from '../core/index.js';
import { DebugMode } from '../debug/index.js';
import { ProviderPool, ChannelAgent, AskUserHandler, CatalogManager } from '../providers/index.js';
import { ToolCatalog, getGitTools, getWebTools, getDataTools, getInfraTools, getMonitoringTools, getPentestTools } from 'iteratio-plugin-tools';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { DriftManager, resolveDriftConfig } from '../drift/index.js';
import { armaDataDir } from './ChannelPaths.js';

let _budgetWarned = false;
let _sessionStartCost = 0;
import { SessionPersistence } from '../session/index.js';
import { CompletionManager } from '../a2a/index.js';
import { PluginLoader } from '../plugins/index.js';
import { McpManager } from './McpManager.js';
import { ChannelLifecycle } from './ChannelLifecycle.js';
import { ThreadCoordinator } from '../threads/index.js';
import { StreamRouter } from './StreamRouter.js';
import { CommandDispatch } from './CommandDispatch.js';
import { FlowRuntime } from './FlowRuntime.js';
import { AgentServices } from './AgentServices.js';
import { SessionState } from './SessionState.js';
import { AuthManager } from './AuthManager.js';
import { McpIntegration } from './McpIntegration.js';
import { PluginIntegration } from './PluginIntegration.js';
import { BackgroundTasks } from './BackgroundTasks.js';
import { ContextManager } from './ContextManager.js';
import { getSessionCommands, getIrcCommands, getConfigCommands, getContextCommands, getFlowCommands, getSetrootCommand, getNudgeCommands, getGodModeCommand, getPromptCommand, getSpawnCommand, getHelpCommand, getRefreshCommand } from './commands/index.js';
import { buildThreadCallbacks } from './ThreadCallbackBuilder.js';

import type { TuiRenderer } from './TuiRenderer.js';
import type { AgentInfo } from './ChannelLifecycle.js';
import type { IAgentSpawnOptions } from '../core/index.js';

// ─── Host interface: the callbacks ArmamentApp provides ────────────────────
/** Interface for AppHost. */
export interface AppHost {
  readonly config: IReplConfig;
  getTui(): TuiRenderer | null;
  getActiveChannelName(): string | undefined;
  setActiveChannelName(name: string | undefined): void;
  getUsageStats(): IUsageStats;
  getMessages(): IMessage[];
  getActiveProvider(): string;
  getAvailableModels(): { provider: string; model: string; region?: string; profile?: string }[];
  joinChannel(name: string): void;
  resumeAgentTurn(channel: string): void;
  refreshProviderStats(): void;
  calculateCost(model: string, input: number, output: number, cacheRead?: number, cacheWrite?: number): number;
  spawnAgent(name: string, opts?: IAgentSpawnOptions): Promise<any>;
  getUserNick(): string;
  onPostStream?(agent: ChannelAgent, channel: string): void;
}

// ─── Return type ───────────────────────────────────────────────────────────
/** Interface for AppServices.
 * @property {CatalogManager} catalogManager - Description of catalogManager.
 * @property {DriftManager} driftManager - Description of driftManager.
 * @property {SessionPersistence} sessionPersistence - Description of sessionPersistence.
 * @property {CompletionManager} completionManager - Description of completionManager.
 * @property {PluginLoader} pluginLoader - Description of pluginLoader.
 * @property {ProviderPool} providerPool - Description of providerPool.
 * @property {McpManager} mcpManager - Description of mcpManager.
 * @property {ThreadCoordinator} threadCoordinator - Description of threadCoordinator.
 * @property ... and 12 more properties.
 */
export interface AppServices {
  catalogManager: CatalogManager;
  driftManager: DriftManager;
  sessionPersistence: SessionPersistence;
  completionManager: CompletionManager;
  pluginLoader: PluginLoader;
  providerPool: ProviderPool;
  mcpManager: McpManager;
  threadCoordinator: ThreadCoordinator | undefined;
  channelLifecycle: ChannelLifecycle;
  sessionState: SessionState;
  backgroundTasks: BackgroundTasks;
  contextManager: ContextManager;
  authManager: AuthManager;
  mcpIntegration: McpIntegration;
  pluginIntegration: PluginIntegration;
  streamRouter: StreamRouter;
  agentServices: AgentServices;
  flowRuntime: FlowRuntime;
  commandDispatch: CommandDispatch;
}

// ─── Factory ───────────────────────────────────────────────────────────────
/** Create app services.
 * @param {IReplConfig} config - Description of config.
 * @param {AppHost} host - Description of host.
 * @param {AskUserHandler} askUserHandler - Description of ask user handler.
 * @param {Map<string} pendingApprovals - Description of pending approvals.
 * @param {(r: string} resolve - Description of resolve.
 * @param {string; options?: string[]; source: string }>} question - Description of question.
 * @returns {AppServices} - Description of return value.
 */
export function createAppServices(
  config: IReplConfig,
  host: AppHost,
  askUserHandler: AskUserHandler,
  pendingApprovals: Map<string, { resolve: (r: string) => void; question: string; options?: string[]; source: string }>,
  inputQueue: (string | { text: string; channel: string })[],
  activeToolNames: { get(): string[]; set(v: string[]): void },
): AppServices {

  // ── Phase 1: standalone services ─────────────────────────────────────────
  const catalog = new ToolCatalog();
  catalog.registerAll([
    ...getGitTools(), ...getWebTools(), ...getDataTools(),
    ...getInfraTools(), ...getMonitoringTools(), ...getPentestTools(),
  ]);
  const catalogManager = new CatalogManager(catalog);

  const debug = DebugMode.instance();
  let driftManager: DriftManager;
  let sessionPersistence: SessionPersistence;
  let completionManager: CompletionManager;

  if (debug.isActive()) {
    driftManager = debug.getDriftManager() as any;
    sessionPersistence = debug.getSessionPersistence() as any;
    completionManager = debug.getCompletionManager() as any;
  } else {
    const driftConfig = resolveDriftConfig(config.drift);
    driftManager = new DriftManager(driftConfig, join(armaDataDir(), 'drift'));
    sessionPersistence = new SessionPersistence(config.sessionPersistence);
    completionManager = new CompletionManager(config.completion);
  }

  const pluginLoader = new PluginLoader();
  pluginLoader.loadAll();
  const providerPool = new ProviderPool();
  const sessionState = new SessionState({
    providers: config.providers.map(p => ({
      models: (p.models || []).map(m => ({
        name: typeof m === 'string' ? m : m.name,
        inputPrice: typeof m === 'string' ? undefined : m.inputPrice,
        outputPrice: typeof m === 'string' ? undefined : m.outputPrice,
        cacheReadMultiplier: typeof m === 'string' ? undefined : m.cacheReadMultiplier,
        cacheWriteMultiplier: typeof m === 'string' ? undefined : m.cacheWriteMultiplier,
      })),
    })),
  });
  const backgroundTasks = new BackgroundTasks();

  // ── Phase 2: services needing host callbacks ─────────────────────────────
  // Forward-declare to allow lazy references in callbacks
  let channelLifecycle: ChannelLifecycle;

  const mcpManager: McpManager = new McpManager({
    writeMessage: (type, sender, text, channel) => {
      const tui = host.getTui();
      if (tui) tui.writeMessage(type as any, sender, text, channel);
    },
    startThinking: (channel) => host.getTui()?.startThinking(channel),
    stopThinking: (channel?: string) => host.getTui()?.stopThinking(channel),
    rebuildMcpMenu: (names, configs) => host.getTui()?.rebuildMcpMenu(names, configs),
    getChannelAgents: () => channelLifecycle.getChannelAgents() as any,
  });

  let threadCoordinator: ThreadCoordinator | undefined;
  if ((config as any).session?.useThreads) {
    threadCoordinator = new ThreadCoordinator(buildThreadCallbacks({
      getTui: () => host.getTui(),
      getChannelAgents: () => channelLifecycle.getChannelAgents(),
      getMcpManager: () => mcpManager,
      getProviderPool: () => providerPool,
      getThreadCoordinator: () => threadCoordinator,
      getSessionState: () => sessionState,
      calculateCost: (model, input, output, cr, cw) => host.calculateCost(model, input, output, cr, cw),
      refreshProviderStats: () => host.refreshProviderStats(),
      getUsageStats: () => host.getUsageStats(),
      trackModelCost: (model, cost, input, output) => sessionState.trackModelCost(model, cost, input, output),
      persistChannelState: (channel) => channelLifecycle.persistChannelState(channel),
    }));
  }

  channelLifecycle = new ChannelLifecycle({
    config,
    providerPool,
    mcpManager,
    threadCoordinator,
    catalogManager,
    driftManager,
    sessionPersistence,
    askUserHandler,
    callbacks: {
      writeMessage: (type, sender, text, channel) => {
        const tui = host.getTui();
        if (tui) tui.writeMessage(type as any, sender, text, channel);
      },
      addChannel: (name) => host.getTui()?.addChannel(name),
      setActiveChannel: (name) => host.getTui()?.setActiveChannel(name),
      removeChannel: (name) => host.getTui()?.removeChannel(name),
      removeAgent: (name) => host.getTui()?.removeAgent(name),
      startThinking: (channel) => host.getTui()?.startThinking(channel),
      stopThinking: (channel: string) => host.getTui()?.stopThinking(channel),
      updateAgentStatus: (channel, status) => host.getTui()?.updateAgentStatus(channel, status),
      addChannelChild: (channel, child) => host.getTui()?.addChannelChild(channel, child as any),
      updateChannelChild: (channel, childId, update) => host.getTui()?.updateChannelChild(channel, childId, update as any),
      removeChannelChild: (channel, childId) => host.getTui()?.removeChannelChild(channel, childId),
      writeToolBlock: (toolName, argsStr, result, durationMs, channel) =>
        host.getTui()?.writeToolBlock(toolName, argsStr, result, durationMs, channel),
      getChannelMessages: (channel) => host.getTui()?.getChannelMessages(channel) ?? [],
      resumeAgent: (channel) => host.resumeAgentTurn(channel),
      trimChannelBuffer: (channel, summary, keepCount) => host.getTui()?.trimChannelBuffer(channel, summary, keepCount),
    },
    calculateCost: (model, input, output) => host.calculateCost(model, input, output),
    getUsageStats: () => ({ ...host.getUsageStats(), maxBudget: config.maxBudget }),
    updateUsageStats: (input, output, total, cost) => {
      const stats = host.getUsageStats();
      // Capture starting cost on first call to detect cross-session accumulation
      if (_sessionStartCost === 0) _sessionStartCost = stats.estimatedCost;
      stats.inputTokens += input;
      stats.outputTokens += output;
      stats.totalTokens += total;
      stats.estimatedCost += cost;
      const maxBud = config.maxBudget ?? 10;
      host.getTui()?.updateStatus({
        cost: { current: stats.estimatedCost, budget: maxBud },
      });
      // Budget warning — fires once per session when this *session's* cost exceeds budget
      const sessionCost = stats.estimatedCost - _sessionStartCost;
      if (maxBud > 0 && sessionCost >= maxBud) {
        if (!_budgetWarned) {
          _budgetWarned = true;
          const ch = host.getTui()?.getActiveChannel?.() ?? '#control';
          host.getTui()?.writeMessage?.('system', 'warn', `⚠ Budget exceeded: ${sessionCost.toFixed(2)} this session > ${maxBud.toFixed(2)}. Use /session to review.`, ch);
        }
      }
    },
    refreshProviderStats: () => host.refreshProviderStats(),
    getActiveToolNames: () => activeToolNames.get(),
    setActiveToolNames: (names) => { activeToolNames.set(names); },
    trackModelCost: (model, cost, input, output) => sessionState.trackModelCost(model, cost, input, output),
  });

  const contextManager = new ContextManager({
    getTui: () => host.getTui(),
    getSessionState: () => sessionState,
    getSessionPersistence: () => sessionPersistence,
    getCatalogManager: () => catalogManager,
    getChannelAgents: () => channelLifecycle.getChannelAgents(),
    getAgentManagerInternal: () => channelLifecycle.getAgents(),
    getActiveChannel: () => host.getActiveChannelName(),
    getActiveToolNames: () => activeToolNames.get(),
    setActiveToolNames: (names) => { activeToolNames.set(names); },
    getConfig: () => config,
    getMessages: () => host.getMessages(),
    getUsageStats: () => host.getUsageStats(),
    getTurnCount: () => sessionState.turnCount,
    getChannelManagerInternal: () => channelLifecycle.getChannels(),
    spawnAgent: (name, opts?) => host.spawnAgent(name, opts),
  });

  const authManager = new AuthManager({
    providerPool,
    getTui: () => host.getTui(),
    askUserHandler,
    getActiveProvider: () => host.getActiveProvider(),
  });

  const mcpIntegration = new McpIntegration({
    mcpManager,
    getTui: () => host.getTui(),
    getConfig: () => config,
    getActiveProvider: () => host.getActiveProvider(),
  });

  const pluginIntegration = new PluginIntegration({
    pluginLoader,
    getTui: () => host.getTui(),
    getChannelAgents: () => channelLifecycle.getChannelAgents(),
    joinChannel: (name) => host.joinChannel(name),
  });

  const streamRouter = new StreamRouter({
    getTui: () => host.getTui(),
    getUserNick: () => host.getUserNick(),
    getInputQueue: () => inputQueue,
    onPostStream: (agent: ChannelAgent, channel: string) => {
      host.refreshProviderStats();
      if (host.onPostStream) host.onPostStream(agent, channel);
      channelLifecycle.persistChannelState(channel);
    },
  });

  const agentServices = new AgentServices({
    tui: host.getTui(),
    channelLifecycle,
    channelAgents: channelLifecycle.getChannelAgents(),
    channelReadyPromises: channelLifecycle.getChannelReadyPromises(),
    streamRouter,
    getUserNick: () => host.getUserNick(),
  });

  const flowRuntime = new FlowRuntime({
    getTui: () => host.getTui(),
    channelLifecycle,
    channelAgents: channelLifecycle.getChannelAgents(),
    channelReadyPromises: channelLifecycle.getChannelReadyPromises(),
    streamRouter,
    pendingApprovals,
    joinChannel: (name) => host.joinChannel(name),
    getActiveChannel: () => host.getActiveChannelName(),
    setActiveChannel: (name) => { host.setActiveChannelName(name); },
    getUserNick: () => host.getUserNick(),
  });

  const commandDispatch = new CommandDispatch();
  commandDispatch.registerAll(getSessionCommands());
  commandDispatch.registerAll(getIrcCommands());
  commandDispatch.registerAll(getConfigCommands());
  commandDispatch.registerAll(getContextCommands());
  commandDispatch.registerAll(getFlowCommands(flowRuntime));
  commandDispatch.registerAll(getSetrootCommand(driftManager));
  commandDispatch.registerAll(getNudgeCommands());
  commandDispatch.registerAll(getPromptCommand());
  commandDispatch.registerAll(getSpawnCommand());
  commandDispatch.registerAll(getGodModeCommand());
  commandDispatch.registerAll(getHelpCommand(commandDispatch));
  commandDispatch.registerAll(getRefreshCommand());

  return {
    catalogManager, driftManager, sessionPersistence, completionManager,
    pluginLoader, providerPool, mcpManager, threadCoordinator,
    channelLifecycle, sessionState, backgroundTasks, contextManager,
    authManager, mcpIntegration, pluginIntegration, streamRouter,
    agentServices, flowRuntime, commandDispatch,
  };
}
