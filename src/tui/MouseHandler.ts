/** Parsed mouse event from terminal escape sequences. */
export interface MouseEvent {
  type: 'click' | 'release' | 'scroll' | 'drag';
  button: 'left' | 'middle' | 'right';
  col: number;  // 0-indexed
  row: number;  // 0-indexed
  scrollDirection?: 'up' | 'down';
}
/** A rectangular region that can receive mouse events. */
export interface ClickableRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  onClick?: (event: MouseEvent) => void;
  onHover?: (event: MouseEvent) => void;
}
/** Configuration for mouse protocol mode. */
export interface MouseHandlerOptions {
  mode?: 'sgr' | 'x10';
}
type MouseEventType = 'click' | 'scroll' | 'drag' | 'release';
type MouseListener = (event: MouseEvent, region: ClickableRegion | null) => void;
const SGR_REGEX = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
const X10_PREFIX = '\x1b[M';
const ENABLE_SEQ = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const DISABLE_SEQ = '\x1b[?1000l\x1b[?1002l\x1b[?1006l';
/**
 * Parses SGR/X10 mouse escape sequences, manages clickable regions,
 * and dispatches events to registered listeners.
 */
export class MouseHandler {
  private _enabled = false;
  private _mode: 'sgr' | 'x10';
  private _regions: ClickableRegion[] = [];
  private _listeners: Map<MouseEventType, MouseListener[]> = new Map();
  constructor(opts?: MouseHandlerOptions) {
    this._mode = opts?.mode ?? 'sgr';
    this._listeners.set('click', []);
    this._listeners.set('scroll', []);
    this._listeners.set('drag', []);
    this._listeners.set('release', []);
  }
  /** Enable mouse reporting by writing the appropriate escape sequences. */
  enable(write?: (s: string) => void): void {
    const w = write ?? ((s: string) => process.stdout.write(s));
    w(ENABLE_SEQ);
    this._enabled = true;
  }
  /** Disable mouse reporting. */
  disable(write?: (s: string) => void): void {
    const w = write ?? ((s: string) => process.stdout.write(s));
    w(DISABLE_SEQ);
    this._enabled = false;
  }
  /**
   * Checks whether enabled.
   */
  isEnabled(): boolean {
    return this._enabled;
  }
  /** Parse raw terminal input into a MouseEvent, or null if not a mouse sequence. */
  parse(data: string): MouseEvent | null {
    if (this._mode === 'sgr') {
      return this._parseSGR(data);
    }
    return this._parseX10(data);
  }
  private _parseSGR(data: string): MouseEvent | null {
    const match = data.match(SGR_REGEX);
    if (!match) return null;
    const buttonCode = parseInt(match[1], 10);
    const col = parseInt(match[2], 10) - 1;
    const row = parseInt(match[3], 10) - 1;
    const isRelease = match[4] === 'm';
    return this._buildEvent(buttonCode, col, row, isRelease);
  }
  private _parseX10(data: string): MouseEvent | null {
    if (!data.startsWith(X10_PREFIX)) return null;
    if (data.length < X10_PREFIX.length + 3) return null;
    const offset = X10_PREFIX.length;
    const cb = data.charCodeAt(offset) - 32;
    const col = data.charCodeAt(offset + 1) - 32 - 1;
    const row = data.charCodeAt(offset + 2) - 32 - 1;
    // X10 mode doesn't distinguish press/release well — treat as click
    return this._buildEvent(cb, col, row, false);
  }
  private _buildEvent(buttonCode: number, col: number, row: number, isRelease: boolean): MouseEvent {
    if (isRelease) {
      const button = this._buttonFromCode(buttonCode);
      return { type: 'release', button, col, row };
    }
    if (buttonCode === 64) {
      return { type: 'scroll', button: 'left', col, row, scrollDirection: 'up' };
    }
    if (buttonCode === 65) {
      return { type: 'scroll', button: 'left', col, row, scrollDirection: 'down' };
    }
    if (buttonCode >= 32 && buttonCode <= 34) {
      const button = this._buttonFromCode(buttonCode - 32);
      return { type: 'drag', button, col, row };
    }
    const button = this._buttonFromCode(buttonCode);
    return { type: 'click', button, col, row };
  }
  private _buttonFromCode(code: number): 'left' | 'middle' | 'right' {
    switch (code) {
      case 0: return 'left';
      case 1: return 'middle';
      case 2: return 'right';
      default: return 'left';
    }
  }
  /** Register a clickable region for hit-testing. */
  registerRegion(region: ClickableRegion): void {
    this._regions.push(region);
  }
  /**
   * Unregister region.
   */
  unregisterRegion(id: string): void {
    this._regions = this._regions.filter(r => r.id !== id);
  }
  /**
   * Clear regions.
   */
  clearRegions(): void {
    this._regions = [];
  }
  /**
   * Gets the regions.
   */
  getRegions(): ClickableRegion[] {
    return [...this._regions];
  }
  /** Find the topmost region at a coordinate (last registered wins). */
  hitTest(col: number, row: number): ClickableRegion | null {
    // Reverse order — last registered is on top
    for (let i = this._regions.length - 1; i >= 0; i--) {
      const r = this._regions[i];
      if (col >= r.x && col < r.x + r.width && row >= r.y && row < r.y + r.height) {
        return r;
      }
    }
    return null;
  }
  /** Dispatch a mouse event: fires region callbacks and global listeners. */
  handleEvent(event: MouseEvent): void {
    const region = this.hitTest(event.col, event.row);
    if (region) {
      if (event.type === 'click' && region.onClick) {
        region.onClick(event);
      }
      if ((event.type === 'drag' || event.type === 'click') && region.onHover) {
        region.onHover(event);
      }
    }
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      for (const handler of listeners) {
        handler(event, region);
      }
    }
  }
  /**
   * On.
   */
  on(event: MouseEventType, handler: MouseListener): void {
    const list = this._listeners.get(event);
    if (list) {
      list.push(handler);
    }
  }
  /**
   * Off.
   */
  off(event: string, handler: Function): void {
    const list = this._listeners.get(event as MouseEventType);
    if (list) {
      const idx = list.indexOf(handler as MouseListener);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    }
  }
}