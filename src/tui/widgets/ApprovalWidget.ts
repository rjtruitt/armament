/** Human-in-the-loop approval prompt widget with multiple input modes. */

import { fgRgb, bgRgb, RESET } from '../../rendering/index.js';

type RGB = [number, number, number];

/** Supported input interaction modes for approval prompts. */
export type ApprovalInputType = 'radio' | 'multi-select' | 'picklist' | 'freeform' | 'confirm';

/** A single pending approval request queued for user response. */
export interface ApprovalRequest {
  id: string;
  source: string;
  question: string;
  options?: string[];
  inputType?: ApprovalInputType;
  timestamp: Date;
}

/** Configuration for the approval widget appearance. */
export interface ApprovalWidgetOptions {
  width: number;
  accent?: RGB;
  dimColor?: RGB;
  borderColor?: RGB;
}

/**
 * Renders and manages a queue of approval requests with keyboard-driven input.
 * Supports radio, multi-select, confirm (yes/no), and freeform text modes.
 */
export class ApprovalWidget {
  private _requests: ApprovalRequest[] = [];
  private _activeIndex = 0;
  private _selectedOption = 0;
  private _multiSelected: Set<number> = new Set();
  private _freeformMode = false;
  private _freeformText = '';
  private _opts: ApprovalWidgetOptions;
  private _onResolve?: (id: string, response: string) => void;

  constructor(opts: ApprovalWidgetOptions) {
    this._opts = opts;
  }

  /** Number of pending requests in the queue. */
  get pending(): number { return this._requests.length; }
  /** The currently displayed request (if any). */
  get activeRequest(): ApprovalRequest | undefined { return this._requests[this._activeIndex]; }
  /** Whether the queue is empty. */
  get isEmpty(): boolean { return this._requests.length === 0; }

  /** Get the source channel of the currently active request. */
  getSourceChannel(): string | null {
    const req = this._requests[this._activeIndex];
    return req?.source ?? null;
  }

  /** Check if any pending request originated from a given channel. */
  hasSourceChannel(channel: string): boolean {
    return this._requests.some(r => r.source === channel);
  }

  /** Set the render width. */
  setWidth(w: number): void { this._opts.width = w; }

  /** Set the accent color from theme. */
  setAccentColor(rgb: RGB): void { this._opts.accent = rgb; }

  /** Set the dim/secondary color from theme. */
  setDimColor(rgb: RGB): void { this._opts.dimColor = rgb; }

  /** Enter freeform text input mode for the current request. */
  enterFreeform(): void {
    this._freeformMode = true;
  }

  /**
   * Checks whether in freeform.
   */
  isInFreeform(): boolean {
    return this._freeformMode;
  }

  /**
   * Cancel.
   */
  cancel(): void {
    this._resolve('[user cancelled]');
  }

  /** Register callback fired when a request is resolved with a user response. */
  onResolve(handler: (id: string, response: string) => void): void {
    this._onResolve = handler;
  }

  /** Add a new approval request to the queue. */
  push(request: ApprovalRequest): void {
    this._requests.push(request);
    if (this._requests.length === 1) {
      this._activeIndex = 0;
      this._selectedOption = 0;
      this._multiSelected.clear();
      this._freeformMode = false;
      this._freeformText = '';
    }
  }

  /** Remove a request from the queue by ID. */
  remove(id: string): void {
    const idx = this._requests.findIndex(r => r.id === id);
    if (idx >= 0) {
      this._requests.splice(idx, 1);
      if (this._activeIndex >= this._requests.length) {
        this._activeIndex = Math.max(0, this._requests.length - 1);
      }
      this._selectedOption = 0;
      this._multiSelected.clear();
      this._freeformMode = false;
      this._freeformText = '';
    }
  }

