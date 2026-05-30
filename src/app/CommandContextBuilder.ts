/**
 * CommandContextBuilder — constructs the CommandContext object for CommandDispatch.
 *
 * Extracted from ArmamentApp to keep the composition root focused on wiring.
 * This module provides the bridge between the app's internal state and the
 * command system's expected interface.
 */
import type { CommandContext } from './CommandDispatch.js';
import type { TuiRenderer } from './TuiRenderer.js';
import type { ChannelLifecycle } from './ChannelLifecycle.js';
import type { ChannelAgent, ProviderPool, CatalogManager } from '../providers/index.js';
import type { StreamRouter } from './StreamRouter.js';
import type { SessionState } from './SessionState.js';
import type { McpManager, McpServer } from './McpManager.js';
import type { PluginLoader } from '../plugins/index.js';
import type { IReplConfig, IMessage, IUsageStats, IContextUsage, IAgentInstance, IAgentSpawnOptions } from '../core/index.js';
/** Interface for CommandContextHost. */
export interface CommandContextHost {
  getTui: () => TuiRenderer | null;
  getActiveChannel: () => string | undefined;
  getChannelLifecycle: () => ChannelLifecycle;
  getChannelAgents: () => Map<string, ChannelAgent>;
  getStreamRouter: () => StreamRouter;
  getSessionState: () => SessionState;
  getProviderPool: () => ProviderPool;
  getMcpManager: () => McpManager;
  getCatalogManager: () => CatalogManager;
  getPluginLoader: () => PluginLoader;
  getConfig: () => IReplConfig;
  getMcpServers: () => Map<string, McpServer>;
  getMessages: () => IMessage[];
  getUsageStats: () => IUsageStats;
  getContextUsage: () => IContextUsage;
  getTurnCount: () => number;
  setTurnCount: (n: number) => void;
  setActiveChannel: (name: string) => void;
  joinChannel: (name: string) => void;
  leaveChannel: (name: string) => void;
  spawnAgent: (name: string, opts?: IAgentSpawnOptions) => Promise<IAgentInstance>;
  switchChannelModel: (channel: string, model: string, provider?: string) => Promise<void>;
  getAvailableModels: () => { provider: string; model: string; region?: string; profile?: string }[];
  getUserNick: () => string;
  stop: () => void;
  getCurrentModel: () => string;
  getActiveProvider: () => string;
  getEnabledTools: () => string[];
  clearSession: () => void;
  saveContext: (title?: string, description?: string) => any;
  loadContext: (nameOrFile: string) => any;
  showContextPicker: () => void;
  addStickyNote: (content: string) => void;
  removeStickyNote: (idOrIndex: string | number) => void;
  listStickyNotes: () => void;
  killAgent: (name: string) => void;
  switchChannel: (nameOrIndex: string | number) => void;
  msgAgent: (name: string, message: string) => void;
  whoIs: (name: string) => any;
  listChannels: () => any;
  formatMcpStatus: (args: string[]) => string;
  formatProvidersStatus: () => string;
  handlePluginCommand: (args: string[]) => void;
  injectPluginContext: (commandName: string, content: any, args: string[]) => void;
  connectMcp: (name: string, config: any) => Promise<void>;
  submitMessage: (content: string, channel?: string) => Promise<void>;
}
/** Construct a CommandContext object bridging app internal state to the command system. */
export function buildCommandContext(host: CommandContextHost): CommandContext {
  return {
    tui: host.getTui(),
    activeChannel: host.getActiveChannel(),
    channelLifecycle: host.getChannelLifecycle(),
    channelAgents: host.getChannelAgents(),
    streamRouter: host.getStreamRouter(),
    sessionState: host.getSessionState(),
    providerPool: host.getProviderPool(),
    mcpManager: host.getMcpManager(),
    catalogManager: host.getCatalogManager(),
    pluginLoader: host.getPluginLoader(),
    config: host.getConfig(),
    setActiveChannel: (name) => { host.setActiveChannel(name); host.getTui()?.setActiveChannel(name); },
    joinChannel: (name) => host.joinChannel(name),
    leaveChannel: (name) => host.leaveChannel(name),
    spawnAgent: (name, opts?) => host.spawnAgent(name, opts),
    switchChannelModel: (channel, model, provider?) => host.switchChannelModel(channel, model, provider),
    getAvailableModels: () => host.getAvailableModels(),
    getUserNick: () => host.getUserNick(),
    stop: () => host.stop(),
    getCurrentModel: () => host.getCurrentModel(),
    getActiveProvider: () => host.getActiveProvider(),
    getEnabledTools: () => host.getEnabledTools(),
    getMcpServers: () => host.getMcpServers(),
    getTurnCount: () => host.getTurnCount(),
    setTurnCount: (n: number) => { host.setTurnCount(n); },
    getMessages: () => host.getMessages(),
    getUsageStats: () => host.getUsageStats(),
    getContextUsage: () => host.getContextUsage(),
    clearSession: () => host.clearSession(),
    saveContext: (title?, description?) => host.saveContext(title, description),
    loadContext: (nameOrFile) => host.loadContext(nameOrFile),
    showContextPicker: () => host.showContextPicker(),
    addStickyNote: (content) => host.addStickyNote(content),
    removeStickyNote: (index) => host.removeStickyNote(index),
    listStickyNotes: () => host.listStickyNotes(),
    killAgent: (name) => host.killAgent(name),
    switchChannel: (nameOrIndex) => host.switchChannel(nameOrIndex),
    msgAgent: (name, message) => { host.msgAgent(name, message); },
    whoIs: (name) => host.whoIs(name),
    listChannels: () => host.listChannels(),
    formatMcpStatus: (args) => host.formatMcpStatus(args),
    formatProvidersStatus: () => host.formatProvidersStatus(),
    handlePluginCommand: (args) => { host.handlePluginCommand(args); },
    injectPluginContext: (commandName, content, args) => host.injectPluginContext(commandName, content, args),
    connectMcp: (name, config) => host.connectMcp(name, config),
    submitMessage: (content, channel) => host.submitMessage(content, channel),
  };
}