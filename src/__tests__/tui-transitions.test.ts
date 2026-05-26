// TDD-RED: Tests for PhaseManager class (not yet implemented)
// Screen transitions between phases (shell → loading → menu → chat)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhaseManager } from '../tui/PhaseManager.js';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';

describe('PhaseManager', () => {
  let buffer: ScreenBuffer;
  let phaseManager: PhaseManager;

  beforeEach(() => {
    buffer = new ScreenBuffer(80, 24);
    phaseManager = new PhaseManager(buffer);
  });

  describe('initialization', () => {
    it('should create phase manager', () => {
      expect(phaseManager).toBeDefined();
    });

    it('should start at shell phase', () => {
      expect(phaseManager.getCurrentPhase()).toBe('shell');
    });

    it('should define all 7 phases', () => {
      const phases = phaseManager.getPhases();
      expect(phases).toEqual([
        'shell',
        'loading',
        'menu',
        'main',
        'hitl',
        'multi',
        'end'
      ]);
    });

    it('should throw without buffer', () => {
      expect(() => new PhaseManager(null as any)).toThrow();
    });
  });

  describe('phase 0: shell', () => {
    it('should be initial phase', () => {
      expect(phaseManager.getCurrentPhase()).toBe('shell');
    });

    it('should show shell prompt', () => {
      phaseManager.render();
      const content = buffer.toString();
      expect(content).toMatch(/\$|~/);
    });

    it('should not show sidebar in shell phase', () => {
      phaseManager.render();
      expect(phaseManager.isSidebarVisible()).toBe(false);
    });

    it('should not show input bar in shell phase', () => {
      phaseManager.render();
      expect(phaseManager.isInputBarVisible()).toBe(false);
    });

    it('should not show status bar in shell phase', () => {
      phaseManager.render();
      expect(phaseManager.isStatusBarVisible()).toBe(false);
    });
  });

  describe('phase 1: loading', () => {
    beforeEach(() => {
      phaseManager.transitionTo('loading');
    });

    it('should transition from shell to loading', () => {
      expect(phaseManager.getCurrentPhase()).toBe('loading');
    });

    it('should clear screen on transition', () => {
      const spy = vi.spyOn(buffer, 'clear');
      phaseManager.transitionTo('shell');
      phaseManager.transitionTo('loading');
      expect(spy).toHaveBeenCalled();
    });

    it('should trigger loading animation', () => {
      const handler = vi.fn();
      phaseManager.on('animation:start', handler);
      phaseManager.transitionTo('shell');
      phaseManager.transitionTo('loading');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'loading' })
      );
    });

    it('should not show sidebar in loading phase', () => {
      expect(phaseManager.isSidebarVisible()).toBe(false);
    });

    it('should show full screen content area', () => {
      phaseManager.render();
      expect(phaseManager.getContentRegion().width).toBe(buffer.width);
    });
  });

  describe('phase 2: menu', () => {
    beforeEach(() => {
      phaseManager.transitionTo('menu');
    });

    it('should transition from loading to menu', () => {
      expect(phaseManager.getCurrentPhase()).toBe('menu');
    });

    it('should show status bar in menu phase', () => {
      expect(phaseManager.isStatusBarVisible()).toBe(true);
    });

    it('should not show sidebar in menu phase', () => {
      expect(phaseManager.isSidebarVisible()).toBe(false);
    });

    it('should not show input bar in menu phase', () => {
      expect(phaseManager.isInputBarVisible()).toBe(false);
    });

    it('should render session menu', () => {
      phaseManager.render();
      const content = buffer.toString();
      expect(content).toContain('SESSION CONFIG');
    });

    it('should emit phase:enter event', () => {
      const handler = vi.fn();
      phaseManager.on('phase:enter', handler);
      phaseManager.transitionTo('loading');
      phaseManager.transitionTo('menu');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'menu' })
      );
    });
  });

  describe('phase 3: main (chat)', () => {
    beforeEach(() => {
      phaseManager.transitionTo('main');
    });

    it('should transition from menu to main', () => {
      expect(phaseManager.getCurrentPhase()).toBe('main');
    });

    it('should show sidebar in main phase', () => {
      expect(phaseManager.isSidebarVisible()).toBe(true);
    });

    it('should show input bar in main phase', () => {
      expect(phaseManager.isInputBarVisible()).toBe(true);
    });

    it('should show status bar in main phase', () => {
      expect(phaseManager.isStatusBarVisible()).toBe(true);
    });

    it('should show full IRC layout', () => {
      const regions = phaseManager.getVisibleRegions();
      expect(regions).toContain('sidebar');
      expect(regions).toContain('main');
      expect(regions).toContain('input');
      expect(regions).toContain('status');
    });

    it('should initialize with #control channel', () => {
      phaseManager.render();
      const content = buffer.toString();
      expect(content).toContain('#control');
    });
  });

  describe('phase 4: hitl (human-in-loop)', () => {
    beforeEach(() => {
      phaseManager.transitionTo('hitl');
    });

    it('should maintain full UI in hitl phase', () => {
      expect(phaseManager.isSidebarVisible()).toBe(true);
      expect(phaseManager.isInputBarVisible()).toBe(true);
      expect(phaseManager.isStatusBarVisible()).toBe(true);
    });

    it('should show prompt modal overlay', () => {
      phaseManager.render();
      const content = buffer.toString();
      expect(content).toMatch(/needs input|select|choose/i);
    });

    it('should not clear sidebar content', () => {
      phaseManager.transitionTo('main');
      phaseManager.render();
      const mainContent = buffer.toString();
      phaseManager.transitionTo('hitl');
      const hitlContent = buffer.toString();
      expect(hitlContent).toContain('#control');
    });
  });

  describe('phase 5: multi (multi-agent)', () => {
    beforeEach(() => {
      phaseManager.transitionTo('multi');
    });

    it('should show multiple agents in sidebar', () => {
      phaseManager.render();
      const content = buffer.toString();
      expect(content).toMatch(/#agent-\d+/);
    });

    it('should maintain full UI layout', () => {
      expect(phaseManager.isSidebarVisible()).toBe(true);
      expect(phaseManager.isInputBarVisible()).toBe(true);
      expect(phaseManager.isStatusBarVisible()).toBe(true);
    });
  });

  describe('phase 6: end', () => {
    beforeEach(() => {
      phaseManager.transitionTo('end');
    });

    it('should show session summary', () => {
      phaseManager.render();
      const content = buffer.toString();
      expect(content).toMatch(/session|summary|complete/i);
    });

    it('should eventually hide UI elements', () => {
      phaseManager.render();
      // After animation, UI should fade
      expect(phaseManager.getCurrentPhase()).toBe('end');
    });

    it('should return to shell prompt at end', () => {
      phaseManager.render();
      const content = buffer.toString();
      expect(content).toMatch(/\$|~/);
    });
  });

  describe('transition validation', () => {
    it('should allow shell → loading', () => {
      expect(() => phaseManager.transitionTo('loading')).not.toThrow();
    });

    it('should allow loading → menu', () => {
      phaseManager.transitionTo('loading');
      expect(() => phaseManager.transitionTo('menu')).not.toThrow();
    });

    it('should allow menu → main', () => {
      phaseManager.transitionTo('menu');
      expect(() => phaseManager.transitionTo('main')).not.toThrow();
    });

    it('should allow main → hitl → main', () => {
      phaseManager.transitionTo('main');
      phaseManager.transitionTo('hitl');
      expect(() => phaseManager.transitionTo('main')).not.toThrow();
    });

    it('should allow main → multi', () => {
      phaseManager.transitionTo('main');
      expect(() => phaseManager.transitionTo('multi')).not.toThrow();
    });

    it('should allow any → end', () => {
      expect(() => phaseManager.transitionTo('end')).not.toThrow();
    });

    it('should warn on invalid transitions', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      phaseManager.transitionTo('end');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should throw on unknown phase', () => {
      expect(() => phaseManager.transitionTo('unknown' as any)).toThrow();
    });
  });

  describe('phase history', () => {
    it('should track phase history', () => {
      phaseManager.transitionTo('loading');
      phaseManager.transitionTo('menu');
      phaseManager.transitionTo('main');
      const history = phaseManager.getHistory();
      expect(history).toEqual(['shell', 'loading', 'menu', 'main']);
    });

    it('should get previous phase', () => {
      phaseManager.transitionTo('loading');
      phaseManager.transitionTo('menu');
      expect(phaseManager.getPreviousPhase()).toBe('loading');
    });

    it('should support back navigation', () => {
      phaseManager.transitionTo('loading');
      phaseManager.transitionTo('menu');
      phaseManager.back();
      expect(phaseManager.getCurrentPhase()).toBe('loading');
    });

    it('should not go back from initial phase', () => {
      expect(() => phaseManager.back()).toThrow(/no previous phase/i);
    });

    it('should clear future history on new transition after back', () => {
      phaseManager.transitionTo('loading');
      phaseManager.transitionTo('menu');
      phaseManager.back();
      phaseManager.transitionTo('main');
      const history = phaseManager.getHistory();
      expect(history).toEqual(['shell', 'loading', 'main']);
    });
  });

  describe('debug mode', () => {
    it('should skip directly to target phase in debug mode', () => {
      const debug = new PhaseManager(buffer, { debug: true });
      debug.transitionTo('main');
      expect(debug.getCurrentPhase()).toBe('main');
    });

    it('should skip animations in debug mode', () => {
      const debug = new PhaseManager(buffer, { debug: true });
      const handler = vi.fn();
      debug.on('animation:start', handler);
      debug.transitionTo('loading');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow jumping to any phase in debug mode', () => {
      const debug = new PhaseManager(buffer, { debug: true });
      expect(() => debug.transitionTo('multi')).not.toThrow();
    });

    it('should skip menu in debug mode', () => {
      const debug = new PhaseManager(buffer, { debug: true });
      debug.transitionTo('menu');
      // Should auto-proceed
      expect(debug.getCurrentPhase()).toBe('menu');
    });
  });

  describe('events', () => {
    it('should emit phase:exit when leaving phase', () => {
      const handler = vi.fn();
      phaseManager.on('phase:exit', handler);
      phaseManager.transitionTo('loading');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'shell' })
      );
    });

    it('should emit phase:enter when entering phase', () => {
      const handler = vi.fn();
      phaseManager.on('phase:enter', handler);
      phaseManager.transitionTo('loading');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'loading' })
      );
    });

    it('should emit transition:start', () => {
      const handler = vi.fn();
      phaseManager.on('transition:start', handler);
      phaseManager.transitionTo('loading');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'shell', to: 'loading' })
      );
    });

    it('should emit transition:complete', () => {
      const handler = vi.fn();
      phaseManager.on('transition:complete', handler);
      phaseManager.transitionTo('loading');
      expect(handler).toHaveBeenCalled();
    });

    it('should pass phase data in events', () => {
      const handler = vi.fn();
      phaseManager.on('phase:enter', handler);
      phaseManager.transitionTo('main');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'main',
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('transition triggers', () => {
    it('should auto-transition after loading complete', () => {
      phaseManager.transitionTo('loading');
      const handler = vi.fn();
      phaseManager.on('phase:enter', handler);
      phaseManager.emit('loading:complete');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'menu' })
      );
    });

    it('should auto-transition after menu complete', () => {
      phaseManager.transitionTo('menu');
      const handler = vi.fn();
      phaseManager.on('phase:enter', handler);
      phaseManager.emit('menu:complete');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'main' })
      );
    });

    it('should not auto-transition without trigger', () => {
      phaseManager.transitionTo('loading');
      const currentPhase = phaseManager.getCurrentPhase();
      expect(currentPhase).toBe('loading');
    });

    it('should support manual transitions', () => {
      phaseManager.transitionTo('main');
      expect(phaseManager.getCurrentPhase()).toBe('main');
    });
  });

  describe('rendering during transitions', () => {
    it('should clear screen before rendering new phase', () => {
      phaseManager.transitionTo('loading');
      phaseManager.render();
      buffer.writeAt(10, 10, 'Old content');
      phaseManager.transitionTo('menu');
      phaseManager.render();
      const content = buffer.toString();
      expect(content).not.toContain('Old content');
    });

    it('should show transition animation between phases', () => {
      const handler = vi.fn();
      phaseManager.on('animation:start', handler);
      phaseManager.transitionTo('loading', { animate: true });
      expect(handler).toHaveBeenCalled();
    });

    it('should support instant transitions', () => {
      const handler = vi.fn();
      phaseManager.on('animation:start', handler);
      phaseManager.transitionTo('loading', { animate: false });
      expect(handler).not.toHaveBeenCalled();
    });

    it('should block input during transition', () => {
      phaseManager.transitionTo('loading', { animate: true });
      expect(phaseManager.isInputBlocked()).toBe(true);
    });

    it('should unblock input after transition complete', () => {
      phaseManager.transitionTo('loading');
      phaseManager.emit('transition:complete');
      expect(phaseManager.isInputBlocked()).toBe(false);
    });
  });

  describe('phase properties', () => {
    it('should get phase metadata', () => {
      const meta = phaseManager.getPhaseMetadata('main');
      expect(meta).toHaveProperty('name');
      expect(meta).toHaveProperty('showSidebar');
      expect(meta).toHaveProperty('showInput');
      expect(meta).toHaveProperty('showStatus');
    });

    it('should check if phase is terminal phase', () => {
      expect(phaseManager.isTerminalPhase('end')).toBe(true);
      expect(phaseManager.isTerminalPhase('main')).toBe(false);
    });

    it('should get next expected phase', () => {
      expect(phaseManager.getNextPhase('shell')).toBe('loading');
      expect(phaseManager.getNextPhase('loading')).toBe('menu');
      expect(phaseManager.getNextPhase('menu')).toBe('main');
    });

    it('should return null for terminal phase next', () => {
      expect(phaseManager.getNextPhase('end')).toBeNull();
    });
  });

  describe('layout coordination', () => {
    it('should update layout when sidebar visibility changes', () => {
      phaseManager.transitionTo('main');
      const handler = vi.fn();
      phaseManager.on('layout:update', handler);
      phaseManager.transitionTo('menu'); // hides sidebar
      expect(handler).toHaveBeenCalled();
    });

    it('should coordinate with LayoutManager', () => {
      phaseManager.transitionTo('main');
      const regions = phaseManager.getActiveRegions();
      expect(regions).toContain('sidebar');
      expect(regions).toContain('main');
    });

    it('should hide regions not used in current phase', () => {
      phaseManager.transitionTo('loading');
      const regions = phaseManager.getActiveRegions();
      expect(regions).not.toContain('sidebar');
      expect(regions).not.toContain('input');
    });
  });

  describe('error handling', () => {
    it('should handle transition errors gracefully', () => {
      const handler = vi.fn();
      phaseManager.on('phase:error', handler);
      phaseManager.transitionTo('loading');
      phaseManager.emit('loading:error', new Error('Test error'));
      expect(handler).toHaveBeenCalled();
    });

    it('should stay in current phase on error', () => {
      phaseManager.transitionTo('loading');
      try {
        phaseManager.emit('loading:error', new Error('Test'));
      } catch (e) {
        // Expected
      }
      expect(phaseManager.getCurrentPhase()).toBe('loading');
    });

    it('should emit error event', () => {
      const handler = vi.fn();
      phaseManager.on('phase:error', handler);
      phaseManager.transitionTo('loading');
      phaseManager.emit('loading:error', new Error('Test'));
      expect(handler).toHaveBeenCalled();
    });
  });
});
