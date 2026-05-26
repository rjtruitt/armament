/** Single-line text input bar with history, tab-completion, and cursor management. */

import { ScreenBuffer } from './ScreenBuffer.js';

/** Screen position and dimensions of the input bar. */
export interface InputBarRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Configuration options for the input bar. */
export interface InputBarOptions {
  allowEmpty?: boolean;
  externalRender?: boolean;
}

/**
 * IRC-style input bar with readline-like keybindings, command history,
 * tab completion, validation, and channel display.
 */
export class InputBar {
  private screen: ScreenBuffer;
  private _region: InputBarRegion;
  private _text = '';
  private _cursorPos = 0;
  private _channel = '#control';
  private _history: string[] = [];
  private _historyIndex = -1;
  private _historyDraft = '';
  private _visible = true;
  private _cursorVisible = true;
  private _blinkTimer: ReturnType<typeof setInterval> | null = null;
  private _scrollOffset = 0;
  private _completions: string[] = [];
  private _completionIndex = -1;
  private _completionDirty = false;
  private _completionPrefix = '';
  private _validator: ((text: string) => boolean) | null = null;
  private _validationError: string | null = null;
  private _theme = 'red';
  private _multiLine = false;
  private _allowEmpty: boolean;
  private _externalRender: boolean;
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  constructor(screen: ScreenBuffer, region: InputBarRegion, opts?: InputBarOptions) {
    if (!screen) throw new Error('Buffer is required');
    if (!region) throw new Error('Region is required');
    this.screen = screen;
    this._region = { ...region };
    this._allowEmpty = opts?.allowEmpty ?? false;
    this._externalRender = opts?.externalRender ?? false;
  }

  /**
   * Gets the text.
   */
  get text(): string { return this._text; }
  /**
   * Gets the cursor pos.
   */
  get cursorPos(): number { return this._cursorPos; }
  /**
   * Gets the channel.
   */
  get channel(): string { return this._channel; }
  /**
   * Gets the visible.
   */
  get visible(): boolean { return this._visible; }
  /**
   * Gets the row.
   */
  get row(): number { return this._region.y; }

  /**
   * Gets the text.
   */
  getText(): string { return this._text; }
  /**
   * Gets the channel.
   */
  getChannel(): string { return this._channel; }
  /**
   * Gets the region.
   */
  getRegion(): InputBarRegion { return { ...this._region }; }
  /**
   * Gets the cursor position.
   */
  getCursorPosition(): number { return this._cursorPos; }
  /**
   * Gets the history.
   */
  getHistory(): string[] { return [...this._history]; }
  /**
   * Gets the scroll offset.
   */
  getScrollOffset(): number { return this._scrollOffset; }
  /**
   * Gets the completion index.
   */
  getCompletionIndex(): number { return this._completionIndex; }
  /**
   * Gets the validation error.
   */
  getValidationError(): string | null { return this._validationError; }
  /**
   * Checks whether cursor visible.
   */
  isCursorVisible(): boolean { return this._cursorVisible; }
  /**
   * Checks whether multi line.
   */
  isMultiLine(): boolean { return this._multiLine; }

  /**
   * Sets the text.
   */
  setText(text: string): void {
    this._text = text;
    this._cursorPos = text.length;
    this._completionDirty = true;
    this.emit('text:change', { text });
  }

  /**
   * Append text.
   */
  appendText(text: string): void {
    this._text += text;
    this._cursorPos = this._text.length;
    this._completionDirty = true;
    this.emit('text:change', { text: this._text });
  }

  /**
   * Insert text.
   */
  insertText(text: string): void {
    this._text = this._text.slice(0, this._cursorPos) + text + this._text.slice(this._cursorPos);
    this._cursorPos += text.length;
    this._completionDirty = true;
    this.emit('text:change', { text: this._text });
  }

  /**
   * Sets the cursor position.
   */
  setCursorPosition(pos: number): void {
    this._cursorPos = Math.max(0, Math.min(pos, this._text.length));
  }

  /**
   * Sets the channel.
   */
  setChannel(channel: string): void {
    this._channel = (channel.startsWith('#') || channel.startsWith('worker-')) ? channel : `#${channel}`;
    this.emit('channel:change', { channel: this._channel });
    this.render();
  }

