import * as readline from 'node:readline';
import { ReplPublicAPI } from './ReplPublicAPI.js';
import { IReplConfig, IAgentInstance, IAgentSpawnOptions, IUsageStats, IContextUsage, IMessage } from '../core/index.js';
import { TuiRenderer as TuiMode } from './TuiRenderer.js';
import { ChannelAgent, AskUserHandler, AskInputType, abortBashProcess } from '../providers/index.js';
import { dirname } from 'node:path';
import { getPermissionStore } from './PermissionStore.js';
import { getGlobalEventBus } from './EventBus.js';
import { McpServer } from './McpManager.js';
import { ChannelInfo, AgentInfo } from './ChannelLifecycle.js';
import { StreamRouter } from './StreamRouter.js';
import { FlowRuntime } from './FlowRuntime.js';
import { AgentServices } from './AgentServices.js';
import { buildTuiOptions, configureTuiPostCreate, restoreSession } from './TuiWiring.js';
import { printWelcome } from './ReplStartup.js';
import { resumeAgentTurn as doResumeAgentTurn } from './ThreadCallbackBuilder.js';
import { createAppServices, type AppServices } from './createAppServices.js';
import { buildCommandContext, type CommandContextHost } from './CommandContextBuilder.js';
import {
  processSlashCommand, handleApprovalResponse, resolveChannelApproval,
  tryQueueMessage, type QueuedMessage,
} from './InputProcessor.js';
import {
  refreshProviderStats as doRefreshProviderStats,
  checkCacheEfficiency as doCheckCacheEfficiency,
  buildExitSummary as doBuildExitSummary,
  getChannelStatus,
} from './AppMonitoring.js';
import type { ChannelStatus } from './TuiTypes.js';
import { handleUserMessage as doHandleUserMessage } from './MessageHandler.js';

/**
 * Armament app class.
 */
export class ArmamentApp extends ReplPublicAPI {
  private rl: readline.Interface | null = null;
  private _pendingApprovals: Map<string, { resolve: (response: string) => void; question: string; options?: string[]; source: string }> = new Map();
  private _askUserHandler: AskUserHandler = this.createAskUserHandler();
  private _activeToolNames: string[] = [];
  private _inputQueue: (string | { text: string; channel: string })[] = [];
  /** Per-channel processing state — allows multiple channels to be active simultaneously. */
  private _channelStates = new Map<string, { processing: boolean; interrupted: boolean; interruptCount: number }>();
  /** Per-channel sticky notes. */
  private _channelStickies = new Map<string, Array<{ id: number; text: string; position: 'top' | 'bottom' | 'both' }>>();
  private _channelStickyId = new Map<string, number>();
  private _streamRouter!: StreamRouter;
  private _flowRuntime!: FlowRuntime;
  private _agentServices!: AgentServices;

  private getChannelState(channel: string): { processing: boolean; interrupted: boolean; interruptCount: number } {
    let state = this._channelStates.get(channel);
    if (!state) {
      state = { processing: false, interrupted: false, interruptCount: 0 };
      this._channelStates.set(channel, state);
    }
    return state;
  }

  private getChannelProcessing(channel?: string): boolean {
    if (!channel) return false;
    return this.getChannelState(channel).processing;
  }

  // ─── Abstract accessor implementations (for ReplPublicAPI) ────────────────
  protected get usageStats(): IUsageStats { return this._sessionState.usageStats; }
  protected get contextUsage(): IContextUsage { return this._sessionState.contextUsage; }
  protected get messages(): IMessage[] { return this._sessionState.messages; }
  protected get turnCount(): number { return this._sessionState.turnCount; }
  protected set turnCount(n: number) { this._sessionState.turnCount = n; }
  protected get memories() { return this._sessionState.memories; }

  protected get channelManagerInternal(): ChannelInfo[] { return this._channelLifecycle.getChannels(); }
  protected get agentManagerInternal(): AgentInfo[] { return this._channelLifecycle.getAgents(); }
  private get _channelAgents(): Map<string, ChannelAgent> { return this._channelLifecycle.getChannelAgents(); }
  private get _channelReadyPromises(): Map<string, Promise<void>> { return this._channelLifecycle.getChannelReadyPromises(); }
  protected get mcpServers(): Map<string, McpServer> { return this._mcpManager.getServers(); }

  private _channelLifecycle!: import('./ChannelLifecycle.js').ChannelLifecycle;
  private _mcpManager!: import('./McpManager.js').McpManager;
  private _services!: AppServices;

