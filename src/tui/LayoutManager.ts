/** Responsive layout engine that calculates region positions from terminal dimensions. */

import { ScreenBuffer } from './ScreenBuffer.js';

/** Resolved position and size of a named layout region. */
export interface LayoutRegionDef {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Configuration options for the layout manager. */
export interface LayoutOptions {
  sidebarWidth?: number;
}

type RegionDefinition = {
  x: number | string;
  y: number | string;
  width: number | string;
  height: number | string;
};

/**
 * Calculates and maintains named layout regions based on terminal size.
 * Auto-collapses sidebar at narrow widths and supports layout presets.
 */
export class LayoutManager {
  private buffer: ScreenBuffer;
  private regions: Map<string, LayoutRegionDef> = new Map();
  private _sidebarVisible = true;
  private _sidebarManuallyHidden = false;
  private _bordersEnabled = true;
  private _sidebarWidth: number;
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  private static readonly MIN_SIDEBAR_WIDTH = 15;
  private static readonly MAX_SIDEBAR_WIDTH = 40;
  private static readonly COLLAPSE_THRESHOLD = 60;
  private static readonly MIN_RENDER_WIDTH = 15;
  private static readonly MIN_RENDER_HEIGHT = 8;

  constructor(bufferOrCols: ScreenBuffer | number, optsOrRows?: LayoutOptions | number, legacyConfig?: any) {
    if (bufferOrCols === null || bufferOrCols === undefined) {
      throw new Error('Buffer is required');
    }

    if (typeof bufferOrCols === 'number') {
      const cols = bufferOrCols;
      const rows = optsOrRows as number;
      this.buffer = new ScreenBuffer(cols, rows);
      this._sidebarWidth = 40;
    } else {
      this.buffer = bufferOrCols;
      const opts = (optsOrRows as LayoutOptions) ?? {};
      const requestedWidth = opts.sidebarWidth ?? 40;
      this._sidebarWidth = Math.max(
        LayoutManager.MIN_SIDEBAR_WIDTH,
        Math.min(LayoutManager.MAX_SIDEBAR_WIDTH, requestedWidth)
      );
    }

    this._sidebarVisible = this.buffer.width >= LayoutManager.COLLAPSE_THRESHOLD;
    this.buffer.on('resize', () => this.recalculate());
    this.calculateRegions();
  }

  /**
   * Gets the sidebar visible.
   */
  get sidebarVisible(): boolean { return this._sidebarVisible && !this._sidebarManuallyHidden; }

  /** Get a region by name. Throws if not found. */
  getRegion(name: string): LayoutRegionDef {
    const region = this.regions.get(name);
    if (!region) throw new Error(`Region "${name}" not found`);
    return { ...region };
  }

  /**
   * Checks whether region exists.
   */
  hasRegion(name: string): boolean {
    return this.regions.has(name);
  }

  /**
   * Gets the region names.
   */
  getRegionNames(): string[] {
    return [...this.regions.keys()];
  }

  /** Find the region containing a given coordinate (for mouse hit-testing). */
  getRegionAt(x: number, y: number): LayoutRegionDef | null {
    if (x < 0 || y < 0) return null;
    for (const region of this.regions.values()) {
      if (x >= region.x && x < region.x + region.width &&
          y >= region.y && y < region.y + region.height) {
        return { ...region };
      }
    }
    return null;
  }

  /** Recalculate all regions from current buffer dimensions. Emits 'resize'. */
  recalculate(): void {
    const w = this.buffer.width;
    const h = this.buffer.height;

    if (w < LayoutManager.MIN_RENDER_WIDTH && h < LayoutManager.MIN_RENDER_HEIGHT) {
      throw new Error(`Terminal too small to render (${w}x${h})`);
    }

    if (w < LayoutManager.COLLAPSE_THRESHOLD) {
      this._sidebarVisible = false;
    } else if (!this._sidebarManuallyHidden) {
      this._sidebarVisible = true;
    }

    if (w <= 20) {
      this.emit('warning', { type: 'narrow', width: w });
    }

    this.calculateRegions();
    this.emit('resize', { width: w, height: h });
  }

  /**
   * Hide sidebar.
   */
  hideSidebar(): void {
    this._sidebarManuallyHidden = true;
    this._sidebarVisible = false;
    this.calculateRegions();
    this.emit('sidebar:toggle', { visible: false });
  }

  /**
   * Show sidebar.
   */
  showSidebar(): void {
    this._sidebarManuallyHidden = false;
    this._sidebarVisible = true;
    this.calculateRegions();
    this.emit('sidebar:toggle', { visible: true });
  }

  /**
   * Toggle sidebar.
   */
  toggleSidebar(): void {
    if (this.sidebarVisible) {
      this.hideSidebar();
    } else {
      this.showSidebar();
    }
  }

  /**
   * Sets the sidebar width.
   */
  setSidebarWidth(width: number): void {
    this._sidebarWidth = Math.max(
      LayoutManager.MIN_SIDEBAR_WIDTH,
      Math.min(LayoutManager.MAX_SIDEBAR_WIDTH, width)
    );
    this.calculateRegions();
    this.emit('sidebar:resize', { width: this._sidebarWidth });
  }

  /**
   * Gets the sidebar width.
   */
  getSidebarWidth(): number {
    return this._sidebarWidth;
  }

  /**
   * Checks whether sidebar visible.
   */
  isSidebarVisible(): boolean {
    return this._sidebarVisible && !this._sidebarManuallyHidden;
  }

  /**
   * Checks whether border exists.
   */
  hasBorder(region: string, side: string): boolean {
    if (!this._bordersEnabled) return false;
    if (region === 'sidebar' && side === 'right') return true;
    if (region === 'input' && side === 'top') return true;
    if (region === 'status' && side === 'top') return true;
    return false;
  }

