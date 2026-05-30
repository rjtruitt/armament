import { BaseRepl, IUsageStats, IContextUsage, IMessage, IToolResult } from '../core/index.js';
import { ProviderPool } from '../providers/index.js';
import { ChannelInfo, AgentInfo } from './ChannelLifecycle.js';
import { McpServer } from './McpManager.js';
import { runNonInteractive, runSetupWizard } from './ReplStartup.js';
import * as Render from './RenderHelpers.js';
import type { IFileEntry, ICommitInfo } from '../core/interfaces/IRenderer.js';

import type { TuiRenderer } from './TuiRenderer.js';
import type { CommandDispatch, CommandContext } from './CommandDispatch.js';
import type { AuthManager } from './AuthManager.js';
import type { McpIntegration } from './McpIntegration.js';
import type { PluginIntegration } from './PluginIntegration.js';
import type { PluginLoader } from '../plugins/index.js';
import type { BackgroundTasks } from './BackgroundTasks.js';
import type { ContextManager } from './ContextManager.js';
import type { SessionState } from './SessionState.js';
import type { ThreadCoordinator } from '../threads/index.js';
import { UserConfig } from '../config/UserConfig.js';

/**
 * Abstract base providing all public API delegate methods.
 * ArmamentApp extends this instead of BaseRepl directly.
 */
export abstract class ReplPublicAPI extends BaseRepl {

  // ─── State accessed by public API methods (assigned by subclass) ──────────
  protected tuiMode: TuiRenderer | null = null;
  protected _providerPool!: ProviderPool;
  protected activeChannelName: string | undefined;
  protected inputHistory: string[] = [];
  protected currentInput = '';
  protected lastUserMsg: string | undefined;
  protected lastResponseMeta: any = undefined;
  protected lastToolResultVal: IToolResult | undefined;
  protected unsavedChanges = false;
  protected interruptCount = 0;
  protected _sessionState!: SessionState;
  protected _authManager!: AuthManager;
  protected _mcpIntegration!: McpIntegration;
  protected _pluginIntegration!: PluginIntegration;
  protected _pluginLoader!: PluginLoader;
  protected _backgroundTasks!: BackgroundTasks;
  protected _contextManager!: ContextManager;
  protected _commandDispatch!: CommandDispatch;
  protected _threadCoordinator: ThreadCoordinator | undefined;
  protected _sessionCleared = false;
  protected eventHandlers: Map<string, Array<(...args: any[]) => void>> = new Map();

  // ─── Abstract accessors subclass must provide ─────────────────────────────
  protected abstract get usageStats(): IUsageStats;
  protected abstract get contextUsage(): IContextUsage;
  protected abstract get messages(): IMessage[];
  protected abstract get turnCount(): number;
  protected abstract set turnCount(n: number);
  protected abstract get memories(): any[];
  protected abstract get channelManagerInternal(): ChannelInfo[];
  protected abstract get agentManagerInternal(): AgentInfo[];
  protected abstract get mcpServers(): Map<string, McpServer>;

  protected abstract _buildCommandContext(): CommandContext;
  protected abstract emitEvent(event: string, ...args: any[]): void;


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API DELEGATES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle o auth flow event.
   */
  handleOAuthFlowEvent(provider: string, url: string): Promise<string> {
    return this._authManager.handleOAuthFlowEvent(provider, url);
  }

  /**
   * Handle command.
   */
  handleCommand(input: string): boolean {
    return this._commandDispatch.dispatch(input, this._buildCommandContext()).handled;
  }

  /**
   * Handle command with output.
   */
  handleCommandWithOutput(input: string): string {
    const result = this._commandDispatch.dispatch(input, this._buildCommandContext());
    if (result.handled) return result.output ?? '';
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const pluginCmd = cmd.startsWith('/') ? cmd.slice(1) : cmd;
    const content = this._pluginLoader.getCommandWithReferences(pluginCmd);
    if (content) {
      this._pluginIntegration.injectPluginContext(pluginCmd, content, parts.slice(1));
      return '';
    }
    this.tuiMode?.writeMessage('system', '*', `Unknown command: ${cmd}`, this.activeChannelName ?? '#control');
    return '';
  }

