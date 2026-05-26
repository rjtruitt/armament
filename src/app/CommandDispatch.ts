import type { ChannelLifecycle } from './ChannelLifecycle.js';
import type { ChannelAgent, ProviderPool, CatalogManager } from '../providers/index.js';
import type { TuiRenderer } from './TuiRenderer.js';
import type { SessionState } from './SessionState.js';
import type { StreamRouter } from './StreamRouter.js';
import type { McpManager } from './McpManager.js';
import type { IReplConfig } from '../core/index.js';
import type { PluginLoader } from '../plugins/index.js';
/** Context object passed to command handlers with access to app state and methods. */
export interface CommandContext {
  tui: TuiRenderer | null;
  activeChannel: string | undefined;
  channelLifecycle: ChannelLifecycle;
  channelAgents: Map<string, ChannelAgent>;
  streamRouter: StreamRouter;
  sessionState: SessionState;
  providerPool: ProviderPool;
  mcpManager: McpManager;
  catalogManager: CatalogManager;
  pluginLoader: PluginLoader;
  config: IReplConfig;
  // Methods the commands need from the REPL
  setActiveChannel: (name: string) => void;
  joinChannel: (name: string) => void;
  leaveChannel: (name: string) => void;
  spawnAgent: (name: string, opts?: { model?: string; provider?: string; systemPrompt?: string }) => any;
  switchChannelModel: (channel: string, model: string, provider?: string) => any;
  getAvailableModels: () => Array<{ provider: string; model: string }>;
  getUserNick: () => string;
  stop: () => void;
  // Additional methods for migrated commands
  getCurrentModel: () => string;
  getActiveProvider: () => string;
  getEnabledTools: () => string[];
  getMcpServers: () => Map<string, any>;
  getTurnCount: () => number;
  setTurnCount: (n: number) => void;
  getMessages: () => any[];
  getUsageStats: () => any;
  getContextUsage: () => any;
  clearSession: () => void;
  saveContext: (title?: string, description?: string) => string;
  loadContext: (nameOrFile: string) => void;
  showContextPicker: () => void;
  addStickyNote: (content: string) => void;
  removeStickyNote: (index: number) => void;
  listStickyNotes: () => void;
  killAgent: (name: string) => void;
  switchChannel: (nameOrIndex: string | number) => void;
  msgAgent: (name: string, message: string) => void;
  whoIs: (name: string) => string;
  listChannels: () => string;
  formatMcpStatus: (args: string[]) => string;
  formatProvidersStatus: () => string;
  handlePluginCommand: (args: string[]) => void;
  injectPluginContext: (commandName: string, content: string, args: string[]) => void;
  connectMcp: (name: string, config: any) => Promise<void>;
}
/** Result returned by a command handler indicating whether it was handled and optional output. */
export interface CommandResult {
  handled: boolean;
  output?: string;
  async?: Promise<void>;
}
/** Type definition for CommandHandler. */
export type CommandHandler = (args: string[], ctx: CommandContext) => CommandResult;
/** Definition for an interactive picker/selector UI for commands. */
export interface PickerDef {
  title: string;
  getItems: (ctx: CommandContext) => Array<{ name: string; description: string; category: 'irc' | 'standard' | 'config' }>;
  onSelect: (item: { name: string; description: string }, ctx: CommandContext) => void;
}
/** Registration entry for a slash command including name, handler, and optional picker. */
export interface CommandRegistration {
  name: string;
  aliases?: string[];
  description?: string;
  usage?: string;
  category?: 'irc' | 'standard' | 'config';
  handler: CommandHandler;
  picker?: PickerDef;
}
/** Class representing CommandDispatch. */
export class CommandDispatch {
  private handlers: Map<string, CommandHandler> = new Map();
  private registrations: CommandRegistration[] = [];
  /**
   * Register.
   */
  register(reg: CommandRegistration): void {
    this.registrations.push(reg);
    this.handlers.set(reg.name, reg.handler);
    if (reg.aliases) {
      for (const alias of reg.aliases) {
        this.handlers.set(alias, reg.handler);
      }
    }
  }
  /**
   * Register all.
   */
  registerAll(regs: CommandRegistration[]): void {
    for (const reg of regs) {
      this.register(reg);
    }
  }
  /**
   * Dispatch.
   */
  dispatch(input: string, ctx: CommandContext): CommandResult {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase().replace(/^\//, '');
    const args = parts.slice(1);
    // Try two-word commands first (e.g. "flow run", "mcp add")
    if (args.length > 0) {
      const twoWord = `${cmd} ${args[0].toLowerCase()}`;
      const twoWordHandler = this.handlers.get(twoWord);
      if (twoWordHandler) {
        return twoWordHandler(args.slice(1), ctx);
      }
    }
    const handler = this.handlers.get(cmd);
    if (handler) {
      return handler(args, ctx);
    }
    return { handled: false };
  }
  /**
   * Gets the completions.
   */
  getCompletions(partial: string): string[] {
    const lower = partial.toLowerCase().replace(/^\//, '');
    const matches: string[] = [];
    for (const reg of this.registrations) {
      if (reg.name.startsWith(lower)) {
        matches.push(`/${reg.name}`);
      }
    }
    return matches;
  }
  /**
   * Gets the registrations.
   */
  getRegistrations(): CommandRegistration[] {
    return [...this.registrations];
  }
  /**
   * Gets the palette commands.
   */
  getPaletteCommands(): Array<{ name: string; description: string; usage?: string; category: 'irc' | 'standard' | 'config' }> {
    return this.registrations.map(r => ({
      name: r.name,
      description: r.description ?? '',
      usage: r.usage,
      category: r.category ?? 'standard',
    }));
  }
  /**
   * Gets the picker.
   */
  getPicker(commandName: string): PickerDef | undefined {
    const reg = this.registrations.find(r => r.name === commandName);
    return reg?.picker;
  }
  /**
   * Checks whether picker exists.
   */
  hasPicker(commandName: string): boolean {
    return this.registrations.some(r => r.name === commandName && r.picker);
  }

  isRecognized(commandName: string): boolean {
    return this.registrations.some(r => r.name === commandName);
  }
}