  /**
   * Creates a fully-wired ArmamentApp instance.
   * @param config - Partial config; missing values use defaults.
   */
  constructor(config: Partial<IReplConfig> = {}) {
    super(config);

    const services = createAppServices(
      this.config,
      {
        config: this.config,
        getTui: () => this.tuiMode,
        getActiveChannelName: () => this.activeChannelName,
        setActiveChannelName: (name) => { this.activeChannelName = name; },
        getUsageStats: () => this.usageStats,
        getMessages: () => this.messages,
        getActiveProvider: () => this.getActiveProvider(),
        getAvailableModels: () => this.getAvailableModels(),
        joinChannel: (name) => this.joinChannel(name),
        resumeAgentTurn: (channel) => this.resumeAgentTurn(channel),
        refreshProviderStats: () => this.refreshProviderStats(),
        calculateCost: (model, i, o, cr, cw) => this.calculateCost(model, i, o, cr, cw),
        spawnAgent: (name, opts?) => this.spawnAgent(name, opts),
        getUserNick: () => this.getUserNick(),
        onPostStream: (agent, channel) => this.checkCacheEfficiency(agent, channel),
      },
      this._askUserHandler,
      this._pendingApprovals,
      this._inputQueue,
      { get: () => this._activeToolNames, set: (v) => { this._activeToolNames = v; } },
    );

    this._services = services;
    this._providerPool = services.providerPool;
    this._pluginLoader = services.pluginLoader;
    this._mcpManager = services.mcpManager;
    this._threadCoordinator = services.threadCoordinator;
    this._channelLifecycle = services.channelLifecycle;
    this._sessionState = services.sessionState;
    this._backgroundTasks = services.backgroundTasks;
    this._contextManager = services.contextManager;
    this._authManager = services.authManager;
    this._mcpIntegration = services.mcpIntegration;
    this._pluginIntegration = services.pluginIntegration;
    this._streamRouter = services.streamRouter;
    this._agentServices = services.agentServices;
    this._flowRuntime = services.flowRuntime;
    this._commandDispatch = services.commandDispatch;

    if (this.config.systemPrompt) {
      this.messages.push({
        id: `msg-sys-0`, role: 'system',
        content: this.config.systemPrompt, timestamp: Date.now(),
      });
    }
  }


  /**
   * Register an event handler for a named event.
   * @param event - Event name to listen for.
   * @param handler - Callback invoked when the event fires.
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []);
    this.eventHandlers.get(event)!.push(handler);
  }

  protected emitEvent(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) for (const handler of handlers) handler(...args);
  }


  private _closePromise: Promise<void> | null = null;
  private _resolveClose: (() => void) | null = null;

  /**
   * Start.
   */
  async start(): Promise<void> {
    this.running = true;
    const isTTY = process.stdout?.isTTY ?? false;
    const useTui = isTTY && !this.config.noTui;

    await printWelcome({
      config: this.config,
      mcpIntegration: this._mcpIntegration,
      catalogManager: this._services.catalogManager,
      getMcpServers: () => this.mcpServers,
      driftManager: this._services.driftManager,
      // Globally injected by web UI wrapper
      webUrl: (globalThis as unknown as Record<string, string | undefined>).__armamentWebUrl,
    });

    if (useTui) {
      this._startTui();
      // Wire PermissionStore to TUI approval widget
      getPermissionStore().onNewRequest(() => {
        const pending = getPermissionStore().listPending();
        for (const req of pending) {
          const toolName = req.tool.replace(/_/g, ' ');
          this.tuiMode?.pushApproval({
            id: req.id, source: req.channel,
            question: `${toolName} wants to access:\n${req.path}`,
            options: ['Deny', 'Allow once', 'Allow and remember folder'],
            inputType: 'radio', timestamp: new Date(),
          });
        }
      });
      // Wire approval responses back to store (once)
      this.tuiMode?.getApprovalWidget()?.onResolve?.((id: string, response: string) => {
        if (response === 'Deny') {
          getPermissionStore().deny(id);
        } else if (response === 'Allow and remember folder') {
          // Look up request BEFORE approving (approve removes it from pending)
          const reqs = getPermissionStore().listPending();
          const req = reqs.find(r => r.id === id);
          getPermissionStore().approve(id);
          if (req) {
            const parent = dirname(req.path);
            getPermissionStore().rememberPath(req.channel, parent);
          }
        } else if (response === 'Allow once') {
          getPermissionStore().approveOnce(id);
        }
      });
    } else {
      this._startReadline();
    }
  }

