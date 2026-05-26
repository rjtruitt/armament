/**
 * Focus management and key binding for terminal UI navigation.
 *
 * Provides a factory-based keyboard navigation system with context-aware
 * binding resolution, scheme overrides, and focus change listeners.
 */

export type FocusTarget = 'input' | 'sidebar' | 'channel' | 'tool' | 'prompt';
/** Interface for FocusState.
 * @property {FocusTarget} current - Description of current.
 * @property {FocusTarget} previous - Description of previous.
 * @property {number} channelIndex - Description of channelIndex.
 * @property {number} toolIndex - Description of toolIndex.
 * @property {boolean} panelExpanded - Description of panelExpanded.
 */
export interface FocusState {
  current: FocusTarget;
  previous: FocusTarget | null;
  channelIndex: number;
  toolIndex: number;
  panelExpanded: boolean;
}
/** Interface for Binding.
 * @property {string} key - Description of key.
 * @property {string} modifiers - Description of modifiers.
 * @property {string} action - Description of action.
 * @property {string} description - Description of description.
 * @property {string} context - Description of context.
 * @property {boolean} repeatable - Description of repeatable.
 */
export interface Binding {
  key: string;
  modifiers: string[];
  action: string;
  description: string;
  context?: string;
  repeatable?: boolean;
}

/** Create keyboard nav.
 */
