import type {
  IKeyboardNavigation,
  IKeyBinding,
  IKeyboardEvent,
  IFocusState,
  INavigationScheme,
  KeyModifier,
  NavigationTarget,
} from './interfaces/IKeyboardNav.js';
import { buildDefaultBindings, buildDefaultScheme, UNIVERSAL_ACTIONS } from './KeyboardNavSchemes.js';
// Re-export createKeyboardNav so existing imports from this module still work.
export { createKeyboardNav } from './KeyboardNav.js';
/** Vi-style keyboard navigation with multi-key sequences and conflict detection. */
export class KeyboardNavController implements IKeyboardNavigation {
  private focusState: IFocusState;
  private mode: 'normal' | 'insert' = 'insert';
  private bindings: IKeyBinding[];
  private defaultBindings: IKeyBinding[];
  private scheme: INavigationScheme;
  private focusChangeCallbacks: Array<(state: IFocusState) => void> = [];
  private sequences: Array<{ keys: string[]; action: string }> = [];
  private pendingSequence: string[] = [];
  private lastKeyTimestamp = 0;
  private sequenceTimeout = 500;
  /**
   * @param _ctx - Optional context with viewManager, channelManager, promptSystem, and scriptEngine.
   */
  constructor(_ctx: {
    viewManager?: any;
    channelManager?: any;
    promptSystem?: any;
    scriptEngine?: any;
  } = {}) {
    this.focusState = {
      current: 'input',
      previous: null,
      channelIndex: 0,
      toolIndex: 0,
      panelExpanded: false,
    };
    this.defaultBindings = buildDefaultBindings();
    this.bindings = [...this.defaultBindings];
    this.scheme = buildDefaultScheme();
  }
  /**
   * Returns a copy of the current focus state.
   */
  getFocusState(): IFocusState {
    return { ...this.focusState };
  }
  /**
   * Sets the focus.
   */
  setFocus(target: NavigationTarget): void {
    const previous = this.focusState.current;
    this.focusState = {
      ...this.focusState,
      previous,
      current: target,
    };
    for (const cb of this.focusChangeCallbacks) {
      cb(this.getFocusState());
    }
  }
  /**
   * Handle key event.
   */
  handleKeyEvent(event: IKeyboardEvent): boolean {
    if (event.key === 'Escape' && this.mode === 'insert') {
      this.mode = 'normal';
      return true;
    }
    if (this.mode === 'normal' && event.key === 'i' && event.modifiers.length === 0) {
      this.mode = 'insert';
      return true;
    }
    if (this.mode === 'normal' && event.modifiers.length === 0) {
      const elapsed = event.timestamp - this.lastKeyTimestamp;
      this.lastKeyTimestamp = event.timestamp;
      if (elapsed > this.sequenceTimeout) {
        this.pendingSequence = [];
      }
      this.pendingSequence.push(event.key);
      for (const seq of this.sequences) {
        if (seq.keys.length === this.pendingSequence.length) {
          const matches = seq.keys.every((k, i) => k === this.pendingSequence[i]);
          if (matches) {
            this.pendingSequence = [];
            return true; // Action consumed
          }
        }
      }
      const isPrefix = this.sequences.some(seq =>
        seq.keys.length > this.pendingSequence.length &&
        this.pendingSequence.every((k, i) => k === seq.keys[i])
      );
      if (isPrefix) {
        return true;
      }
      if (this.pendingSequence.length > 1) {
        this.pendingSequence = [event.key];
      }
    }
    if (event.modifiers.length > 0) {
      const match = this.findBinding(event);
      if (match) {
        this.pendingSequence = [];
        return true;
      }
    }
    if (this.mode === 'normal') {
      const normalModeKeys = ['j', 'k', 'h', 'l', 'g', 'G', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      if (normalModeKeys.includes(event.key) && event.modifiers.length === 0) {
        return true;
      }
      if (event.key === 'Tab') return true;
      if (event.key === 'Enter' && this.focusState.current === 'tool') {
        return true;
      }
    }
    if (this.mode === 'insert') {
      const match = this.findBinding(event);
      if (match) return true;
      if (event.modifiers.length === 0 && event.key.length === 1) {
        return false;
      }
    }
    return false;
  }
  /**
   * Gets the bindings.
   */
  getBindings(): IKeyBinding[] {
    return [...this.bindings];
  }
  /**
   * Returns bindings relevant to a specific navigation context.
   * @param context - The context to filter by.
   */
  getBindingsForContext(context: NavigationTarget): IKeyBinding[] {
    const contextBindings = this.bindings.filter(b => !b.context || b.context === context);
    switch (context) {
      case 'input':
        return contextBindings.filter(b =>
          b.action !== 'toolExpand' && b.action !== 'toolNext' && b.action !== 'toolPrev'
        );
      case 'sidebar':
        return contextBindings.filter(b =>
          b.action !== 'historyUp' && b.action !== 'historyDown' && b.action !== 'historySearch'
        );
      case 'tool':
        return contextBindings;
      default:
        return contextBindings;
    }
  }
  /**
   * Rebind.
   */
  /**
   * Rebinds an action to a new key/combination, detecting conflicts.
   * @param action - The action name.
   * @param binding - The new key binding details.
   * @throws If there is a key conflict with another action.
   */
  rebind(action: string, binding: Partial<IKeyBinding>): void {
    if (binding.key && binding.modifiers) {
      const conflict = this.bindings.find(b =>
        b.action !== action &&
        b.key === binding.key &&
        this.modifiersMatch(b.modifiers ?? [], binding.modifiers!)
      );
      if (conflict) {
        throw new Error(`Conflict: key ${binding.modifiers.join('+')}+${binding.key} is already bound to "${conflict.action}"`);
      }
    }
    const idx = this.bindings.findIndex(b => b.action === action);
    if (idx !== -1) {
      this.bindings[idx] = { ...this.bindings[idx], ...binding };
    } else {
      this.bindings.push({
        key: binding.key ?? '',
        modifiers: binding.modifiers ?? [],
        action,
        description: binding.description ?? '',
        ...binding,
      } as IKeyBinding);
    }
    if (action in this.scheme) {
      const schemeRecord = this.scheme as unknown as Record<string, object>;
      schemeRecord[action] = { ...schemeRecord[action], ...binding };
    }
  }
  /**
   * Reset bindings.
   */
  /**
   * Resets all bindings and scheme to defaults.
   */
  resetBindings(): void {
    this.bindings = [...buildDefaultBindings()];
    this.scheme = buildDefaultScheme();
  }
  /**
   * Gets the scheme.
   */
  /**
   * Returns a copy of the current navigation scheme.
   */
  getScheme(): INavigationScheme {
    return { ...this.scheme };
  }
  /**
   * Sets the scheme.
   */
  /**
   * Merges a partial scheme into the current navigation scheme, updating bindings accordingly.
   * @param scheme - Partial scheme overrides.
   */
  setScheme(scheme: Partial<INavigationScheme>): void {
    this.scheme = { ...this.scheme, ...scheme };
    for (const [action, binding] of Object.entries(scheme)) {
      if (binding && !Array.isArray(binding) && 'key' in binding) {
        const idx = this.bindings.findIndex(b => b.action === action);
        if (idx !== -1) {
          this.bindings[idx] = binding as IKeyBinding;
        }
      }
    }
  }
  /**
   * Checks whether action available.
   */
  /**
   * Returns whether a given action is available in the current focus context.
   * @param action - The action name.
   */
  isActionAvailable(action: string): boolean {
    if (UNIVERSAL_ACTIONS.has(action)) return true;
    if (action === 'promptAccept') {
      return false;
    }
    if (action === 'toolExpand' || action === 'toolCollapse') {
      return this.focusState.current === 'tool';
    }
    return this.bindings.some(b => b.action === action);
  }
  /**
   * On focus change.
   */
  /**
   * Registers a focus change listener.
   * @param callback - Called with the new focus state on changes.
   * @returns A function to unregister the listener.
   */
  onFocusChange(callback: (state: IFocusState) => void): () => void {
    this.focusChangeCallbacks.push(callback);
    return () => {
      this.focusChangeCallbacks = this.focusChangeCallbacks.filter(cb => cb !== callback);
    };
  }
  /**
   * Gets the mode.
   */
  /**
   * Returns the current mode ('normal' or 'insert').
   */
  getMode(): 'normal' | 'insert' {
    return this.mode;
  }
  /**
   * Sets the mode.
   */
  /**
   * Sets the current mode ('normal' or 'insert').
   * @param mode - The mode to set.
   */
  setMode(mode: 'normal' | 'insert'): void {
    this.mode = mode;
  }
  /**
   * Register sequence.
   */
  /**
   * Registers a multi-key sequence binding.
   * @param keys - Array of keys in the sequence.
   * @param action - The action to bind.
   */
  registerSequence(keys: string[], action: string): void {
    this.sequences.push({ keys, action });
    if (!this.bindings.some(b => b.action === action)) {
      this.bindings.push({
        key: keys.join(' '),
        modifiers: [],
        action,
        description: `Sequence: ${keys.join(' ')}`,
      });
    }
  }
  /**
   * Gets the conflicts.
   */
  /**
   * Detects and returns conflicting key bindings.
   */
  getConflicts(): { action1: string; action2: string; binding: string }[] {
    const conflicts: { action1: string; action2: string; binding: string }[] = [];
    const seen = new Map<string, IKeyBinding>();
    for (const binding of this.bindings) {
      const mods = [...(binding.modifiers ?? [])].sort().join('+');
      const key = `${mods}+${binding.key}|${binding.context ?? ''}`;
      const existing = seen.get(key);
      if (existing) {
        conflicts.push({
          action1: existing.action,
          action2: binding.action,
          binding: `${mods}+${binding.key}`,
        });
      } else {
        seen.set(key, binding);
      }
    }
    return conflicts;
  }
  /**
   * Exports current bindings and mode as a serializable object.
   */
  exportBindings(): Record<string, any> {
    return {
      bindings: this.bindings.map(b => ({ ...b })),
      mode: this.mode,
    };
  }
  /**
   * Import bindings.
   */
  /**
   * Imports bindings from a serialized configuration object.
   * @param config - The configuration object with a bindings array.
   */
  importBindings(config: Record<string, any>): void {
    if (config.bindings && Array.isArray(config.bindings)) {
      this.bindings = config.bindings;
    }
  }
  private findBinding(event: IKeyboardEvent): IKeyBinding | undefined {
    return this.bindings.find(b =>
      b.key === event.key &&
      this.modifiersMatch(b.modifiers ?? [], event.modifiers)
    );
  }
  private modifiersMatch(a: KeyModifier[], b: KeyModifier[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((mod, i) => mod === sortedB[i]);
  }
}