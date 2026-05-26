/**
 * Mouse event wiring, text selection, and clipboard operations for the TUI.
 * Handles click routing to regions, drag-to-select, scroll wheel, and sidebar resizing.
 */

import { spawn } from 'node:child_process';
import { ScreenBuffer, LayoutManager, MouseHandler, type MouseEvent as TuiMouseEvent, FocusManager, type FocusableRegion, ApprovalWidget, ScrollBuffer } from '../tui/index.js';
import type { TuiRendererOptions, ToolBlock } from './TuiTypes.js';

/** Callback interface the mouse controller uses to trigger side effects on the parent. */
export interface MouseControllerDelegate {
  render(): void;
  getActiveChannel(): string;
  setActiveChannel(channel: string): void;
  createNewChannel(): void;
  getScrollBuffer(channel: string): ScrollBuffer;
  getSidebarRowMap(): (string | null)[];
  getToolBlocks(channel: string): ToolBlock[] | undefined;
  toggleToolBlock(channel: string, lineIndex: number): void;
  getChannelLines(channel: string): string[];
  handleFKeyBarClick(col: number): void;
}

/**
 * Manages all mouse interaction: click regions, drag selection,
 * scroll events, sidebar resizing, and clipboard integration.
 */
export class TuiMouseController {
  private screen: ScreenBuffer;
  private layout: LayoutManager;
  private mouseHandler: MouseHandler;
  private focusManager: FocusManager;
  private approvalWidget: ApprovalWidget;
  private opts: TuiRendererOptions;
  private delegate: MouseControllerDelegate;

  private _selection: { startLine: number; startCol: number; endLine: number; endCol: number } | null = null;
  private _selecting = false;
  private _resizingSidebar = false;

  constructor(deps: {
    screen: ScreenBuffer;
    layout: LayoutManager;
    mouseHandler: MouseHandler;
    focusManager: FocusManager;
    approvalWidget: ApprovalWidget;
    opts: TuiRendererOptions;
    delegate: MouseControllerDelegate;
  }) {
    this.screen = deps.screen;
    this.layout = deps.layout;
    this.mouseHandler = deps.mouseHandler;
    this.focusManager = deps.focusManager;
    this.approvalWidget = deps.approvalWidget;
    this.opts = deps.opts;
    this.delegate = deps.delegate;
  }

  /** Current text selection bounds, or null if nothing selected. */
  get selection() { return this._selection; }

  /** Clear the current text selection. */
  clearSelection(): void { this._selection = null; }

  /** Whether a selection currently exists. */
  get hasSelection(): boolean { return this._selection !== null; }