  /**
   * Authenticate.
   */
  async authenticate(): Promise<any> { return this._authManager.authenticate(); }
  /**
   * Checks whether valid token exists.
   */
  hasValidToken(): boolean { return this._authManager.tokenValid; }
  /**
   * Simulate token expiring.
   */
  simulateTokenExpiring(): void { this._authManager.simulateTokenExpiring(); }

  /**
   * Gets the provider pool.
   */
  getProviderPool(): ProviderPool { return this._providerPool; }
  /**
   * Checks whether provider exists.
   */
  hasProvider(): boolean { return this._providerPool.size > 0; }
  /**
   * Gets the ll m provider.
   */
  getLLMProvider(): any { return { name: this.getActiveProvider(), model: this.getCurrentModel() }; }
  /**
   * Gets the current model.
   */
  getCurrentModel(): string { return this.config.defaultModel ?? ''; }
  /**
   * Gets the current model id.
   */
  getCurrentModelId(): string { return this.getCurrentModel(); }
  /**
   * Gets the active provider.
   */
  getActiveProvider(): string { return this.config.defaultProvider ?? ''; }
  /**
   * Gets the configured providers.
   */
  getConfiguredProviders(): any[] { return this.config.providers ?? []; }
  /**
   * Gets the available models.
   */
  getAvailableModels(): { provider: string; model: string; region?: string; profile?: string }[] {
    const providers = UserConfig.instance().providers;
    return (providers ?? []).flatMap((p: any) =>
      (p.models || []).map((m: any) => ({ provider: p.name ?? p.type, model: typeof m === 'string' ? m : m.name, region: p.region, profile: p.profile }))
    );
  }
  /**
   * Gets the default provider.
   */
  getDefaultProvider(): string { return this.config.defaultProvider ?? 'anthropic'; }
  /**
   * Gets the fallback chain.
   */
  getFallbackChain(): string[] { return this.config.fallbackChain; }
  /**
   * Estimate tokens.
   */
  estimateTokens(text: string): number { return Math.ceil(text.length / 4); }
  /**
   * Gets the turn count.
   */
  getTurnCount(): number { return this.turnCount; }
  /**
   * Gets the message history.
   */
  getMessageHistory(): IMessage[] { return this.messages; }
  /**
   * Gets the last user message.
   */
  getLastUserMessage(): string | undefined { return this.lastUserMsg; }
  /**
   * Gets the last response metadata.
   */
  getLastResponseMetadata(): any { return this.lastResponseMeta; }
  /**
   * Gets the last tool result.
   */
  getLastToolResult(): IToolResult | undefined { return this.lastToolResultVal; }
  /**
   * Gets the mode.
   */
  getMode(): string { return 'agent'; }
  /**
   * Gets the plan.
   */
  getPlan(): { steps: any[] } { return { steps: [] }; }
  /**
   * Gets the usage.
   */
  getUsage(): IUsageStats { return this.usageStats; }
  /**
   * Gets the context usage.
   */
  getContextUsage(): IContextUsage { return this.contextUsage; }
  /**
   * Gets the stats.
   */
  getStats(): { avgLatencyMs: number } { return { avgLatencyMs: this.usageStats.avgLatencyMs }; }
  /**
   * Gets the model config.
   */
  getModelConfig(): any { return this.config.modelConfig; }
  /**
   * Gets the config source.
   */
  getConfigSource(): string | undefined { return this.config.configPath; }
  /**
   * Gets the aws profile.
   */
  getAwsProfile(): string | undefined { return undefined; }
  /**
   * Gets the aws region.
   */
  getAwsRegion(): string | undefined { return undefined; }
  /**
   * Gets the auth method.
   */
  getAuthMethod(): string | undefined { return undefined; }
  /**
   * Gets the theme name.
   */
  getThemeName(): string { return this.config.theme; }
  /**
   * Gets the enabled tools.
   */
  getEnabledTools(): string[] {
    return Object.keys(this.config.toolPermissions).filter(t => this.config.toolPermissions[t] === 'allow');
  }
  /**
   * Gets the tool permission.
   */
  getToolPermission(toolName: string): string { return this.config.toolPermissions[toolName] ?? 'ask'; }
  /**
   * Gets the configured mcp servers.
   */
  getConfiguredMcpServers(): any[] { return [...this.mcpServers.values()].map(s => ({ name: s.name, status: s.status })); }
  /**
   * Checks whether unsaved config changes exists.
   */
  hasUnsavedConfigChanges(): boolean { return this.unsavedChanges; }
  /**
   * Gets the mcp servers.
   */
  getMcpServers(): string[] { return this._mcpIntegration.getMcpServerNames(); }
  /**
   * Gets the mcp tools.
   */
  getMcpTools(serverName: string): any[] { return this._mcpIntegration.getMcpTools(serverName); }
  /**
   * Gets the mcp status.
   */
  getMcpStatus(serverName: string): string { return this._mcpIntegration.getMcpServerStatus(serverName); }
  /**
   * Format mcp status.
   */
  formatMcpStatus(args: string[]): string { return this._mcpIntegration.formatMcpStatus(args); }
  /**
   * Format providers status.
   */
  formatProvidersStatus(): string { return this._mcpIntegration.formatProvidersStatus(); }
  /**
   * Connect mcp.
   */
  async connectMcp(name: string, config: any, opts?: { nonInteractive?: boolean }): Promise<void> {
    return this._mcpIntegration.connectMcp(name, config, opts);
  }
  /**
   * Disconnect mcp.
   */
  async disconnectMcp(name: string): Promise<void> { return this._mcpIntegration.disconnectMcp(name); }

