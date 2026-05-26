import { Sidebar, InputBar, StatusBar, ApprovalWidget, type ChatMessage } from '../tui/index.js';
import { TuiChannelManager } from './TuiChannelManager.js';
import type { TuiRendererOptions, ControlDashboardData } from './TuiTypes.js';

/** Interface for ChannelViewDelegate. */
export interface ChannelViewDelegate {
  render(): void;
  setApprovalFocused(focused: boolean): void;
}

/** Class representing TuiChannelView. */
export class TuiChannelView {
  private sidebar: Sidebar;
  private inputBar: InputBar;
  private statusBar: StatusBar;
  private channelManager: TuiChannelManager;
  private approvalWidget: ApprovalWidget;
  private opts: TuiRendererOptions;
  private delegate: ChannelViewDelegate;
  private _activeView: string | null = null;
  private _startTime = Date.now();

  constructor(
    sidebar: Sidebar,
    inputBar: InputBar,
    statusBar: StatusBar,
    channelManager: TuiChannelManager,
    approvalWidget: ApprovalWidget,
    opts: TuiRendererOptions,
    delegate: ChannelViewDelegate,
  ) {
    this.sidebar = sidebar;
    this.inputBar = inputBar;
    this.statusBar = statusBar;
    this.channelManager = channelManager;
    this.approvalWidget = approvalWidget;
    this.opts = opts;
    this.delegate = delegate;
  }

  /**
   * Gets the active view.
   */
  get activeView(): string | null { return this._activeView; }
  /**
   * Sets the active view.
   */
  set activeView(v: string | null) { this._activeView = v; }

  /**
   * Gets the active channel.
   */
  getActiveChannel(): string {
    return this._activeView ?? this.sidebar.getActive() ?? '#control';
  }

  /**
   * Sets the active channel.
   */
  setActiveChannel(channel: string, clearSelection: () => void): void {
    if (channel === '+new-channel') {
      this.delegate.render();
      return;
    }
    if (channel.startsWith('@')) {
      this._activeView = channel;
      clearSelection();
      this.delegate.render();
      return;
    }
    if (channel.startsWith('worker-')) {
      this._activeView = channel;
      this.inputBar.setChannel(channel);
      this.sidebar.setActive(channel);
      this.opts.onChannelSwitch?.(channel);
      this.delegate.render();
      return;
    }
    const name = channel.startsWith('#') ? channel : `#${channel}`;
    this._activeView = name;
    this.inputBar.setChannel(name);
    this.sidebar.setActive(name);
    if (!this.approvalWidget.isEmpty) {
      this.delegate.setApprovalFocused(true);
    }
    this.opts.onChannelSwitch?.(name);
    this.delegate.render();
  }

  /**
   * Add channel.
   */
  addChannel(name: string): void {
    const chName = name.startsWith('#') ? name : `#${name}`;
    this.sidebar.addChannel(chName);
    this.delegate.render();
  }

  /**
   * Create new channel.
   */
  createNewChannel(): void {
    const existing = this.sidebar.getChannels().map(ch => ch.name);
    let base = '#general';
    let name = base;
    let n = 1;
    while (existing.includes(name)) {
      name = `${base}_${n}`;
      n++;
    }
    this.sidebar.addChannel(name);
    this.setActiveChannel(name, () => {});
    this.opts.onNewChannel?.(name);
    this.delegate.render();
  }

  /**
   * Remove channel.
   */
  removeChannel(name: string): void {
    const chName = name.startsWith('#') ? name : `#${name}`;
    this.channelManager.removeChannel(chName);
    this.sidebar.removeChannel(chName);
    if (this._activeView === chName) {
      this._activeView = '#control';
      this.inputBar.setChannel('#control');
      this.sidebar.setActive('#control');
    }
    this.delegate.render();
  }

  /**
   * Add agent.
   */
  addAgent(name: string, opts?: { model?: string; status?: string }): void {
    this.sidebar.addAgent(name, opts);
    this.statusBar.incrementAgents();
    this.delegate.render();
  }