  /** Wire up mouse event listeners on the MouseHandler. */
  wireEvents(_mode: 'chat' | 'config', approvalFocusedSetter: (v: boolean) => void): void {
    this.mouseHandler.on('click', (event: TuiMouseEvent, region) => {
      if (this._selection) { this._selection = null; this.delegate.render(); }

      if (!this.approvalWidget.isEmpty && !this.delegate.getActiveChannel().startsWith('@')) {
        const screenWidth = this.screen.width;
        const modalWidth = Math.max(40, Math.min(80, Math.floor(screenWidth * 0.5)));
        const layoutInfo = this.layout.getLayout();
        const statusRow = layoutInfo.inputBar.row - 1;
        const contentLines = this.approvalWidget.render();
        const modalHeight = contentLines.length + 2;
        const modalTop = Math.max(layoutInfo.main.row + 1, statusRow - modalHeight - 2);
        const modalLeft = Math.floor((screenWidth - modalWidth) / 2);
        const modalRight = modalLeft + modalWidth;
        if (event.row >= modalTop && event.row <= modalTop + modalHeight && event.col >= modalLeft && event.col < modalRight) {
          approvalFocusedSetter(true);
          const queueRow = modalTop + contentLines.length;
          if (this.approvalWidget.pending > 1 && event.row === queueRow) {
            if (event.col <= modalLeft + 4) {
              this.approvalWidget.handleKey('[');
            } else if (event.col >= modalRight - 5) {
              this.approvalWidget.handleKey(']');
            }
          }
          const req = this.approvalWidget.activeRequest;
          if (req) {
            const inputType = req.inputType ?? (req.options ? 'radio' : 'freeform');
            if (inputType === 'freeform' || !req.options || req.options.length === 0) {
              this.approvalWidget.enterFreeform();
            }
          }
          this.delegate.render();
          return;
        }
      }

      const sidebarBorderCol = this.layout.getLayout().sidebar.width;
      if (event.col >= sidebarBorderCol - 1 && event.col <= sidebarBorderCol + 1 && this.layout.isSidebarVisible()) {
        this._resizingSidebar = true;
        return;
      }

      if (this.isInMainArea(event.row, event.col)) {
        const activeChannel = this.delegate.getActiveChannel();
        if (activeChannel.startsWith('@')) {
          this.delegate.render();
          return;
        }
        const layoutInfo = this.layout.getLayout();
        const main = layoutInfo.main;
        const mainStartRow = main.row + 2;
        const mainEndRow = main.row + main.height - 2;
        if (event.row < mainStartRow || event.row > mainEndRow) return;
        const scrollOffset = this.delegate.getScrollBuffer(activeChannel).scrollOffset;
        const bufLine = event.row - mainStartRow + scrollOffset;

        const blocks = this.delegate.getToolBlocks(activeChannel);
        if (blocks) {
          for (const block of blocks) {
            const blockEnd = block.lineIndex + (block.expanded ? this.blockLineCount(block) : 3);
            if (bufLine >= block.lineIndex && bufLine < blockEnd) {
              this.delegate.toggleToolBlock(activeChannel, bufLine);
              return;
            }
          }
        }

        const clampedCol = Math.max(0, Math.min(main.width - 3, event.col - main.col - 1));
        this._selecting = true;
        this._selection = { startLine: bufLine, startCol: clampedCol, endLine: bufLine, endCol: clampedCol };
        this.delegate.render();
        return;
      }

      if (region) {
        if (region.id === 'fkeybar') { this.delegate.handleFKeyBarClick(event.col); return; }
        if (region.id === 'sidebar') {
          const clicked = this.delegate.getSidebarRowMap()[event.row];
          if (clicked) {
            if (clicked === '+new-channel') {
              this.delegate.createNewChannel();
            } else if (clicked.startsWith('mcp:')) {
              const serverName = clicked.slice(4);
              const mcpStatus = this.opts.getMcpStatus?.();
              const srv = mcpStatus?.find(s => s.name === serverName);
              if (srv && srv.status !== 'connected') {
                this.opts.onMcpAuth?.(serverName);
              }
            } else {
              this.delegate.setActiveChannel(clicked);
              if (clicked.startsWith('@')) {
                this.focusManager.focusInput();
              }
            }
          }
          this.delegate.render();
          return;
        }
        const regionId = region.id as FocusableRegion;
        if (this.focusManager.isRegionVisible(regionId)) {
          this.focusManager.setFocus(regionId, 'click');
          this.delegate.render();
        }
      }
    });

    this.mouseHandler.on('drag', (event: TuiMouseEvent) => {
      if (this._resizingSidebar) {
        this.layout.setSidebarWidth(event.col);
        this.delegate.render();
        return;
      }
      if (this.delegate.getActiveChannel().startsWith('@')) return;
      if (this._selecting && this._selection) {
        const layoutInfo = this.layout.getLayout();
        const main = layoutInfo.main;
        const mainStartRow = main.row + 2;
        const mainEndRow = main.row + main.height - 2;
        const ch = this.delegate.getActiveChannel();
        const scrollBuf = this.delegate.getScrollBuffer(ch);

        if (event.row <= mainStartRow) scrollBuf.scrollUp(1);
        else if (event.row >= mainEndRow) scrollBuf.scrollDown(1);

        const bufLine = Math.max(0, event.row - mainStartRow + scrollBuf.scrollOffset);
        const clampedCol = Math.max(0, Math.min(main.width - 3, event.col - main.col - 1));
        this._selection.endLine = bufLine;
        this._selection.endCol = clampedCol;
        this.delegate.render();
      }
    });

    this.mouseHandler.on('release', () => {
      if (this._resizingSidebar) { this._resizingSidebar = false; return; }
      if (this._selecting && this._selection) {
        this._selecting = false;
        const text = this.getSelectedText();
        if (text) this.copyToClipboard(text);
      }
    });

    this.mouseHandler.on('scroll', (event: TuiMouseEvent) => {
      if (this.delegate.getActiveChannel().startsWith('@')) return;
      if (this.isInMainArea(event.row, event.col)) {
        if (event.scrollDirection === 'up') {
          this.delegate.getScrollBuffer(this.delegate.getActiveChannel()).scrollUp(3);
        } else {
          this.delegate.getScrollBuffer(this.delegate.getActiveChannel()).scrollDown(3);
        }
        this.delegate.render();
      }
    });
  }

