import { TextInput, TextInputOptions } from './TextInput.js';

type RGB = [number, number, number];

/** Interface for NumberInputOptions.
 * @property {number} min - Description of min.
 * @property {number} max - Description of max.
 * @property {boolean} decimals - Description of decimals.
 */
export interface NumberInputOptions extends TextInputOptions {
  min?: number;
  max?: number;
  decimals?: boolean;
}

/** Class representing NumberInput. */
export class NumberInput {
  private _textInput: TextInput;
  private _min: number;
  private _max: number;
  private _decimals: boolean;

  constructor(opts?: NumberInputOptions) {
    this._textInput = new TextInput({
      value: opts?.value ?? '',
      placeholder: opts?.placeholder,
      maxLength: opts?.maxLength ?? 20,
    });
    this._min = opts?.min ?? -Infinity;
    this._max = opts?.max ?? Infinity;
    this._decimals = opts?.decimals ?? true;
  }

  /**
   * Gets the value.
   */
  get value(): string { return this._textInput.value; }
  /**
   * Gets the numeric value.
   */
  get numericValue(): number { return parseFloat(this._textInput.value) || 0; }
  /**
   * Gets the is active.
   */
  get isActive(): boolean { return this._textInput.isActive; }
  /**
   * Gets the is valid.
   */
  get isValid(): boolean {
    const v = this._textInput.value;
    if (v === '' || v === '-') return true; // partial input ok
    const n = parseFloat(v);
    return !isNaN(n) && n >= this._min && n <= this._max;
  }

  /**
   * Sets the value.
   */
  set value(v: string) { this._textInput.value = v; }

  /**
   * Activate.
   */
  activate(value?: string): void { this._textInput.activate(value); }
  /**
   * Deactivate.
   */
  deactivate(): { value: string; changed: boolean } { return this._textInput.deactivate(); }
  /**
   * Cancel.
   */
  cancel(): string { return this._textInput.cancel(); }

  /**
   * Handle key.
   */
  handleKey(key: string): boolean {
    if (key.length === 1 && key.charCodeAt(0) >= 32) {
      if (key >= '0' && key <= '9') return this._textInput.handleKey(key);
      if (key === '-' && this._textInput.cursor === 0) return this._textInput.handleKey(key);
      if (key === '.' && this._decimals && !this._textInput.value.includes('.')) {
        return this._textInput.handleKey(key);
      }
      return true; // consumed but rejected
    }
    return this._textInput.handleKey(key);
  }

  /**
   * Render.
   */
  render(accent: RGB, maxWidth?: number): { text: string; plainLen: number } {
    return this._textInput.render(accent, maxWidth);
  }

  /**
   * Gets the cursor.
   */
  get cursor(): number { return this._textInput.cursor; }
}