  /**
   * Sets the region.
   */
  setRegion(region: InputBarRegion): void {
    this._region = { ...region };
  }

  /**
   * Sets the theme.
   */
  setTheme(theme: string): void { this._theme = theme; }
  /**
   * Sets the completions.
   */
  setCompletions(completions: string[]): void { this._completions = completions; }
  /**
   * Sets the validator.
   */
  setValidator(fn: (text: string) => boolean): void { this._validator = fn; }

  /**
   * Show cursor.
   */
  showCursor(): void {
    this._cursorVisible = true;
    this.startBlink();
  }

  /**
   * Hide cursor.
   */
  hideCursor(): void {
    this._cursorVisible = false;
    this.stopBlink();
  }

  /**
   * Type.
   */
  type(char: string): void {
    this._text = this._text.slice(0, this._cursorPos) + char + this._text.slice(this._cursorPos);
    this._cursorPos += char.length;
    this._completionDirty = true;
    this.render();
  }

  /**
   * Backspace.
   */
  backspace(): void {
    if (this._cursorPos > 0) {
      this._text = this._text.slice(0, this._cursorPos - 1) + this._text.slice(this._cursorPos);
      this._cursorPos--;
      this._completionDirty = true;
      this.render();
    }
  }

  /**
   * Delete.
   */
  delete(): void {
    if (this._cursorPos < this._text.length) {
      this._text = this._text.slice(0, this._cursorPos) + this._text.slice(this._cursorPos + 1);
      this._completionDirty = true;
      this.render();
    }
  }

  /**
   * Move cursor left.
   */
  moveCursorLeft(): void {
    if (this._cursorPos > 0) { this._cursorPos--; this.render(); }
  }

  /**
   * Move cursor right.
   */
  moveCursorRight(): void {
    if (this._cursorPos < this._text.length) { this._cursorPos++; this.render(); }
  }

  /**
   * Move cursor to start.
   */
  moveCursorToStart(): void { this._cursorPos = 0; this.render(); }
  /**
   * Move cursor to end.
   */
  moveCursorToEnd(): void { this._cursorPos = this._text.length; this.render(); }
  /**
   * Move cursor home.
   */
  moveCursorHome(): void { this.moveCursorToStart(); }

  /**
   * Paste.
   */
  paste(text: string): void {
    const cleaned = text.replace(/\n/g, ' ');
    this._text = this._text.slice(0, this._cursorPos) + cleaned + this._text.slice(this._cursorPos);
    this._cursorPos += cleaned.length;
    this._completionDirty = true;
    this.emit('paste', { text: cleaned });
    this.render();
  }

  /**
   * Handle key.
   */
  handleKey(key: string): void {
    switch (key.toLowerCase()) {
      case 'left': this.moveCursorLeft(); break;
      case 'right': this.moveCursorRight(); break;
      case 'home':
      case 'ctrl+a': this.moveCursorToStart(); break;
      case 'end':
      case 'ctrl+e': this.moveCursorToEnd(); break;
      case 'backspace': this.backspace(); break;
      case 'delete': this.delete(); break;
      case 'enter':
        if (this._text.endsWith('\\')) {
          this._multiLine = true;
          this._text = this._text.slice(0, -1) + '\n';
          this._cursorPos = this._text.length;
        } else {
          this.submit();
        }
        break;
      case 'shift+enter':
        this._text = this._text.slice(0, this._cursorPos) + '\n' + this._text.slice(this._cursorPos);
        this._cursorPos++;
        this._multiLine = true;
        break;
      case 'up': this.historyUp(); break;
      case 'down': this.historyDown(); break;
      case 'tab':
        this.emit('complete', { text: this._text });
        this.complete();
        break;
      case 'ctrl+u':
        this._text = '';
        this._cursorPos = 0;
        this.render();
        break;
      case 'ctrl+k':
        this._text = this._text.slice(0, this._cursorPos);
        this.render();
        break;
      case 'ctrl+w': {
        const before = this._text.slice(0, this._cursorPos);
        const trimmed = before.replace(/\S+\s*$/, '');
        this._text = trimmed + this._text.slice(this._cursorPos);
        this._cursorPos = trimmed.length;
        this.render();
        break;
      }
      default:
        if (key.length === 1) {
          this.type(key);
        }
    }
  }