  /**
   * Add channel child.
   */
  addChannelChild(channelName: string, child: { id: string; label: string; model?: string; status?: 'idle' | 'thinking' | 'tool_use' | 'done' | 'error'; role?: 'operator' | 'worker' }): void {
    const chName = channelName.startsWith('#') ? channelName : `#${channelName}`;
    this.sidebar.addChild(chName, child);
    this.delegate.render();
  }

  /**
   * Update channel child.
   */
  updateChannelChild(channelName: string, childId: string, updates: { status?: 'idle' | 'thinking' | 'tool_use' | 'done' | 'error'; label?: string }): void {
    const chName = channelName.startsWith('#') ? channelName : `#${channelName}`;
    this.sidebar.updateChild(chName, childId, updates);
    this.delegate.render();
  }

  /**
   * Remove channel child.
   */
  removeChannelChild(channelName: string, childId: string): void {
    const chName = channelName.startsWith('#') ? channelName : `#${channelName}`;
    this.sidebar.removeChild(chName, childId);
    this.delegate.render();
  }

  /**
   * Update provider.
   */
  updateProvider(providerName: string, connected: boolean, model: string, stats: { tokens?: number; cost?: number; cacheRead?: number; cacheWrite?: number; agents?: number }, type?: string): void {
    this.sidebar.updateProvider(providerName, connected, model, stats, type);
    this.delegate.render();
  }

  /**
   * Clear providers.
   */
  clearProviders(): void { this.sidebar.clearProviders(); }

  /**
   * Remove agent.
   */
  removeAgent(name: string): void {
    this.sidebar.removeAgent(name);
    this.statusBar.decrementAgents();
    this.delegate.render();
  }

  /**
   * Update agent status.
   */
  updateAgentStatus(name: string, status: string): void {
    const info = this.sidebar.getChannel(name);
    if (info) { info.status = status; this.delegate.render(); }
  }

  /**
   * Update status.
   */
  updateStatus(data: { provider?: string; model?: string; agents?: number; cost?: { current: number; budget: number } }): void {
    if (data.provider !== undefined) this.statusBar.setProvider(data.provider);
    if (data.model !== undefined) this.statusBar.setModel(data.model);
    if (data.agents !== undefined) this.statusBar.setAgents(data.agents);
    if (data.cost) this.statusBar.setCost(data.cost.current, data.cost.budget);
    this.delegate.render();
  }

  /**
   * Scroll chat up.
   */
  scrollChatUp(lines = 3): void {
    this.channelManager.getScrollBuffer(this.getActiveChannel()).scrollUp(lines);
    this.delegate.render();
  }

  /**
   * Scroll chat down.
   */
  scrollChatDown(lines = 3): void {
    this.channelManager.getScrollBuffer(this.getActiveChannel()).scrollDown(lines);
    this.delegate.render();
  }

  /**
   * Scroll chat page up.
   */
  scrollChatPageUp(): void {
    this.channelManager.getScrollBuffer(this.getActiveChannel()).pageUp();
    this.delegate.render();
  }

  /**
   * Scroll chat page down.
   */
  scrollChatPageDown(): void {
    this.channelManager.getScrollBuffer(this.getActiveChannel()).pageDown();
    this.delegate.render();
  }

  /**
   * Gets the is streaming.
   */
  get isStreaming(): boolean { return this.channelManager.isStreaming; }

  /**
   * Stage message.
   */
  stageMessage(sender: string, content: string, channel?: string): void {
    const ch = channel ?? this.getActiveChannel();
    this.channelManager.stageMessage(sender, content, ch);
    this.delegate.render();
  }

  /**
   * Checks whether staging exists.
   */
  hasStaging(channel?: string): boolean {
    return this.channelManager.hasStaging(channel ?? this.getActiveChannel());
  }

  /**
   * Flush staging.
   */
  flushStaging(channel?: string): Array<{ sender: string; content: string }> {
    const ch = channel ?? this.getActiveChannel();
    const flushed = this.channelManager.flushStaging(ch, this.getActiveChannel());
    this.delegate.render();
    return flushed;
  }

