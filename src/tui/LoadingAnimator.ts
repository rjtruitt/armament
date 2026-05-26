/** Drives the animated boot sequence with banner, loading steps, and progress bar. */

import { ScreenBuffer } from './ScreenBuffer.js';

/** Type union for AnimationSpeed: normal, fast, instant. */
export type AnimationSpeed = 'normal' | 'fast' | 'instant';

/** Interface for LoadingStepConfig.
 * @property {string} label - Description of label.
 * @property {string} result - Description of result.
 */
export interface LoadingStepConfig {
  label: string;
  result?: string;
  status?: 'ok' | 'fail' | 'warn' | 'skip';
}

/** Interface for LoadingAnimatorConfig.
 * @property {number} stepDelay - Description of stepDelay.
 * @property {number} lineDelay - Description of lineDelay.
 * @property {LoadingStepConfig} steps - Description of steps.
 * @property {boolean} debug - Description of debug.
 * @property {number} progressBarWidth - Description of progressBarWidth.
 */
export interface LoadingAnimatorConfig {
  stepDelay?: number;
  lineDelay?: number;
  steps?: LoadingStepConfig[];
  debug?: boolean;
  progressBarWidth?: number;
}

// Banner art that avoids the █ character (uses ▓ instead) so progress bar tests work
const BANNER_LINES = [
  ' ▄▄▄       ▓▓▀▓▓▓   ▓▓▓▄ ▄▓▓▓▒ ▄▄▄       ▓▓▓▄ ▄▓▓▓▒▓▓▓▓▓  ▓▓▓▄    ▓ ▄▄▄▓▓▓▓▓▒',
  '▒▓▓▓▓▄    ▓▓▓ ▒ ▓▓▒▓▓▓▒▀▓▀ ▓▓▒▒▓▓▓▓▄    ▓▓▓▒▀▓▀ ▓▓▒▓▓   ▀  ▓▓ ▀▓   ▓ ▓  ▓▓▒ ▓▒',
  '▒▓▓  ▀▓▄  ▓▓▓ ░▄▓ ▒▓▓▓    ▓▓▓░▒▓▓  ▀▓▄  ▓▓▓    ▓▓▓░▒▓▓▓   ▓▓▓  ▀▓ ▓▓▒▒ ▓▓▓░ ▒░',
  '░▓▓▄▄▄▄▓▓ ▒▓▓▀▀▓▄  ▒▓▓    ▒▓▓ ░▓▓▄▄▄▄▓▓ ▒▓▓    ▒▓▓ ▒▓▓  ▄ ▓▓▓▒  ▐▌▓▓▒░ ▓▓▓▓ ░ ',
  ' ▓▓   ▓▓▓▒░▓▓▓ ▒▓▓▒▒▓▓▒   ░▓▓▒ ▓▓   ▓▓▓▒▒▓▓▒   ░▓▓▒░▒▓▓▓▓▒▒▓▓░   ▓▓▓░  ▒▓▓▒ ░ ',
  ' ▒▒   ▓▒▓░░ ▒▓ ░▒▓░░ ▒░   ░  ░ ▒▒   ▓▒▓░░ ▒░   ░  ░░░ ▒░ ░░ ▒░   ▒ ▒   ▒ ░░  ',
  '  ▒   ▒▒ ░  ░▒ ░ ▒░░  ░      ░  ▒   ▒▒ ░░  ░      ░ ░ ░  ░░ ░░   ░ ▒░    ░   ',
  '  ░   ▒     ░░   ░ ░      ░     ░   ▒   ░      ░      ░      ░   ░ ░   ░     ',
  '      ░  ░   ░            ░         ░  ░       ░      ░  ░         ░         ',
];

const DEFAULT_STEPS: LoadingStepConfig[] = [
  { label: 'loading config', result: 'ok', status: 'ok' },
  { label: 'scanning MCP servers', result: '3 connected', status: 'ok' },
  { label: 'connecting provider', result: 'connected', status: 'ok' },
  { label: 'workspace ready', result: 'ready', status: 'ok' },
];

const FLAVOR_TEXTS = [
  'initializing tactical subroutines',
  'calibrating response batteries',
  'loading forward arrays',
  'spinning up countermeasures',
  'deploying combat protocols',
  'engaging shield harmonics',
  'activating targeting matrix',
  'priming weapon systems',
];

/** Class representing LoadingAnimator. */
export class LoadingAnimator {
  private buffer: ScreenBuffer;
  private stepDelay: number;
  private lineDelay: number;
  private steps: LoadingStepConfig[];
  private debugMode: boolean;
  private progressBarWidth: number;
  private _running = false;
  private _complete = false;
  private _cancelled = false;
  private _currentStep = -1;
  private _progress = 0;
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();
  private _speed: AnimationSpeed = 'normal';
  private _stepResolve: (() => void) | null = null;
  private flavorText: string;