  /**
   * Inject plugin context.
   */
  injectPluginContext(commandName: string, content: string, args: string[]): void {
    this._pluginIntegration.injectPluginContext(commandName, content, args);
  }
  /**
   * Handle plugin command.
   */
  async handlePluginCommand(args: string[]): Promise<void> {
    return this._pluginIntegration.handlePluginCommand(args);
  }

  /**
   * Run in background.
   */
  async runInBackground(task: string): Promise<string> { return this._backgroundTasks.runInBackground(task); }
  /**
   * Cancel background task.
   */
  cancelBackgroundTask(taskId: string): void { this._backgroundTasks.cancelTask(taskId); }
  /**
   * Gets the background tasks.
   */
  getBackgroundTasks(): any[] { return this._backgroundTasks.getAll(); }
  /**
   * Gets the background task status.
   */
  getBackgroundTaskStatus(taskId: string): string { return this._backgroundTasks.getStatus(taskId); }
  /**
   * Gets the background task result.
   */
  getBackgroundTaskResult(taskId: string): any { return this._backgroundTasks.getResult(taskId); }

  /**
   * Run non interactive.
   */
  async runNonInteractive(): Promise<string> { return runNonInteractive(); }
  /**
   * Run setup wizard.
   */
  async runSetupWizard(): Promise<void> { return runSetupWizard(); }

  /**
   * Sets the processing.
   */
  setProcessing(state: boolean): void { this.processing = state; }

  /**
   * Simulate context usage.
   */
  simulateContextUsage(percentage: number): void {
    this._sessionState.updateContextUsage(percentage);
    if (percentage >= 90) this.emitEvent('context:warning', { percentage });
  }
  /**
   * Simulate config change.
   */
  simulateConfigChange(changes: any): void { Object.assign(this.config, changes); this.unsavedChanges = true; }

  /**
   * Interrupt.
   */
  interrupt(): void {
    this.interrupted = true;
    this.interruptCount++;
    this.emitEvent('interrupt', {});
    if (this._threadCoordinator && this.activeChannelName) this._threadCoordinator.interrupt(this.activeChannelName);
    if (this.interruptCount >= 2 && !this.processing) this.running = false;
  }


  // ─── Rendering (delegates to RenderHelpers) ────────────────────────────────

  /**
   * Format prompt.
   */
  formatPrompt(): string {
    const channelPart = this.activeChannelName
      ? (this.activeChannelName.startsWith('#') ? this.activeChannelName : `#${this.activeChannelName}`)
      : '';
    return `${this.config.agentName}${channelPart}> `;
  }

