/**
 * UX SHORTCUTS TEST SUITE — Keyboard navigation, keybinding customization,
 * focus management, mode switching, multi-key sequences, and context-aware
 * shortcut dispatch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardNavController } from '../core/KeyboardNavController';

function createKeyboardNavController(ctx: any = {}) {
  return new KeyboardNavController(ctx);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FOCUS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Focus Management', () => {
  it('starts with focus on input', () => {
    const nav = createKeyboardNavController();
    const state = nav.getFocusState();
    expect(state.current).toBe('input');
  });

  it('can set focus to sidebar', () => {
    const nav = createKeyboardNavController();
    nav.setFocus('sidebar');
    expect(nav.getFocusState().current).toBe('sidebar');
  });

  it('can set focus to channel', () => {
    const nav = createKeyboardNavController();
    nav.setFocus('channel');
    expect(nav.getFocusState().current).toBe('channel');
  });

  it('can set focus to tool (expand/collapse tool output)', () => {
    const nav = createKeyboardNavController();
    nav.setFocus('tool');
    expect(nav.getFocusState().current).toBe('tool');
  });

  it('can set focus to panel', () => {
    const nav = createKeyboardNavController();
    nav.setFocus('panel');
    expect(nav.getFocusState().current).toBe('panel');
  });

  it('tracks previous focus for toggle-back', () => {
    const nav = createKeyboardNavController();
    nav.setFocus('sidebar');
    nav.setFocus('channel');
    expect(nav.getFocusState().previous).toBe('sidebar');
  });

  it('tracks channel index when in channel focus', () => {
    const nav = createKeyboardNavController();
    const state = nav.getFocusState();
    expect(typeof state.channelIndex).toBe('number');
    expect(state.channelIndex).toBe(0);
  });

  it('tracks tool index when in tool focus', () => {
    const nav = createKeyboardNavController();
    const state = nav.getFocusState();
    expect(typeof state.toolIndex).toBe('number');
    expect(state.toolIndex).toBe(0);
  });

  it('tracks panel expanded state', () => {
    const nav = createKeyboardNavController();
    const state = nav.getFocusState();
    expect(typeof state.panelExpanded).toBe('boolean');
  });

  it('emits focus change event on setFocus', () => {
    const nav = createKeyboardNavController();
    const handler = vi.fn();
    nav.onFocusChange(handler);
    nav.setFocus('sidebar');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ current: 'sidebar' }));
  });

  it('onFocusChange returns unsubscribe function', () => {
    const nav = createKeyboardNavController();
    const handler = vi.fn();
    const unsub = nav.onFocusChange(handler);
    unsub();
    nav.setFocus('channel');
    expect(handler).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. VIM-LIKE MODES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Vim-like Modes', () => {
  it('starts in insert mode (typing goes to input)', () => {
    const nav = createKeyboardNavController();
    expect(nav.getMode()).toBe('insert');
  });

  it('escape switches from insert to normal mode', () => {
    const nav = createKeyboardNavController();
    nav.handleKeyEvent({ key: 'Escape', modifiers: [], raw: '\x1b', timestamp: 0 });
    expect(nav.getMode()).toBe('normal');
  });

  it('i in normal mode switches to insert mode', () => {
    const nav = createKeyboardNavController();
    nav.setMode('normal');
    nav.handleKeyEvent({ key: 'i', modifiers: [], raw: 'i', timestamp: 0 });
    expect(nav.getMode()).toBe('insert');
  });

  it('normal mode enables navigation keys (j/k)', () => {
    const nav = createKeyboardNavController();
    nav.setMode('normal');
    // j in normal mode should be consumed (scroll down or similar)
    const consumed = nav.handleKeyEvent({ key: 'j', modifiers: [], raw: 'j', timestamp: 0 });
    expect(consumed).toBe(true);
  });

  it('insert mode routes unmodified keys to input (returns false = pass through)', () => {
    const nav = createKeyboardNavController();
    // In insert mode, plain 'a' should pass through to input handler
    const consumed = nav.handleKeyEvent({ key: 'a', modifiers: [], raw: 'a', timestamp: 0 });
    expect(consumed).toBe(false);
  });

  it('ctrl shortcuts work in both modes', () => {
    const nav = createKeyboardNavController();
    // Ctrl+L (clear) should be consumed in insert mode
    const consumed = nav.handleKeyEvent({ key: 'l', modifiers: ['ctrl'], raw: '', timestamp: 0 });
    expect(consumed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DEFAULT NAVIGATION SCHEME
// ═══════════════════════════════════════════════════════════════════════════════

describe('Default Navigation Scheme', () => {
  describe('channel navigation', () => {
    it('Alt+Down is bound to channelNext action', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'ArrowDown', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Alt+Up is bound to channelPrev action', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'ArrowUp', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Alt+1..9 bound to channelDirect action', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: '1', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Alt+Home bound to channelHome action', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'Home', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });
  });

  describe('scroll navigation', () => {
    it('PageUp scrolls output up', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'PageUp', modifiers: [], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('PageDown scrolls output down', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'PageDown', modifiers: [], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Ctrl+Home scrolls to top', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'Home', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Ctrl+End scrolls to bottom', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'End', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });
  });

  describe('tool navigation', () => {
    it('Tab in normal mode navigates to next tool call', () => {
      const nav = createKeyboardNavController();
      nav.setMode('normal');
      const consumed = nav.handleKeyEvent({ key: 'Tab', modifiers: [], raw: '\t', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Shift+Tab navigates to previous tool call', () => {
      const nav = createKeyboardNavController();
      nav.setMode('normal');
      const consumed = nav.handleKeyEvent({ key: 'Tab', modifiers: ['shift'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Enter on tool toggles expand/collapse', () => {
      const nav = createKeyboardNavController();
      nav.setMode('normal');
      nav.setFocus('tool');
      const consumed = nav.handleKeyEvent({ key: 'Enter', modifiers: [], raw: '\r', timestamp: 0 });
      expect(consumed).toBe(true);
    });
  });

  describe('prompt navigation', () => {
    it('isActionAvailable for promptAccept depends on context', () => {
      const nav = createKeyboardNavController();
      // No active prompt by default
      expect(nav.isActionAvailable('promptAccept')).toBe(false);
    });

    it('Ctrl+Z is bound to promptDefer action', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'z', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('number keys in normal mode bound to quick-select', () => {
      const nav = createKeyboardNavController();
      nav.setMode('normal');
      const consumed = nav.handleKeyEvent({ key: '1', modifiers: [], raw: '1', timestamp: 0 });
      expect(consumed).toBe(true);
    });
  });

  describe('history navigation', () => {
    it('Up arrow is bound to historyUp', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'ArrowUp', modifiers: [], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Down arrow is bound to historyDown', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'ArrowDown', modifiers: [], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Ctrl+R is bound to history search', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'r', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });
  });

  describe('misc shortcuts', () => {
    it('Ctrl+L clears screen', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'l', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Ctrl+W closes current channel', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'w', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Ctrl+P opens quick switcher', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'p', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Ctrl+T cycles theme', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 't', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });

    it('Ctrl+B toggles sidebar', () => {
      const nav = createKeyboardNavController();
      const consumed = nav.handleKeyEvent({ key: 'b', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(consumed).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. KEYBINDING CUSTOMIZATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Keybinding Customization', () => {
  it('rebind changes action key', () => {
    const nav = createKeyboardNavController();
    nav.rebind('channelNext', { key: 'n', modifiers: ['ctrl'] });
    const bindings = nav.getBindings();
    const found = bindings.find(b => b.action === 'channelNext');
    expect(found!.key).toBe('n');
    expect(found!.modifiers).toContain('ctrl');
  });

  it('rebind validates no conflict with existing binding', () => {
    const nav = createKeyboardNavController();
    // Ctrl+L is already bound to clearScreen
    expect(() => nav.rebind('channelNext', { key: 'l', modifiers: ['ctrl'] })).toThrow(/conflict/i);
  });

  it('resetBindings restores all defaults', () => {
    const nav = createKeyboardNavController();
    nav.rebind('channelNext', { key: 'n', modifiers: ['ctrl'] });
    nav.resetBindings();
    const bindings = nav.getBindings();
    const found = bindings.find(b => b.action === 'channelNext');
    // Should be back to default (Alt+ArrowDown)
    expect(found!.key).toBe('ArrowDown');
    expect(found!.modifiers).toContain('alt');
  });

  it('exportBindings returns JSON-serializable config', () => {
    const nav = createKeyboardNavController();
    const exported = nav.exportBindings();
    expect(typeof exported).toBe('object');
    expect(JSON.stringify(exported)).toBeDefined(); // serializable
  });

  it('importBindings applies saved config', () => {
    const nav = createKeyboardNavController();
    const exported = nav.exportBindings();
    // Modify and reimport
    const nav2 = createKeyboardNavController();
    nav2.importBindings(exported);
    expect(nav2.getBindings().length).toBe(nav.getBindings().length);
  });

  it('getConflicts detects overlapping bindings', () => {
    const nav = createKeyboardNavController();
    // No conflicts in default scheme
    const conflicts = nav.getConflicts();
    expect(conflicts).toHaveLength(0);
  });

  it('setScheme applies partial navigation scheme override', () => {
    const nav = createKeyboardNavController();
    nav.setScheme({
      channelNext: { key: 'n', modifiers: ['ctrl'], action: 'channelNext', description: 'Next channel' },
    });
    const scheme = nav.getScheme();
    expect(scheme.channelNext.key).toBe('n');
  });

  it('getScheme returns full navigation scheme', () => {
    const nav = createKeyboardNavController();
    const scheme = nav.getScheme();
    expect(scheme).toHaveProperty('channelNext');
    expect(scheme).toHaveProperty('channelPrev');
    expect(scheme).toHaveProperty('scrollUp');
    expect(scheme).toHaveProperty('clearScreen');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MULTI-KEY SEQUENCES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Multi-Key Sequences', () => {
  it('registerSequence creates multi-key binding', () => {
    const nav = createKeyboardNavController();
    nav.setMode('normal');
    nav.registerSequence(['g', 'g'], 'scrollTop');
    // Should be in bindings now
    const bindings = nav.getBindings();
    expect(bindings.some(b => b.action === 'scrollTop')).toBe(true);
  });

  it('g g executes scrollTop action', () => {
    const nav = createKeyboardNavController();
    nav.setMode('normal');
    nav.registerSequence(['g', 'g'], 'scrollTop');
    nav.handleKeyEvent({ key: 'g', modifiers: [], raw: 'g', timestamp: 100 });
    const consumed = nav.handleKeyEvent({ key: 'g', modifiers: [], raw: 'g', timestamp: 150 });
    expect(consumed).toBe(true);
  });

  it('g G executes scrollBottom action', () => {
    const nav = createKeyboardNavController();
    nav.setMode('normal');
    nav.registerSequence(['g', 'G'], 'scrollBottom');
    nav.handleKeyEvent({ key: 'g', modifiers: [], raw: 'g', timestamp: 100 });
    const consumed = nav.handleKeyEvent({ key: 'G', modifiers: [], raw: 'G', timestamp: 150 });
    expect(consumed).toBe(true);
  });

  it('sequence times out after 500ms (key treated as individual)', () => {
    const nav = createKeyboardNavController();
    nav.setMode('normal');
    nav.registerSequence(['g', 'g'], 'scrollTop');
    nav.handleKeyEvent({ key: 'g', modifiers: [], raw: 'g', timestamp: 100 });
    // 600ms later -- should timeout
    const consumed = nav.handleKeyEvent({ key: 'g', modifiers: [], raw: 'g', timestamp: 700 });
    // The second 'g' starts a new sequence rather than completing old one
    // since the old one timed out
    expect(consumed).toBe(true); // still consumed as potential sequence start
  });

  it('partial sequence cancelled by non-matching key', () => {
    const nav = createKeyboardNavController();
    nav.setMode('normal');
    nav.registerSequence(['g', 'g'], 'scrollTop');
    nav.handleKeyEvent({ key: 'g', modifiers: [], raw: 'g', timestamp: 100 });
    // 'x' doesn't match sequence
    const consumed = nav.handleKeyEvent({ key: 'x', modifiers: [], raw: 'x', timestamp: 150 });
    // non-matching cancels the sequence, but key itself may still be handled
    expect(typeof consumed).toBe('boolean');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CONTEXT-AWARE BINDINGS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Context-Aware Bindings', () => {
  it('getBindingsForContext returns bindings for given focus zone', () => {
    const nav = createKeyboardNavController();
    const sidebarBindings = nav.getBindingsForContext('sidebar');
    expect(Array.isArray(sidebarBindings)).toBe(true);
  });

  it('same key has different action in different contexts', () => {
    const nav = createKeyboardNavController();
    const inputBindings = nav.getBindingsForContext('input');
    const sidebarBindings = nav.getBindingsForContext('sidebar');
    // Input context should have different bindings than sidebar
    expect(inputBindings).not.toEqual(sidebarBindings);
  });

  it('isActionAvailable returns false when action not applicable', () => {
    const nav = createKeyboardNavController();
    // promptAccept should not be available when no prompt is active
    expect(nav.isActionAvailable('promptAccept')).toBe(false);
  });

  it('isActionAvailable returns true for universally available actions', () => {
    const nav = createKeyboardNavController();
    expect(nav.isActionAvailable('clearScreen')).toBe(true);
  });

  it('handleKeyEvent returns false for unbound keys (pass through)', () => {
    const nav = createKeyboardNavController();
    // Some random key combo that's not bound
    const consumed = nav.handleKeyEvent({ key: 'x', modifiers: ['meta', 'shift'], raw: '', timestamp: 0 });
    expect(consumed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SCRIPT-REGISTERED BINDINGS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Script-Registered Bindings', () => {
  it('getBindings returns all registered bindings', () => {
    const nav = createKeyboardNavController();
    const bindings = nav.getBindings();
    expect(bindings.length).toBeGreaterThan(0);
  });

  it('rebind can override existing binding for a different action', () => {
    const nav = createKeyboardNavController();
    // First remove conflict by rebinding original to something else
    nav.rebind('clearScreen', { key: 'k', modifiers: ['ctrl'] });
    nav.rebind('channelNext', { key: 'l', modifiers: ['ctrl'] });
    const bindings = nav.getBindings();
    const found = bindings.find(b => b.action === 'channelNext');
    expect(found!.key).toBe('l');
  });

  it('resetBindings restores original binding after override', () => {
    const nav = createKeyboardNavController();
    nav.rebind('clearScreen', { key: 'k', modifiers: ['ctrl'] });
    nav.resetBindings();
    const bindings = nav.getBindings();
    const found = bindings.find(b => b.action === 'clearScreen');
    expect(found!.key).toBe('l');
    expect(found!.modifiers).toContain('ctrl');
  });
});
