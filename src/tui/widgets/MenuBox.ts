import { fgRgb, RESET } from '../../rendering/index.js';
import { ScreenBuffer } from '../ScreenBuffer.js';

type RGB = [number, number, number];

/** Interface for MenuBoxOptions.
 * @property {string} title - Description of title.
 * @property {number} width - Description of width.
 * @property {number} height - Description of height.
 * @property {number} x - Description of x.
 * @property {number} y - Description of y.
 * @property {RGB} accent - Description of accent.
 */
export interface MenuBoxOptions {
  title: string;
  width: number;
  height: number;
  x: number;
  y: number;
  accent: RGB;
}

/** Class representing MenuBox. */
export class MenuBox {
  private _title: string;
  private _width: number;
  private _height: number;
  private _x: number;
  private _y: number;
  private _accent: RGB;

  constructor(opts: MenuBoxOptions) {
    this._title = opts.title;
    this._width = opts.width;
    this._height = opts.height;
    this._x = opts.x;
    this._y = opts.y;
    this._accent = opts.accent;
  }

  /**
   * Gets the inner width.
   */
  get innerWidth(): number { return this._width - 2; }
  /**
   * Gets the inner height.
   */
  get innerHeight(): number { return this._height - 2; }
  /**
   * Gets the content x.
   */
  get contentX(): number { return this._x + 1; }
  /**
   * Gets the content y.
   */
  get contentY(): number { return this._y + 1; }

  /**
   * Sets the title.
   */
  set title(t: string) { this._title = t; }
  /**
   * Sets the accent.
   */
  set accent(a: RGB) { this._accent = a; }

  /**
   * Resize.
   */
  resize(width: number, height: number, x: number, y: number): void {
    this._width = width;
    this._height = height;
    this._x = x;
    this._y = y;
  }

  /**
   * Sine gradient char.
   */
  sineGradientChar(char: string, row: number, totalRows: number): string {
    const t = totalRows > 1 ? row / (totalRows - 1) : 0;
    const sine = Math.sin(t * Math.PI);
    const [r, g, b] = this._accent;
    const factor = 0.3 + 0.7 * sine;
    return fgRgb(
      Math.round(r * factor),
      Math.round(g * factor),
      Math.round(b * factor)
    ) + char + RESET;
  }

  /**
   * Render frame.
   */
  renderFrame(screen: ScreenBuffer): void {
    const { _x: x, _y: y, _width: w, _height: h, _accent: accent } = this;
    const accentColor = fgRgb(...accent);

    const titleDisplay = ` ${this._title} `;
    const topDash = '─'.repeat(Math.max(0, w - titleDisplay.length - 3));
    screen.writeAt(y, x, `${accentColor}┌─${RESET}${accentColor}${titleDisplay}${RESET}${accentColor}${topDash}${RESET}`);

    for (let row = 1; row < h - 1; row++) {
      const leftBorder = this.sineGradientChar('│', row, h);
      const rightBorder = this.sineGradientChar('│', row, h);
      screen.writeAt(y + row, x, leftBorder);
      screen.writeAt(y + row, x + w - 1, rightBorder);
    }

    const bottomDash = '─'.repeat(Math.max(0, w - 2));
    screen.writeAt(y + h - 1, x, `${accentColor}└${bottomDash}┘${RESET}`);
  }

  /**
   * Render footer.
   */
  renderFooter(screen: ScreenBuffer, hints: string): void {
    const row = this._y + this._height - 2;
    const padded = `  ${hints}`;
    screen.writeAt(row, this._x + 1, `${fgRgb(120, 120, 120)}${padded}${RESET}`);
  }
}