  private _startTui(): void {
    const wiringDeps = this._buildTuiWiringDeps();
    const opts = buildTuiOptions(wiringDeps);
    this.tuiMode = new TuiMode(opts);
    wiringDeps._tuiRef = this.tuiMode;
    this.tuiMode.start();
    configureTuiPostCreate(this.tuiMode, wiringDeps);
    restoreSession(this.tuiMode, wiringDeps).catch(() => {});
    // Initial provider stats refresh — models show in sidebar immediately
    this.refreshProviderStats();
    this._closePromise = new Promise<void>((resolve) => { this._resolveClose = resolve; });
  }

  private _buildTuiWiringDeps(): import('./TuiWiring.js').TuiWiringDeps {
    return {
      config: this.config,
      mcpIntegration: this._mcpIntegration,
      providerPool: this._providerPool,
      sessionPersistence: this._services.sessionPersistence,
      sessionState: this._sessionState,
      catalogManager: this._services.catalogManager,
      driftManager: this._services.driftManager,
      askUserHandler: this._askUserHandler,
      getMcpServers: () => this.mcpServers,
      getChannelManagerInternal: () => this.channelManagerInternal,
      getActiveToolNames: () => this._activeToolNames,
      setActiveToolNames: (names) => { this._activeToolNames = names; },
      setActiveChannel: (name) => { this.activeChannelName = name; },
      getActiveChannel: () => this.activeChannelName,
      getChannelAgent: (channel: string) => this._channelLifecycle?.getChannelAgents().get(channel),
      resumeChannel: (entry, state) => this._resumeChannel(entry, state),
      handleInput: (text) => this.handleInput(text),
      stop: () => this.stop(),
      interrupt: () => this.interrupt(),
      isProcessing: () => this.getChannelProcessing(this.activeChannelName),
      formatPrompt: () => this.formatPrompt(),
      getAvailableModels: () => this.getAvailableModels(),
      switchChannelModel: (ch, model, provider?) => this.switchChannelModel(ch, model, provider),
      joinChannel: (name) => this.joinChannel(name),
      getChannelStatus: (channel) => this._getChannelStatus(channel),
      getCommandDispatch: () => this._commandDispatch,
      buildCommandContext: () => this._buildCommandContext(),
    };
  }

  private _startReadline(): void {
    this.rl = readline.createInterface({
      input: process.stdin, output: process.stdout, prompt: this.formatPrompt(),
    });
    this.rl.prompt();
    this.rl.on('line', (line) => this.onLine(line));
    this._closePromise = new Promise<void>((resolve) => {
      this._resolveClose = resolve;
      this.rl!.on('close', () => { this.onClose(); resolve(); });
    });
  }

  /**
   * Wait for close.
   */
  waitForClose(): Promise<void> { return this._closePromise ?? Promise.resolve(); }

  /**
   * Stop.
   */
  stop(): void {
    this.running = false;
    this._threadCoordinator?.shutdownAll().catch(() => {});

    if (!this._sessionCleared) {
      for (const ch of this.channelManagerInternal) this._persistChannelState(ch.name);
      this._services.sessionPersistence.saveManifest({
        version: 1, savedAt: new Date().toISOString(), workspace: process.cwd(),
        activeChannel: this.activeChannelName,
        channels: this.channelManagerInternal.map(ch => ({
          name: ch.name, stateFile: `channels/${ch.name.replace(/^#/, '')}.state.json`,
          status: 'suspended' as const,
          model: this._channelAgents.get(ch.name)?.model || '',
          provider: this._channelAgents.get(ch.name)?.providerType || '',
          turnCount: this._channelAgents.get(ch.name)?.turnCount || 0,
          lastActivity: Date.now(),
        })),
        globalConfig: {
          mcpServers: [...this.mcpServers.entries()].map(([name, s]) => ({ name, config: s.config })),
        },
        stickyNotes: Object.fromEntries(
          [...this._channelStickies.entries()].map(([ch, notes]) =>
            [ch, notes.map(n => `${n.id}:${n.position}:${n.text}`)]
          )
        ),
        activeTools: this._activeToolNames,
      }).catch(() => {});
    }

    this._services.completionManager.shutdown();
    this._services.sessionPersistence.shutdown();

    const summary = this.buildExitSummary();
    if (this.tuiMode) { this.tuiMode.stop(); this.tuiMode = null; }
    if (summary) process.stdout.write(summary + '\n');
    this.rl?.close();
    if (this._resolveClose) { this._resolveClose(); this._resolveClose = null; }
  }


