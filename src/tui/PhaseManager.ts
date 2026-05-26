/** State machine for TUI phase transitions. */

import { ScreenBuffer } from './ScreenBuffer.js';

/** Type union for Phase: shell, loading, menu, main, chat, hitl, .... */
export type Phase = 'shell' | 'loading' | 'menu' | 'main' | 'chat' | 'hitl' | 'multi' | 'end';

const CANONICAL_PHASES: Phase[] = ['shell', 'loading', 'menu', 'main', 'hitl', 'multi', 'end'];

interface PhaseConfig {
  name: string;
  showSidebar: boolean;
  showInput: boolean;
  showStatus: boolean;
  allowsSidebar: boolean;
  allowsInput: boolean;
  allowsMulti: boolean;
}

const PHASE_CONFIGS: Record<string, PhaseConfig> = {
  shell: { name: 'shell', showSidebar: false, showInput: false, showStatus: false, allowsSidebar: false, allowsInput: false, allowsMulti: false },
  loading: { name: 'loading', showSidebar: false, showInput: false, showStatus: false, allowsSidebar: false, allowsInput: false, allowsMulti: false },
  menu: { name: 'menu', showSidebar: false, showInput: false, showStatus: true, allowsSidebar: false, allowsInput: false, allowsMulti: false },
  main: { name: 'main', showSidebar: true, showInput: true, showStatus: true, allowsSidebar: true, allowsInput: true, allowsMulti: false },
  hitl: { name: 'hitl', showSidebar: true, showInput: true, showStatus: true, allowsSidebar: true, allowsInput: true, allowsMulti: false },
  multi: { name: 'multi', showSidebar: true, showInput: true, showStatus: true, allowsSidebar: true, allowsInput: true, allowsMulti: true },
  end: { name: 'end', showSidebar: false, showInput: false, showStatus: false, allowsSidebar: false, allowsInput: false, allowsMulti: false },
};

/** Interface for PhaseTransition.
 * @property {Phase} from - Description of from.
 * @property {Phase} to - Description of to.
 * @property {number} timestamp - Description of timestamp.
 */
export interface PhaseTransition {
  from: Phase;
  to: Phase;
  timestamp: number;
}

/** Type definition for PhaseHandler. */
export type PhaseHandler = (...args: any[]) => void | Promise<void>;

/** Interface for PhaseManagerOptions.
 * @property {boolean} debug - Description of debug.
 */
export interface PhaseManagerOptions {
  debug?: boolean;
}

/** Class representing PhaseManager. */
export class PhaseManager {
  private _current: Phase = 'shell';
  private _history: Phase[] = ['shell'];
  private _historyIndex: number = 0;
  private _handlers: Map<string, PhaseHandler[]> = new Map();
  private _enterHandlers: Map<string, PhaseHandler[]> = new Map();
  private _exitHandlers: Map<string, PhaseHandler[]> = new Map();
  private _buffer: ScreenBuffer | null;
  private _debug: boolean;
  private _inputBlocked: boolean = false;

  constructor(buffer: ScreenBuffer, opts?: PhaseManagerOptions);
  constructor();
  constructor(buffer?: ScreenBuffer | null, opts?: PhaseManagerOptions) {
    if (buffer === null) {
      throw new Error('ScreenBuffer is required');
    }
    this._buffer = buffer ?? null;
    this._debug = opts?.debug ?? false;

    this.on('loading:complete', () => {
      if (this.configKey(this._current) === 'loading') {
        this.transitionTo('menu');
      }
    });

    this.on('menu:complete', () => {
      if (this.configKey(this._current) === 'menu') {
        this.transitionTo('main');
      }
    });

    this.on('loading:error', (err: any) => {
      this.emitEvent('phase:error', { phase: this._current, error: err });
    });

    this.on('transition:complete', () => {
      this._inputBlocked = false;
    });
  }

  /**
   * Gets the current.
   */
  get current(): Phase { return this._current; }
  /**
   * Gets the history.
   */
  get history(): PhaseTransition[] {
    const transitions: PhaseTransition[] = [];
    for (let i = 1; i < this._history.length; i++) {
      transitions.push({ from: this._history[i - 1], to: this._history[i], timestamp: Date.now() });
    }
    return transitions;
  }
  /**
   * Gets the phase history.
   */
  get phaseHistory(): Phase[] { return [...this._history.slice(0, this._historyIndex + 1)]; }


  /**
   * Gets the current phase.
   */
  getCurrentPhase(): Phase {
    return this._current;
  }

  /**
   * Gets the phases.
   */
  getPhases(): Phase[] {
    return [...CANONICAL_PHASES];
  }

  /**
   * Gets the history.
   */
  getHistory(): Phase[] {
    return [...this._history.slice(0, this._historyIndex + 1)];
  }

  /**
   * Gets the previous phase.
   */
  getPreviousPhase(): Phase | null {
    if (this._historyIndex <= 0) return null;
    return this._history[this._historyIndex - 1];
  }

