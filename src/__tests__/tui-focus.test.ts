import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FocusManager, FocusChangeEvent, FocusableRegion } from '../tui/FocusManager.js';

describe('FocusManager', () => {
  let fm: FocusManager;

  beforeEach(() => {
    fm = new FocusManager();
  });

  describe('Initial State', () => {
    it('starts with focus on input by default', () => {
      expect(fm.getFocus()).toBe('input');
    });

    it('starts with custom initial focus when specified', () => {
      const fm2 = new FocusManager({ initialFocus: 'sidebar' });
      expect(fm2.getFocus()).toBe('sidebar');
    });

    it('uses default regions when none specified', () => {
      expect(fm.getTabOrder()).toEqual(['input', 'sidebar', 'main']);
    });

    it('uses custom regions when specified', () => {
      const fm2 = new FocusManager({ regions: ['input', 'sidebar', 'main', 'status'] });
      expect(fm2.getTabOrder()).toEqual(['input', 'sidebar', 'main', 'status']);
    });

    it('all default regions are visible initially', () => {
      expect(fm.isRegionVisible('input')).toBe(true);
      expect(fm.isRegionVisible('sidebar')).toBe(true);
      expect(fm.isRegionVisible('main')).toBe(true);
    });

    it('is not locked initially', () => {
      expect(fm.isLocked()).toBe(false);
      expect(fm.getLockedRegion()).toBeNull();
    });
  });

  describe('Tab Cycling', () => {
    it('Tab moves input -> sidebar -> main -> input', () => {
      expect(fm.getFocus()).toBe('input');
      fm.focusNext();
      expect(fm.getFocus()).toBe('sidebar');
      fm.focusNext();
      expect(fm.getFocus()).toBe('main');
      fm.focusNext();
      expect(fm.getFocus()).toBe('input');
    });

    it('wraps around from last to first', () => {
      fm.setFocus('main');
      fm.focusNext();
      expect(fm.getFocus()).toBe('input');
    });

    it('cycles through all visible regions continuously', () => {
      for (let i = 0; i < 9; i++) {
        fm.focusNext();
      }
      // 9 % 3 = 0 -> back to input
      expect(fm.getFocus()).toBe('input');
    });
  });

  describe('Shift+Tab (focusPrev)', () => {
    it('moves in reverse order: input -> main -> sidebar -> input', () => {
      expect(fm.getFocus()).toBe('input');
      fm.focusPrev();
      expect(fm.getFocus()).toBe('main');
      fm.focusPrev();
      expect(fm.getFocus()).toBe('sidebar');
      fm.focusPrev();
      expect(fm.getFocus()).toBe('input');
    });

    it('wraps around from first to last', () => {
      expect(fm.getFocus()).toBe('input');
      fm.focusPrev();
      expect(fm.getFocus()).toBe('main');
    });
  });

  describe('Escape (focusInput)', () => {
    it('returns focus to input from sidebar', () => {
      fm.setFocus('sidebar');
      fm.focusInput();
      expect(fm.getFocus()).toBe('input');
    });

    it('returns focus to input from main', () => {
      fm.setFocus('main');
      fm.focusInput();
      expect(fm.getFocus()).toBe('input');
    });

    it('is a no-op when already on input', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.focusInput();
      expect(fm.getFocus()).toBe('input');
      expect(handler).not.toHaveBeenCalled();
    });

    it('fires event with reason escape', () => {
      fm.setFocus('sidebar');
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.focusInput();
      expect(handler).toHaveBeenCalledWith({
        from: 'sidebar',
        to: 'input',
        reason: 'escape',
      });
    });

    it('does nothing when focus is locked', () => {
      fm.lockFocus('palette');
      fm.focusInput();
      expect(fm.getFocus()).toBe('palette');
    });
  });

  describe('Region Visibility', () => {
    it('hidden regions are skipped in tab order', () => {
      fm.setRegionVisible('sidebar', false);
      expect(fm.getFocus()).toBe('input');
      fm.focusNext();
      expect(fm.getFocus()).toBe('main');
      fm.focusNext();
      expect(fm.getFocus()).toBe('input');
    });

    it('getVisibleRegions returns only visible ones', () => {
      fm.setRegionVisible('main', false);
      expect(fm.getVisibleRegions()).toEqual(['input', 'sidebar']);
    });

    it('getTabOrder reflects visibility changes', () => {
      fm.setRegionVisible('sidebar', false);
      expect(fm.getTabOrder()).toEqual(['input', 'main']);
    });

    it('making a region visible again adds it back to tab order', () => {
      fm.setRegionVisible('sidebar', false);
      fm.setRegionVisible('sidebar', true);
      expect(fm.getTabOrder()).toEqual(['input', 'sidebar', 'main']);
    });

    it('non-configured regions report as not visible', () => {
      expect(fm.isRegionVisible('palette')).toBe(false);
    });
  });

  describe('Focus Lock', () => {
    it('locking focus moves focus to locked region', () => {
      const fm2 = new FocusManager({ regions: ['input', 'sidebar', 'main', 'palette'] });
      fm2.lockFocus('palette');
      expect(fm2.getFocus()).toBe('palette');
    });

    it('focusNext is a no-op when locked', () => {
      fm.lockFocus('sidebar');
      fm.focusNext();
      expect(fm.getFocus()).toBe('sidebar');
    });

    it('focusPrev is a no-op when locked', () => {
      fm.lockFocus('sidebar');
      fm.focusPrev();
      expect(fm.getFocus()).toBe('sidebar');
    });

    it('setFocus to different region is blocked when locked', () => {
      fm.lockFocus('sidebar');
      fm.setFocus('main');
      expect(fm.getFocus()).toBe('sidebar');
    });

    it('setFocus to locked region is allowed', () => {
      fm.lockFocus('sidebar');
      // Already there, no-op but no error
      fm.setFocus('sidebar');
      expect(fm.getFocus()).toBe('sidebar');
    });

    it('unlockFocus releases the lock', () => {
      fm.lockFocus('sidebar');
      fm.unlockFocus();
      expect(fm.isLocked()).toBe(false);
      expect(fm.getLockedRegion()).toBeNull();
    });

    it('after unlock, tab cycling works again', () => {
      fm.lockFocus('sidebar');
      fm.unlockFocus();
      fm.focusNext();
      expect(fm.getFocus()).toBe('main');
    });

    it('isLocked returns true when locked', () => {
      fm.lockFocus('main');
      expect(fm.isLocked()).toBe(true);
    });

    it('getLockedRegion returns the locked region', () => {
      fm.lockFocus('main');
      expect(fm.getLockedRegion()).toBe('main');
    });

    it('fires focus:lock event', () => {
      const handler = vi.fn();
      fm.on('focus:lock', handler);
      fm.lockFocus('sidebar');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires focus:unlock event', () => {
      const handler = vi.fn();
      fm.on('focus:unlock', handler);
      fm.lockFocus('sidebar');
      fm.unlockFocus();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Events', () => {
    it('focus:change fires with correct from/to/reason on focusNext', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.focusNext();
      expect(handler).toHaveBeenCalledWith({
        from: 'input',
        to: 'sidebar',
        reason: 'tab',
      });
    });

    it('focus:change fires with correct from/to/reason on focusPrev', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.focusPrev();
      expect(handler).toHaveBeenCalledWith({
        from: 'input',
        to: 'main',
        reason: 'shift-tab',
      });
    });

    it('focus:change fires with reason programmatic on setFocus', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.setFocus('main');
      expect(handler).toHaveBeenCalledWith({
        from: 'input',
        to: 'main',
        reason: 'programmatic',
      });
    });

    it('focus:change does not fire when setting same focus', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.setFocus('input');
      expect(handler).not.toHaveBeenCalled();
    });

    it('off removes a listener', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.off('focus:change', handler);
      fm.focusNext();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('setFocus', () => {
    it('programmatic focus change works', () => {
      fm.setFocus('main');
      expect(fm.getFocus()).toBe('main');
    });

    it('fires event with the specified reason', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.setFocus('sidebar', 'click');
      expect(handler).toHaveBeenCalledWith({
        from: 'input',
        to: 'sidebar',
        reason: 'click',
      });
    });

    it('throws when setting focus to invisible region', () => {
      fm.setRegionVisible('sidebar', false);
      expect(() => fm.setFocus('sidebar')).toThrow('Cannot focus invisible region: sidebar');
    });
  });

  describe('hasFocus / isFocused', () => {
    it('hasFocus returns true for current focus', () => {
      expect(fm.hasFocus('input')).toBe(true);
    });

    it('hasFocus returns false for non-focused region', () => {
      expect(fm.hasFocus('sidebar')).toBe(false);
    });

    it('isFocused returns true for current focus', () => {
      expect(fm.isFocused('input')).toBe(true);
    });

    it('isFocused returns false for non-focused region', () => {
      expect(fm.isFocused('main')).toBe(false);
    });

    it('updates after focus change', () => {
      fm.focusNext();
      expect(fm.hasFocus('input')).toBe(false);
      expect(fm.hasFocus('sidebar')).toBe(true);
    });
  });

  describe('getTabOrder', () => {
    it('returns only visible regions in configured order', () => {
      fm.setRegionVisible('sidebar', false);
      expect(fm.getTabOrder()).toEqual(['input', 'main']);
    });

    it('preserves configured order', () => {
      const fm2 = new FocusManager({ regions: ['main', 'input', 'sidebar'] });
      expect(fm2.getTabOrder()).toEqual(['main', 'input', 'sidebar']);
    });

    it('returns empty array when all regions hidden', () => {
      fm.setRegionVisible('input', false);
      fm.setRegionVisible('sidebar', false);
      fm.setRegionVisible('main', false);
      expect(fm.getTabOrder()).toEqual([]);
    });
  });

  describe('getFocusIndicator', () => {
    it('returns indicator character for focused region', () => {
      expect(fm.getFocusIndicator('input')).toBe('▸');
    });

    it('returns empty string for blurred region', () => {
      expect(fm.getFocusIndicator('sidebar')).toBe('');
      expect(fm.getFocusIndicator('main')).toBe('');
    });

    it('updates when focus changes', () => {
      fm.focusNext();
      expect(fm.getFocusIndicator('input')).toBe('');
      expect(fm.getFocusIndicator('sidebar')).toBe('▸');
    });
  });

  describe('getKeyTarget', () => {
    it('returns current focus when not locked', () => {
      expect(fm.getKeyTarget()).toBe('input');
      fm.focusNext();
      expect(fm.getKeyTarget()).toBe('sidebar');
    });

    it('returns locked region when locked', () => {
      fm.lockFocus('main');
      expect(fm.getKeyTarget()).toBe('main');
    });

    it('returns current focus after unlock', () => {
      fm.lockFocus('main');
      fm.unlockFocus();
      expect(fm.getKeyTarget()).toBe('main'); // focus stayed on main after lock moved it there
      fm.focusNext();
      expect(fm.getKeyTarget()).toBe('input');
    });
  });

  describe('Edge Cases', () => {
    it('single visible region — Tab is a no-op', () => {
      fm.setRegionVisible('sidebar', false);
      fm.setRegionVisible('main', false);
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.focusNext();
      expect(fm.getFocus()).toBe('input');
      expect(handler).not.toHaveBeenCalled();
    });

    it('single visible region — Shift+Tab is a no-op', () => {
      fm.setRegionVisible('sidebar', false);
      fm.setRegionVisible('main', false);
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.focusPrev();
      expect(fm.getFocus()).toBe('input');
      expect(handler).not.toHaveBeenCalled();
    });

    it('focus set to invisible region throws', () => {
      fm.setRegionVisible('sidebar', false);
      expect(() => fm.setFocus('sidebar')).toThrow();
    });

    it('region not in configured list is not visible', () => {
      expect(fm.isRegionVisible('status')).toBe(false);
    });

    it('locking to a region fires focus:change if not already there', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.lockFocus('sidebar');
      expect(handler).toHaveBeenCalledWith({
        from: 'input',
        to: 'sidebar',
        reason: 'programmatic',
      });
    });

    it('locking to current region does not fire focus:change', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.lockFocus('input');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Listeners', () => {
    it('all handlers fire on focus change', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      fm.on('focus:change', handler1);
      fm.on('focus:change', handler2);
      fm.on('focus:change', handler3);
      fm.focusNext();
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('removing one listener does not affect others', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      fm.on('focus:change', handler1);
      fm.on('focus:change', handler2);
      fm.off('focus:change', handler1);
      fm.focusNext();
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('handlers receive the same event object', () => {
      const events: FocusChangeEvent[] = [];
      fm.on('focus:change', (e: FocusChangeEvent) => events.push(e));
      fm.on('focus:change', (e: FocusChangeEvent) => events.push(e));
      fm.focusNext();
      expect(events[0]).toEqual(events[1]);
    });
  });

  describe('Click reason', () => {
    it('setFocus with click reason emits correctly', () => {
      const handler = vi.fn();
      fm.on('focus:change', handler);
      fm.setFocus('sidebar', 'click');
      expect(handler).toHaveBeenCalledWith({
        from: 'input',
        to: 'sidebar',
        reason: 'click',
      });
    });

    it('click reason is preserved in event', () => {
      let captured: FocusChangeEvent | null = null;
      fm.on('focus:change', (e: FocusChangeEvent) => { captured = e; });
      fm.setFocus('main', 'click');
      expect(captured).not.toBeNull();
      expect(captured!.reason).toBe('click');
      expect(captured!.from).toBe('input');
      expect(captured!.to).toBe('main');
    });
  });

  describe('Full region set', () => {
    let fullFm: FocusManager;

    beforeEach(() => {
      fullFm = new FocusManager({
        regions: ['input', 'sidebar', 'main', 'status', 'palette', 'menu'],
        initialFocus: 'input',
      });
    });

    it('tabs through all six regions', () => {
      const visited: FocusableRegion[] = ['input'];
      for (let i = 0; i < 6; i++) {
        fullFm.focusNext();
        visited.push(fullFm.getFocus());
      }
      expect(visited).toEqual(['input', 'sidebar', 'main', 'status', 'palette', 'menu', 'input']);
    });

    it('hiding palette and menu gives 4-region tab order', () => {
      fullFm.setRegionVisible('palette', false);
      fullFm.setRegionVisible('menu', false);
      expect(fullFm.getTabOrder()).toEqual(['input', 'sidebar', 'main', 'status']);
    });

    it('lock to palette simulates command palette open', () => {
      fullFm.lockFocus('palette');
      expect(fullFm.getKeyTarget()).toBe('palette');
      fullFm.focusNext();
      expect(fullFm.getFocus()).toBe('palette');
      fullFm.unlockFocus();
      fullFm.focusNext();
      expect(fullFm.getFocus()).toBe('menu');
    });
  });
});