  constructor(buffer: ScreenBuffer, config?: LoadingAnimatorConfig) {
    if (!buffer) {
      throw new Error('ScreenBuffer is required');
    }
    this.buffer = buffer;
    this.stepDelay = config?.stepDelay ?? 300;
    // lineDelay scales with stepDelay to keep proportions right
    this.lineDelay = config?.lineDelay ?? Math.min(50, Math.max(1, Math.floor(this.stepDelay / 6)));
    this.steps = config?.steps ?? DEFAULT_STEPS;
    this.debugMode = config?.debug ?? false;
    this.progressBarWidth = config?.progressBarWidth ?? 40;
    this.flavorText = FLAVOR_TEXTS[Math.floor(Math.random() * FLAVOR_TEXTS.length)];
  }


  /**
   * Gets the progress.
   */
  get progress(): number { return this._progress; }

  /**
   * Checks whether running.
   */
  isRunning(): boolean { return this._running; }
  /**
   * Checks whether complete.
   */
  isComplete(): boolean { return this._complete; }

  /**
   * Gets the current step.
   */
  getCurrentStep(): number { return this._currentStep; }

  /**
   * Gets the progress.
   */
  getProgress(): number { return this._progress; }


  /**
   * Sets the speed.
   */
  setSpeed(speed: AnimationSpeed): void {
    this._speed = speed;
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

  private emit(event: string, data?: any): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(data);
    }
  }


  /**
   * Start.
   */
  start(): Promise<void> {
    if (this._running) {
      throw new Error('Already running');
    }
    this._running = true;
    this._complete = false;
    this._cancelled = false;
    this._currentStep = -1;
    this._progress = 0;

    this.flavorText = FLAVOR_TEXTS[Math.floor(Math.random() * FLAVOR_TEXTS.length)];

    const promise = this.run();
    return promise;
  }

  private async run(): Promise<void> {
    this.emit('loading:start');

    if (this.debugMode) {
      // In debug mode, render everything immediately with no delays
      this.renderBannerImmediate();
      this.renderFlavorImmediate();
      for (let i = 0; i < this.steps.length; i++) {
        this._currentStep = i;
        this.emit('step:start', { label: this.steps[i].label, index: i });
        this.renderStepComplete(i);
        this.emit('step:complete', { label: this.steps[i].label, index: i });
      }
      this._progress = 100;
      this.emit('progress:update', 100);
      this.renderProgressBar(1);
      this._complete = true;
      this._running = false;
      this.emit('loading:complete');
      return;
    }

    await this.renderBannerAnimated();
    if (this._cancelled) return;

    this.renderFlavorImmediate();
    await this.wait(this.lineDelay);
    if (this._cancelled) return;

    for (let i = 0; i < this.steps.length; i++) {
      if (this._cancelled) return;
      this._currentStep = i;
      this.emit('step:start', { label: this.steps[i].label, index: i });

      this.renderStepSpinner(i);
      await this.wait(this.stepDelay);
      if (this._cancelled) return;

      this.renderStepComplete(i);
      this.emit('step:complete', { label: this.steps[i].label, index: i });

      const progress = Math.round(((i + 1) / this.steps.length) * 100);
      this._progress = progress;
      this.emit('progress:update', progress);
      this.renderProgressBar((i + 1) / this.steps.length);

      await this.wait(this.lineDelay);
      if (this._cancelled) return;
    }

    this._complete = true;
    this._running = false;
    this.emit('loading:complete');
  }


  /**
   * Skip.
   */
  skip(): void {
    if (!this._running) return;
    this._cancelled = true;
    this.renderBannerImmediate();
    this.renderFlavorImmediate();
    for (let i = 0; i < this.steps.length; i++) {
      this.renderStepComplete(i);
    }
    this._progress = 100;
    this.renderProgressBar(1);
    this._complete = true;
    this._running = false;
    this._cancelled = false;
    this.emit('loading:complete');
  }

  /**
   * Cancel.
   */
  cancel(): void {
    this._cancelled = true;
    this._running = false;
    this.emit('loading:cancel');
    if (this._stepResolve) {
      this._stepResolve();
      this._stepResolve = null;
    }
  }

  /**
   * Reset.
   */
  reset(): void {
    this._running = false;
    this._complete = false;
    this._cancelled = false;
    this._currentStep = -1;
    this._progress = 0;
  }


  /**
   * Advance step.
   */
  async advanceStep(): Promise<void> {
    if (this._stepResolve) {
      this._stepResolve();
      this._stepResolve = null;
    }
  }


  private renderBannerImmediate(): void {
    const bufWidth = this.buffer.cols;
    const logoWidth = BANNER_LINES[0].length;
    const pad = Math.max(0, Math.floor((bufWidth - logoWidth) / 2));
    const padStr = ' '.repeat(pad);
    for (let i = 0; i < BANNER_LINES.length; i++) {
      const row = 1 + i;
      if (row < this.buffer.rows) {
        const text = padStr + BANNER_LINES[i];
        this.buffer.writeAt(row, 0, this.colorBannerLine(text, i));
      }
    }
    const labelRow = 1 + BANNER_LINES.length;
    if (labelRow < this.buffer.rows) {
      const label = 'ARMAMENT';
      const labelPad = Math.max(0, Math.floor((bufWidth - label.length) / 2));
      this.buffer.writeAt(labelRow, 0, ' '.repeat(labelPad) + this.colorBannerLine(label, 0));
    }
  }

  private async renderBannerAnimated(): Promise<void> {
    const bufWidth = this.buffer.cols;
    const logoWidth = BANNER_LINES[0].length;
    const pad = Math.max(0, Math.floor((bufWidth - logoWidth) / 2));
    const padStr = ' '.repeat(pad);
    for (let i = 0; i < BANNER_LINES.length; i++) {
      if (this._cancelled) return;
      const row = 1 + i;
      if (row < this.buffer.rows) {
        const text = padStr + BANNER_LINES[i];
        this.buffer.writeAt(row, 0, this.colorBannerLine(text, i));
      }
      await this.wait(this.lineDelay);
    }
    const labelRow = 1 + BANNER_LINES.length;
    if (labelRow < this.buffer.rows) {
      const label = 'ARMAMENT';
      const labelPad = Math.max(0, Math.floor((bufWidth - label.length) / 2));
      this.buffer.writeAt(labelRow, 0, ' '.repeat(labelPad) + this.colorBannerLine(label, 0));
    }
  }

  private renderFlavorImmediate(): void {
    const row = 12;
    if (row < this.buffer.rows) {
      const bufWidth = this.buffer.cols;
      const text = this.flavorText;
      const pad = Math.max(0, Math.floor((bufWidth - text.length) / 2));
      this.buffer.writeAt(row, 0, ' '.repeat(pad) + this.colorFlavor(text));
    }
  }

  private renderStepSpinner(index: number): void {
    const step = this.steps[index];
    const row = 14 + index;
    if (row >= this.buffer.rows) return;
    const text = `  ▸ ${step.label} ···`;
    this.buffer.writeAt(row, 0, text);
  }

  private renderStepComplete(index: number): void {
    const step = this.steps[index];
    const row = 14 + index;
    if (row >= this.buffer.rows) return;

    const dots = '·'.repeat(Math.max(4, 28 - step.label.length));
    let statusIcon = '✓';
    let resultText = step.result ?? 'ok';

    if (step.status === 'fail') {
      statusIcon = '✗';
    } else if (step.status === 'warn') {
      statusIcon = '⚠';
    }

    const line = `  ▸ ${step.label} ${dots} ${statusIcon} ${resultText}`;
    this.buffer.writeAt(row, 0, this.colorStepResult(line, step.status ?? 'ok'));
  }

  private renderProgressBar(fraction: number): void {
    const barWidth = this.progressBarWidth;
    const filledWidth = Math.round(fraction * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
    const row = 14 + this.steps.length + 1;
    if (row >= this.buffer.rows) return;

    const label = fraction >= 1 ? 'ready' : `${Math.round(fraction * 100)}%`;
    const line = `  [${bar}] ${label}`;
    this.buffer.writeAt(row, 0, this.colorProgressBar(line, fraction));
  }


  private colorBannerLine(text: string, lineIndex: number): string {
    const intensity = Math.max(45, 255 - lineIndex * 22);
    return `\x1b[38;2;${intensity};${Math.floor(intensity * 0.3)};${Math.floor(intensity * 0.3)}m${text}\x1b[0m`;
  }

  private colorFlavor(text: string): string {
    return `\x1b[38;2;255;180;60m${text}\x1b[0m`;
  }

  private colorStepResult(text: string, status: string): string {
    if (status === 'fail') {
      return `\x1b[38;2;255;60;60m${text}\x1b[0m`;
    } else if (status === 'warn') {
      return `\x1b[38;2;255;200;60m${text}\x1b[0m`;
    }
    return `\x1b[38;2;100;255;100m${text}\x1b[0m`;
  }

  private colorProgressBar(text: string, _fraction: number): string {
    return `\x1b[38;2;255;120;50m${text}\x1b[0m`;
  }


  private wait(ms: number): Promise<void> {
    if (this._speed === 'instant' || this.debugMode) {
      return Promise.resolve();
    }
    if (this._speed === 'fast') {
      ms = Math.floor(ms / 10);
    }
    return new Promise(resolve => {
      this._stepResolve = resolve;
      setTimeout(() => {
        this._stepResolve = null;
        resolve();
      }, ms);
    });
  }
}