  /**
   * Gets the next phase.
   */
  getNextPhase(phase?: Phase): Phase | null {
    const p = phase ?? this._current;
    const key = this.configKey(p);
    const idx = CANONICAL_PHASES.indexOf(key);
    if (idx < 0 || idx >= CANONICAL_PHASES.length - 1) return null;
    return CANONICAL_PHASES[idx + 1];
  }

  /**
   * Gets the phase metadata.
   */
  getPhaseMetadata(phase: Phase): PhaseConfig {
    const key = this.configKey(phase);
    return { ...PHASE_CONFIGS[key] };
  }

  /**
   * Checks whether terminal phase.
   */
  isTerminalPhase(phase: Phase): boolean {
    return this.configKey(phase) === 'end';
  }

  /**
   * Checks whether sidebar visible.
   */
  isSidebarVisible(): boolean {
    return PHASE_CONFIGS[this.configKey(this._current)].showSidebar;
  }

  /**
   * Checks whether input bar visible.
   */
  isInputBarVisible(): boolean {
    return PHASE_CONFIGS[this.configKey(this._current)].showInput;
  }

  /**
   * Checks whether status bar visible.
   */
  isStatusBarVisible(): boolean {
    return PHASE_CONFIGS[this.configKey(this._current)].showStatus;
  }

  /**
   * Checks whether input blocked.
   */
  isInputBlocked(): boolean {
    return this._inputBlocked;
  }

  /**
   * Gets the visible regions.
   */
  getVisibleRegions(): string[] {
    const config = PHASE_CONFIGS[this.configKey(this._current)];
    const regions: string[] = ['main'];
    if (config.showSidebar) regions.push('sidebar');
    if (config.showInput) regions.push('input');
    if (config.showStatus) regions.push('status');
    return regions;
  }

  /**
   * Gets the active regions.
   */
  getActiveRegions(): string[] {
    return this.getVisibleRegions();
  }

  /**
   * Gets the content region.
   */
  getContentRegion(): { width: number; height: number } {
    if (!this._buffer) return { width: 80, height: 24 };
    const config = PHASE_CONFIGS[this.configKey(this._current)];
    if (config.showSidebar) {
      const sidebarWidth = Math.floor(this._buffer.width * 0.2);
      return { width: this._buffer.width - sidebarWidth, height: this._buffer.height };
    }
    return { width: this._buffer.width, height: this._buffer.height };
  }


  /**
   * Transition to.
   */
  transitionTo(phase: Phase, opts?: { animate?: boolean }): void {
    if (!this.isKnownPhase(phase)) {
      throw new Error(`Unknown phase: "${phase}"`);
    }

    const key = this.configKey(phase);
    const from = this._current;
    const animateOpt = opts?.animate;

    this.emitEvent('transition:start', { from, to: phase, timestamp: Date.now() });

    this.emitEvent('phase:exit', { phase: from, timestamp: Date.now() });
    const fromKey = this.configKey(from);
    const exitHandlers = this._exitHandlers.get(fromKey) ?? [];
    for (const handler of exitHandlers) {
      handler(from);
    }

    const oldConfig = PHASE_CONFIGS[fromKey];
    const newConfig = PHASE_CONFIGS[key];
    const layoutChanged = oldConfig.showSidebar !== newConfig.showSidebar ||
      oldConfig.showInput !== newConfig.showInput ||
      oldConfig.showStatus !== newConfig.showStatus;

    const isOverlay = key === 'hitl';
    if (this._buffer && !isOverlay) {
      this._buffer.clear();
    }

    this._current = phase;

    this._history = this._history.slice(0, this._historyIndex + 1);
    this._history.push(phase);
    this._historyIndex = this._history.length - 1;

    const shouldFireAnimation = animateOpt !== false && !this._debug;
    const shouldBlock = animateOpt === true && !this._debug;

    if (shouldBlock) {
      this._inputBlocked = true;
    }

    if (shouldFireAnimation) {
      this.emitEvent('animation:start', { type: key });
    }

    this.emitEvent('phase:enter', { phase, timestamp: Date.now() });
    const enterHandlers = this._enterHandlers.get(key) ?? [];
    for (const handler of enterHandlers) {
      handler(phase);
    }

    if (layoutChanged) {
      this.emitEvent('layout:update', { from, to: phase });
    }

    if (!shouldBlock) {
      this.emitEvent('transition:complete', { from, to: phase, timestamp: Date.now() });
    }
  }

  /**
   * Back.
   */
  back(): void {
    if (this._historyIndex <= 0) {
      throw new Error('No previous phase');
    }
    this._historyIndex--;
    const prevPhase = this._history[this._historyIndex];

    if (this._buffer) {
      this._buffer.clear();
    }

    const from = this._current;
    this.emitEvent('phase:exit', { phase: from, timestamp: Date.now() });
    this._current = prevPhase;
    this.emitEvent('phase:enter', { phase: prevPhase, timestamp: Date.now() });
  }

