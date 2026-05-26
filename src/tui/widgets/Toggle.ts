import { fgRgb, RESET } from '../../rendering/index.js';

type RGB = [number, number, number];

/** A boolean toggle widget with keyboard and ANSI rendering support. */
export class Toggle {
  private _value: boolean;

  constructor(value = false) {
    this._value = value;
  }

  /**
   * Gets the value.
   */
  get value(): boolean { return this._value; }
  /**
   * Sets the value.
   */
  set value(v: boolean) { this._value = v; }

  /**
   * Toggle.
   */
  toggle(): boolean {
    this._value = !this._value;
    return this._value;
  }

  /**
   * Handle key.
   */
  handleKey(key: string): boolean {
    switch (key) {
      case 'enter':
      case 'space':
      case 'right':
      case 'left':
        this.toggle();
        return true;
      default:
        return false;
    }
  }

  /**
   * Render.
   */
  render(accent: RGB): { text: string; plainLen: number } {
    if (this._value) {
      const text = `${fgRgb(...accent)}[●]${RESET}`;
      return { text, plainLen: 3 };
    }
    const text = `${fgRgb(100, 100, 100)}[ ]${RESET}`;
    return { text, plainLen: 3 };
  }
}