  /** Process a keypress. Returns true if the key was consumed. */
  handleKey(key: string): boolean {
    if (this._requests.length === 0) return false;
    const req = this._requests[this._activeIndex];
    if (!req) return false;

    const inputType = req.inputType ?? (req.options ? 'radio' : 'freeform');

    // Freeform text input mode
    if (this._freeformMode) {
      if (key === 'escape') {
        this._freeformMode = false;
        return true;
      }
      if (key === 'enter') {
        if (this._freeformText.trim()) {
          this._resolve(this._freeformText.trim());
        }
        return true;
      }
      if (key === 'backspace') {
        this._freeformText = this._freeformText.slice(0, -1);
        return true;
      }
      if (key === 'space') {
        this._freeformText += ' ';
        return true;
      }
      if (key.length === 1 && key.charCodeAt(0) >= 32) {
        this._freeformText += key;
        return true;
      }
      return false;
    }

    // Confirm mode (yes/no) — up/down to toggle, left/right to switch queued requests
    if (inputType === 'confirm') {
      if (key === 'y' || key === 'Y') { this._resolve('yes'); return true; }
      if (key === 'n' || key === 'N') { this._resolve('no'); return true; }
      if (key === 'enter') {
        this._resolve(this._selectedOption === 0 ? 'yes' : 'no');
        return true;
      }
      if (key === 'up' || key === 'down' || key === 'k' || key === 'j') {
        this._selectedOption = this._selectedOption === 0 ? 1 : 0;
        return true;
      }
      if (key === 'left' || key === '[') {
        if (this._requests.length > 1) {
          this._activeIndex = (this._activeIndex - 1 + this._requests.length) % this._requests.length;
          this._resetSelection();
          return true;
        }
        return false;
      }
      if (key === 'right' || key === ']') {
        if (this._requests.length > 1) {
          this._activeIndex = (this._activeIndex + 1) % this._requests.length;
          this._resetSelection();
          return true;
        }
        return false;
      }
      return false;
    }

    if (inputType === 'freeform' || !req.options || req.options.length === 0) {
      if (key === 'enter') {
        this._freeformMode = true;
        this._freeformText = '';
        return true;
      }
      return false;
    }

    const optionCount = req.options.length + 1; // +1 for "other"

    switch (key) {
      case 'up':
      case 'k':
        this._selectedOption = (this._selectedOption - 1 + optionCount) % optionCount;
        return true;
      case 'down':
      case 'j':
        this._selectedOption = (this._selectedOption + 1) % optionCount;
        return true;
      case 'left':
      case '[':
        if (this._requests.length > 1) {
          this._activeIndex = (this._activeIndex - 1 + this._requests.length) % this._requests.length;
          this._resetSelection();
          return true;
        }
        return false;
      case 'right':
      case ']':
        if (this._requests.length > 1) {
          this._activeIndex = (this._activeIndex + 1) % this._requests.length;
          this._resetSelection();
          return true;
        }
        return false;
      case 'space':
        if (inputType === 'multi-select') {
          if (this._selectedOption < req.options.length) {
            if (this._multiSelected.has(this._selectedOption)) {
              this._multiSelected.delete(this._selectedOption);
            } else {
              this._multiSelected.add(this._selectedOption);
            }
          }
          return true;
        }
        return this._confirmSelection(req);
      case 'enter':
        if (inputType === 'multi-select') {
          const selected = [...this._multiSelected]
            .sort()
            .map(i => req.options![i])
            .filter(Boolean);
          if (selected.length > 0) {
            this._resolve(selected.join(', '));
          }
          return true;
        }
        return this._confirmSelection(req);
      case 'escape':
        return true;
      default:
        const num = parseInt(key, 10);
        if (!isNaN(num) && num >= 1 && num <= optionCount) {
          this._selectedOption = num - 1;
          if (inputType === 'multi-select') {
            if (this._selectedOption < req.options.length) {
              if (this._multiSelected.has(this._selectedOption)) {
                this._multiSelected.delete(this._selectedOption);
              } else {
                this._multiSelected.add(this._selectedOption);
              }
            }
          } else {
            return this._confirmSelection(req);
          }
          return true;
        }
        return false;
    }
  }

  private _confirmSelection(req: ApprovalRequest): boolean {
    if (req.options && this._selectedOption < req.options.length) {
      this._resolve(req.options[this._selectedOption]);
    } else {
      // "Other" selected — enter freeform mode
      this._freeformMode = true;
      this._freeformText = '';
    }
    return true;
  }

  private _resetSelection(): void {
    this._selectedOption = 0;
    this._multiSelected.clear();
    this._freeformMode = false;
    this._freeformText = '';
  }

  private _resolve(response: string): void {
    const req = this._requests[this._activeIndex];
    if (!req) return;
    this._onResolve?.(req.id, response);
    this.remove(req.id);
  }