  /**
   * Skip to.
   */
  async skipTo(phase: Phase): Promise<void> {
    if (!this.isKnownPhase(phase)) {
      throw new Error(`Unknown phase: "${phase}"`);
    }
    const key = this.configKey(phase);
    const from = this._current;

    this.emitEvent('phase:exit', { phase: from, timestamp: Date.now() });
    const fromKey = this.configKey(from);
    const exitHandlers = this._exitHandlers.get(fromKey) ?? [];
    for (const handler of exitHandlers) {
      handler(from);
    }

    if (this._buffer) {
      this._buffer.clear();
    }

    this._current = phase;
    this._history = this._history.slice(0, this._historyIndex + 1);
    this._history.push(phase);
    this._historyIndex = this._history.length - 1;

    this.emitEvent('phase:enter', { phase, timestamp: Date.now() });
    const enterHandlers = this._enterHandlers.get(key) ?? [];
    for (const handler of enterHandlers) {
      handler(phase);
    }
  }

  /**
   * Run to.
   */
  async runTo(target: Phase): Promise<void> {
    const targetKey = this.configKey(target);
    const currentKey = this.configKey(this._current);
    const currentIdx = CANONICAL_PHASES.indexOf(currentKey);
    const targetIdx = CANONICAL_PHASES.indexOf(targetKey);
    if (targetIdx <= currentIdx) return;

    for (let i = currentIdx + 1; i <= targetIdx; i++) {
      const phaseName = (i === targetIdx) ? target : CANONICAL_PHASES[i];
      this.transitionTo(phaseName);
    }
  }


  /**
   * Render.
   */
  render(): void {
    if (!this._buffer) return;

    this._buffer.clear();
    const key = this.configKey(this._current);

    switch (key) {
      case 'shell':
        this._buffer.writeAt(0, 0, '~ $ ');
        break;
      case 'loading':
        this._buffer.writeAt(this._buffer.height / 2 | 0, 2, 'Loading...');
        break;
      case 'menu':
        this._buffer.writeAt(1, 2, '── SESSION CONFIG ──');
        this._buffer.writeAt(3, 4, 'Workspace: .');
        this._buffer.writeAt(4, 4, 'Model: (default)');
        this._buffer.writeAt(5, 4, 'Budget: $5.00');
        this._buffer.writeAt(6, 4, 'Provider: (default)');
        break;
      case 'main':
        this.renderMainLayout();
        break;
      case 'hitl':
        this.renderMainLayout();
        this._buffer.writeAt(this._buffer.height / 2 | 0, 10, '[Agent needs input - select an option]');
        break;
      case 'multi':
        this.renderMultiLayout();
        break;
      case 'end':
        this._buffer.writeAt(1, 2, 'Session complete - summary');
        this._buffer.writeAt(this._buffer.height - 1, 0, '~ $ ');
        break;
    }
  }

  private renderMainLayout(): void {
    if (!this._buffer) return;
    const sidebarWidth = 20;
    this._buffer.writeAt(0, 0, '#control');
    this._buffer.writeAt(1, 0, '#agents');
    this._buffer.writeAt(0, sidebarWidth + 1, '── #control ──');
  }

  private renderMultiLayout(): void {
    if (!this._buffer) return;
    const sidebarWidth = 20;
    this._buffer.writeAt(0, 0, '#control');
    this._buffer.writeAt(1, 0, '#agent-1');
    this._buffer.writeAt(2, 0, '#agent-2');
    this._buffer.writeAt(0, sidebarWidth + 1, '── #agent-1 ──');
  }


  /**
   * On enter.
   */
  onEnter(phase: Phase, handler: PhaseHandler): void {
    const key = this.configKey(phase);
    if (!this._enterHandlers.has(key)) {
      this._enterHandlers.set(key, []);
    }
    this._enterHandlers.get(key)!.push(handler);
  }

  /**
   * On exit.
   */
  onExit(phase: Phase, handler: PhaseHandler): void {
    const key = this.configKey(phase);
    if (!this._exitHandlers.has(key)) {
      this._exitHandlers.set(key, []);
    }
    this._exitHandlers.get(key)!.push(handler);
  }

  /**
   * On.
   */
  on(event: string, handler: PhaseHandler): void {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, []);
    }
    this._handlers.get(event)!.push(handler);
  }

  /**
   * Emit.
   */
  emit(event: string, ...args: any[]): void {
    const handlers = this._handlers.get(event) ?? [];
    for (const handler of handlers) {
      handler(...args);
    }
  }

  private emitEvent(event: string, data: any): void {
    const handlers = this._handlers.get(event) ?? [];
    for (const handler of handlers) {
      handler(data);
    }
  }


  /**
   * Can transition to.
   */
  canTransitionTo(phase: Phase): boolean {
    const key = this.configKey(phase);
    const currentIdx = CANONICAL_PHASES.indexOf(this.configKey(this._current));
    const targetIdx = CANONICAL_PHASES.indexOf(key);
    return targetIdx > currentIdx || key === this.configKey(this._current);
  }

  /**
   * Reset.
   */
  reset(): void {
    this._current = 'shell';
    this._history = ['shell'];
    this._historyIndex = 0;
    this._inputBlocked = false;
  }

  private configKey(phase: Phase): Phase {
    if (phase === 'chat') return 'main';
    return phase;
  }

  private isKnownPhase(phase: Phase): boolean {
    return (CANONICAL_PHASES as readonly Phase[]).includes(phase) || phase === 'chat';
  }
}