  /** Handle Ctrl+C interrupt. Stops the current agent turn cleanly. */
  interrupt(): void {
    const ch = this.activeChannelName;
    // Always set singleton flags (needed by tests and wasInterrupted())
    this.interrupted = true;
    this.interruptCount++;
    this.emitEvent('interrupt', {});
    if (!ch) {
      // No active channel — use singleton counters for double-escape
      if (this.interruptCount >= 2 && !this.processing) this.running = false;
      return;
    }
    const state = this.getChannelState(ch);
    state.interrupted = true;
    state.interruptCount++;
    // Kill everything mid-flight
    if (this._threadCoordinator) this._threadCoordinator.interrupt(ch);
    abortBashProcess(ch);
    this._channelAgents.get(ch)?.interrupt();
    this.tuiMode?.stopThinking(ch);
    this.tuiMode?.writeMessage('system', '*', '── interrupted ──', ch);
    // Double-escape exits
    if (state.interruptCount >= 2 && !state.processing) {
      this.running = false;
    }
  }

  /** Entry point: user typed a message. Queues if busy, processes immediately if idle. */
  async handleInput(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/')) {
      const handled = processSlashCommand(trimmed, this._inputProcessorDeps());
      if (handled) return;
      this.tuiMode?.writeMessage('system', '*', `Unknown command: ${trimmed.split(/\s+/)[0]}`, this.activeChannelName ?? '#control');
      return;
    }

    const channel = this.tuiMode?.getActiveChannel() ?? '#general';

    // If this channel is already processing, queue and return
    if (tryQueueMessage(trimmed, channel, this._inputProcessorDeps())) return;

