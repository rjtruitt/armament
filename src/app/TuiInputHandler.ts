/**
 * Keyboard input processing for the TUI.
 * Handles raw stdin parsing, escape sequence tokenization, bracketed paste,
 * and dispatches key events to the appropriate handler based on current mode.
 */

import { InputBar, CommandPalette, Sidebar, FocusManager, MouseHandler, LayoutManager, ApprovalWidget } from '../tui/index.js';
import type { TuiRendererOptions } from './TuiTypes.js';
import {
  handleApprovalKey,
  handlePaneKey,
  handleFKey,
  handlePaletteKey,
  handleSidebarKey,
  handleFKeyBarClick as handleFKeyBarClickAction,
  checkPaletteState,
  completePaste,
  type ActionDeps,
} from './TuiInputActions.js';

/** Callback interface the input handler uses to trigger side effects on the parent. */
export interface InputHandlerDelegate {
  render(): void;
  getActiveChannel(): string;
  setActiveChannel(channel: string): void;
  createNewChannel(): void;
  writeToMain(text: string): void;
  showConfig(): void;
  showPaneStatus(msg: string): void;
  getConfigPane(paneId: string): { handleKey(key: string): boolean; currentPanelId?: string };
  scrollChatUp(lines: number): void;
  scrollChatDown(lines: number): void;
  scrollChatPageUp(): void;
  scrollChatPageDown(): void;
  getSelectedText(): string;
  copyToClipboard(text: string): void;
  clearSelection(): void;
  handlePaletteCommand?(command: string): boolean;
}

/**
 * Processes raw stdin bytes into tokenized key sequences and routes them
 * to the correct handler based on focus state and active mode.
 */
export class TuiInputHandler {
  private opts: TuiRendererOptions;
  private inputBar: InputBar;
  private commandPalette: CommandPalette;
  private sidebar: Sidebar;
  private focusManager: FocusManager;
  private mouseHandler: MouseHandler;
  private layout: LayoutManager;
  private approvalWidget: ApprovalWidget;
  private delegate: InputHandlerDelegate;

  private _escTimer: ReturnType<typeof setTimeout> | null = null;
  private _escBuffer = '';
  private _pasteBuffer: string | null = null;

  /**
   * mode property.
   */
  mode: 'chat' = 'chat';
  /** Whether the approval modal currently has keyboard focus. */
  approvalFocused = false;
  /** Selection state managed externally but tracked here for Ctrl+C. */
  hasSelection = false;

  constructor(deps: {
    opts: TuiRendererOptions;
    inputBar: InputBar;
    commandPalette: CommandPalette;
    sidebar: Sidebar;
    focusManager: FocusManager;
    mouseHandler: MouseHandler;
    layout: LayoutManager;
    approvalWidget: ApprovalWidget;
    delegate: InputHandlerDelegate;
  }) {
    this.opts = deps.opts;
    this.inputBar = deps.inputBar;
    this.commandPalette = deps.commandPalette;
    this.sidebar = deps.sidebar;
    this.focusManager = deps.focusManager;
    this.mouseHandler = deps.mouseHandler;
    this.layout = deps.layout;
    this.approvalWidget = deps.approvalWidget;
    this.delegate = deps.delegate;
  }

  /** Entry point for raw stdin data. Buffers partial escape sequences. */
  onStdin(data: Buffer): void {
    const seq = data.toString('utf8');

    if (this._escBuffer) {
      if (this._escTimer) { clearTimeout(this._escTimer); this._escTimer = null; }
      const combined = this._escBuffer + seq;
      this._escBuffer = '';
      this.dispatch(combined);
      return;
    }

    if (seq === '\x1b') {
      this._escBuffer = seq;
      this._escTimer = setTimeout(() => {
        const buffered = this._escBuffer;
        this._escBuffer = '';
        this._escTimer = null;
        this.processKey(buffered);
      }, 50);
      return;
    }

    this.dispatch(seq);
  }

  private dispatch(data: string): void {
    const tokens = this.tokenize(data);
    for (const token of tokens) {
      this.processKey(token);
    }
  }

