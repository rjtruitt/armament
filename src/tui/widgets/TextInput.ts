import { fgRgb, RESET } from '../../rendering/index.js';

type RGB = [number, number, number];

/** Interface for TextInputOptions.
 * @property {string} value - Description of value.
 * @property {string} placeholder - Description of placeholder.
 * @property {number} maxLength - Description of maxLength.
 */
export interface TextInputOptions {
  value?: string;
  placeholder?: string;
  maxLength?: number;
}

/** Class representing TextInput. */
export class TextInput {
  private _buffer: string;
  private _cursor: number;
  private _original: string;
  private _active: boolean = false;
  private _placeholder: string;
  private _maxLength: number;

  constructor(opts?: TextInputOptions) {
    this._buffer = opts?.value ?? '';
    this._cursor = this._buffer.length;
    this._original = this._buffer;
    this._placeholder = opts?.placeholder ?? '';
    this._maxLength = opts?.maxLength ?? 256;
  }

  /**
   * Gets the value.
   */
  get value(): string { return this._buffer; }
  /**
   * Sets the value.
   */
  set value(v: string) {
    this._buffer = v;
    this._cursor = Math.min(this._cursor, v.length);
  }

  /**
   * Gets the is active.
   */
  get isActive(): boolean { return this._active; }
  /**
   * Gets the cursor.
   */
  get cursor(): number { return this._cursor; }

  /**
   * Activate.
   */
  activate(value?: string): void {
    if (value !== undefined) this._buffer = value;
    this._original = this._buffer;
    this._cursor = this._buffer.length;
    this._active = true;
  }

  /**
   * Deactivate.
   */
  deactivate(): { value: string; changed: boolean } {
    this._active = false;
    const changed = this._buffer !== this._original;
    return { value: this._buffer, changed };
  }

  /**
   * Cancel.
   */
  cancel(): string {
    this._buffer = this._original;
    this._cursor = this._buffer.length;
    this._active = false;
    return this._original;
  }

  /**
   * Handle key.
   */
  handleKey(key: string): boolean {
    if (!this._active) return false;

    switch (key) {
      case 'left':
        if (this._cursor > 0) this._cursor--;
        return true;
      case 'right':
        if (this._cursor < this._buffer.length) this._cursor++;
        return true;
      case 'home':
        this._cursor = 0;
        return true;
      case 'end':
        this._cursor = this._buffer.length;
        return true;
      case 'backspace':
        if (this._cursor > 0) {
          this._buffer = this._buffer.slice(0, this._cursor - 1) + this._buffer.slice(this._cursor);
          this._cursor--;
        }
        return true;
      case 'delete':
        if (this._cursor < this._buffer.length) {
          this._buffer = this._buffer.slice(0, this._cursor) + this._buffer.slice(this._cursor + 1);
        }
        return true;
      case 'ctrl+u':
        this._buffer = this._buffer.slice(this._cursor);
        this._cursor = 0;
        return true;
      case 'ctrl+k':
        this._buffer = this._buffer.slice(0, this._cursor);
        return true;
      case 'ctrl+a':
        this._cursor = 0;
        return true;
      case 'ctrl+e':
        this._cursor = this._buffer.length;
        return true;
      default:
        if (key.length === 1 && key.charCodeAt(0) >= 32) {
          if (this._buffer.length < this._maxLength) {
            this._buffer = this._buffer.slice(0, this._cursor) + key + this._buffer.slice(this._cursor);
            this._cursor++;
          }
          return true;
        }
        return false;
    }
  }

  /**
   * Render.
   */
  render(accent: RGB, maxWidth?: number): { text: string; plainLen: number } {
    const textColor = fgRgb(220, 220, 220);
    if (!this._active) {
      const display = this._buffer || `${fgRgb(100, 100, 100)}${this._placeholder}${RESET}`;
      const plain = this._buffer || this._placeholder;
      return { text: `${textColor}${display}${RESET}`, plainLen: plain.length };
    }
    const before = this._buffer.slice(0, this._cursor);
    const after = this._buffer.slice(this._cursor);
    const cursorChar = `${fgRgb(...accent)}▌${RESET}`;
    const text = `${textColor}${before}${cursorChar}${textColor}${after}${RESET}`;
    const plainLen = this._buffer.length + 1; // +1 for cursor char
    return { text, plainLen };
  }

  /**
   * Paste.
   */
  paste(content: string): void {
    const available = this._maxLength - this._buffer.length;
    const toInsert = content.slice(0, available);
    this._buffer = this._buffer.slice(0, this._cursor) + toInsert + this._buffer.slice(this._cursor);
    this._cursor += toInsert.length;
  }
}
