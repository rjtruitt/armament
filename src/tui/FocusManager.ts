/** Named screen regions that can receive keyboard focus. */
export type FocusableRegion = 'input' | 'sidebar' | 'main' | 'status' | 'palette' | 'menu';
/** Configuration for the focus manager's initial state. */
export interface FocusManagerOptions {
  initialFocus?: FocusableRegion;
  regions?: FocusableRegion[];
}
/** Event payload emitted when focus moves between regions. */
export interface FocusChangeEvent {
  from: FocusableRegion | null;
  to: FocusableRegion;
  reason: 'tab' | 'shift-tab' | 'click' | 'escape' | 'programmatic';
}
type FocusEventType = 'focus:change' | 'focus:lock' | 'focus:unlock';
/**
 * Manages keyboard focus state across TUI regions with tab cycling,
 * visibility gating, and focus locking for modal overlays.
 */
export class FocusManager {
  private currentFocus: FocusableRegion;
  private regions: FocusableRegion[];
  private visibilityMap: Map<FocusableRegion, boolean>;
  private lockedRegion: FocusableRegion | null = null;
  private listeners: Map<string, Function[]> = new Map();
  constructor(opts?: FocusManagerOptions) {
    this.regions = opts?.regions ?? ['input', 'sidebar', 'main'];
    this.currentFocus = opts?.initialFocus ?? 'input';
    this.visibilityMap = new Map();
    for (const region of this.regions) {
      this.visibilityMap.set(region, true);
    }
  }
  /** Get the currently focused region. */
  getFocus(): FocusableRegion {
    return this.currentFocus;
  }
  /** Move focus to a region. Throws if the region is invisible; no-op if locked elsewhere. */
  setFocus(region: FocusableRegion, reason: FocusChangeEvent['reason'] = 'programmatic'): void {
    if (this.lockedRegion !== null && region !== this.lockedRegion) {
      return;
    }
    if (!this.isRegionVisible(region)) {
      throw new Error(`Cannot focus invisible region: ${region}`);
    }
    const from = this.currentFocus;
    if (from === region) {
      return;
    }
    this.currentFocus = region;
    this.emit('focus:change', { from, to: region, reason });
  }
  /**
   * Checks whether focus exists.
   */
  hasFocus(region: FocusableRegion): boolean {
    return this.currentFocus === region;
  }
  /** Advance focus to the next visible region in tab order. */
  focusNext(): void {
    if (this.lockedRegion !== null) {
      return;
    }
    const order = this.getTabOrder();
    if (order.length <= 1) {
      return;
    }
    const idx = order.indexOf(this.currentFocus);
    const nextIdx = (idx + 1) % order.length;
    const from = this.currentFocus;
    this.currentFocus = order[nextIdx];
    this.emit('focus:change', { from, to: this.currentFocus, reason: 'tab' });
  }
  /** Move focus to the previous visible region in tab order. */
  focusPrev(): void {
    if (this.lockedRegion !== null) {
      return;
    }
    const order = this.getTabOrder();
    if (order.length <= 1) {
      return;
    }
    const idx = order.indexOf(this.currentFocus);
    const prevIdx = (idx - 1 + order.length) % order.length;
    const from = this.currentFocus;
    this.currentFocus = order[prevIdx];
    this.emit('focus:change', { from, to: this.currentFocus, reason: 'shift-tab' });
  }
  /** Return focus to the input bar (typical escape behavior). */
  focusInput(): void {
    if (this.lockedRegion !== null) {
      return;
    }
    if (this.currentFocus === 'input') {
      return;
    }
    const from = this.currentFocus;
    this.currentFocus = 'input';
    this.emit('focus:change', { from, to: 'input', reason: 'escape' });
  }
  /**
   * Sets the region visible.
   */
  setRegionVisible(region: FocusableRegion, visible: boolean): void {
    this.visibilityMap.set(region, visible);
  }
  /**
   * Checks whether region visible.
   */
  isRegionVisible(region: FocusableRegion): boolean {
    return this.visibilityMap.get(region) ?? false;
  }
  /**
   * Gets the visible regions.
   */
  getVisibleRegions(): FocusableRegion[] {
    return this.regions.filter(r => this.visibilityMap.get(r) === true);
  }
  /**
   * Gets the tab order.
   */
  getTabOrder(): FocusableRegion[] {
    return this.regions.filter(r => this.visibilityMap.get(r) === true);
  }
  /**
   * Gets the focus indicator.
   */
  getFocusIndicator(region: FocusableRegion): string {
    return this.currentFocus === region ? '▸' : '';
  }
  /**
   * Checks whether focused.
   */
  isFocused(region: FocusableRegion): boolean {
    return this.currentFocus === region;
  }
  /** Lock focus to a region (e.g., for a modal). All other focus attempts are blocked. */
  lockFocus(region: FocusableRegion): void {
    this.lockedRegion = region;
    const from = this.currentFocus;
    if (from !== region) {
      this.currentFocus = region;
      this.emit('focus:change', { from, to: region, reason: 'programmatic' });
    }
    this.emit('focus:lock');
  }
  /** Release the focus lock, allowing normal tab cycling again. */
  unlockFocus(): void {
    this.lockedRegion = null;
    this.emit('focus:unlock');
  }
  /**
   * Checks whether locked.
   */
  isLocked(): boolean {
    return this.lockedRegion !== null;
  }
  /**
   * Gets the locked region.
   */
  getLockedRegion(): FocusableRegion | null {
    return this.lockedRegion;
  }
  /**
   * On.
   */
  on(event: FocusEventType, handler: Function): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }
  /**
   * Off.
   */
  off(event: string, handler: Function): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  }
  /** Get the region that should receive key events (respects focus lock). */
  getKeyTarget(): FocusableRegion {
    if (this.lockedRegion !== null) {
      return this.lockedRegion;
    }
    return this.currentFocus;
  }
  private emit(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(...args);
    }
  }
}