  /** Render the current approval prompt as an array of styled lines. */
  render(): string[] {
    if (this._requests.length === 0) return [];

    const accent: RGB = this._opts.accent ?? [0, 180, 220];
    const dim: RGB = this._opts.dimColor ?? [100, 100, 100];
    const w = this._opts.width;
    const req = this._requests[this._activeIndex];
    if (!req) return [];

    const inputType = req.inputType ?? (req.options ? 'radio' : 'freeform');
    const lines: string[] = [];
    const ac = fgRgb(...accent);
    const dc = fgRgb(...dim);

    const questionLines = this._wrapText(req.question, w - 4);
    for (const ql of questionLines) {
      lines.push(ql);
    }
    lines.push('');

    const inputBg = this._opts.accent 
      ? bgRgb(Math.round(this._opts.accent[0] * 0.15), Math.round(this._opts.accent[1] * 0.15), Math.round(this._opts.accent[2] * 0.15))
      : bgRgb(42, 42, 50);
    if (this._freeformMode) {
      const w = this._opts.width;
      const text = `> ${this._freeformText}`;
      // Wrap freeform text if it exceeds width
      if (text.length > w - 2) {
        const wrappedLines = this._wrapText(text, w - 4);
        for (let li = 0; li < wrappedLines.length; li++) {
          const line = wrappedLines[li];
          const isLast = li === wrappedLines.length - 1;
          const display = isLast ? `${line}█` : line;
          const padLen = Math.max(0, w - display.length);
          lines.push(`${inputBg}${dc} ${display}${' '.repeat(padLen)}${RESET}`);
        }
      } else {
        const padLen = Math.max(0, w - text.length);
        lines.push(`${inputBg}${dc} ${text}█${' '.repeat(padLen)}${RESET}`);
      }
    } else if (inputType === 'confirm') {
      const yesMarker = this._selectedOption === 0 ? `${ac}●${RESET}` : `${dc}○${RESET}`;
      const noMarker = this._selectedOption === 1 ? `${ac}●${RESET}` : `${dc}○${RESET}`;
      const yesLabel = this._selectedOption === 0 ? `${ac}Yes${RESET}` : `Yes`;
      const noLabel = this._selectedOption === 1 ? `${ac}No${RESET}` : `No`;
      lines.push(`  ${yesMarker} ${yesLabel}`);
      lines.push(`  ${noMarker} ${noLabel}`);
    } else if (inputType === 'freeform' || !req.options || req.options.length === 0) {
      const w = this._opts.width;
      const hint = 'press enter to type';
      const padLen = Math.max(0, w - hint.length);
      lines.push(`${inputBg}${dc}${hint}${' '.repeat(padLen)}${RESET}`);
    } else {
      for (let i = 0; i < req.options.length; i++) {
        const isCursor = i === this._selectedOption;
        let marker: string;
        if (inputType === 'multi-select') {
          const checked = this._multiSelected.has(i);
          marker = checked ? `${ac}[✓]${RESET}` : `${dc}[ ]${RESET}`;
        } else {
          marker = isCursor ? `${ac}●${RESET}` : `${dc}○${RESET}`;
        }
        const label = isCursor ? `${ac}${req.options[i]}${RESET}` : req.options[i];
        lines.push(`  ${marker} ${label}`);
      }
      const otherCursor = this._selectedOption === req.options.length;
      const otherMarker = otherCursor ? `${ac}●${RESET}` : `${dc}○${RESET}`;
      const otherLabel = otherCursor ? `${ac}other...${RESET}` : `${dc}other...${RESET}`;
      lines.push(`  ${otherMarker} ${otherLabel}`);
    }

    lines.push('');
    const hints: string[] = [];
    if (this._freeformMode) {
      hints.push('enter submit', 'esc back');
    } else if (inputType === 'confirm') {
      hints.push('y/n', '↑↓');
    } else if (inputType === 'multi-select') {
      hints.push('↑↓', 'space toggle', 'enter submit');
    } else if (req.options && req.options.length > 0) {
      hints.push('↑↓', 'enter select');
    } else {
      hints.push('enter');
    }
    if (this._requests.length > 1) hints.push('[/] queue');
    hints.push('esc cancel');
    lines.push(`${dc}${hints.join('  │  ')}${RESET}`);

    if (this._requests.length > 1) {
      const sources = this._requests.map((r, i) => i === this._activeIndex ? `${ac}${r.source}${RESET}${dc}` : r.source);
      lines.push(`${dc}◀ ${this._activeIndex + 1}/${this._requests.length}: ${sources.join(' ')} ▶${RESET}`);
    }

    return lines;
  }

  private _wrapText(text: string, maxWidth: number): string[] {
    if (text.length <= maxWidth) return [text];
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}
