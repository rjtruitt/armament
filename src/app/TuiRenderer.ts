import { readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { cwd } from 'node:process';
import { ScreenBuffer, LayoutManager, Sidebar, InputBar, StatusBar, CommandPalette, type CommandDef, FocusManager, MouseHandler, ApprovalWidget, type ApprovalRequest, type ChatMessage } from '../tui/index.js';
import { getCommandsForPalette } from './CommandRegistry.js';
import { getRedirectedRoot } from './ChannelPaths.js';
import { TuiPainter } from './TuiPainter.js';
import { TuiInputHandler, type InputHandlerDelegate } from './TuiInputHandler.js';
import { TuiMouseController, type MouseControllerDelegate } from './TuiMouseController.js';
import { TuiChannelManager } from './TuiChannelManager.js';
import { TuiStatusDisplay } from './TuiStatusDisplay.js';
import { TuiConfigPanes } from './TuiConfigPanes.js';
import { TuiChannelView } from './TuiChannelView.js';
import {
  type TuiRendererOptions,
  type TuiMenuConfig,
  type TuiProviderInfo,
  type ChannelStatus,
  type TuiModeOptions,
  type ControlDashboardData,
} from './TuiTypes.js';

export type { TuiRendererOptions, TuiMenuConfig, TuiProviderInfo, ChannelStatus, TuiModeOptions, ControlDashboardData };

/** Class representing TuiRenderer. */
export class TuiRenderer {
  private screen: ScreenBuffer;
  private layout: LayoutManager;
  private sidebar: Sidebar;
  private inputBar: InputBar;
  private statusBar: StatusBar;
  private commandPalette: CommandPalette;
  private focusManager: FocusManager;
  private mouseHandler: MouseHandler;
  private opts: TuiRendererOptions;

  private painter: TuiPainter;
  private inputHandler: TuiInputHandler;
  private mouseController: TuiMouseController;
  private channelManager: TuiChannelManager;
  private statusDisplay: TuiStatusDisplay;
  private configPanes: TuiConfigPanes;
  private channelView: TuiChannelView;

  private _running = false;
  private _rawDataHandler: ((data: Buffer) => void) | null = null;
  private _resizeHandler: (() => void) | null = null;
  private _welcomeShown = false;

  private _renderPending = false;
  private _lastRenderTime = 0;
  private _renderInterval = 33;

  private _sidebarRowMap: (string | null)[] = [];
  private _approvalWidget: ApprovalWidget;

  constructor(opts: TuiRendererOptions) {
    this.opts = opts;
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 40;
    this.screen = new ScreenBuffer(cols, rows);
    this.layout = new LayoutManager(this.screen, { sidebarWidth: 40 });
    const li = this.layout.getLayout();

    this.sidebar = new Sidebar(this.screen, { x: li.sidebar.col, y: li.sidebar.row, width: li.sidebar.width, height: li.sidebar.height });
    this.inputBar = new InputBar(this.screen, { x: li.inputBar.col, y: li.inputBar.row, width: li.inputBar.width, height: 1 }, { externalRender: true });
    this.statusBar = new StatusBar(this.screen, { x: li.statusBar.col, y: li.statusBar.row, width: li.statusBar.width, height: 1 });
    const paletteCommands = opts.getCommandDispatch?.()?.getPaletteCommands() ?? getCommandsForPalette();
    this.commandPalette = new CommandPalette(this.screen, { x: li.inputBar.col, y: li.inputBar.row - 1, width: li.inputBar.width, height: 10 }, { theme: opts.theme, noColor: opts.noColor, commands: paletteCommands });
    this.focusManager = new FocusManager({ initialFocus: 'input', regions: ['input', 'sidebar', 'main', 'palette'] });
    this.focusManager.setRegionVisible('palette', false);
    this.mouseHandler = new MouseHandler({ mode: 'sgr' });
    this._approvalWidget = new ApprovalWidget({ width: li.main.width - 4 });

    this.painter = new TuiPainter(this.screen, this.layout, this.opts);
    this.channelManager = new TuiChannelManager(this.layout, this.sidebar, this.opts);
    this.statusDisplay = new TuiStatusDisplay({ getActiveChannel: () => this.getActiveChannel(), render: () => this.render() });
    this.channelView = new TuiChannelView(this.sidebar, this.inputBar, this.statusBar, this.channelManager, this._approvalWidget, this.opts, {
      render: () => this.render(),
      setApprovalFocused: (f) => { this.inputHandler.approvalFocused = f; },
    });
    this.configPanes = new TuiConfigPanes(this.opts, {
      render: () => this.render(), setActiveChannel: (ch) => this.setActiveChannel(ch), setRenderInterval: (ms) => this.setRenderInterval(ms),
    });

    this.inputHandler = new TuiInputHandler({
      opts, inputBar: this.inputBar, commandPalette: this.commandPalette, sidebar: this.sidebar,
      focusManager: this.focusManager, mouseHandler: this.mouseHandler, layout: this.layout, approvalWidget: this._approvalWidget,
      delegate: {
        render: () => this.render(), getActiveChannel: () => this.getActiveChannel(),
        setActiveChannel: (ch) => this.setActiveChannel(ch), createNewChannel: () => this.createNewChannel(),
        writeToMain: (text) => this.writeToMain(text), showConfig: () => this.showConfig(),
        showPaneStatus: (msg) => this.statusDisplay.showPaneStatus(msg), getConfigPane: (id) => this.configPanes.getConfigPane(id),
        scrollChatUp: (n) => this.scrollChatUp(n), scrollChatDown: (n) => this.scrollChatDown(n),
        scrollChatPageUp: () => this.scrollChatPageUp(), scrollChatPageDown: () => this.scrollChatPageDown(),
        getSelectedText: () => this.mouseController.getSelectedText(), copyToClipboard: (t) => this.mouseController.copyToClipboard(t),
        clearSelection: () => { this.mouseController.clearSelection(); }, handlePaletteCommand: (cmd) => this.handlePaletteCommand(cmd),
      },
    });

    this.mouseController = new TuiMouseController({
      screen: this.screen, layout: this.layout, mouseHandler: this.mouseHandler, focusManager: this.focusManager,
      approvalWidget: this._approvalWidget, opts,
      delegate: {
        render: () => this.render(), getActiveChannel: () => this.getActiveChannel(),
        setActiveChannel: (ch) => this.setActiveChannel(ch), createNewChannel: () => this.createNewChannel(),
        getScrollBuffer: (ch) => this.channelManager.getScrollBuffer(ch), getSidebarRowMap: () => this._sidebarRowMap,
        getToolBlocks: (ch) => this.channelManager.getToolBlocks(ch),
        toggleToolBlock: (ch, idx) => { this.channelManager.toggleToolBlock(ch, idx); this.render(); },
        getChannelLines: (ch) => this.channelManager.getChannelLines(ch),
        handleFKeyBarClick: (col) => this.inputHandler.handleFKeyBarClick(col),
      },
    });

    if (opts.mouse !== false) {
      this.mouseController.wireEvents(this.inputHandler.mode, (v) => { this.inputHandler.approvalFocused = v; });
    }
    this.inputBar.setChannel('#control');
    this.sidebar.addChannel('#control', { active: true });
    this.sidebar.addSystemChannel('#logs');
    this.sidebar.addSystemChannel('#cost');
    this.inputBar.on('submit', ({ text }: { text: string }) => { this.handleSubmit(text); });
    this.inputBar.on('complete', () => {
      const text = this.inputBar.getText();
      if (text.startsWith('/setroot ')) {
        const partial = text.slice('/setroot '.length);
        const dirPath = partial.length > 0 ? dirname(partial) : '.';
        const prefix = partial.length > 0 ? basename(partial) : '';
        const dirResolved = dirPath === '.' ? cwd() : (dirPath.startsWith('~') ? join(homedir(), dirPath.slice(1)) : dirPath);
        try {
          const entries = readdirSync(dirResolved);
          const dirs = entries.filter((e: string) => {
            try { return statSync(join(dirResolved, e)).isDirectory(); } catch { return false; }
          });
          const matching = dirs.filter((d: string) => d.startsWith(prefix)).map((d: string) => `/setroot ${join(dirPath, d)}`);
          this.inputBar.setCompletions(matching);
        } catch {
          this.inputBar.setCompletions([]);
        }
      } else {
        this.inputBar.setCompletions([]);
      }
    });
  }

  /**
   * Gets the running.
   */
  get running(): boolean { return this._running; }

  /**
   * Start.
   */
  start(): void {
    this._running = true;
    process.stdout.write('\x1b[?1049l\x1b[?25l\x1b[2J\x1b[H');
    if (this.opts.mouse !== false) this.mouseHandler.enable();
    process.stdout.write('\x1b[?2004h');
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);
    process.stdin.resume();
    if (this.opts.mouse !== false) this.mouseController.registerRegions();
    this.render();
    process.stdout.write('\x1b[?25h');
    this._rawDataHandler = (data: Buffer) => this.inputHandler.onStdin(data);
    process.stdin.on('data', this._rawDataHandler);
    this._resizeHandler = () => this.onResize();
    process.stdout.on('resize', this._resizeHandler);
  }

  /**
   * Stop.
   */
  stop(): void {
    this._running = false;
    if (this.opts.mouse !== false) this.mouseHandler.disable();
    process.stdout.write('\x1b[?2004l');
    if (this._rawDataHandler) { process.stdin.removeListener('data', this._rawDataHandler); this._rawDataHandler = null; }
    if (this._resizeHandler) { process.stdout.removeListener('resize', this._resizeHandler); this._resizeHandler = null; }
    if (process.stdin.setRawMode) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\x1b[?25h\x1b[2J\x1b[H');
  }

  /**
   * Sets the render interval.
   */
  setRenderInterval(ms: number): void {
    this._renderInterval = Math.max(8, Math.min(200, ms));
  }

  private render(): void {
    if (!this._running) return;
    const now = Date.now();
    const elapsed = now - this._lastRenderTime;
    if (elapsed < (this._renderInterval ?? 16)) {
      if (!this._renderPending) {
        this._renderPending = true;
        setTimeout(() => { this._renderPending = false; this.render(); }, (this._renderInterval ?? 16) - elapsed);
      }
      return;
    }
    this._lastRenderTime = now;
    this.channelManager.refreshPendingBlocks();
    this.screen.clear();
    const layoutInfo = this.layout.getLayout();
    this.painter.paintOuterFrame();
    if (layoutInfo.sidebarVisible) {
      this._sidebarRowMap = this.painter.paintSidebar(this.sidebar, this.focusManager, this.channelView.activeView, this._approvalWidget.pending, this.opts.getMcpStatus);
      this.painter.paintSidebarBorder(this.focusManager);
    }
    this.painter.paintBorders(this.focusManager);
    const activeChannel = this.getActiveChannel();
    if (activeChannel.startsWith('@')) {
      const pane = this.configPanes.getConfigPane(activeChannel.slice(1));
      this.painter.paintChannelHeader(pane.breadcrumb.join(' › '));
      this.painter.paintConfigPane(pane);
    } else if (activeChannel === '#control') {
      this.painter.paintChannelHeader('#control');
      this.painter.paintControlDashboard(this.channelView.getControlDashboardData());
    } else {
      const root = getRedirectedRoot(activeChannel);
      this.painter.paintChannelHeader(activeChannel, root ?? undefined);
      const isThinking = this.statusDisplay.thinkingChannel === activeChannel && this.statusDisplay.thinkingTimer !== null;
      const staging = this.channelManager.hasStaging(activeChannel)
        ? { lines: this.channelManager.getStagingLines(activeChannel), scrollOffset: this.channelManager.getStagingScrollOffset(activeChannel), messageCount: this.channelManager.getStagingMessageCount(activeChannel) }
        : undefined;
      const thinkText = isThinking && this.statusDisplay.thinkingTextBuffer.length > 0 ? this.statusDisplay.thinkingTextBuffer : undefined;
      this.painter.paintMainContent(this.channelManager.getScrollBuffer(activeChannel), isThinking, this.statusDisplay.thinkingFrame, this.statusDisplay.thinkingMsg, staging, thinkText);
      if (this.channelManager.getChannelLines(activeChannel).length === 0 && !this._welcomeShown) { this.painter.paintWelcome(); this._welcomeShown = true; }
    }
    if (!activeChannel.startsWith('@')) this.painter.paintApprovalWidget(this._approvalWidget);
    const paneHint = activeChannel.startsWith('@') ? (this.statusDisplay.paneStatus ?? '↑↓:navigate │ enter:select │ esc:back') : undefined;
    this.painter.paintInputBar(this.inputBar, paneHint);
    const statusParts = this.painter.getContextualStatusParts(this.inputBar.getChannel(), this.statusBar.getValues(), this._approvalWidget.pending, this.opts.getChannelStatus);
    this.painter.paintStatusBar(statusParts, this.statusDisplay.compactingChannel === activeChannel && this.statusDisplay.compactingTimer !== null);
    this.painter.paintFKeyBar();
    if (this.commandPalette.isVisible()) this.commandPalette.render();
    this.emitScreen();
  }

  private emitScreen(): void {
    const parts: string[] = [];

    for (let r = 0; r < this.screen.height; r++) {
      parts.push(`\x1b[${r + 1};1H`);
      let lastAnsi = '';
      for (let c = 0; c < this.screen.width; c++) {
        if (r === this.screen.height - 1 && c === this.screen.width - 1) break;
        const cell = (this.screen as any).cells[r][c];
        const ansi = cell.ansi || '';
        if (ansi !== lastAnsi) {
          parts.push(ansi || '\x1b[0m');
          lastAnsi = ansi;
        }
        parts.push(cell.char);
      }
      parts.push('\x1b[0m');
    }

    const cursor = this.screen.getCursor();
    parts.push(`\x1b[${cursor.row + 1};${cursor.col + 1}H`);

    if (this.mouseController.hasSelection) {
      const overlay = this.mouseController.renderSelectionOverlay();
      if (overlay) parts.push(overlay);
    }

    process.stdout.write(parts.join(''));
  }

  private onResize(): void {
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 40;
    this.screen.resize(cols, rows);
    this.layout.resize(cols, rows);
    const li = this.layout.getLayout();
    this.sidebar.setRegion({ x: li.sidebar.col, y: li.sidebar.row, width: li.sidebar.width, height: li.sidebar.height });
    this.inputBar.setRegion({ x: li.inputBar.col, y: li.inputBar.row, width: li.inputBar.width, height: 1 });
    this.statusBar.setRegion({ x: li.statusBar.col, y: li.statusBar.row, width: li.statusBar.width, height: 1 });
    if (this.opts.mouse !== false) this.mouseController.registerRegions();
    this.channelManager.reRenderAllChannels(this.getActiveChannel());
    this.render();
  }

  /**
   * Gets the active channel.
   */
  getActiveChannel(): string { return this.channelView.getActiveChannel(); }

  /**
   * Sets the active channel.
   */
  setActiveChannel(channel: string): void {
    this.channelView.setActiveChannel(channel, () => this.mouseController.clearSelection());
  }

  /**
   * Add channel.
   */
  addChannel(name: string): void { this.channelView.addChannel(name); }
  /**
   * Create new channel.
   */
  createNewChannel(): void { this.channelView.createNewChannel(); }
  /**
   * Remove channel.
   */
  removeChannel(name: string): void { this.channelView.removeChannel(name); }
  /**
   * Add agent.
   */
  addAgent(name: string, opts?: { model?: string; status?: string }): void { this.channelView.addAgent(name, opts); }
  /**
   * Remove agent.
   */
  removeAgent(name: string): void { this.channelView.removeAgent(name); }
  /**
   * Update agent status.
   */
  updateAgentStatus(name: string, status: string): void { this.channelView.updateAgentStatus(name, status); }
  /**
   * Clear providers.
   */
  clearProviders(): void { this.channelView.clearProviders(); }

  /**
   * Add channel child.
   */
  addChannelChild(channelName: string, child: { id: string; label: string; model?: string; status?: 'idle' | 'thinking' | 'tool_use' | 'done' | 'error'; role?: 'operator' | 'worker' }): void {
    this.channelView.addChannelChild(channelName, child);
  }
  /**
   * Update channel child.
   */
  updateChannelChild(channelName: string, childId: string, updates: { status?: 'idle' | 'thinking' | 'tool_use' | 'done' | 'error'; label?: string }): void {
    this.channelView.updateChannelChild(channelName, childId, updates);
  }
  /**
   * Remove channel child.
   */
  removeChannelChild(channelName: string, childId: string): void { this.channelView.removeChannelChild(channelName, childId); }
  /**
   * Update provider.
   */
  updateProvider(providerName: string, connected: boolean, model: string, stats: { tokens?: number; cost?: number; cacheRead?: number; cacheWrite?: number; agents?: number }, type?: string): void {
    this.channelView.updateProvider(providerName, connected, model, stats, type);
  }

  /**
   * Adjust font size.
   */
  adjustFontSize(delta: number): void {
    if (delta === 0) { process.stdout.write('\x1b]50;resetFont\x07'); return; }
    const seq = delta > 0 ? '\x1b]1337;SetFontSize=+1\x07\x1b[>1t' : '\x1b]1337;SetFontSize=-1\x07\x1b[>2t';
    process.stdout.write(seq);
  }

  /**
   * Push approval.
   */
  pushApproval(request: ApprovalRequest): void {
    this._approvalWidget.push(request);
    if (!this.getActiveChannel().startsWith('@')) this.inputHandler.approvalFocused = true;
    this.render();
  }

  /**
   * Remove approval.
   */
  removeApproval(id: string): void {
    this._approvalWidget.remove(id);
    if (this._approvalWidget.isEmpty) this.inputHandler.approvalFocused = false;
    this.render();
  }

  /**
   * Gets the approval widget.
   */
  getApprovalWidget(): ApprovalWidget { return this._approvalWidget; }
  /**
   * Checks whether approval focused.
   */
  isApprovalFocused(): boolean { return this.inputHandler.approvalFocused && !this._approvalWidget.isEmpty; }
  /**
   * Sets the approval focused.
   */
  setApprovalFocused(focused: boolean): void { this.inputHandler.approvalFocused = focused && !this._approvalWidget.isEmpty; }
  /**
   * Show config.
   */
  showConfig(): void { this.setActiveChannel('@config'); this.render(); }

  /**
   * Show channel config.
   */
  showChannelConfig(channel: string): void {
    this.setActiveChannel(channel.startsWith('@') ? channel : '@config');
    this.render();
  }

  /**
   * Show context picker.
   */
  showContextPicker(items: CommandDef[], onSelect: (item: CommandDef) => void): void {
    this.showPicker('saved contexts', items, onSelect);
  }

  /**
   * Show picker.
   */
  showPicker(title: string, items: CommandDef[], onSelect: (item: CommandDef) => void): void {
    this.commandPalette.showPicker(title, items, onSelect);
    this.focusManager.setRegionVisible('palette', true);
    this.focusManager.lockFocus('input');
    this.render();
  }

  /**
   * Gets the is streaming.
   */
  get isStreaming(): boolean { return this.channelView.isStreaming; }
  /**
   * Stage message.
   */
  stageMessage(sender: string, content: string, channel?: string): void { this.channelView.stageMessage(sender, content, channel); }
  /**
   * Checks whether staging exists.
   */
  hasStaging(channel?: string): boolean { return this.channelView.hasStaging(channel); }
  /**
   * Flush staging.
   */
  flushStaging(channel?: string): Array<{ sender: string; content: string }> { return this.channelView.flushStaging(channel); }
  /**
   * Update status.
   */
  updateStatus(data: { provider?: string; model?: string; effort?: string; agents?: number; cost?: { current: number; budget: number } }): void { this.channelView.updateStatus(data); }

  /**
   * Rebuild mcp menu.
   */
  rebuildMcpMenu(_servers: string[], _configs?: any[]): void {
    if (this.opts.menuConfig) {
      this.opts.menuConfig.mcpServers = _servers;
      this.opts.menuConfig.mcpConfigs = _configs;
    }
  }

  /**
   * Scroll chat up.
   */
  scrollChatUp(lines = 3): void { this.channelView.scrollChatUp(lines); }
  /**
   * Scroll chat down.
   */
  scrollChatDown(lines = 3): void { this.channelView.scrollChatDown(lines); }
  /**
   * Scroll chat page up.
   */
  scrollChatPageUp(): void { this.channelView.scrollChatPageUp(); }
  /**
   * Scroll chat page down.
   */
  scrollChatPageDown(): void { this.channelView.scrollChatPageDown(); }
  /**
   * Start thinking.
   */
  startThinking(channel?: string, message?: string): void { this.statusDisplay.startThinking(channel, message); }
  /**
   * Update thinking message.
   */
  updateThinkingMessage(message: string): void { this.statusDisplay.updateThinkingMessage(message); }
  /**
   * Stop thinking.
   */
  stopThinking(): void { this.statusDisplay.stopThinking(); }
  /**
   * Start compacting.
   */
  startCompacting(channel?: string): void { this.statusDisplay.startCompacting(channel); }
  /**
   * Stop compacting.
   */
  stopCompacting(): void { this.statusDisplay.stopCompacting(); }
  /**
   * Show pane status.
   */
  showPaneStatus(msg: string): void { this.statusDisplay.showPaneStatus(msg); }
  /**
   * Gets the config pane.
   */
  getConfigPane(paneId: string) { return this.configPanes.getConfigPane(paneId); }
  /**
   * Write to main.
   */
  writeToMain(text: string, channel?: string): void { this.channelView.writeToMain(text, channel); }
  /**
   * Write message.
   */
  writeMessage(type: 'user' | 'agent' | 'system', sender: string, content: string, channel?: string): void { this.channelView.writeMessage(type, sender, content, channel); }
  /** Trim channel buffer after compaction. */
  trimChannelBuffer(channel: string, summary: string, keepCount: number): void { this.channelView.trimChannelBuffer(channel, summary, keepCount); }
  /**
   * Begin stream message.
   */
  beginStreamMessage(sender: string, channel?: string): void { this.channelView.beginStreamMessage(sender, channel); }
  /**
   * Append stream chunk.
   */
  appendStreamChunk(text: string, channel?: string): void { this.channelView.appendStreamChunk(text, channel); }
  /**
   * Finalize stream message.
   */
  finalizeStreamMessage(channel?: string): void { this.channelView.finalizeStreamMessage(channel); }
  /**
   * Cancel stream message.
   */
  cancelStreamMessage(channel?: string): void { this.channelView.cancelStreamMessage(channel); }
  /**
   * Gets the channel lines.
   */
  getChannelLines(channel?: string): string[] { return this.channelView.getChannelLines(channel); }
  /**
   * Gets the channel messages.
   */
  getChannelMessages(channel?: string): ChatMessage[] { return this.channelView.getChannelMessages(channel); }

  /**
   * Append stream thinking.
   */
  appendStreamThinking(text: string, channel?: string): void {
    this.channelView.appendStreamThinking(text, (t) => this.statusDisplay.appendThinkingText(t), channel);
  }
  /**
   * Write tool block.
   */
  writeToolBlock(toolName: string, description: string, result: { success: boolean; data?: string; error?: string }, durationMs: number, channel?: string): void {
    this.channelView.writeToolBlock(toolName, description, result, durationMs, channel);
  }
  /**
   * Begin tool block.
   */
  beginToolBlock(toolName: string, description: string, channel?: string): number { return this.channelView.beginToolBlock(toolName, description, channel); }
  /**
   * Update tool block description.
   */
  updateToolBlockDescription(channel: string, blockId: number, description: string): void { this.channelView.updateToolBlockDescription(channel, blockId, description); }
  /**
   * Complete tool block.
   */
  completeToolBlock(channel: string, blockId: number, result: { success: boolean; data?: string; error?: string }, durationMs?: number): void {
    this.channelView.completeToolBlock(channel, blockId, result, durationMs);
  }

  private handlePaletteCommand(command: string): boolean {
    if (command === '/model') {
      const models = this.opts.getAvailableModels?.() ?? [];
      const items = models.map(m => ({ name: `${m.provider}/${m.model}`, description: '', category: 'standard' as const }));
      this.commandPalette.showPicker('model', items, (selected) => {
        const [provider, ...modelParts] = selected.name.split('/');
        this.opts.onModelSelect?.(provider, modelParts.join('/'));
        this.updateStatus({ provider, model: modelParts.join('/') });
      });
      this.focusManager.setRegionVisible('palette', true);
      this.focusManager.lockFocus('input');
      return true;
    }
    const cmdName = command.replace(/^\//, '');
    const dispatch = this.opts.getCommandDispatch?.();
    if (dispatch?.hasPicker(cmdName)) {
      this.handleSubmit(command);
      return true;
    }
    // If it's a recognized command, submit it directly
    if (dispatch?.isRecognized(cmdName)) {
      this.handleSubmit(command);
      return true;
    }
    return false;
  }

  private handleSubmit(text: string): void {
    if (!text.trim()) return;
    this.opts.onSubmit(text).then(() => this.render()).catch(() => this.render());
  }
}

export { TuiRenderer as TuiMode };
