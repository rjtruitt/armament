import { fgRgb, RESET } from '../../rendering/index.js';

type RGB = [number, number, number];

/** Interface for Choice.
 * @property {string} id - Description of id.
 * @property {string} label - Description of label.
 * @property {string} description - Description of description.
 */
export interface Choice {
  id: string;
  label: string;
  description?: string;
}

/** Interface for ChoiceSelectorOptions.
 * @property {Choice} choices - Description of choices.
 * @property {string} value - Description of value.
 */
export interface ChoiceSelectorOptions {
  choices: Choice[];
  value?: string;
}

/** Class representing ChoiceSelector. */
export class ChoiceSelector {
  private _choices: Choice[];
  private _index: number;

  constructor(opts: ChoiceSelectorOptions) {
    this._choices = opts.choices;
    this._index = opts.value
      ? Math.max(0, this._choices.findIndex(c => c.id === opts.value || c.label === opts.value))
      : 0;
  }

  /**
   * Gets the value.
   */
  get value(): string { return this._choices[this._index]?.label ?? ''; }
  /**
   * Gets the value id.
   */
  get valueId(): string { return this._choices[this._index]?.id ?? ''; }
  /**
   * Gets the index.
   */
  get index(): number { return this._index; }
  /**
   * Gets the choices.
   */
  get choices(): Choice[] { return this._choices; }

  /**
   * Sets the value.
   */
  set value(v: string) {
    const idx = this._choices.findIndex(c => c.id === v || c.label === v);
    if (idx >= 0) this._index = idx;
  }

  /**
   * Sets the choices.
   */
  setChoices(choices: Choice[], keepValue = true): void {
    const currentValue = this.value;
    this._choices = choices;
    if (keepValue) {
      const idx = choices.findIndex(c => c.label === currentValue || c.id === currentValue);
      this._index = idx >= 0 ? idx : 0;
    } else {
      this._index = 0;
    }
  }

  /**
   * Handle key.
   */
  handleKey(key: string): boolean {
    switch (key) {
      case 'right':
      case 'l':
        this._index = (this._index + 1) % this._choices.length;
        return true;
      case 'left':
      case 'h':
        this._index = (this._index - 1 + this._choices.length) % this._choices.length;
        return true;
      case 'enter':
      case 'space':
        this._index = (this._index + 1) % this._choices.length;
        return true;
      default:
        return false;
    }
  }

  /**
   * Render.
   */
  render(accent: RGB, isSelected: boolean): { text: string; plainLen: number } {
    const label = this.value;
    const arrows = isSelected ? `${fgRgb(100, 100, 100)}◂ ${RESET}` : '  ';
    const arrowsAfter = isSelected ? `${fgRgb(100, 100, 100)} ▸${RESET}` : '  ';
    const valueColor = fgRgb(...accent);
    const text = `${arrows}${valueColor}${label}${RESET}${arrowsAfter}`;
    const plainLen = label.length + 6; // arrows + spaces
    return { text, plainLen };
  }
}