  /**
   * Render banner.
   */
  renderBanner(): string { return Render.renderBanner(); }
  /**
   * Render mini banner.
   */
  renderMiniBanner(): string { return Render.renderMiniBanner(); }
  /**
   * Render separator.
   */
  renderSeparator(width: number): string { return Render.renderSeparator(width); }
  /**
   * Render status line.
   */
  renderStatusLine(): string {
    return `[model: ${this.getCurrentModel()}] [tok: ${this.usageStats.totalTokens}] [$${this.usageStats.estimatedCost.toFixed(4)}] [mode: ${this.getMode()}] [turn: ${this.turnCount}]`;
  }
  /**
   * Render markdown.
   */
  renderMarkdown(md: string): string { return Render.renderMarkdown(md); }
  /**
   * Render diff.
   */
  renderDiff(diff: string): string { return Render.renderDiff(diff); }
  /**
   * Render error.
   */
  renderError(error: Error): string { return Render.renderError(error); }
  /**
   * Render progress bar.
   */
  renderProgressBar(current: number, total: number): string { return Render.renderProgressBar(current, total); }
  /**
   * Render box.
   */
  renderBox(content: string): string { return Render.renderBox(content); }
  /**
   * Render file tree.
   */
  renderFileTree(entries: IFileEntry[]): string { return Render.renderFileTree(entries); }
  /**
   * Render file path.
   */
  renderFilePath(p: string, line?: number): string { return Render.renderFilePath(p, line); }
  /**
   * Render commit.
   */
  renderCommit(commit: ICommitInfo): string { return Render.renderCommit(commit); }
  /**
   * Render status.
   */
  renderStatus(type: string, message: string): string { return Render.renderStatus(type, message); }
  /**
   * Apply gradient.
   */
  applyGradient(text: string): string { return Render.applyGradient(text, this.config.noColor); }
  /**
   * Render image.
   */
  renderImage(content: { type?: string; mimeType?: string; data?: string | { length?: number } }): string { return Render.renderImage(content); }
  /**
   * Checks whether image content.
   */
  isImageContent(content: { type?: string; mimeType?: string; data?: string | { length?: number } }): boolean { return Render.isImageContent(content); }


  // ─── History / completions ─────────────────────────────────────────────────

  /**
   * Add to history.
   */
  addToHistory(entry: string): void {
    if (!entry) return;
    if (this.inputHistory.length > 0 && this.inputHistory[this.inputHistory.length - 1] === entry) return;
    this.inputHistory.push(entry);
  }
  /**
   * Gets the history entry.
   */
  getHistoryEntry(offset: number): string | undefined {
    if (this.inputHistory.length === 0) return undefined;
    const idx = this.inputHistory.length - 1 - offset;
    if (idx < 0 || idx >= this.inputHistory.length) return undefined;
    return this.inputHistory[idx];
  }
  /**
   * Gets the completions.
   */
  getCompletions(partial: string): string[] {
    const commands = (this._commandDispatch?.getRegistrations() ?? []).map(r => '/' + r.name);
    const parts = partial.split(/\s+/);
    if (parts.length > 1) {
      const cmd = parts[0];
      const subPartial = parts[parts.length - 1];
      if (cmd === '/join' || cmd === '/switch') {
        return this.channelManagerInternal
          .map(c => c.name.startsWith('#') ? c.name.slice(1) : c.name)
          .filter(name => name.startsWith(subPartial));
      }
      if (cmd === '/model') {
        return this.getAvailableModels()
          .map(m => `${m.provider}/${m.model}`)
          .filter(name => name.startsWith(subPartial));
      }
      return [];
    }
    return commands.filter((c: string) => c.startsWith(partial));
  }
  /**
   * Append input.
   */
  appendInput(text: string): void { this.currentInput += text; }
  /**
   * Sets the input.
   */
  setInput(text: string): void { this.currentInput = text; }
  /**
   * Gets the current input.
   */
  getCurrentInput(): string { return this.currentInput; }


  // ─── Session / context / sticky ────────────────────────────────────────────

