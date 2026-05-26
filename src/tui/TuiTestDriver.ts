/** Debug mode harness for programmatically driving and observing the TUI without a real terminal. */

import { ScreenBuffer } from './ScreenBuffer.js';
import { LayoutManager } from './LayoutManager.js';
import { PhaseManager, Phase } from './PhaseManager.js';
import { LoadingAnimator, AnimationSpeed } from './LoadingAnimator.js';
import { SessionMenu } from './SessionMenu.js';
import { Sidebar } from './Sidebar.js';
import { InputBar } from './InputBar.js';
import { StatusBar } from './StatusBar.js';

/** Interface for TuiTestDriverOptions.
 * @property {number} cols - Description of cols.
 * @property {number} rows - Description of rows.
 * @property {string} theme - Description of theme.
 */
export interface TuiTestDriverOptions {
  cols?: number;
  rows?: number;
  theme?: string;
  /** Callback to activate debug mode. Called during construction. */
  activateDebug?: () => void;
}

/** Class representing TuiTestDriver. */
export class TuiTestDriver {
  private screen: ScreenBuffer;
  private layout: LayoutManager;
  private phases: PhaseManager;
  private sidebar: Sidebar;
  private inputBar: InputBar;
  private statusBar: StatusBar;
  private loadingAnimator: LoadingAnimator | null = null;
  private sessionMenu: SessionMenu | null = null;
  private _animationSpeed: AnimationSpeed = 'instant';
  private _cols: number;
  private _rows: number;
  private _theme: string;
  private _destroyed = false;
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  constructor(opts: TuiTestDriverOptions = {}) {
    this._cols = opts.cols ?? 120;
    this._rows = opts.rows ?? 40;
    this._theme = opts.theme ?? 'red';

    if (opts.activateDebug) opts.activateDebug();

    this.screen = new ScreenBuffer(this._cols, this._rows);
    this.layout = new LayoutManager(this.screen);
    this.phases = new PhaseManager(this.screen);

    const layoutState = this.layout.getLayout();
    this.sidebar = new Sidebar(this.screen, { x: layoutState.sidebar.col, y: layoutState.sidebar.row, width: layoutState.sidebar.width, height: layoutState.sidebar.height });
    this.inputBar = new InputBar(this.screen, { x: layoutState.inputBar.col, y: layoutState.inputBar.row, width: layoutState.inputBar.width, height: layoutState.inputBar.height ?? 1 });
    this.statusBar = new StatusBar(this.screen, { x: layoutState.statusBar.col, y: layoutState.statusBar.row, width: layoutState.statusBar.width, height: layoutState.statusBar.height ?? 1 });

    this.phases.on('phase:enter', (data) => this.emit('phase:enter', typeof data === 'object' ? data.phase : data));
    this.phases.on('phase:exit', (data) => this.emit('phase:exit', typeof data === 'object' ? data.phase : data));
  }

  /**
   * Gets the cols.
   */
  get cols(): number { return this._cols; }
  /**
   * Gets the rows.
   */
  get rows(): number { return this._rows; }
  /**
   * Gets the theme.
   */
  get theme(): string { return this._theme; }
  /**
   * Gets the current phase.
   */
  get currentPhase(): Phase { return this.phases.current; }
  /**
   * Gets the phase history.
   */
  get phaseHistory(): Phase[] { return this.phases.phaseHistory; }


  /**
   * Skip to phase.
   */
  async skipToPhase(phase: Phase): Promise<void> {
    await this.phases.skipTo(phase);
    this.renderPhase(phase);
  }

  /**
   * Run to phase.
   */
  async runToPhase(phase: Phase): Promise<void> {
    await this.phases.runTo(phase);
    this.renderPhase(phase);
  }

  /**
   * Wait for phase.
   */
  async waitForPhase(phase: Phase, timeoutMs = 5000): Promise<void> {
    if (this.phases.current === phase) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for phase "${phase}"`)), timeoutMs);
      this.phases.onEnter(phase, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }


  /**
   * Get screen.
   */
  getScreen(): string[][] {
    return this.screen.getScreen();
  }

  /**
   * Read row.
   */
  readRow(row: number): string {
    return this.screen.readRow(row);
  }

  /**
   * Read region.
   */
  readRegion(startRow: number, startCol: number, width: number, height: number): string[] {
    return this.screen.readRegion(startRow, startCol, width, height);
  }

  /**
   * Find text.
   */
  findText(text: string): { row: number; col: number } | null {
    for (let r = 0; r < this._rows; r++) {
      const rowText = this.screen.readRow(r);
      const col = rowText.indexOf(text);
      if (col >= 0) return { row: r, col };
    }
    return null;
  }

  /**
   * Has text.
   */
  hasText(text: string): boolean {
    return this.findText(text) !== null;
  }

  /**
   * Screenshot.
   */
  screenshot(opts?: { stripAnsi?: boolean }): string {
    const text = this.screen.render();
    return text;
  }

  /**
   * Get sidebar content.
   */
  getSidebarContent(): string {
    return this.sidebar.getContent();
  }

  /**
   * Get main content.
   */
  getMainContent(): string {
    const layout = this.layout.getLayout();
    const lines = this.screen.readRegion(layout.main.row, layout.main.col, layout.main.width, layout.main.height);
    return lines.join('\n');
  }

  /**
   * Get status bar.
   */
  getStatusBar(): string {
    return this.statusBar.getContent();
  }

  /**
   * Get input bar.
   */
  getInputBar(): string {
    return this.inputBar.getContent();
  }


  /**
   * Type.
   */
  async type(text: string): Promise<void> {
    for (const char of text) {
      this.inputBar.type(char);
    }
  }

  /**
   * Press.
   */
  async press(key: string): Promise<void> {
    switch (key) {
      case 'Enter':
        const submitted = this.inputBar.submit();
        if (submitted) {
          this.emit('input', submitted);
        }
        break;
      case 'Backspace':
        this.inputBar.backspace();
        break;
      case 'ArrowUp':
        this.inputBar.historyUp();
        break;
      case 'ArrowDown':
        this.inputBar.historyDown();
        break;
      case 'ArrowLeft':
        this.inputBar.moveCursorLeft();
        break;
      case 'ArrowRight':
        this.inputBar.moveCursorRight();
        break;
      case 'Tab':
        break;
      case 'Ctrl+C':
        this.emit('interrupt', undefined);
        break;
      default:
        if (key.startsWith('Alt+')) {
          this.emit('alt-key', key.slice(4));
        } else if (key.length === 1) {
          if (this.phases.current === 'menu' && this.sessionMenu) {
            this.sessionMenu.handleKey(key);
          } else {
            this.inputBar.type(key);
          }
        }
    }
  }


  /**
   * Is sidebar visible.
   */
  isSidebarVisible(): boolean {
    return this.layout.sidebarVisible && this.phases.current === 'chat';
  }

  /**
   * Get sidebar width.
   */
  getSidebarWidth(): number {
    return this.layout.getLayout().sidebar.width;
  }

  /**
   * Get active channel.
   */
  getActiveChannel(): string {
    return `#${this.sidebar.activeId ?? 'control'}`;
  }