    // Process now, then drain any queued messages for this channel
    await this._processMessage(trimmed, channel);
    await this._drainChannelQueue(channel);
  }

  /** Process exactly one message. Called by handleInput and _drainChannelQueue. */
  private async _processMessage(text: string, channel: string): Promise<void> {
    const state = this._beginProcessing(channel);
    try {
      if (channel === '#approvals' && this._pendingApprovals.size > 0) {
        handleApprovalResponse(text, this._inputProcessorDeps());
        return;
      }
      resolveChannelApproval(text, channel, this._inputProcessorDeps());
      if (this.tuiMode) this.tuiMode.writeMessage('user', this.getUserNick(), text, channel);
      const response = await this.handleUserMessage(text);
      if (response) {
        if (this.tuiMode) this.tuiMode.writeMessage('agent', this.getAgentNick(), response, channel);
        else process.stdout.write(response + '\n');
      }
    } finally {
      this._endProcessing(channel, state);
    }
  }

  /** Drain all queued messages for the given channel. Runs sequentially. */
  private async _drainChannelQueue(channel: string): Promise<void> {
    const queue = this._inputQueue;
    const remaining: (string | { text: string; channel: string })[] = [];
    while (queue.length > 0) {
      const entry = queue.shift()!;
      const text = typeof entry === 'string' ? entry : (entry as { text: string; channel: string }).text;
      const entryChannel = typeof entry === 'string' ? undefined : (entry as { text: string; channel: string }).channel;
      if (entryChannel !== undefined && entryChannel !== channel) {
        remaining.push(entry);
      } else {
        await this._processMessage(text, entryChannel ?? channel);
      }
    }
    for (const entry of remaining) queue.push(entry);
  }

  /** Begin processing: set flags, reset interrupt state. */
  private _beginProcessing(channel: string): { processing: boolean; interrupted: boolean; interruptCount: number } {
    const state = this.getChannelState(channel);
    state.processing = true;
    state.interrupted = false;
    state.interruptCount = 0;
    this.interrupted = false;
    return state;
  }

  /** End processing: cleanup flags, stop thinking, abort bash, flush staging. */
  private _endProcessing(channel: string, state: { processing: boolean; interrupted: boolean; interruptCount: number }): void {
    state.processing = false;
    this.tuiMode?.stopThinking(channel);
    abortBashProcess(channel);
    if (state.interrupted) {
      this.tuiMode?.flushStaging(channel);
      state.interrupted = false;
    } else if (this.tuiMode?.hasStaging(channel)) {
      this.tuiMode.flushStaging(channel);
    }
  }

  // ─── Per-channel sticky notes ─────────────────────────────────────────────

  private _getChannelStickies(channel: string): Array<{ id: number; text: string; position: 'top' | 'bottom' | 'both' }> {
    let stickies = this._channelStickies.get(channel);
    if (!stickies) {
      stickies = [];
      this._channelStickies.set(channel, stickies);
    }
    return stickies;
  }

  private _nextStickyId(channel: string): number {
    const id = (this._channelStickyId.get(channel) ?? 0) + 1;
    this._channelStickyId.set(channel, id);
    return id;
  }

  /** Override: add sticky note for the current channel. */
  override addStickyNote(content: string): void {
    const channel = this.activeChannelName || '#general';
    const stickies = this._getChannelStickies(channel);
    const note = { id: this._nextStickyId(channel), text: content, position: 'top' as const };
    stickies.push(note);
    this.tuiMode?.writeMessage('system', 'info', `📝 Sticky #${note.id}: "${content}"`, channel);
  }

  /** Override: remove sticky note from the current channel. */
  override removeStickyNote(idOrIndex: string | number): void {
    const channel = this.activeChannelName || '#general';
    const stickies = this._getChannelStickies(channel);
    let removed = false;
    let target = '';
    if (typeof idOrIndex === 'string') {
      const id = parseInt(idOrIndex, 10);
      if (!isNaN(id)) {
        const idx = stickies.findIndex(n => n.id === id);
        if (idx !== -1) { target = `#${id}`; stickies.splice(idx, 1); removed = true; }
      }
    } else if (typeof idOrIndex === 'number' && idOrIndex < stickies.length) {
      target = `#${stickies[idOrIndex].id}`;
      stickies.splice(idOrIndex, 1);
      removed = true;
    }
    if (removed) {
      this.tuiMode?.writeMessage('system', 'info', `🗑 Removed sticky ${target}`, channel);
    } else {
      this.tuiMode?.writeMessage('system', 'error', `Sticky ${target || `#${idOrIndex}`} not found — use /stickies to see IDs`, channel);
    }
  }

  /** Override: list sticky notes for the current channel. */
  override listStickyNotes(): void {
    const channel = this.activeChannelName || '#general';
    const stickies = this._getChannelStickies(channel);
    if (stickies.length === 0) {
      this.tuiMode?.writeMessage('system', 'info', 'No sticky notes set.', channel);
      return;
    }
    this.tuiMode?.writeMessage('system', 'info', `📌 Sticky notes (${stickies.length}):`, channel);
    for (const n of stickies) {
      this.tuiMode?.writeMessage('system', 'info', `  #${n.id}: ${n.text}`, channel);
    }
  }

  /** Build sticky injection for a specific channel. */
  buildStickyInjectionForChannel(channel: string): string {
    const stickies = this._getChannelStickies(channel);
    if (stickies.length === 0) return '';
    const top: string[] = [];
    const bottom: string[] = [];
    for (const n of stickies) {
      if (n.position === 'top' || n.position === 'both') top.push(`- ${n.text}`);
      if (n.position === 'bottom' || n.position === 'both') bottom.push(`- ${n.text}`);
    }
    const parts: string[] = [];
    if (top.length > 0) parts.push(`[Persistent reminders — appended to every message you receive]\n${top.join('\n')}\n[End reminders]`);
    if (bottom.length > 0) parts.push(`[Persistent reminders — appended to every message you receive]\n${bottom.join('\n')}\n[End reminders]`);
    return parts.join('\n\n');
  }

  /** Build sticky injection for the current channel. */
  buildStickyInjection(): string {
    return this.buildStickyInjectionForChannel(this.activeChannelName || '#general');
  }


  // ─── Delegates ────────────────────────────────────────────────────────────

  private output(text: string): void {
    if (this.tuiMode) {
      const ch = this.activeChannelName ?? '#control';
      if (ch === '#control') {
        this.tuiMode.writeMessage('system', '*', text, '#logs');
        this.tuiMode.setActiveChannel('#logs');
      } else {
        this.tuiMode.writeMessage('system', '*', text, ch);
      }
    } else {
      process.stdout.write(text + '\n');
    }
  }

  private getUserNick(): string { return process.env.USER ?? 'you'; }

  private getAgentNick(): string {
    const channel = this.activeChannelName ?? '#control';
    if (channel.startsWith('#')) return channel.slice(1);
    return channel;
  }

  /**
   * Join channel.
   */
  joinChannel(name: string): void {
    this.activeChannelName = this._channelLifecycle.joinChannel(name, this.activeChannelName);
  }

  /**
   * Leave channel.
   */
  leaveChannel(name: string): void {
    this.activeChannelName = this._channelLifecycle.leaveChannel(name);
  }

  /**
   * Part channel.
   */
  partChannel(name: string): void { this.leaveChannel(name); }

  /**
   * Spawn agent.
   */
  async spawnAgent(name: string, opts?: IAgentSpawnOptions): Promise<IAgentInstance> {
    if (!name || name.length === 0) throw new Error('Agent name cannot be empty');
    if (this.agentManagerInternal.find(a => a.name === name)) throw new Error(`Agent "${name}" already exists`);

    const id = `agent-${this._backgroundTasks.incrementCounter()}-${Date.now()}`;
    const agent: AgentInfo = {
      id, name, model: opts?.model ?? this.getCurrentModel(),
      provider: opts?.provider ?? this.getActiveProvider(), systemPrompt: opts?.systemPrompt,
      status: 'running', turnCount: 0, tokenUsage: 0, cost: 0,
    };
    this.agentManagerInternal.push(agent);

    const channelName = name.startsWith('#') ? name : `#${name}`;
    if (!this.channelManagerInternal.find(c => c.name === channelName)) {
      this.channelManagerInternal.push({ name: channelName, agentId: id, active: false });
    }

    return {
      id: agent.id, name: agent.name, channelId: `chan-${id}`,
      model: agent.model, provider: agent.provider, systemPrompt: agent.systemPrompt,
      status: 'running' as any, turnCount: 0, tokenUsage: 0, cost: 0,
      createdAt: Date.now(), lastActivity: Date.now(), childIds: [],
    };
  }

  /**
   * Switch channel model.
   */
  async switchChannelModel(channelName: string, newModel: string, newProvider?: string): Promise<void> {
    return this._channelLifecycle.switchChannelModel(channelName, newModel, newProvider);
  }

  /**
   * Msg agent.
   */
  async msgAgent(name: string, message: string): Promise<void> {
    if (!message || message.length === 0) throw new Error('Message cannot be empty');
    const agent = this.agentManagerInternal.find(a => a.name === name);
    if (!agent) throw new Error(`Agent "${name}" not found`);
    agent.turnCount++;
    agent.tokenUsage += message.length;

    const chName = name.startsWith('#') ? name : `#${name}`;
    const channelAgent = this._channelAgents.get(chName);
    if (channelAgent) {
      this.tuiMode?.writeMessage('user', this.getUserNick(), message, chName);
      if (channelAgent.status === 'idle') {
        channelAgent.sendMessage(message).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.tuiMode?.writeMessage('system', 'err', `Agent error: ${msg}`, chName);
        });
      } else {
        channelAgent.injectMessage(message);
      }
    }
  }


  // ─── Private helpers ───────────────────────────────────────────────────────

  private calculateCost(model: string, inputTokens: number, outputTokens: number, cacheRead = 0, cacheWrite = 0): number {
    return this._sessionState.calculateCost(model, inputTokens, outputTokens, cacheRead, cacheWrite);
  }

  private _persistChannelState(channelName: string): void { this._channelLifecycle.persistChannelState(channelName, true); }

  private async _resumeChannel(
    entry: import('../session/interfaces/ISessionPersistence.js').IChannelManifestEntry,
    state: import('../session/interfaces/ISessionPersistence.js').IChannelStateFile
  ): Promise<void> {
    await this._channelLifecycle.resumeChannel(entry, state, this.activeChannelName);
  }

  private _inputProcessorDeps() {
    return {
      getTui: () => this.tuiMode,
      getActiveChannelName: () => this.activeChannelName,
      getUserNick: () => this.getUserNick(),
      getAgentNick: () => this.getAgentNick(),
      getCommandDispatch: () => this._commandDispatch,
      getPluginLoader: () => this._pluginLoader,
      buildCommandContext: () => this._buildCommandContext(),
      getPendingApprovals: () => this._pendingApprovals,
      getInputQueue: () => this._inputQueue,
      isProcessingInput: (channel: string) => this.getChannelProcessing(channel),
      setProcessingInput: (channel: string, state: boolean) => { this.getChannelState(channel).processing = state; },
      getInterrupted: (channel: string) => this.getChannelState(channel).interrupted,
      setInterrupted: (channel: string, state: boolean) => { this.getChannelState(channel).interrupted = state; },
      setInterruptCount: (channel: string, count: number) => { this.getChannelState(channel).interruptCount = count; },
      handleUserMessage: (input: string) => this.handleUserMessage(input),
      injectPluginContext: (cmd: string, content: string, args: string[]) => this._pluginIntegration.injectPluginContext(cmd, content, args),
      stop: () => this.stop(),
      clearSession: () => this.clearSession(),
      output: (text: string) => this.output(text),
    };
  }

  private createAskUserHandler(): AskUserHandler {
    let approvalCounter = 0;
    return {
      ask: (question: string, options?: string[], sourceChannel?: string, inputType?: AskInputType): Promise<string> => {
        return new Promise<string>((resolve) => {
          const id = `approval-${++approvalCounter}-${Date.now()}`;
          const source = sourceChannel ?? '#unknown';
          this._pendingApprovals.set(id, { resolve, question, options, source });
          const resolvedType = inputType ?? (options && options.length > 0 ? 'radio' : 'freeform');
          this.tuiMode?.pushApproval({ id, source, question, options, inputType: resolvedType, timestamp: new Date() });
          getGlobalEventBus().emit({ type: 'ask_user', id, channel: source, question, options, inputType: resolvedType });
          this.tuiMode?.getApprovalWidget().onResolve((resolvedId, response) => {
            const pending = this._pendingApprovals.get(resolvedId);
            if (pending) {
              this._pendingApprovals.delete(resolvedId);
              this.tuiMode?.writeMessage('system', '*', `✓ ${pending.source}: "${response}"`, '#approvals');
              this.tuiMode?.writeMessage('system', '*', `Approval from ${pending.source} resolved: "${response}"`, '#control');
              pending.resolve(response);
            }
          });
          this.tuiMode?.writeMessage('system', '*', `Approval needed: ${question}`, source);
          if (source !== '#control') {
            this.tuiMode?.writeMessage('system', '*', `Approval needed from ${source}: ${question}`, '#control');
          }
        });
      },
    };
  }

  protected _buildCommandContext() {
    const host: CommandContextHost = {
      getTui: () => this.tuiMode,
      getActiveChannel: () => this.activeChannelName,
      getChannelLifecycle: () => this._channelLifecycle,
      getChannelAgents: () => this._channelAgents,
      getStreamRouter: () => this._streamRouter,
      getSessionState: () => this._sessionState,
      getProviderPool: () => this._providerPool,
      getMcpManager: () => this._mcpManager,
      getCatalogManager: () => this._services.catalogManager,
      getPluginLoader: () => this._pluginLoader,
      getConfig: () => this.config,
      getMcpServers: () => this.mcpServers,
      getMessages: () => this.messages,
      getUsageStats: () => this.usageStats,
      getContextUsage: () => this.contextUsage,
      getTurnCount: () => this.turnCount,
      setTurnCount: (n) => { this.turnCount = n; },
      setActiveChannel: (name) => { this.activeChannelName = name; },
      joinChannel: (name) => this.joinChannel(name),
      leaveChannel: (name) => this.leaveChannel(name),
      spawnAgent: (name, opts?) => this.spawnAgent(name, opts),
      switchChannelModel: (ch, model, provider?) => this.switchChannelModel(ch, model, provider),
      getAvailableModels: () => this.getAvailableModels(),
      getUserNick: () => this.getUserNick(),
      stop: () => this.stop(),
      getCurrentModel: () => this.getCurrentModel(),
      getActiveProvider: () => this.getActiveProvider(),
      getEnabledTools: () => this.getEnabledTools(),
      clearSession: () => this.clearSession(),
      saveContext: (title?, description?) => this.saveContext(title, description),
      loadContext: (nameOrFile) => this.loadContext(nameOrFile),
      showContextPicker: () => this.showContextPicker(),
      addStickyNote: (content) => this.addStickyNote(content),
      removeStickyNote: (index) => this.removeStickyNote(index),
      listStickyNotes: () => this.listStickyNotes(),
      killAgent: (name) => this.killAgent(name),
      switchChannel: (nameOrIndex) => this.switchChannel(nameOrIndex),
      msgAgent: (name, message) => { this.msgAgent(name, message); },
      whoIs: (name) => this.whoIs(name),
      listChannels: () => this.listChannels(),
      formatMcpStatus: (args) => this.formatMcpStatus(args),
      formatProvidersStatus: () => this.formatProvidersStatus(),
      handlePluginCommand: (args) => { this.handlePluginCommand(args); },
      injectPluginContext: (commandName, content, args) => this.injectPluginContext(commandName, content, args),
      connectMcp: (name, config) => this.connectMcp(name, config),
      submitMessage: (content, channel) => { if (channel) return this._processMessage(content, channel); return Promise.resolve(); },
    };
    return buildCommandContext(host);
  }

  private _getChannelStatus(channel: string): ChannelStatus | null {
    return getChannelStatus(channel, this._monitoringDeps());
  }

  private _cacheWarningShown = new Set<string>();

  private checkCacheEfficiency(agent: ChannelAgent, channel: string): void {
    doCheckCacheEfficiency(agent, channel, this._monitoringDeps(), this._cacheWarningShown, this._askUserHandler);
  }

  private resumeAgentTurn(channel: string): void {
    if (this.getChannelProcessing(channel)) return;
    doResumeAgentTurn(channel, {
      getTui: () => this.tuiMode,
      getChannelAgents: () => this._channelAgents,
      getAgentNick: () => this.getAgentNick(),
      setProcessing: (channel: string, state: boolean) => { this.getChannelState(channel).processing = state; },
      refreshProviderStats: () => this.refreshProviderStats(),
    });
  }

  private refreshProviderStats(): void {
    doRefreshProviderStats(this._monitoringDeps());
  }

  private buildExitSummary(): string {
    return doBuildExitSummary(this._monitoringDeps());
  }

  private _monitoringDeps() {
    return {
      getTui: () => this.tuiMode,
      getProviderPool: () => this._providerPool,
      getSessionState: () => this._sessionState,
      getChannelAgents: () => this._channelAgents,
      getThreadCoordinator: () => this._threadCoordinator ?? null,
      getConfig: () => this.config,
      getAgentManagerInternal: () => this.agentManagerInternal,
      getActiveProvider: () => this.getActiveProvider(),
      calculateCost: (model: string, i: number, o: number, cr: number, cw: number) => this.calculateCost(model, i, o, cr, cw),
    };
  }

  /**
   * Handle user message.
   */
  async handleUserMessage(input: string): Promise<string | void> {
    return doHandleUserMessage(input, {
      getInterrupted: () => { const ch = this.activeChannelName; return (ch ? this.getChannelState(ch).interrupted : false) || this.interrupted; },
      getTurnCount: () => this.turnCount,
      setTurnCount: (n) => { this.turnCount = n; },
      getConfig: () => this.config,
      getActiveChannelName: () => this.activeChannelName,
      getChannelManagerInternal: () => this.channelManagerInternal,
      joinChannel: (name) => this.joinChannel(name),
      getActiveChannelNameAfterJoin: () => this.activeChannelName,
      getChannelAgents: () => this._channelAgents,
      getProviderPool: () => this._providerPool,
      getStreamRouter: () => this._streamRouter,
      getSessionState: () => this._sessionState,
      getMessages: () => this.messages,
      getUsageStats: () => this.usageStats,
      getCurrentModel: () => this.getCurrentModel(),
      getActiveProvider: () => this.getActiveProvider(),
      buildStickyInjection: (channel) => this.buildStickyInjectionForChannel(channel),
      buildStickyInjectionTop: (channel) => this.buildStickyInjectionForChannel(channel),
      buildStickyInjectionBottom: (channel) => this.buildStickyInjectionForChannel(channel),
      buildArmadebugInjection: () => this._sessionState.buildArmadebugInjection(),
      getChannelNotes: (channel) => this._channelLifecycle.getChannelNotes(channel),
      getAgentNick: () => this.getAgentNick(),
      getTui: () => this.tuiMode,
      setProcessing: (channel: string, state: boolean) => { this.getChannelState(channel).processing = state; },
      setLastUserMsg: (msg) => { this.lastUserMsg = msg; },
      setLastResponseMeta: (meta) => { this.lastResponseMeta = meta; },
      setLastToolResultVal: (val) => { this.lastToolResultVal = val; },
      isAuthError: (err) => this._authManager.isAuthError(err),
      handleAuthError: (ch, agent, err) => this._authManager.handleAuthError(ch, agent, err),
      emitEvent: (event, ...args) => this.emitEvent(event, ...args),
      refreshProviderStats: () => this.refreshProviderStats(),
      awaitChannelReady: async (channel) => {
        const p = this._channelReadyPromises.get(channel);
        if (p) await p;
      },
    });
  }


  // ─── Private readline ──────────────────────────────────────────────────────

  private async onLine(line: string): Promise<void> {
    await this.handleInput(line);
    if (this.running) { this.rl?.setPrompt(this.formatPrompt()); this.rl?.prompt(); }
  }

  private onClose(): void { this.running = false; }
}

/** @deprecated Use ArmamentApp instead */
export { ArmamentApp as ArmamentRepl };
