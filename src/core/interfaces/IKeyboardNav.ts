/** Type union for KeyModifier: ctrl, alt, shift, meta. */
export type KeyModifier = 'ctrl' | 'alt' | 'shift' | 'meta';
/** Type union for NavigationTarget: channel, tool, prompt, sidebar, input, panel. */
export type NavigationTarget = 'channel' | 'tool' | 'prompt' | 'sidebar' | 'input' | 'panel';
/** A single key binding mapping a key/modifier combination to an action. */
export interface IKeyBinding {
  key: string;
  modifiers?: KeyModifier[];
  action: string;
  description: string;
  context?: NavigationTarget;
  repeatable?: boolean;
}
/** A keyboard event with key, modifiers, and timing info. */
export interface IKeyboardEvent {
  key: string;
  modifiers: KeyModifier[];
  raw: string;
  timestamp: number;
}
/** The current focus state of the TUI navigation system. */
export interface IFocusState {
  current: NavigationTarget;
  previous: NavigationTarget | null;
  channelIndex: number;
  toolIndex: number;
  panelExpanded: boolean;
}
/** Complete navigation scheme defining all action-to-key mappings. */
export interface INavigationScheme {
  channelNext: IKeyBinding;
  channelPrev: IKeyBinding;
  channelDirect: IKeyBinding[];
  channelHome: IKeyBinding;
  scrollUp: IKeyBinding;
  scrollDown: IKeyBinding;
  scrollPageUp: IKeyBinding;
  scrollPageDown: IKeyBinding;
  toolNext: IKeyBinding;
  toolPrev: IKeyBinding;
  toolExpand: IKeyBinding;
  toolCollapse: IKeyBinding;
  focusInput: IKeyBinding;
  focusSidebar: IKeyBinding;
  clearScreen: IKeyBinding;
  closeChannel: IKeyBinding;
  promptAccept: IKeyBinding;
  promptDefer: IKeyBinding;
  promptQuickSelect: IKeyBinding[];
  historyUp: IKeyBinding;
  historyDown: IKeyBinding;
}
/** Keyboard navigation system — manages key bindings, focus state, and navigation schemes. */
export interface IKeyboardNavigation {
  getFocusState(): IFocusState;
  setFocus(target: NavigationTarget): void;
  handleKeyEvent(event: IKeyboardEvent): boolean;
  getBindings(): IKeyBinding[];
  getBindingsForContext(context: NavigationTarget): IKeyBinding[];
  rebind(action: string, binding: Partial<IKeyBinding>): void;
  resetBindings(): void;
  getScheme(): INavigationScheme;
  setScheme(scheme: Partial<INavigationScheme>): void;
  isActionAvailable(action: string): boolean;
  onFocusChange(callback: (state: IFocusState) => void): () => void;
}