  /**
   * Clear session.
   */
  clearSession(): void { this._sessionCleared = true; this._contextManager.clearSession(); this.turnCount = 0; }
  /**
   * Export session.
   */
  exportSession(): any { return this._contextManager.exportSession(); }
  /**
   * Import session.
   */
  importSession(data: any): void {
    this._contextManager.importSession(data);
    if (data.config) this.config = { ...this.config, ...data.config };
  }
  /**
   * Save context.
   */
  saveContext(title?: string, description?: string): string { return this._contextManager.saveContext(title, description); }
  /**
   * Load context.
   */
  loadContext(nameOrFile: string): void { this._contextManager.loadContext(nameOrFile); }
  /**
   * List contexts.
   */
  listContexts(): string[] { return this._contextManager.listContexts(); }
  /**
   * Show context picker.
   */
  showContextPicker(): void { this._contextManager.showContextPicker(); }

  // Sticky note methods — implemented by ArmamentApp (per-channel stickies).
  // These are abstract so any future ReplPublicAPI subclass must provide them.
  abstract addStickyNote(content: string): void;
  abstract removeStickyNote(idOrIndex: string | number): void;
  abstract listStickyNotes(): void;

  /**
   * Add memory.
   */
  addMemory(type: string, content: string): void { this._sessionState.addMemory(type, content); }
  /**
   * Gets the memories.
   */
  getMemories(type?: string): any[] { return this._sessionState.getMemories(type); }
  /**
   * Gets the persisted memories.
   */
  getPersistedMemories(): string { return this._sessionState.getPersistedMemories(); }
  /**
   * Build context.
   */
  buildContext(): string {
    const parts: string[] = [];
    if (this.config.systemPrompt) parts.push(this.config.systemPrompt);
    for (const m of this.memories) parts.push(m.content);
    return parts.join('\n');
  }


  // ─── Agents / channels ─────────────────────────────────────────────────────

  /**
   * Kill agent.
   */
  killAgent(nameOrId: string): void {
    const idx = this.agentManagerInternal.findIndex(a => a.name === nameOrId || a.id === nameOrId);
    if (idx === -1) throw new Error(`Agent "${nameOrId}" not found`);
    const agent = this.agentManagerInternal[idx];
    if (agent.status === 'stopped') throw new Error(`Agent "${nameOrId}" is already dead`);
    this.agentManagerInternal.splice(idx, 1);
    const agentChannelName = agent.name.startsWith('#') ? agent.name : `#${agent.name}`;
    const chIdx = this.channelManagerInternal.findIndex(c => c.agentId === agent.id || c.name === agentChannelName);
    if (chIdx !== -1) this.channelManagerInternal.splice(chIdx, 1);
  }

  /**
   * Switch channel.
   */
  switchChannel(nameOrIndex: string | number): void {
    if (typeof nameOrIndex === 'number') {
      if (nameOrIndex < 0 || nameOrIndex >= this.channelManagerInternal.length) throw new Error(`Channel index ${nameOrIndex} out of bounds`);
      this.channelManagerInternal.forEach(c => c.active = false);
      this.channelManagerInternal[nameOrIndex].active = true;
      this.activeChannelName = this.channelManagerInternal[nameOrIndex].name;
    } else {
      let name = nameOrIndex;
      if (name && !name.startsWith('#')) name = `#${name}`;
      const ch = this.channelManagerInternal.find(c => c.name === name);
      if (!ch) throw new Error(`Channel "${name}" not found`);
      this.channelManagerInternal.forEach(c => c.active = false);
      ch.active = true;
      this.activeChannelName = ch.name;
    }
  }

  /**
   * List channels.
   */
  listChannels(): string {
    if (this.channelManagerInternal.length === 0) return 'No channels';
    return this.channelManagerInternal.map(c => {
      const indicator = c.active ? '* ' : '  ';
      const agent = c.agentId ? this.agentManagerInternal.find(a => a.id === c.agentId) : undefined;
      return `${indicator}${c.name} [${agent ? agent.status : 'idle'}]`;
    }).join('\n');
  }

  /**
   * Who is.
   */
  whoIs(name: string): string {
    const agent = this.agentManagerInternal.find(a => a.name === name);
    if (!agent) return `Agent "${name}" not found`;
    return [`Name: ${agent.name}`,`Model: ${agent.model}`,`Provider: ${agent.provider}`,`Status: ${agent.status}`,`Turns: ${agent.turnCount}`,`Token usage: ${agent.tokenUsage}`,`Cost: $${agent.cost.toFixed(4)}`].join('\n');
  }
}
