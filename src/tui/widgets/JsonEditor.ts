import { fgRgb, bgRgb, RESET } from '../../rendering/index.js';
import { TextInput } from './TextInput.js';

type RGB = [number, number, number];

/** Class representing JsonEditor. */
export class JsonEditor {
  private _lines: string[];
  private _cursorRow: number = 0;
  private _cursorCol: number = 0;
  private _scrollOffset: number = 0;
  private _active: boolean = false;
  private _original: string = '';

  constructor(content?: string) {
    this._lines = content ? content.split('\n') : ['{}'];
    this._original = this._lines.join('\n');
  }

  /**
   * Gets the lines.
   */
  get lines(): string[] { return this._lines; }
  /**
   * Gets the content.
   */
  get content(): string { return this._lines.join('\n'); }
  /**
   * Gets the is active.
   */
  get isActive(): boolean { return this._active; }
  /**
   * Gets the cursor row.
   */
  get cursorRow(): number { return this._cursorRow; }
  /**
   * Gets the cursor col.
   */
  get cursorCol(): number { return this._cursorCol; }
  /**
   * Gets the scroll offset.
   */
  get scrollOffset(): number { return this._scrollOffset; }
  /**
   * Gets the is valid.
   */
  get isValid(): boolean {
    try { JSON.parse(this.content); return true; } catch { return false; }
  }

  /**
   * Sets the content.
   */
  set content(v: string) {
    this._lines = v.split('\n');
    this._cursorRow = Math.min(this._cursorRow, this._lines.length - 1);
    this._cursorCol = Math.min(this._cursorCol, this._lines[this._cursorRow]?.length ?? 0);
  }

  /**
   * Activate.
   */
  activate(content?: string): void {
    if (content !== undefined) {
      this._lines = content.split('\n');
    }
    this._original = this._lines.join('\n');
    this._active = true;
    this._cursorRow = 0;
    this._cursorCol = 0;
  }

  /**
   * Deactivate.
   */
  deactivate(): { content: string; changed: boolean } {
    this._active = false;
    const changed = this._lines.join('\n') !== this._original;
    return { content: this._lines.join('\n'), changed };
  }

  /**
   * Cancel.
   */
  cancel(): void {
    this._lines = this._original.split('\n');
    this._active = false;
  }

  /**
   * Handle key.
   */
  handleKey(key: string): boolean {
    if (!this._active) return false;

    switch (key) {
      case 'up':
        if (this._cursorRow > 0) {
          this._cursorRow--;
          this._cursorCol = Math.min(this._cursorCol, this._lines[this._cursorRow].length);
        }
        return true;
      case 'down':
        if (this._cursorRow < this._lines.length - 1) {
          this._cursorRow++;
          this._cursorCol = Math.min(this._cursorCol, this._lines[this._cursorRow].length);
        }
        return true;
      case 'left':
        if (this._cursorCol > 0) {
          this._cursorCol--;
        } else if (this._cursorRow > 0) {
          this._cursorRow--;
          this._cursorCol = this._lines[this._cursorRow].length;
        }
        return true;
      case 'right':
        if (this._cursorCol < this._lines[this._cursorRow].length) {
          this._cursorCol++;
        } else if (this._cursorRow < this._lines.length - 1) {
          this._cursorRow++;
          this._cursorCol = 0;
        }
        return true;
      case 'home':
        this._cursorCol = 0;
        return true;
      case 'end':
        this._cursorCol = this._lines[this._cursorRow].length;
        return true;
      case 'backspace':
        if (this._cursorCol > 0) {
          const line = this._lines[this._cursorRow];
          this._lines[this._cursorRow] = line.slice(0, this._cursorCol - 1) + line.slice(this._cursorCol);
          this._cursorCol--;
        } else if (this._cursorRow > 0) {
          const prevLine = this._lines[this._cursorRow - 1];
          this._cursorCol = prevLine.length;
          this._lines[this._cursorRow - 1] = prevLine + this._lines[this._cursorRow];
          this._lines.splice(this._cursorRow, 1);
          this._cursorRow--;
        }
        return true;
      case 'delete':
        if (this._cursorCol < this._lines[this._cursorRow].length) {
          const line = this._lines[this._cursorRow];
          this._lines[this._cursorRow] = line.slice(0, this._cursorCol) + line.slice(this._cursorCol + 1);
        } else if (this._cursorRow < this._lines.length - 1) {
          this._lines[this._cursorRow] += this._lines[this._cursorRow + 1];
          this._lines.splice(this._cursorRow + 1, 1);
        }
        return true;
      case 'enter':
        const line = this._lines[this._cursorRow];
        const before = line.slice(0, this._cursorCol);
        const after = line.slice(this._cursorCol);
        // Auto-indent: match leading whitespace of current line
        const indent = before.match(/^(\s*)/)?.[1] ?? '';
        this._lines[this._cursorRow] = before;
        this._lines.splice(this._cursorRow + 1, 0, indent + after);
        this._cursorRow++;
        this._cursorCol = indent.length;
        return true;
      default:
        if (key.length === 1 && key.charCodeAt(0) >= 32) {
          const l = this._lines[this._cursorRow];
          this._lines[this._cursorRow] = l.slice(0, this._cursorCol) + key + l.slice(this._cursorCol);
          this._cursorCol++;
          return true;
        }
        return false;
    }
  }

  /**
   * Paste.
   */
  paste(text: string): void {
    const pasteLines = text.split('\n');
    if (pasteLines.length === 1) {
      const line = this._lines[this._cursorRow];
      this._lines[this._cursorRow] = line.slice(0, this._cursorCol) + pasteLines[0] + line.slice(this._cursorCol);
      this._cursorCol += pasteLines[0].length;
    } else {
      const line = this._lines[this._cursorRow];
      const before = line.slice(0, this._cursorCol);
      const after = line.slice(this._cursorCol);
      this._lines[this._cursorRow] = before + pasteLines[0];
      for (let i = 1; i < pasteLines.length - 1; i++) {
        this._lines.splice(this._cursorRow + i, 0, pasteLines[i]);
      }
      const lastPaste = pasteLines[pasteLines.length - 1];
      this._lines.splice(this._cursorRow + pasteLines.length - 1, 0, lastPaste + after);
      this._cursorRow += pasteLines.length - 1;
      this._cursorCol = lastPaste.length;
    }
  }

  /**
   * Scroll to.
   */
  scrollTo(visibleHeight: number): void {
    if (this._cursorRow < this._scrollOffset) {
      this._scrollOffset = this._cursorRow;
    } else if (this._cursorRow >= this._scrollOffset + visibleHeight) {
      this._scrollOffset = this._cursorRow - visibleHeight + 1;
    }
  }

  /**
   * Sets the cursor from click.
   */
  setCursorFromClick(row: number, col: number): void {
    const line = row + this._scrollOffset;
    if (line >= 0 && line < this._lines.length) {
      this._cursorRow = line;
      this._cursorCol = Math.min(col, this._lines[line].length);
    }
  }
}
