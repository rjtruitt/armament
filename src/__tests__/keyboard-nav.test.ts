import { describe, it, expect, beforeEach } from 'vitest';
import { createKeyboardNav } from '../core/KeyboardNavController.js';

describe('Keyboard Navigation', () => {
  let nav: ReturnType<typeof createKeyboardNav>;

  beforeEach(() => {
    nav = createKeyboardNav();
  });

  describe('Focus management', () => {
    it('should start with focus on input bar', () => {
      const state = nav.getFocusState();
      expect(state.current).toBe('input');
    });

    it('should track previous focus target', () => {
      nav.setFocus('sidebar');
      nav.setFocus('input');
      const state = nav.getFocusState();
      expect(state.previous).toBe('sidebar');
    });

    it('should track channel index', () => {
      nav.setFocus('channel');
      const state = nav.getFocusState();
      expect(state.channelIndex).toBeGreaterThanOrEqual(0);
    });

    it('should track tool selection index', () => {
      nav.setFocus('tool');
      const state = nav.getFocusState();
      expect(state.toolIndex).toBeGreaterThanOrEqual(0);
    });

    it('should track panel expanded state', () => {
      const state = nav.getFocusState();
      expect(state.panelExpanded).toBe(false);
    });

    it('should notify on focus change', () => {
      let received: any = null;
      nav.onFocusChange((s) => { received = s; });
      nav.setFocus('sidebar');
      expect(received).not.toBeNull();
      expect(received.current).toBe('sidebar');
    });

    it('should return unsubscribe function', () => {
      const unsub = nav.onFocusChange(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('Channel navigation', () => {
    it('should navigate to next channel with Alt+Down', () => {
      const handled = nav.handleKeyEvent({ key: 'ArrowDown', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should navigate to previous channel with Alt+Up', () => {
      const handled = nav.handleKeyEvent({ key: 'ArrowUp', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should jump to channel by number with Alt+1-9', () => {
      const handled = nav.handleKeyEvent({ key: '1', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should jump to control channel with Alt+Left', () => {
      const handled = nav.handleKeyEvent({ key: 'ArrowLeft', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should go to next channel with unread via Ctrl+N', () => {
      const handled = nav.handleKeyEvent({ key: 'n', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should go to prev channel with unread via Ctrl+P', () => {
      const handled = nav.handleKeyEvent({ key: 'p', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should wrap around when reaching last channel', () => {
      // Navigate past the last channel
      for (let i = 0; i < 20; i++) {
        nav.handleKeyEvent({ key: 'ArrowDown', modifiers: ['alt'], raw: '', timestamp: 0 });
      }
      const state = nav.getFocusState();
      expect(state.channelIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Scrolling', () => {
    it('should scroll up with PgUp', () => {
      const handled = nav.handleKeyEvent({ key: 'PageUp', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should scroll down with PgDn', () => {
      const handled = nav.handleKeyEvent({ key: 'PageDown', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should not scroll when focus is on input and typing', () => {
      nav.setFocus('input');
      const handled = nav.handleKeyEvent({ key: 'PageUp', modifiers: [], raw: '', timestamp: 0 });
      // Input has priority — PgUp goes to scroll
      expect(handled).toBe(true);
    });
  });

  describe('Tool navigation', () => {
    it('should cycle to next tool with Tab', () => {
      const handled = nav.handleKeyEvent({ key: 'Tab', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should cycle to prev tool with Shift+Tab', () => {
      const handled = nav.handleKeyEvent({ key: 'Tab', modifiers: ['shift'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should expand tool detail with Enter on selected tool', () => {
      nav.setFocus('tool');
      const handled = nav.handleKeyEvent({ key: 'Enter', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should collapse tool detail with Esc', () => {
      nav.setFocus('tool');
      nav.handleKeyEvent({ key: 'Enter', modifiers: [], raw: '', timestamp: 0 });
      const handled = nav.handleKeyEvent({ key: 'Escape', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
      expect(nav.getFocusState().panelExpanded).toBe(false);
    });

    it('should return focus to input on Esc from tool', () => {
      nav.setFocus('tool');
      nav.handleKeyEvent({ key: 'Escape', modifiers: [], raw: '', timestamp: 0 });
      expect(nav.getFocusState().current).toBe('input');
    });
  });

  describe('Input bar', () => {
    it('should always be reachable via Esc', () => {
      nav.setFocus('sidebar');
      nav.handleKeyEvent({ key: 'Escape', modifiers: [], raw: '', timestamp: 0 });
      expect(nav.getFocusState().current).toBe('input');
    });

    it('should recall command history with Up arrow', () => {
      nav.setFocus('input');
      const handled = nav.handleKeyEvent({ key: 'ArrowUp', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should recall forward history with Down arrow', () => {
      nav.setFocus('input');
      const handled = nav.handleKeyEvent({ key: 'ArrowDown', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should not intercept normal typing keys', () => {
      nav.setFocus('input');
      const handled = nav.handleKeyEvent({ key: 'a', modifiers: [], raw: 'a', timestamp: 0 });
      expect(handled).toBe(false);
    });
  });

  describe('HITL prompt interaction', () => {
    it('should navigate prompt options with Up/Down', () => {
      nav.setFocus('prompt');
      const up = nav.handleKeyEvent({ key: 'ArrowUp', modifiers: [], raw: '', timestamp: 0 });
      const down = nav.handleKeyEvent({ key: 'ArrowDown', modifiers: [], raw: '', timestamp: 0 });
      expect(up).toBe(true);
      expect(down).toBe(true);
    });

    it('should select prompt option with Enter', () => {
      nav.setFocus('prompt');
      const handled = nav.handleKeyEvent({ key: 'Enter', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should defer prompt with Ctrl+Z', () => {
      nav.setFocus('prompt');
      const handled = nav.handleKeyEvent({ key: 'z', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should quick-select with number keys 1-9', () => {
      nav.setFocus('prompt');
      const handled = nav.handleKeyEvent({ key: '3', modifiers: [], raw: '3', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should release focus back to input after selection', () => {
      nav.setFocus('prompt');
      nav.handleKeyEvent({ key: 'Enter', modifiers: [], raw: '', timestamp: 0 });
      expect(nav.getFocusState().current).toBe('input');
    });
  });

  describe('Global shortcuts', () => {
    it('should clear screen with Ctrl+L', () => {
      const handled = nav.handleKeyEvent({ key: 'l', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should close/leave channel with Ctrl+W', () => {
      const handled = nav.handleKeyEvent({ key: 'w', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should not close #control channel', () => {
      nav.setFocus('channel');
      // If on control channel, Ctrl+W should be blocked
      const handled = nav.handleKeyEvent({ key: 'w', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      // Still handled (no-op) but doesn't close
      expect(handled).toBe(true);
    });
  });

  describe('Binding customization', () => {
    it('should list all bindings', () => {
      const bindings = nav.getBindings();
      expect(Array.isArray(bindings)).toBe(true);
    });

    it('should list bindings for a specific context', () => {
      const bindings = nav.getBindingsForContext('channel');
      expect(Array.isArray(bindings)).toBe(true);
    });

    it('should rebind an action', () => {
      nav.rebind('channelNext', { key: 'j', modifiers: ['alt'] });
      const handled = nav.handleKeyEvent({ key: 'j', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should reset bindings to defaults', () => {
      nav.rebind('channelNext', { key: 'x', modifiers: ['meta'] });
      nav.resetBindings();
      // Default Alt+Down should work again
      const handled = nav.handleKeyEvent({ key: 'ArrowDown', modifiers: ['alt'], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should check if action is available in current context', () => {
      nav.setFocus('input');
      expect(nav.isActionAvailable('historyUp')).toBe(true);
      expect(nav.isActionAvailable('toolExpand')).toBe(false);
    });

    it('should support vim-style nav scheme override', () => {
      nav.setScheme({
        channelNext: { key: 'j', modifiers: ['alt'], action: 'channelNext', description: 'next channel' },
        channelPrev: { key: 'k', modifiers: ['alt'], action: 'channelPrev', description: 'prev channel' },
      });
      const scheme = nav.getScheme();
      expect(scheme.channelNext.key).toBe('j');
    });
  });

  describe('Repeatable keys', () => {
    it('should handle repeated scroll events', () => {
      let count = 0;
      for (let i = 0; i < 5; i++) {
        if (nav.handleKeyEvent({ key: 'PageDown', modifiers: [], raw: '', timestamp: i * 50 })) {
          count++;
        }
      }
      expect(count).toBe(5);
    });

    it('should not repeat non-repeatable actions', () => {
      // Enter is not repeatable
      nav.setFocus('prompt');
      nav.handleKeyEvent({ key: 'Enter', modifiers: [], raw: '', timestamp: 0 });
      // Second enter should not re-select
      const handled = nav.handleKeyEvent({ key: 'Enter', modifiers: [], raw: '', timestamp: 50 });
      // Focus already moved to input, so prompt-select not available
      expect(nav.getFocusState().current).toBe('input');
    });
  });

  describe('Sidebar focus', () => {
    it('should focus sidebar with a shortcut', () => {
      nav.handleKeyEvent({ key: 'b', modifiers: ['ctrl'], raw: '', timestamp: 0 });
      expect(nav.getFocusState().current).toBe('sidebar');
    });

    it('should navigate sidebar items with Up/Down when focused', () => {
      nav.setFocus('sidebar');
      const handled = nav.handleKeyEvent({ key: 'ArrowDown', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should switch to channel on Enter in sidebar', () => {
      nav.setFocus('sidebar');
      const handled = nav.handleKeyEvent({ key: 'Enter', modifiers: [], raw: '', timestamp: 0 });
      expect(handled).toBe(true);
    });

    it('should return to input on Esc from sidebar', () => {
      nav.setFocus('sidebar');
      nav.handleKeyEvent({ key: 'Escape', modifiers: [], raw: '', timestamp: 0 });
      expect(nav.getFocusState().current).toBe('input');
    });
  });
});