export function createKeyboardNav() {

  const defaultBindings: Binding[] = [
    { key: 'ArrowDown', modifiers: ['alt'], action: 'channelNext', description: 'next channel', context: 'global', repeatable: true },
    { key: 'ArrowUp', modifiers: ['alt'], action: 'channelPrev', description: 'prev channel', context: 'global', repeatable: true },
    { key: '1', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: '2', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: '3', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: '4', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: '5', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: '6', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: '7', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: '8', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: '9', modifiers: ['alt'], action: 'channelJump', description: 'jump to channel', context: 'global' },
    { key: 'ArrowLeft', modifiers: ['alt'], action: 'channelControl', description: 'jump to control channel', context: 'global' },
    { key: 'n', modifiers: ['ctrl'], action: 'channelNextUnread', description: 'next unread channel', context: 'global' },
    { key: 'p', modifiers: ['ctrl'], action: 'channelPrevUnread', description: 'prev unread channel', context: 'global' },
    { key: 'PageUp', modifiers: [], action: 'scrollUp', description: 'scroll up', context: 'global', repeatable: true },
    { key: 'PageDown', modifiers: [], action: 'scrollDown', description: 'scroll down', context: 'global', repeatable: true },
    { key: 'Tab', modifiers: [], action: 'toolNext', description: 'next tool', context: 'global' },
    { key: 'Tab', modifiers: ['shift'], action: 'toolPrev', description: 'prev tool', context: 'global' },
    { key: 'Enter', modifiers: [], action: 'toolExpand', description: 'expand tool', context: 'tool' },
    { key: 'Escape', modifiers: [], action: 'toolCollapse', description: 'collapse tool', context: 'tool' },
    { key: 'Escape', modifiers: [], action: 'focusInput', description: 'focus input', context: 'global' },
    { key: 'ArrowUp', modifiers: [], action: 'historyUp', description: 'history up', context: 'input' },
    { key: 'ArrowDown', modifiers: [], action: 'historyDown', description: 'history down', context: 'input' },
    { key: 'ArrowUp', modifiers: [], action: 'promptUp', description: 'prompt option up', context: 'prompt' },
    { key: 'ArrowDown', modifiers: [], action: 'promptDown', description: 'prompt option down', context: 'prompt' },
    { key: 'Enter', modifiers: [], action: 'promptSelect', description: 'select prompt option', context: 'prompt' },
    { key: 'z', modifiers: ['ctrl'], action: 'promptDefer', description: 'defer prompt', context: 'prompt' },
    { key: 'l', modifiers: ['ctrl'], action: 'clearScreen', description: 'clear screen', context: 'global' },
    { key: 'w', modifiers: ['ctrl'], action: 'closeChannel', description: 'close channel', context: 'global' },
    { key: 'b', modifiers: ['ctrl'], action: 'focusSidebar', description: 'focus sidebar', context: 'global' },
    { key: 'ArrowDown', modifiers: [], action: 'sidebarDown', description: 'sidebar nav down', context: 'sidebar' },
    { key: 'ArrowUp', modifiers: [], action: 'sidebarUp', description: 'sidebar nav up', context: 'sidebar' },
    { key: 'Enter', modifiers: [], action: 'sidebarSelect', description: 'select sidebar item', context: 'sidebar' },
  ];

  let bindings = defaultBindings.map(b => ({ ...b }));
  let scheme: Record<string, Binding> = {};

  const state: FocusState = {
    current: 'input',
    previous: null,
    channelIndex: 0,
    toolIndex: -1,
    panelExpanded: false,
  };

  const listeners: Array<(s: FocusState) => void> = [];

  const MAX_CHANNELS = 10;

  function setFocus(target: FocusTarget) {
    if (state.current !== target) {
      state.previous = state.current;
      state.current = target;
    }
    if (target === 'tool' && state.toolIndex < 0) {
      state.toolIndex = 0;
    }
    for (const cb of listeners) {
      cb({ ...state });
    }
  }

  function matchesBinding(event: { key: string; modifiers: string[] }, binding: { key: string; modifiers: string[] }): boolean {
    if (event.key !== binding.key) return false;
    if (event.modifiers.length !== binding.modifiers.length) return false;
    for (const mod of binding.modifiers) {
      if (!event.modifiers.includes(mod)) return false;
    }
    return true;
  }

  function findBinding(event: { key: string; modifiers: string[] }): Binding | undefined {
    for (const action of Object.keys(scheme)) {
      const b = scheme[action];
      if (matchesBinding(event, b)) return b;
    }
    const contextBindings = bindings.filter(b => b.context === state.current);
    for (const b of contextBindings) {
      if (matchesBinding(event, b)) return b;
    }
    const globalBindings = bindings.filter(b => b.context === 'global');
    for (const b of globalBindings) {
      if (matchesBinding(event, b)) return b;
    }
    return undefined;
  }

  function isPromptNumberKey(event: { key: string; modifiers: string[] }): boolean {
    return state.current === 'prompt' && event.modifiers.length === 0 && /^[1-9]$/.test(event.key);
  }

  function handleKeyEvent(event: { key: string; modifiers: string[]; raw: string; timestamp: number }): boolean {
    // Prompt number quick-select
    if (isPromptNumberKey(event)) {
      setFocus('input');
      return true;
    }

    const binding = findBinding(event);
    if (!binding) return false;

    switch (binding.action) {
      case 'channelNext':
        state.channelIndex = (state.channelIndex + 1) % MAX_CHANNELS;
        return true;
      case 'channelPrev':
        state.channelIndex = (state.channelIndex - 1 + MAX_CHANNELS) % MAX_CHANNELS;
        return true;
      case 'channelJump':
        return true;
      case 'channelControl':
        state.channelIndex = 0;
        return true;
      case 'channelNextUnread':
        return true;
      case 'channelPrevUnread':
        return true;
      case 'scrollUp':
      case 'scrollDown':
        return true;
      case 'toolNext':
        state.toolIndex = Math.max(0, state.toolIndex + 1);
        setFocus('tool');
        return true;
      case 'toolPrev':
        state.toolIndex = Math.max(0, state.toolIndex - 1);
        setFocus('tool');
        return true;
      case 'toolExpand':
        if (state.current === 'tool') {
          state.panelExpanded = true;
          return true;
        }
        return false;
      case 'toolCollapse':
        if (state.current === 'tool') {
          if (state.panelExpanded) {
            state.panelExpanded = false;
            return true;
          }
          setFocus('input');
          return true;
        }
        // Fall through to focusInput for non-tool contexts
        setFocus('input');
        return true;
      case 'focusInput':
        setFocus('input');
        return true;
      case 'historyUp':
        if (state.current === 'input') return true;
        return false;
      case 'historyDown':
        if (state.current === 'input') return true;
        return false;
      case 'promptUp':
      case 'promptDown':
        if (state.current === 'prompt') return true;
        return false;
      case 'promptSelect':
        if (state.current === 'prompt') {
          setFocus('input');
          return true;
        }
        return false;
      case 'promptDefer':
        if (state.current === 'prompt') return true;
        return false;
      case 'clearScreen':
        return true;
      case 'closeChannel':
        return true;
      case 'focusSidebar':
        setFocus('sidebar');
        return true;
      case 'sidebarDown':
      case 'sidebarUp':
        if (state.current === 'sidebar') return true;
        return false;
      case 'sidebarSelect':
        if (state.current === 'sidebar') return true;
        return false;
      default:
        return false;
    }
  }

  function getBindings() {
    return [...bindings];
  }

  function getBindingsForContext(ctx: string) {
    return bindings.filter(b => b.context === ctx);
  }

  function rebind(action: string, binding: { key: string; modifiers: string[] }) {
    bindings = bindings.filter(b => b.action !== action);
    bindings.push({ key: binding.key, modifiers: binding.modifiers, action, description: '', context: 'global' });
  }

  function resetBindings() {
    bindings = defaultBindings.map(b => ({ ...b }));
    scheme = {};
  }

  function getScheme() {
    return { ...scheme };
  }

  function setScheme(s: Record<string, Binding>) {
    scheme = { ...s };
  }

  function isActionAvailable(action: string): boolean {
    const actionContextMap: Record<string, string[]> = {
      historyUp: ['input'],
      historyDown: ['input'],
      toolExpand: ['tool'],
      toolCollapse: ['tool'],
      promptUp: ['prompt'],
      promptDown: ['prompt'],
      promptSelect: ['prompt'],
      promptDefer: ['prompt'],
      sidebarDown: ['sidebar'],
      sidebarUp: ['sidebar'],
      sidebarSelect: ['sidebar'],
    };
    const contexts = actionContextMap[action];
    if (contexts) {
      return contexts.includes(state.current);
    }
    return true;
  }

  function onFocusChange(cb: (s: FocusState) => void): () => void {
    listeners.push(cb);
    return () => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  return {
    getFocusState: () => ({ ...state }),
    setFocus,
    handleKeyEvent,
    getBindings,
    getBindingsForContext,
    rebind,
    resetBindings,
    getScheme,
    setScheme,
    isActionAvailable,
    onFocusChange,
  };
}
