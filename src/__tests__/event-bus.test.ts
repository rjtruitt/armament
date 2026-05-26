/**
 * EVENT BUS TEST SUITE — Central pub/sub event system.
 * All components communicate via typed events.
 *
 * Covers:
 * - on/off/once/emit/removeAllListeners/listenerCount
 * - Event ordering (listeners called in registration order)
 * - Error isolation (listener errors don't break others)
 * - Wildcard listeners (onAny)
 * - waitFor (promise-based event waiting)
 * - Event history (for debugging)
 * - All armament event types
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../core/EventBus.js';

let bus: EventBus;

beforeEach(() => {
  bus = new EventBus();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BASIC PUB/SUB
// ═══════════════════════════════════════════════════════════════════════════════

describe('Basic Pub/Sub', () => {
  it('on registers listener that receives emitted events', () => {
    const handler = vi.fn();
    bus.on('token', handler);
    bus.emit('token', 'hello');
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('emit calls all listeners for event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('token', handler1);
    bus.on('token', handler2);
    bus.emit('token', 'data');
    expect(handler1).toHaveBeenCalledWith('data');
    expect(handler2).toHaveBeenCalledWith('data');
  });

  it('emit passes all arguments to listeners', () => {
    const handler = vi.fn();
    bus.on('tool:start', handler);
    bus.emit('tool:start', 'bash', { command: 'ls' });
    expect(handler).toHaveBeenCalledWith('bash', { command: 'ls' });
  });

  it('off removes specific listener', () => {
    const handler = vi.fn();
    bus.on('token', handler);
    bus.off('token', handler);
    bus.emit('token', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('once listener auto-removes after first call', () => {
    const handler = vi.fn();
    bus.once('close', handler);
    bus.emit('close');
    bus.emit('close');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removeAllListeners(event) removes all for that event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('token', handler1);
    bus.on('token', handler2);
    bus.removeAllListeners('token');
    bus.emit('token', 'data');
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('removeAllListeners() removes ALL listeners', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('token', handler1);
    bus.on('step', handler2);
    bus.removeAllListeners();
    bus.emit('token', 'data');
    bus.emit('step', 'data');
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('listenerCount returns number of listeners', () => {
    bus.on('token', () => {});
    bus.on('token', () => {});
    bus.on('step', () => {});
    expect(bus.listenerCount('token')).toBe(2);
    expect(bus.listenerCount('step')).toBe(1);
    expect(bus.listenerCount('close')).toBe(0);
  });

  it('emit with no listeners does not throw', () => {
    expect(() => bus.emit('token', 'hello')).not.toThrow();
  });

  it('off with non-registered handler does not throw', () => {
    expect(() => bus.off('token', () => {})).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EVENT ORDERING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Event Ordering', () => {
  it('listeners called in registration order', () => {
    const order: number[] = [];
    bus.on('step', () => order.push(1));
    bus.on('step', () => order.push(2));
    bus.on('step', () => order.push(3));
    bus.emit('step');
    expect(order).toEqual([1, 2, 3]);
  });

  it('once listeners maintain position in order', () => {
    const order: number[] = [];
    bus.on('step', () => order.push(1));
    bus.once('step', () => order.push(2));
    bus.on('step', () => order.push(3));
    bus.emit('step');
    expect(order).toEqual([1, 2, 3]);
  });

  it('removing a listener does not affect order of remaining', () => {
    const order: number[] = [];
    const h2 = () => order.push(2);
    bus.on('step', () => order.push(1));
    bus.on('step', h2);
    bus.on('step', () => order.push(3));
    bus.off('step', h2);
    bus.emit('step');
    expect(order).toEqual([1, 3]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ERROR ISOLATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error Isolation', () => {
  it('listener throwing does not prevent other listeners from running', () => {
    const handler1 = vi.fn(() => { throw new Error('boom'); });
    const handler2 = vi.fn();
    bus.on('token', handler1);
    bus.on('token', handler2);
    bus.emit('token', 'test');
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('listener errors are caught and do not propagate to emit caller', () => {
    bus.on('error:display', () => { throw new Error('oops'); });
    expect(() => bus.emit('error:display', 'test')).not.toThrow();
  });

  it('all listeners run even if multiple throw', () => {
    const handler3 = vi.fn();
    bus.on('token', () => { throw new Error('err1'); });
    bus.on('token', () => { throw new Error('err2'); });
    bus.on('token', handler3);
    bus.emit('token', 'data');
    expect(handler3).toHaveBeenCalledWith('data');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. WILDCARD LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Wildcard Listeners', () => {
  it('onAny receives all events regardless of type', () => {
    const handler = vi.fn();
    bus.onAny(handler);
    bus.emit('token', 'a');
    bus.emit('step', 'b');
    bus.emit('close');
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('onAny receives event name as first arg followed by event args', () => {
    const handler = vi.fn();
    bus.onAny(handler);
    bus.emit('tool:start', 'bash', { cmd: 'ls' });
    expect(handler).toHaveBeenCalledWith('tool:start', 'bash', { cmd: 'ls' });
  });

  it('onAny returns unsubscribe function', () => {
    const handler = vi.fn();
    const unsub = bus.onAny(handler);
    bus.emit('token', 'a');
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
    bus.emit('token', 'b');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('multiple onAny listeners all receive events', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.onAny(h1);
    bus.onAny(h2);
    bus.emit('step');
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. WAITFOR (Promise-based)
// ═══════════════════════════════════════════════════════════════════════════════

describe('waitFor', () => {
  it('resolves on next emission of specified event', async () => {
    const promise = bus.waitFor('close');
    bus.emit('close');
    await expect(promise).resolves.toBeDefined();
  });

  it('resolves with event args as array', async () => {
    const promise = bus.waitFor('tool:result');
    bus.emit('tool:result', 'bash', { output: 'hello' });
    const result = await promise;
    expect(result).toEqual(['bash', { output: 'hello' }]);
  });

  it('rejects on timeout if event not emitted', async () => {
    const promise = bus.waitFor('close', 50);
    await expect(promise).rejects.toThrow();
  });

  it('cleans up listener after resolution', async () => {
    const promise = bus.waitFor('step');
    bus.emit('step', 'data');
    await promise;
    // After resolving, the internal listener should be removed
    expect(bus.listenerCount('step')).toBe(0);
  });

  it('cleans up listener after timeout rejection', async () => {
    const promise = bus.waitFor('step', 50);
    try { await promise; } catch { /* expected */ }
    expect(bus.listenerCount('step')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. EVENT HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Event History', () => {
  it('getEventHistory returns recent events', () => {
    bus.emit('token', 'a');
    bus.emit('step', 'b');
    const history = bus.getEventHistory();
    expect(history.length).toBe(2);
    expect(history[0].event).toBe('token');
    expect(history[1].event).toBe('step');
  });

  it('getEventHistory filtered by event type', () => {
    bus.emit('token', 'a');
    bus.emit('step', 'b');
    bus.emit('token', 'c');
    const history = bus.getEventHistory('token');
    expect(history.length).toBe(2);
    expect(history.every(h => h.event === 'token')).toBe(true);
  });

  it('history entries include timestamp', () => {
    bus.emit('tool:start', 'bash');
    const history = bus.getEventHistory('tool:start');
    expect(history[0].timestamp).toBeTypeOf('number');
    expect(history[0].timestamp).toBeGreaterThan(0);
  });

  it('history entries include args', () => {
    bus.emit('tool:start', 'bash', { command: 'ls' });
    const history = bus.getEventHistory('tool:start');
    expect(history[0].args).toEqual(['bash', { command: 'ls' }]);
  });

  it('history respects limit parameter', () => {
    for (let i = 0; i < 20; i++) {
      bus.emit('token', `t${i}`);
    }
    const history = bus.getEventHistory(undefined, 5);
    expect(history.length).toBe(5);
    // Should return the most recent 5
    expect(history[4].args).toEqual(['t19']);
  });

  it('history returns most recent when limited', () => {
    bus.emit('token', 'first');
    bus.emit('token', 'second');
    bus.emit('token', 'third');
    const history = bus.getEventHistory('token', 2);
    expect(history.length).toBe(2);
    expect(history[0].args).toEqual(['second']);
    expect(history[1].args).toEqual(['third']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ARMAMENT EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Armament Event Types', () => {
  describe('streaming events', () => {
    it('token event carries streamed text', () => {
      const handler = vi.fn();
      bus.on('token', handler);
      bus.emit('token', 'hello world');
      expect(handler).toHaveBeenCalledWith('hello world');
    });

    it('stream:start signals beginning of response', () => {
      const handler = vi.fn();
      bus.on('stream:start', handler);
      bus.emit('stream:start');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('stream:end signals response complete', () => {
      const handler = vi.fn();
      bus.on('stream:end', handler);
      bus.emit('stream:end');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('tool events', () => {
    it('tool:start carries tool name and args', () => {
      const handler = vi.fn();
      bus.on('tool:start', handler);
      bus.emit('tool:start', 'bash', { command: 'ls' });
      expect(handler).toHaveBeenCalledWith('bash', { command: 'ls' });
    });

    it('tool:result carries result data', () => {
      const handler = vi.fn();
      bus.on('tool:result', handler);
      bus.emit('tool:result', 'bash', { output: 'file.txt' });
      expect(handler).toHaveBeenCalledWith('bash', { output: 'file.txt' });
    });

    it('tool:aborted carries abort reason', () => {
      const handler = vi.fn();
      bus.on('tool:aborted', handler);
      bus.emit('tool:aborted', 'bash', 'denied');
      expect(handler).toHaveBeenCalledWith('bash', 'denied');
    });
  });

  describe('permission events', () => {
    it('permission:request carries request details', () => {
      const handler = vi.fn();
      bus.on('permission:request', handler);
      bus.emit('permission:request', { tool: 'bash', risk: 'high' });
      expect(handler).toHaveBeenCalledWith({ tool: 'bash', risk: 'high' });
    });

    it('permission:granted carries decision', () => {
      const handler = vi.fn();
      bus.on('permission:granted', handler);
      bus.emit('permission:granted', { tool: 'bash' });
      expect(handler).toHaveBeenCalledWith({ tool: 'bash' });
    });

    it('permission:denied carries reason', () => {
      const handler = vi.fn();
      bus.on('permission:denied', handler);
      bus.emit('permission:denied', { tool: 'bash', reason: 'unsafe' });
      expect(handler).toHaveBeenCalledWith({ tool: 'bash', reason: 'unsafe' });
    });
  });

  describe('budget/rate limit events', () => {
    it('budget:warning fires with budget data', () => {
      const handler = vi.fn();
      bus.on('budget:warning', handler);
      bus.emit('budget:warning', { remaining: 1.0, pct: 80 });
      expect(handler).toHaveBeenCalledWith({ remaining: 1.0, pct: 80 });
    });

    it('ratelimit:warning fires with remaining info', () => {
      const handler = vi.fn();
      bus.on('ratelimit:warning', handler);
      bus.emit('ratelimit:warning', { remaining: 5 });
      expect(handler).toHaveBeenCalledWith({ remaining: 5 });
    });

    it('ratelimit:waiting fires with retry info', () => {
      const handler = vi.fn();
      bus.on('ratelimit:waiting', handler);
      bus.emit('ratelimit:waiting', { retryAfter: 5000 });
      expect(handler).toHaveBeenCalledWith({ retryAfter: 5000 });
    });

    it('provider:fallback fires with from/to info', () => {
      const handler = vi.fn();
      bus.on('provider:fallback', handler);
      bus.emit('provider:fallback', { from: 'anthropic', to: 'openai' });
      expect(handler).toHaveBeenCalledWith({ from: 'anthropic', to: 'openai' });
    });
  });

  describe('session events', () => {
    it('session:saved fires with checkpoint data', () => {
      const handler = vi.fn();
      bus.on('session:saved', handler);
      bus.emit('session:saved', { checkpointId: 'cp-1' });
      expect(handler).toHaveBeenCalledWith({ checkpointId: 'cp-1' });
    });

    it('config:unsaved fires with changed keys', () => {
      const handler = vi.fn();
      bus.on('config:unsaved', handler);
      bus.emit('config:unsaved', { keys: ['model'] });
      expect(handler).toHaveBeenCalledWith({ keys: ['model'] });
    });

    it('background:complete fires with task info', () => {
      const handler = vi.fn();
      bus.on('background:complete', handler);
      bus.emit('background:complete', { taskId: 'bg-1' });
      expect(handler).toHaveBeenCalledWith({ taskId: 'bg-1' });
    });
  });

  describe('auth events', () => {
    it('auth:required fires with provider info', () => {
      const handler = vi.fn();
      bus.on('auth:required', handler);
      bus.emit('auth:required', { provider: 'anthropic' });
      expect(handler).toHaveBeenCalledWith({ provider: 'anthropic' });
    });

    it('auth:device-code fires with device auth data', () => {
      const handler = vi.fn();
      bus.on('auth:device-code', handler);
      bus.emit('auth:device-code', { userCode: 'ABCD-1234', uri: 'https://example.com' });
      expect(handler).toHaveBeenCalledWith({ userCode: 'ABCD-1234', uri: 'https://example.com' });
    });
  });
});