  /**
   * Complete.
   */
  complete(): void {
    if (this._completions.length === 0) return;
    if (this._completionDirty) {
      this._completionPrefix = this._text;
      this._completionIndex = 0;
      this._completionDirty = false;
    } else {
      this._completionIndex++;
    }
    const matching = this._completions.filter(c => c.startsWith(this._completionPrefix));
    if (matching.length === 0) return;
    this._completionIndex = this._completionIndex % matching.length;
    this._text = matching[this._completionIndex];
    this._cursorPos = this._text.length;
    this.render();
  }

  /**
   * Submit.
   */
  submit(): string {
    const text = this._text;
    if (!text.trim() && !this._allowEmpty) {
      return '';
    }
    if (this._validator && !this._validator(text)) {
      this._validationError = 'Validation failed';
      this.emit('validation:error', { text, error: this._validationError });
      return '';
    }
    this._validationError = null;
    if (text.trim()) {
      const last = this._history[this._history.length - 1];
      if (last !== text) {
        this._history.push(text);
        if (this._history.length > 100) {
          this._history = this._history.slice(-100);
        }
      }
    }
    this._text = '';
    this._cursorPos = 0;
    this._historyIndex = -1;
    this._historyDraft = '';
    this._multiLine = false;
    this.emit('submit', { text, channel: this._channel });
    this.render();
    return text;
  }

  /**
   * History up.
   */
  historyUp(): void {
    if (this._history.length === 0) return;
    if (this._historyIndex === -1) {
      this._historyDraft = this._text;
      this._historyIndex = this._history.length - 1;
    } else if (this._historyIndex > 0) {
      this._historyIndex--;
    }
    this._text = this._history[this._historyIndex];
    this._cursorPos = this._text.length;
    this.render();
  }

  /**
   * History down.
   */
  historyDown(): void {
    if (this._historyIndex === -1) return;
    if (this._historyIndex < this._history.length - 1) {
      this._historyIndex++;
      this._text = this._history[this._historyIndex];
    } else {
      this._historyIndex = -1;
      this._text = this._historyDraft;
    }
    this._cursorPos = this._text.length;
    this.render();
  }

  /**
   * Clear.
   */
  clear(): void {
    this._text = '';
    this._cursorPos = 0;
    this.render();
  }

  /**
   * Show.
   */
  show(): void { this._visible = true; this.render(); }
  /**
   * Hide.
   */
  hide(): void { this._visible = false; }

  /**
   * Render.
   */
  render(): void {
    if (!this._visible || this._externalRender) return;
    const w = this._region.width;
    const y = this._region.y;
    const x = this._region.x;

    const prompt = `${this._channel} | `;
    const promptLen = prompt.length;
    const maxTextWidth = w - promptLen;

    if (this._cursorPos - this._scrollOffset >= maxTextWidth) {
      this._scrollOffset = this._cursorPos - maxTextWidth + 1;
    } else if (this._cursorPos < this._scrollOffset) {
      this._scrollOffset = this._cursorPos;
    }

    const visibleText = this._text.replace(/\n/g, ' ').slice(this._scrollOffset, this._scrollOffset + maxTextWidth);
    const padded = (prompt + visibleText).padEnd(w).slice(0, w);
    this.screen.writeAt(y, x, `\x1b[38;2;200;200;200m${padded}\x1b[0m`);
  }

  /**
   * Gets the content.
   */
  getContent(): string {
    return `${this._channel} | ${this._text}`;
  }

  /**
   * On.
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) h(data);
  }

  private startBlink(): void {
    if (this._blinkTimer) return;
    this._blinkTimer = setInterval(() => {
      this._cursorVisible = !this._cursorVisible;
    }, 500);
  }

  private stopBlink(): void {
    if (this._blinkTimer) {
      clearInterval(this._blinkTimer);
      this._blinkTimer = null;
    }
  }
}