  /**
   * Write to main.
   */
  writeToMain(text: string, channel?: string): void {
    const ch = channel ?? this.sidebar.getActive() ?? '#control';
    this.channelManager.writeToMain(text, ch, this.getActiveChannel());
    if (ch === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Write message.
   */
  writeMessage(type: 'user' | 'agent' | 'system', sender: string, content: string, channel?: string): void {
    const ch = channel ?? this.sidebar.getActive() ?? '#control';
    this.channelManager.writeMessage(type, sender, content, ch, this.getActiveChannel());
    if (ch === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Begin stream message.
   */
  beginStreamMessage(sender: string, channel?: string): void {
    const ch = channel ?? this.sidebar.getActive() ?? '#control';
    this.channelManager.beginStreamMessage(sender, ch);
  }

  /**
   * Append stream chunk.
   */
  appendStreamChunk(text: string, channel?: string): void {
    const ch = channel ?? this.getActiveChannel();
    this.channelManager.appendStreamChunk(text, ch);
    if (ch === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Append stream thinking.
   */
  appendStreamThinking(text: string, appendThinkingText: (t: string) => void, channel?: string): void {
    const ch = channel ?? this.getActiveChannel();
    this.channelManager.appendStreamThinking(text, ch);
    appendThinkingText(text);
    if (ch === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Finalize stream message.
   */
  finalizeStreamMessage(channel?: string): void {
    const ch = channel ?? this.getActiveChannel();
    this.channelManager.finalizeStreamMessage(ch);
    if (ch === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Cancel stream message.
   */
  cancelStreamMessage(channel?: string): void {
    const ch = channel ?? this.getActiveChannel();
    this.channelManager.cancelStreamMessage(ch);
    if (ch === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Write tool block.
   */
  writeToolBlock(toolName: string, description: string, result: { success: boolean; data?: string; error?: string }, durationMs: number, channel?: string): void {
    const ch = channel ?? this.sidebar.getActive() ?? '#control';
    this.channelManager.writeToolBlock(toolName, description, result, durationMs, ch);
    if (ch === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Begin tool block.
   */
  beginToolBlock(toolName: string, description: string, channel?: string): number {
    const ch = channel ?? this.sidebar.getActive() ?? '#control';
    const id = this.channelManager.beginToolBlock(toolName, description, ch);
    if (ch === this.getActiveChannel()) this.delegate.render();
    return id;
  }

  /**
   * Update tool block description.
   */
  updateToolBlockDescription(channel: string, blockId: number, description: string): void {
    this.channelManager.updateToolBlockDescription(channel, blockId, description);
    if (channel === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Complete tool block.
   */
  completeToolBlock(channel: string, blockId: number, result: { success: boolean; data?: string; error?: string }, durationMs?: number): void {
    this.channelManager.completeToolBlock(channel, blockId, result, durationMs);
    if (channel === this.getActiveChannel()) this.delegate.render();
  }

  /**
   * Gets the channel lines.
   */
  getChannelLines(channel?: string): string[] {
    return this.channelManager.getChannelLines(channel);
  }

  /**
   * Gets the channel messages.
   */
  getChannelMessages(channel?: string): ChatMessage[] {
    return this.channelManager.getChannelMessages(channel);
  }

  /**
   * Gets the control dashboard data.
   */
  getControlDashboardData(): ControlDashboardData {
    const channels = this.sidebar.getChannels().filter(ch => ch.name !== '#control');
    const channelData = channels.map(ch => {
      const status = this.opts.getChannelStatus?.(ch.name);
      return {
        name: ch.name,
        status: status?.status ?? 'idle',
        tokens: status?.tokens ?? 0,
        contextPercent: status?.contextPercent ?? 0,
      };
    });
    let totalTokens = 0;
    let totalCost = 0;
    let activeWorkers = 0;
    for (const ch of channels) {
      const status = this.opts.getChannelStatus?.(ch.name);
      if (status) {
        totalTokens += status.tokens ?? 0;
      }
      if (ch.children) {
        for (const child of ch.children) {
          if (child.status === 'thinking' || child.status === 'tool_use') activeWorkers++;
        }
      }
    }
    const providers = this.sidebar.getProviders();
    for (const prov of providers) {
      for (const [, stats] of prov.models) {
        totalCost += stats.cost;
      }
    }
    return { channels: channelData, totalTokens, totalCost, activeWorkers, uptime: Date.now() - this._startTime };
  }
}
