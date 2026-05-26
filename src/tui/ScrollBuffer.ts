/** Scrollable content buffer with viewport windowing. */

import { sliceText, visibleWidth } from './TextEngine.js';

/** Configuration for the scroll buffer viewport and scrollback limits. */
export interface ScrollBufferConfig {
  /** Visible height of the viewport (rows) */
  viewportHeight: number;
  /** Visible width of the viewport (columns) */
  viewportWidth: number;
  /** Max lines to retain in scrollback (0 = unlimited) */
  maxScrollback?: number;
}

/**
 * Line-based scrollable content buffer with auto-scroll (pin-to-bottom),
 * viewport windowing, and ANSI-aware line clipping.
 */
export class ScrollBuffer {
  private _lines: string[] = [];
  private _scrollOffset = 0;
  private _viewportHeight: number;
  private _viewportWidth: number;
  private _maxScrollback: number;
  private _pinToBottom = true;

  constructor(config: ScrollBufferConfig) {
    this._viewportHeight = config.viewportHeight;
    this._viewportWidth = config.viewportWidth;
    this._maxScrollback = config.maxScrollback ?? 10000;
  }

  /**
   * Gets the line count.
   */
  get lineCount(): number { return this._lines.length; }
  /**
   * Gets the scroll offset.
   */
  get scrollOffset(): number { return this._scrollOffset; }
  /**
   * Gets the viewport height.
   */
  get viewportHeight(): number { return this._viewportHeight; }
  /**
   * Gets the viewport width.
   */
  get viewportWidth(): number { return this._viewportWidth; }
  /**
   * Gets the is pinned to bottom.
   */
  get isPinnedToBottom(): boolean { return this._pinToBottom; }

  /**
   * Append lines to the buffer.
   * If pinned to bottom, auto-scrolls to show latest content.
   */
  append(...lines: string[]): void {
    this._lines.push(...lines);

    if (this._maxScrollback > 0 && this._lines.length > this._maxScrollback) {
      const excess = this._lines.length - this._maxScrollback;
      this._lines.splice(0, excess);
      this._scrollOffset = Math.max(0, this._scrollOffset - excess);
    }

    if (this._pinToBottom) {
      this.scrollToBottom();
    }
  }

  /**
   * Replace all content with new lines.
   */
  setLines(lines: string[]): void {
    this._lines = lines;
    if (this._pinToBottom) {
      this.scrollToBottom();
    }
  }

  /**
   * Replace lines from a given index onwards.
   */
  replaceFrom(startIndex: number, newLines: string[]): void {
    this._lines.splice(startIndex, this._lines.length - startIndex, ...newLines);
    if (this._pinToBottom) {
      this.scrollToBottom();
    }
  }

  /**
   * Replace lines at.
   */
  replaceLinesAt(startIndex: number, count: number, newLines: string[]): void {
    this._lines.splice(startIndex, count, ...newLines);
    if (this._pinToBottom) {
      this.scrollToBottom();
    }
  }

  /**
   * Clear all content.
   */
  clear(): void {
    this._lines = [];
    this._scrollOffset = 0;
  }

  /**
   * Scroll up by N lines.
   */
  scrollUp(lines = 1): void {
    this._scrollOffset = Math.max(0, this._scrollOffset - lines);
    this._pinToBottom = false;
  }

  /**
   * Scroll down by N lines.
   */
  scrollDown(lines = 1): void {
    const maxOffset = Math.max(0, this._lines.length - this._viewportHeight);
    this._scrollOffset = Math.min(maxOffset, this._scrollOffset + lines);
    if (this._scrollOffset >= maxOffset) {
      this._pinToBottom = true;
    }
  }

  /**
   * Page up (scroll by viewport height).
   */
  pageUp(): void {
    this.scrollUp(this._viewportHeight);
  }

  /**
   * Page down (scroll by viewport height).
   */
  pageDown(): void {
    this.scrollDown(this._viewportHeight);
  }

  /**
   * Scroll to top.
   */
  scrollToTop(): void {
    this._scrollOffset = 0;
    this._pinToBottom = false;
  }

  /**
   * Scroll to bottom and re-pin.
   */
  scrollToBottom(): void {
    this._scrollOffset = Math.max(0, this._lines.length - this._viewportHeight);
    this._pinToBottom = true;
  }

  /**
   * Get the currently visible lines (the viewport window).
   * Each line is sliced to fit viewportWidth.
   */
  getViewport(): string[] {
    const start = this._scrollOffset;
    const end = start + this._viewportHeight;
    const visible = this._lines.slice(start, end);
    const vw = this._viewportWidth;

    // Pad to viewport height
    const padCount = this._viewportHeight - visible.length;
    for (let i = 0; i < padCount; i++) {
      visible.push('');
    }

    // Clip lines that exceed viewport width (avoid allocating a new array via .map)
    for (let i = 0; i < visible.length; i++) {
      const line = visible[i];
      if (line && visibleWidth(line) > vw) {
        visible[i] = sliceText(line, 0, vw);
      }
    }

    return visible;
  }

  /**
   * Whether there is content above the viewport (can scroll up).
   */
  canScrollUp(): boolean {
    return this._scrollOffset > 0;
  }

  /**
   * Whether there is content below the viewport (can scroll down).
   */
  canScrollDown(): boolean {
    return this._scrollOffset + this._viewportHeight < this._lines.length;
  }

  /**
   * Resize the viewport (e.g., on terminal resize).
   */
  resize(width: number, height: number): void {
    this._viewportWidth = width;
    this._viewportHeight = height;
    if (this._pinToBottom) {
      this.scrollToBottom();
    } else {
      // Clamp scroll offset to valid range
      const maxOffset = Math.max(0, this._lines.length - this._viewportHeight);
      this._scrollOffset = Math.min(this._scrollOffset, maxOffset);
    }
  }

  /**
   * Scroll position indicator (e.g., "75%" or "END").
   */
  getScrollIndicator(): string {
    if (this._lines.length <= this._viewportHeight) return '';
    if (this._pinToBottom) return 'END';
    const pct = Math.round((this._scrollOffset / (this._lines.length - this._viewportHeight)) * 100);
    return `${pct}%`;
  }
}