  /** Register clickable regions based on current layout. */
  registerRegions(): void {
    this.mouseHandler.clearRegions();
    const layoutInfo = this.layout.getLayout();
    if (layoutInfo.sidebarVisible) {
      this.mouseHandler.registerRegion({
        id: 'sidebar',
        x: layoutInfo.sidebar.col,
        y: layoutInfo.sidebar.row,
        width: layoutInfo.sidebar.width,
        height: layoutInfo.sidebar.height,
      });
    }
    this.mouseHandler.registerRegion({
      id: 'main',
      x: layoutInfo.main.col,
      y: layoutInfo.main.row,
      width: layoutInfo.main.width,
      height: layoutInfo.main.height,
    });
    this.mouseHandler.registerRegion({
      id: 'input',
      x: layoutInfo.inputBar.col,
      y: layoutInfo.inputBar.row,
      width: layoutInfo.inputBar.width,
      height: 1,
    });
    if (this.screen.height >= 5 && this.layout.hasRegion('fkey')) {
      const fkey = this.layout.getRegion('fkey');
      this.mouseHandler.registerRegion({
        id: 'fkeybar',
        x: fkey.x,
        y: fkey.y,
        width: fkey.width,
        height: 1,
      });
    }
  }

  /** Extract plain text from the current selection range. */
  getSelectedText(): string {
    if (!this._selection) return '';
    const ch = this.delegate.getActiveChannel();
    const channelLines = this.delegate.getChannelLines(ch);
    let { startLine, startCol, endLine, endCol } = this._selection;
    if (startLine > endLine || (startLine === endLine && startCol > endCol)) {
      [startLine, startCol, endLine, endCol] = [endLine, endCol, startLine, startCol];
    }
    const result: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      if (i < 0 || i >= channelLines.length) continue;
      const line = channelLines[i].replace(/\x1b\[[0-9;]*m/g, '');
      const from = i === startLine ? startCol : 0;
      const to = i === endLine ? endCol + 1 : line.length;
      result.push(line.slice(from, to));
    }
    return result.join('\n');
  }

  /** Copy text to system clipboard (macOS only). */
  copyToClipboard(text: string): void {
    if (!text) return;
    if (process.platform === 'darwin') {
      const pbcopy = spawn('pbcopy');
      pbcopy.stdin.write(text);
      pbcopy.stdin.end();
    }
  }

  /** Render selection highlight overlay as escape sequences to append to the frame. */
  renderSelectionOverlay(): string {
    if (!this._selection) return '';
    const layoutInfo = this.layout.getLayout();
    const main = layoutInfo.main;
    const mainStartRow = main.row + 2;
    const mainEndRow = main.row + main.height - 2;
    const screenCol = main.col + 1;
    const maxVisibleCol = main.width - 2;
    const ch = this.delegate.getActiveChannel();
    const scrollOffset = this.delegate.getScrollBuffer(ch).scrollOffset;

    let { startLine, startCol, endLine, endCol } = this._selection;
    if (startLine > endLine || (startLine === endLine && startCol > endCol)) {
      [startLine, startCol, endLine, endCol] = [endLine, endCol, startLine, startCol];
    }

    let overlay = '';
    for (let bufIdx = startLine; bufIdx <= endLine; bufIdx++) {
      const screenRow = bufIdx - scrollOffset + mainStartRow;
      if (screenRow < mainStartRow || screenRow > mainEndRow) continue;
      const lineFrom = bufIdx === startLine ? startCol : 0;
      const lineTo = bufIdx === endLine ? endCol : maxVisibleCol - 1;
      if (lineFrom > lineTo) continue;
      const absFrom = screenCol + lineFrom;
      const absTo = screenCol + lineTo;
      overlay += `\x1b[${screenRow + 1};${absFrom + 1}H\x1b[7m`;
      const rowText = this.screen.readRow(screenRow);
      overlay += rowText.slice(absFrom, absTo + 1);
      overlay += '\x1b[0m';
    }
    return overlay;
  }

  private isInMainArea(row: number, col: number): boolean {
    const layoutInfo = this.layout.getLayout();
    const main = layoutInfo.main;
    return row >= main.row && row < main.row + main.height && col >= main.col && col < main.col + main.width;
  }

  private blockLineCount(block: ToolBlock): number {
    if (!block.expanded) return 3;
    const output = block.result.success ? (block.result.data ?? '') : (block.result.error ?? '');
    const outputLines = Math.min(output.split('\n').length, 50);
    return 2 + outputLines + (output.split('\n').length > 50 ? 1 : 0) + 1;
  }
}
