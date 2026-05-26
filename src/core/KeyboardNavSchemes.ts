/**
 * Navigation scheme definitions and key binding mappings for the
 * KeyboardNavController class (vi-style class-based controller).
 *
 * Exports: buildDefaultBindings, buildDefaultScheme, UNIVERSAL_ACTIONS
 */
import type {
  IKeyBinding,
  INavigationScheme,
} from './interfaces/IKeyboardNav.js';
/** Build the default flat list of key bindings for all navigation actions. */
export function buildDefaultBindings(): IKeyBinding[] {
  return [
    { key: 'ArrowDown', modifiers: ['alt'], action: 'channelNext', description: 'Next channel' },
    { key: 'ArrowUp', modifiers: ['alt'], action: 'channelPrev', description: 'Previous channel' },
    { key: '1', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 1' },
    { key: '2', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 2' },
    { key: '3', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 3' },
    { key: '4', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 4' },
    { key: '5', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 5' },
    { key: '6', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 6' },
    { key: '7', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 7' },
    { key: '8', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 8' },
    { key: '9', modifiers: ['alt'], action: 'channelDirect', description: 'Direct channel 9' },
    { key: 'Home', modifiers: ['alt'], action: 'channelHome', description: 'First channel' },
    { key: 'PageUp', modifiers: [], action: 'scrollPageUp', description: 'Scroll page up' },
    { key: 'PageDown', modifiers: [], action: 'scrollPageDown', description: 'Scroll page down' },
    { key: 'Home', modifiers: ['ctrl'], action: 'scrollTop', description: 'Scroll to top' },
    { key: 'End', modifiers: ['ctrl'], action: 'scrollBottom', description: 'Scroll to bottom' },
    { key: 'Tab', modifiers: [], action: 'toolNext', description: 'Next tool call', context: 'tool' },
    { key: 'Tab', modifiers: ['shift'], action: 'toolPrev', description: 'Previous tool call', context: 'tool' },
    { key: 'Enter', modifiers: [], action: 'toolExpand', description: 'Expand/collapse tool', context: 'tool' },
    { key: 'ArrowUp', modifiers: [], action: 'historyUp', description: 'Previous history' },
    { key: 'ArrowDown', modifiers: [], action: 'historyDown', description: 'Next history' },
    { key: 'r', modifiers: ['ctrl'], action: 'historySearch', description: 'Search history' },
    { key: 'l', modifiers: ['ctrl'], action: 'clearScreen', description: 'Clear screen' },
    { key: 'w', modifiers: ['ctrl'], action: 'closeChannel', description: 'Close channel' },
    { key: 'p', modifiers: ['ctrl'], action: 'quickSwitcher', description: 'Quick switcher' },
    { key: 't', modifiers: ['ctrl'], action: 'cycleTheme', description: 'Cycle theme' },
    { key: 'b', modifiers: ['ctrl'], action: 'toggleSidebar', description: 'Toggle sidebar' },
    { key: 'z', modifiers: ['ctrl'], action: 'promptDefer', description: 'Defer prompt' },
  ];
}
/** Build the default navigation scheme mapping actions to key bindings. */
export function buildDefaultScheme(): INavigationScheme {
  return {
    channelNext: { key: 'ArrowDown', modifiers: ['alt'], action: 'channelNext', description: 'Next channel' },
    channelPrev: { key: 'ArrowUp', modifiers: ['alt'], action: 'channelPrev', description: 'Previous channel' },
    channelDirect: [
      { key: '1', modifiers: ['alt'], action: 'channelDirect', description: 'Channel 1' },
    ],
    channelHome: { key: 'Home', modifiers: ['alt'], action: 'channelHome', description: 'First channel' },
    scrollUp: { key: 'ArrowUp', modifiers: [], action: 'scrollUp', description: 'Scroll up' },
    scrollDown: { key: 'ArrowDown', modifiers: [], action: 'scrollDown', description: 'Scroll down' },
    scrollPageUp: { key: 'PageUp', modifiers: [], action: 'scrollPageUp', description: 'Page up' },
    scrollPageDown: { key: 'PageDown', modifiers: [], action: 'scrollPageDown', description: 'Page down' },
    toolNext: { key: 'Tab', modifiers: [], action: 'toolNext', description: 'Next tool' },
    toolPrev: { key: 'Tab', modifiers: ['shift'], action: 'toolPrev', description: 'Previous tool' },
    toolExpand: { key: 'Enter', modifiers: [], action: 'toolExpand', description: 'Expand tool' },
    toolCollapse: { key: 'Escape', modifiers: [], action: 'toolCollapse', description: 'Collapse tool' },
    focusInput: { key: 'i', modifiers: [], action: 'focusInput', description: 'Focus input' },
    focusSidebar: { key: 'b', modifiers: ['ctrl'], action: 'focusSidebar', description: 'Focus sidebar' },
    clearScreen: { key: 'l', modifiers: ['ctrl'], action: 'clearScreen', description: 'Clear screen' },
    closeChannel: { key: 'w', modifiers: ['ctrl'], action: 'closeChannel', description: 'Close channel' },
    promptAccept: { key: 'Enter', modifiers: [], action: 'promptAccept', description: 'Accept prompt' },
    promptDefer: { key: 'z', modifiers: ['ctrl'], action: 'promptDefer', description: 'Defer prompt' },
    promptQuickSelect: [
      { key: '1', modifiers: [], action: 'promptQuickSelect', description: 'Select 1' },
    ],
    historyUp: { key: 'ArrowUp', modifiers: [], action: 'historyUp', description: 'History up' },
    historyDown: { key: 'ArrowDown', modifiers: [], action: 'historyDown', description: 'History down' },
  };
}
/** Set of action names that remain active regardless of current focus context. */
export const UNIVERSAL_ACTIONS = new Set([
  'clearScreen', 'toggleSidebar', 'quickSwitcher', 'cycleTheme',
  'channelNext', 'channelPrev', 'channelDirect', 'channelHome',
  'closeChannel', 'historyUp', 'historyDown', 'historySearch',
  'scrollPageUp', 'scrollPageDown', 'scrollTop', 'scrollBottom',
  'promptDefer',
]);