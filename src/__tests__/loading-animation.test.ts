// TDD-RED: Tests for LoadingAnimator class (not yet implemented)
// Animated loading sequence with banner, progress bar, and step-by-step loading

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LoadingAnimator } from '../tui/LoadingAnimator.js';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';

describe('LoadingAnimator', () => {
  let buffer: ScreenBuffer;
  let animator: LoadingAnimator;

  beforeEach(() => {
    vi.useFakeTimers();
    buffer = new ScreenBuffer(80, 24);
    animator = new LoadingAnimator(buffer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create animator with buffer', () => {
      expect(animator).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const custom = new LoadingAnimator(buffer, {
        stepDelay: 100,
        lineDelay: 20
      });
      expect(custom).toBeDefined();
    });

    it('should throw without buffer', () => {
      expect(() => new LoadingAnimator(null as any)).toThrow();
    });

    it('should initialize in pending state', () => {
      expect(animator.isRunning()).toBe(false);
      expect(animator.isComplete()).toBe(false);
    });
  });

  describe('banner animation', () => {
    it('should render banner lines one at a time', async () => {
      const promise = animator.start();

      await vi.advanceTimersByTimeAsync(50);
      const content1 = buffer.toString();
      const lineCount1 = content1.split('\n').filter(l => l.trim().length > 0).length;

      await vi.advanceTimersByTimeAsync(100);
      const content2 = buffer.toString();
      const lineCount2 = content2.split('\n').filter(l => l.trim().length > 0).length;

      expect(lineCount2).toBeGreaterThan(lineCount1);
    });

    it('should display all 9 banner lines eventually', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      // Banner should contain ARMAMENT ASCII art (9 lines)
      expect(content).toContain('▄▄▄');
      expect(content).toContain('ARMAMENT');
    });

    it('should apply gradient colors to banner', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b['); // ANSI codes present
    });

    it('should have slight delay between banner lines', async () => {
      const spy = vi.spyOn(buffer, 'writeAt');
      const promise = animator.start();

      await vi.advanceTimersByTimeAsync(60);
      const calls1 = spy.mock.calls.length;

      await vi.advanceTimersByTimeAsync(60);
      const calls2 = spy.mock.calls.length;

      expect(calls2).toBeGreaterThan(calls1);
    });

    it('should center banner horizontally', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      const lines = buffer.toString().split('\n');
      const bannerLine = lines.find(l => l.includes('▄▄▄'));
      expect(bannerLine).toBeDefined();
      // Should have leading spaces for centering
      expect(bannerLine?.match(/^\s+/)).toBeTruthy();
    });
  });

  describe('loading steps', () => {
    it('should show each step one at a time', async () => {
      const promise = animator.start();

      await vi.advanceTimersByTimeAsync(2000);
      const content = buffer.toString();
      expect(content).toMatch(/loading config|scanning MCP|connecting provider|workspace ready/);
    });

    it('should show spinner (···) while step is running', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(2000);
      const content = buffer.toString();
      expect(content).toContain('···');
    });

    it('should replace spinner with result when step completes', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(2000);
      const content = buffer.toString();
      expect(content).toMatch(/ok|connected|ready|\d+ connected/);
    });

    it('should show all 4 default steps eventually', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      expect(content).toContain('loading config');
      expect(content).toContain('scanning MCP servers');
      expect(content).toContain('connecting provider');
      expect(content).toContain('workspace ready');
    });

    it('should accept custom steps', async () => {
      const custom = new LoadingAnimator(buffer, {
        steps: [
          { label: 'custom step 1', result: 'done' },
          { label: 'custom step 2', result: 'success' }
        ]
      });
      const promise = custom.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      expect(content).toContain('custom step 1');
      expect(content).toContain('custom step 2');
    });

    it('should show success indicator (✓) for successful steps', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      expect(content).toMatch(/✓|ok/);
    });

    it('should support failing steps', async () => {
      const custom = new LoadingAnimator(buffer, {
        steps: [
          { label: 'failing step', result: 'error', status: 'fail' }
        ]
      });
      const promise = custom.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      expect(content).toContain('✗');
    });

    it('should support warning steps', async () => {
      const custom = new LoadingAnimator(buffer, {
        steps: [
          { label: 'warning step', result: 'degraded', status: 'warn' }
        ]
      });
      const promise = custom.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      expect(content).toContain('⚠');
    });

    it('should apply color to step results', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      const contentWithANSI = buffer.toStringWithANSI();
      // Success color (green gradient)
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should have configurable delay per step', async () => {
      const fast = new LoadingAnimator(buffer, { stepDelay: 10 });
      const slow = new LoadingAnimator(buffer, { stepDelay: 500 });

      const fastPromise = fast.start();
      await vi.advanceTimersByTimeAsync(100);
      const fastContent = buffer.toString();

      buffer.clear();
      const slowPromise = slow.start();
      await vi.advanceTimersByTimeAsync(100);
      const slowContent = buffer.toString();

      // Fast should have more steps visible
      const fastLines = fastContent.split('\n').filter(l => l.trim()).length;
      const slowLines = slowContent.split('\n').filter(l => l.trim()).length;
      expect(fastLines).toBeGreaterThanOrEqual(slowLines);
    });
  });

  describe('progress bar', () => {
    it('should show progress bar after steps', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      expect(content).toMatch(/█|░|\[.*\]/);
    });

    it('should fill incrementally as steps complete', async () => {
      const promise = animator.start();

      await vi.advanceTimersByTimeAsync(2500);
      const content1 = buffer.toString();
      const filled1 = (content1.match(/█/g) || []).length;

      await vi.advanceTimersByTimeAsync(2500);
      const content2 = buffer.toString();
      const filled2 = (content2.match(/█/g) || []).length;

      expect(filled2).toBeGreaterThanOrEqual(filled1);
    });

    it('should fill completely when all steps done', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      // Should have full bar (40 chars default)
      const filled = (content.match(/█/g) || []).length;
      expect(filled).toBeGreaterThanOrEqual(35);
    });

    it('should show empty bar cells as ░', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(2000);
      const content = buffer.toString();
      expect(content).toContain('░');
    });

    it('should apply gradient colors to filled portion', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should have configurable width', async () => {
      const narrow = new LoadingAnimator(buffer, { progressBarWidth: 20 });
      const promise = narrow.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      const filled = (content.match(/█/g) || []).length;
      expect(filled).toBeLessThanOrEqual(20);
    });

    it('should show "ready" label at end', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      const content = buffer.toString();
      expect(content).toMatch(/ready/i);
    });
  });

  describe('flavor text', () => {
    it('should show random flavor text', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      const content = buffer.toString();
      expect(content).toMatch(/initializing|calibrating|loading|spinning|engaging|deploying|activating|priming/);
    });

    it('should apply gradient to flavor text', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should show different flavor text on each run', async () => {
      const runs: string[] = [];

      for (let i = 0; i < 5; i++) {
        buffer.clear();
        const anim = new LoadingAnimator(buffer);
        const promise = anim.start();
        await vi.advanceTimersByTimeAsync(1000);
        runs.push(buffer.toString());
      }

      // At least some variation expected
      const unique = new Set(runs);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe('debug mode', () => {
    it('should skip animations in debug mode', async () => {
      const debug = new LoadingAnimator(buffer, { debug: true });
      const promise = debug.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(debug.isComplete()).toBe(true);
    });

    it('should render all content immediately in debug mode', async () => {
      const debug = new LoadingAnimator(buffer, { debug: true });
      const promise = debug.start();
      await vi.advanceTimersByTimeAsync(10);
      const content = buffer.toString();
      expect(content).toContain('loading config');
      expect(content).toContain('workspace ready');
      expect(content).toContain('ready');
    });

    it('should still emit complete event in debug mode', async () => {
      const handler = vi.fn();
      const debug = new LoadingAnimator(buffer, { debug: true });
      debug.on('loading:complete', handler);
      await debug.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(handler).toHaveBeenCalled();
    });

    it('should use zero delays in debug mode', async () => {
      const debug = new LoadingAnimator(buffer, { debug: true });
      const start = Date.now();
      await debug.start();
      await vi.advanceTimersByTimeAsync(10);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('events', () => {
    it('should emit loading:start on start', async () => {
      const handler = vi.fn();
      animator.on('loading:start', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(handler).toHaveBeenCalled();
    });

    it('should emit loading:complete when done', async () => {
      const handler = vi.fn();
      animator.on('loading:complete', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      expect(handler).toHaveBeenCalled();
    });

    it('should emit step:start for each step', async () => {
      const handler = vi.fn();
      animator.on('step:start', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      expect(handler).toHaveBeenCalledTimes(4); // 4 default steps
    });

    it('should emit step:complete for each step', async () => {
      const handler = vi.fn();
      animator.on('step:complete', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      expect(handler).toHaveBeenCalledTimes(4);
    });

    it('should pass step data in events', async () => {
      const handler = vi.fn();
      animator.on('step:start', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          label: expect.any(String),
          index: expect.any(Number)
        })
      );
    });

    it('should emit progress:update as bar fills', async () => {
      const handler = vi.fn();
      animator.on('progress:update', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('timing', () => {
    it('should complete within reasonable time', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(5000);
      expect(animator.isComplete()).toBe(true);
    });

    it('should take longer with more steps', async () => {
      const few = new LoadingAnimator(buffer, {
        steps: [{ label: 'step 1', result: 'ok' }]
      });
      const many = new LoadingAnimator(buffer, {
        steps: Array(10).fill(0).map((_, i) => ({ label: `step ${i}`, result: 'ok' }))
      });

      const fewPromise = few.start();
      await vi.advanceTimersByTimeAsync(1000);
      const fewDone = few.isComplete();

      const manyPromise = many.start();
      await vi.advanceTimersByTimeAsync(1000);
      const manyDone = many.isComplete();

      expect(fewDone).toBe(true);
      expect(manyDone).toBe(false);
    });

    it('should respect custom step delays', async () => {
      const fast = new LoadingAnimator(buffer, { stepDelay: 10 });
      const slow = new LoadingAnimator(buffer, { stepDelay: 500 });

      const fastPromise = fast.start();
      await vi.advanceTimersByTimeAsync(200);
      const fastDone = fast.isComplete();

      const slowPromise = slow.start();
      await vi.advanceTimersByTimeAsync(200);
      const slowDone = slow.isComplete();

      expect(fastDone).toBe(true);
      expect(slowDone).toBe(false);
    });
  });

  describe('state management', () => {
    it('should track running state', async () => {
      expect(animator.isRunning()).toBe(false);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(animator.isRunning()).toBe(true);
    });

    it('should track complete state', async () => {
      expect(animator.isComplete()).toBe(false);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      expect(animator.isComplete()).toBe(true);
    });

    it('should not allow starting twice', async () => {
      const promise1 = animator.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(() => animator.start()).toThrow(/already running/i);
    });

    it('should allow reset after completion', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(10000);
      animator.reset();
      expect(animator.isComplete()).toBe(false);
      expect(animator.isRunning()).toBe(false);
    });

    it('should get current step index', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(2000);
      const step = animator.getCurrentStep();
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(4);
    });

    it('should get progress percentage', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(2500);
      const progress = animator.getProgress();
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(100);
    });
  });

  describe('cancellation', () => {
    it('should support canceling animation', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      animator.cancel();
      expect(animator.isRunning()).toBe(false);
    });

    it('should emit cancel event', async () => {
      const handler = vi.fn();
      animator.on('loading:cancel', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      animator.cancel();
      expect(handler).toHaveBeenCalled();
    });

    it('should not emit complete after cancel', async () => {
      const handler = vi.fn();
      animator.on('loading:complete', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      animator.cancel();
      await vi.advanceTimersByTimeAsync(10000);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('skip functionality', () => {
    it('should skip to end immediately', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      animator.skip();
      expect(animator.isComplete()).toBe(true);
    });

    it('should render full content when skipped', async () => {
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      animator.skip();
      const content = buffer.toString();
      expect(content).toContain('ready');
    });

    it('should still emit complete event when skipped', async () => {
      const handler = vi.fn();
      animator.on('loading:complete', handler);
      const promise = animator.start();
      await vi.advanceTimersByTimeAsync(1000);
      animator.skip();
      expect(handler).toHaveBeenCalled();
    });
  });
});