  /**
   * Disable borders.
   */
  disableBorders(): void {
    this._bordersEnabled = false;
    this.calculateRegions();
  }

  /**
   * Enable borders.
   */
  enableBorders(): void {
    this._bordersEnabled = true;
    this.calculateRegions();
  }

  /** Define a custom region using absolute or relative coordinates. */
  defineRegion(name: string, def: RegionDefinition): void {
    const resolved = this.resolveDefinition(def);
    if (resolved.x + resolved.width > this.buffer.width || resolved.y + resolved.height > this.buffer.height) {
      throw new Error(`Region "${name}" extends beyond buffer bounds`);
    }
    if (resolved.x < 0 || resolved.y < 0) {
      throw new Error(`Region "${name}" has negative position`);
    }
    this.regions.set(name, { name, ...resolved });
  }

  /** Apply a named layout preset ('irc', 'fullscreen', 'split'). */
  loadPreset(name: string): void {
    switch (name) {
      case 'irc':
        this._sidebarManuallyHidden = false;
        this._sidebarVisible = true;
        this.calculateRegions();
        break;
      case 'fullscreen':
        this._sidebarManuallyHidden = true;
        this._sidebarVisible = false;
        this.regions.clear();
        this.regions.set('main', {
          name: 'main',
          x: 0, y: 0,
          width: this.buffer.width,
          height: this.buffer.height
        });
        break;
      case 'split': {
        this._sidebarManuallyHidden = true;
        this._sidebarVisible = false;
        this.regions.clear();
        const halfW = Math.floor(this.buffer.width / 2);
        this.regions.set('left', { name: 'left', x: 0, y: 0, width: halfW, height: this.buffer.height });
        this.regions.set('right', { name: 'right', x: halfW, y: 0, width: this.buffer.width - halfW, height: this.buffer.height });
        break;
      }
      default:
        throw new Error(`Unknown preset "${name}"`);
    }
  }

  // Backward-compat method used by TuiTestDriver
  /**
   * Gets the layout.
   */
  getLayout(): { sidebar: any; main: any; inputBar: any; statusBar: any; sidebarVisible: boolean; cols: number; rows: number } {
    const sidebar = this.regions.get('sidebar') ?? { x: 0, y: 0, width: 0, height: 0 };
    const main = this.regions.get('main') ?? { x: 0, y: 0, width: this.buffer.width, height: this.buffer.height };
    const input = this.regions.get('input') ?? { x: 0, y: this.buffer.height - 2, width: this.buffer.width, height: 1 };
    const status = this.regions.get('status') ?? { x: 0, y: this.buffer.height - 1, width: this.buffer.width, height: 1 };
    return {
      sidebar: { row: sidebar.y, col: sidebar.x, width: sidebar.width, height: sidebar.height },
      main: { row: main.y, col: main.x, width: main.width, height: main.height },
      inputBar: { row: input.y, col: input.x, width: input.width, height: input.height },
      statusBar: { row: status.y, col: status.x, width: status.width, height: status.height },
      sidebarVisible: this.isSidebarVisible(),
      cols: this.buffer.width,
      rows: this.buffer.height,
    };
  }

  /**
   * Resize.
   */
  resize(cols: number, rows: number): void {
    this.buffer.resize(cols, rows);
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

  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) h(data);
  }

  private calculateRegions(): void {
    const w = this.buffer.width;
    const h = this.buffer.height;
    const sidebarW = this.isSidebarVisible() ? this._sidebarWidth : 0;
    const mainX = sidebarW;
    const mainW = Math.max(20, w - sidebarW);

    // Bottom-up layout with border rows between bars:
    const fkeyY = h - 1;
    const fkeyBorderY = fkeyY - 1;
    const inputY = fkeyBorderY - 1;
    const inputBorderY = inputY - 1;
    const statusY = inputBorderY - 1;
    const mainH = statusY;

    this.regions.set('sidebar', { name: 'sidebar', x: 0, y: 0, width: sidebarW, height: statusY });
    this.regions.set('main', { name: 'main', x: mainX, y: 0, width: mainW, height: mainH });
    this.regions.set('status', { name: 'status', x: 0, y: statusY, width: w, height: 1 });
    this.regions.set('inputBorder', { name: 'inputBorder', x: 0, y: inputBorderY, width: w, height: 1 });
    this.regions.set('input', { name: 'input', x: 0, y: inputY, width: w, height: 1 });
    this.regions.set('fkeyBorder', { name: 'fkeyBorder', x: 0, y: fkeyBorderY, width: w, height: 1 });
    this.regions.set('fkey', { name: 'fkey', x: 0, y: fkeyY, width: w, height: 1 });
  }

  private resolveDefinition(def: RegionDefinition): { x: number; y: number; width: number; height: number } {
    return {
      x: this.resolveCoord(def.x, 'x'),
      y: this.resolveCoord(def.y, 'y'),
      width: this.resolveDimension(def.width, 'width'),
      height: this.resolveDimension(def.height, 'height'),
    };
  }

  private resolveCoord(val: number | string, axis: string): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && val.startsWith('after:')) {
      const refName = val.slice(6);
      const ref = this.regions.get(refName);
      if (!ref) return 0;
      return axis === 'x' ? ref.x + ref.width : ref.y + ref.height;
    }
    return 0;
  }

  private resolveDimension(val: number | string, dim: string): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && val.endsWith('%')) {
      const pct = parseFloat(val) / 100;
      const base = dim === 'width' ? this.buffer.width : this.buffer.height;
      return Math.floor(base * pct);
    }
    return 0;
  }
}