  /** Split raw input into individual key/sequence tokens for sequential processing. */
  tokenize(data: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < data.length) {
      if (data[i] === '\x1b') {
        if (i + 1 < data.length && data[i + 1] === '[') {
          let end = i + 2;
          while (end < data.length && data.charCodeAt(end) >= 0x20 && data.charCodeAt(end) <= 0x3f) end++;
          if (end < data.length && data.charCodeAt(end) >= 0x40 && data.charCodeAt(end) <= 0x7e) end++;
          tokens.push(data.slice(i, end));
          i = end;
        } else if (i + 1 < data.length && data[i + 1] === 'O') {
          const end = Math.min(i + 3, data.length);
          tokens.push(data.slice(i, end));
          i = end;
        } else if (i + 1 < data.length && data[i + 1] === ']') {
          let end = i + 2;
          while (end < data.length && data[end] !== '\x07' && !(data[end] === '\x1b' && data[end + 1] === '\\')) end++;
          if (end < data.length) end++;
          tokens.push(data.slice(i, end));
          i = end;
        } else {
          const end = Math.min(i + 2, data.length);
          tokens.push(data.slice(i, end));
          i = end;
        }
      } else if (data[i] === '\r' || data[i] === '\n') {
        // Treat \r\n (CRLF) as a single token to avoid double-enter on some terminals
        if (data[i] === '\r' && i + 1 < data.length && data[i + 1] === '\n') {
          tokens.push('\r\n');
          i += 2;
        } else {
          tokens.push(data[i]);
          i++;
        }
      } else if (data.charCodeAt(i) < 32) {
        tokens.push(data[i]);
        i++;
      } else {
        let end = i + 1;
        while (end < data.length && data.charCodeAt(end) >= 32 && data[end] !== '\x1b') end++;
        tokens.push(data.slice(i, end));
        i = end;
      }
    }
    return tokens;
  }

  /** Route a single key token to the correct handler based on current state. */
  processKey(seq: string): void {
    if (this._pasteBuffer !== null) {
      const endIdx = seq.indexOf('\x1b[201~');
      if (endIdx >= 0) {
        this._pasteBuffer += seq.slice(0, endIdx);
        completePaste(this.actionDeps(), this._pasteBuffer);
        this._pasteBuffer = null;
        const remainder = seq.slice(endIdx + 6);
        if (remainder.length > 0) this.processKey(remainder);
      } else {
        this._pasteBuffer += seq;
      }
      return;
    }
    if (seq.includes('\x1b[200~')) {
      const start = seq.indexOf('\x1b[200~') + 6;
      const endIdx = seq.indexOf('\x1b[201~', start);
      if (endIdx >= 0) {
        completePaste(this.actionDeps(), seq.slice(start, endIdx));
        const remainder = seq.slice(endIdx + 6);
        if (remainder.length > 0) this.processKey(remainder);
      } else {
        this._pasteBuffer = seq.slice(start);
      }
      return;
    }

    if (seq === '\x03') {
      if (this.hasSelection) {
        const text = this.delegate.getSelectedText();
        if (text) { this.delegate.copyToClipboard(text); this.delegate.clearSelection(); this.delegate.render(); return; }
      }
      this.opts.onExit();
      return;
    }

    if (seq === '\x04') { this.opts.onExit(); return; }

    if (this.opts.mouse !== false) {
      const mouseEvent = this.mouseHandler.parse(seq);
      if (mouseEvent) { this.mouseHandler.handleEvent(mouseEvent); return; }
    }

    const deps = this.actionDeps();

    if (this.delegate.getActiveChannel().startsWith('@') && !this.focusManager.hasFocus('sidebar')) {
      if (handlePaneKey(deps, seq)) return;
    }

    if (this.approvalFocused && !this.approvalWidget.isEmpty) {
      if (handleApprovalKey(deps, seq)) { this.approvalFocused = deps.approvalFocused; return; }
    }

    if (handleFKey(deps, seq)) return;

    if (seq === '\x1b') {
      if (this.commandPalette.isVisible()) {
        this.commandPalette.hide();
        this.focusManager.unlockFocus();
      } else if (this.focusManager.hasFocus('sidebar')) {
        this.focusManager.focusInput();
      } else if (this.opts.isProcessing?.()) {
        this.opts.onInterrupt?.();
      } else {
        this.focusManager.focusInput();
      }
      this.delegate.render();
      return;
    }

    if (seq === '\t') {
      const text = this.inputBar.getText();
      // Route Tab to InputBar for argument completion on supported commands
      // Do this before palette check so Tab on /setroot completes paths, not focus
      if (text.startsWith('/setroot ') || text.startsWith('/join ') || text.startsWith('/switch ')) {
        this.inputBar.handleKey('tab');
        this.delegate.render();
        return;
      }
      this.focusManager.focusNext();
      this.delegate.render();
      return;
    }

    if (this.commandPalette.isVisible()) { handlePaletteKey(deps, seq); return; }

    if (seq === '\x1b[5~') { this.delegate.scrollChatPageUp(); return; }
    if (seq === '\x1b[6~') { this.delegate.scrollChatPageDown(); return; }
    if (seq === '\x1b[1;2A') { this.delegate.scrollChatUp(3); return; }
    if (seq === '\x1b[1;2B') { this.delegate.scrollChatDown(3); return; }

    if (this.focusManager.hasFocus('sidebar')) {
      if (handleSidebarKey(deps, seq)) return;
    }

    if (seq === '\x1b[A') { this.inputBar.handleKey('up'); this.delegate.render(); return; }
    if (seq === '\x1b[B') { this.inputBar.handleKey('down'); this.delegate.render(); return; }
    if (seq === '\x1b[C') { this.inputBar.handleKey('right'); this.delegate.render(); return; }
    if (seq === '\x1b[D') { this.inputBar.handleKey('left'); this.delegate.render(); return; }
    if (seq === '\x1b[H' || seq === '\x1b[1~') { this.inputBar.handleKey('home'); this.delegate.render(); return; }
    if (seq === '\x1b[F' || seq === '\x1b[4~') { this.inputBar.handleKey('end'); this.delegate.render(); return; }
    if (seq === '\x1b[3~') { this.inputBar.handleKey('delete'); this.delegate.render(); return; }

    if (seq === '\x1b[Z') { this.focusManager.focusPrev(); this.delegate.render(); return; }

    if (seq === '\r' || seq === '\n' || seq === '\r\n') {
      this.inputBar.handleKey('enter');
      this.delegate.render();
      return;
    }

    if (seq === '\x7f' || seq === '\x08') {
      this.inputBar.handleKey('backspace');
      checkPaletteState(deps);
      this.delegate.render();
      return;
    }

    if (seq === '\x15') { this.inputBar.handleKey('ctrl+u'); this.commandPalette.hide(); this.delegate.render(); return; }
    if (seq === '\x0b') { this.inputBar.handleKey('ctrl+k'); this.delegate.render(); return; }
    if (seq === '\x01') { this.inputBar.handleKey('ctrl+a'); this.delegate.render(); return; }
    if (seq === '\x05') { this.inputBar.handleKey('ctrl+e'); this.delegate.render(); return; }
    if (seq === '\x17') { this.inputBar.handleKey('ctrl+w'); this.commandPalette.hide(); this.delegate.render(); return; }

    if (seq.startsWith('\x1b')) return;

    for (const char of seq) {
      if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127) {
        this.inputBar.handleKey(char);
      }
    }
    checkPaletteState(deps);
    this.delegate.render();
  }

  /** Map F-key bar column to the corresponding F-key sequence for click handling. */
  handleFKeyBarClick(col: number): void {
    handleFKeyBarClickAction(this.actionDeps(), col);
  }

  /** Show or hide the command palette based on current input bar text. */
  checkPaletteState(): void {
    checkPaletteState(this.actionDeps());
  }

  private actionDeps(): ActionDeps {
    return {
      opts: this.opts,
      inputBar: this.inputBar,
      commandPalette: this.commandPalette,
      sidebar: this.sidebar,
      focusManager: this.focusManager,
      layout: this.layout,
      approvalWidget: this.approvalWidget,
      delegate: this.delegate,
      approvalFocused: this.approvalFocused,
      processKey: (seq: string) => this.processKey(seq),
    };
  }
}