  /**
   * Get current model.
   */
  getCurrentModel(): string {
    return this.statusBar.data.model ?? '';
  }

  /**
   * Get agent count.
   */
  getAgentCount(): number {
    return this.statusBar.data.agents ?? 0;
  }

  /**
   * Get input bar row.
   */
  getInputBarRow(): number {
    return this.layout.getLayout().inputBar.row;
  }

  /**
   * Get status bar row.
   */
  getStatusBarRow(): number {
    return this.layout.getLayout().statusBar.row;
  }


  /**
   * Set animation speed.
   */
  setAnimationSpeed(speed: AnimationSpeed): void {
    this._animationSpeed = speed;
    if (this.loadingAnimator) {
      this.loadingAnimator.setSpeed(speed);
    }
  }

  /**
   * Get animation progress.
   */
  getAnimationProgress(): number {
    return this.loadingAnimator?.progress ?? 0;
  }

  /**
   * Advance animation.
   */
  async advanceAnimation(): Promise<void> {
    if (this.loadingAnimator) {
      await this.loadingAnimator.advanceStep();
    }
  }


  /**
   * Wait for text.
   */
  async waitForText(text: string, timeoutMs = 5000): Promise<void> {
    if (this.hasText(text)) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for text "${text}"`)), timeoutMs);
      const check = setInterval(() => {
        if (this.hasText(text)) {
          clearInterval(check);
          clearTimeout(timer);
          resolve();
        }
      }, 50);
    });
  }

  /**
   * Wait for prompt.
   */
  async waitForPrompt(timeoutMs = 5000): Promise<void> {
    await this.waitForText('>', timeoutMs);
  }

  /**
   * Wait for active channel.
   */
  async waitForActiveChannel(channel: string, timeoutMs = 5000): Promise<void> {
    const target = channel.startsWith('#') ? channel : `#${channel}`;
    if (this.getActiveChannel() === target) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for channel "${target}"`)), timeoutMs);
      this.sidebar.on('channel:switch', (id) => {
        if (`#${id}` === target || id === channel) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  /**
   * Wait for response.
   */
  async waitForResponse(timeoutMs = 5000): Promise<void> {
    const before = this.getMainContent();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for response')), timeoutMs);
      const check = setInterval(() => {
        if (this.getMainContent() !== before) {
          clearInterval(check);
          clearTimeout(timer);
          resolve();
        }
      }, 50);
    });
  }


  /**
   * Resize.
   */
  resize(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    this.screen.resize(cols, rows);
    this.layout.resize(cols, rows);
    this.emit('resize', { cols, rows });
    this.renderPhase(this.phases.current);
  }


  /**
   * Export screen.
   */
  exportScreen(): any {
    return {
      phase: this.phases.current,
      screen: this.screenshot(),
      layout: this.layout.getLayout(),
      activeChannel: this.getActiveChannel(),
    };
  }

  /**
   * Diff screenshots.
   */
  diffScreenshots(before: string, after: string): { changedRows: number } {
    const bLines = before.split('\n');
    const aLines = after.split('\n');
    let changed = 0;
    const maxLines = Math.max(bLines.length, aLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (bLines[i] !== aLines[i]) changed++;
    }
    return { changedRows: changed };
  }


  /**
   * Destroy.
   */
  destroy(): void {
    this._destroyed = true;
    this.listeners.clear();
  }


  private renderPhase(phase: Phase): void {
    this.screen.clear();
    switch (phase) {
      case 'chat':
        this.sidebar.render();
        this.inputBar.render();
        this.statusBar.update({ model: 'sonnet-4', agents: 0, cost: { current: 0, budget: 5.0 } });
        const layout = this.layout.getLayout();
        this.screen.write(layout.main.row, layout.main.col + 1, '── #control ──');
        break;
      case 'loading':
        break;
      case 'menu':
        this.sessionMenu = new SessionMenu(this.screen);
        this.sessionMenu.render();
        break;
    }
  }

  /**
   * On.
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(data);
    }
  }
}
