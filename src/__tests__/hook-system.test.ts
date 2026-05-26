/**
 * HOOK SYSTEM TEST SUITE — Pre/post hooks for all armament operations.
 * Like middleware: can observe, modify, or abort operations.
 *
 * Covers:
 * - Hook registration (by point, priority, name)
 * - Hook execution order (priority-based)
 * - Abort capability (stop operation chain)
 * - Modify capability (alter data mid-flight)
 * - Hook points: message, tool, agent lifecycle, session, git, view
 * - Hook enable/disable
 * - Error isolation (one hook failure doesn't break others)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookSystem } from '../core/HookSystem.js';
import type { IHookContext } from '../core/interfaces/IHookSystem.js';

let hooks: HookSystem;

beforeEach(() => {
  hooks = new HookSystem();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. HOOK REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Hook Registration', () => {
  it('register adds hook to specified point', () => {
    hooks.register({
      name: 'log-messages',
      point: 'pre:message',
      priority: 10,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    const byPoint = hooks.getByPoint('pre:message');
    expect(byPoint.length).toBe(1);
    expect(byPoint[0].name).toBe('log-messages');
  });

  it('getAll returns all registered hooks', () => {
    hooks.register({
      name: 'hook-a',
      point: 'pre:message',
      priority: 10,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    hooks.register({
      name: 'hook-b',
      point: 'pre:tool',
      priority: 5,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    const all = hooks.getAll();
    expect(all.length).toBe(2);
    expect(all.map(h => h.name).sort()).toEqual(['hook-a', 'hook-b']);
  });

  it('getByPoint returns hooks for specific point sorted by priority', () => {
    hooks.register({
      name: 'high-priority',
      point: 'pre:tool',
      priority: 1,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    hooks.register({
      name: 'low-priority',
      point: 'pre:tool',
      priority: 100,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    hooks.register({
      name: 'mid-priority',
      point: 'pre:tool',
      priority: 50,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    const byPoint = hooks.getByPoint('pre:tool');
    expect(byPoint.map(h => h.name)).toEqual(['high-priority', 'mid-priority', 'low-priority']);
  });

  it('unregister removes hook by name', () => {
    hooks.register({
      name: 'temp-hook',
      point: 'pre:message',
      priority: 10,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    hooks.unregister('temp-hook');
    expect(hooks.getAll().length).toBe(0);
    expect(hooks.getByPoint('pre:message').length).toBe(0);
  });

  it('duplicate name overwrites previous registration', () => {
    hooks.register({
      name: 'log-messages',
      point: 'pre:message',
      priority: 10,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    hooks.register({
      name: 'log-messages',
      point: 'pre:message',
      priority: 5,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    const all = hooks.getAll();
    expect(all.length).toBe(1);
    expect(all[0].priority).toBe(5);
  });

  it('getByPoint returns empty array for point with no hooks', () => {
    const result = hooks.getByPoint('post:tool');
    expect(result).toEqual([]);
  });

  it('unregister with non-existent name does not throw', () => {
    expect(() => hooks.unregister('non-existent')).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. HOOK EXECUTION ORDER
// ═══════════════════════════════════════════════════════════════════════════════

describe('Hook Execution Order', () => {
  it('hooks execute in priority order (lower number = higher priority)', async () => {
    const order: number[] = [];
    hooks.register({
      name: 'last',
      point: 'pre:message',
      priority: 100,
      handler: async () => { order.push(3); return { aborted: false, modified: {} }; },
    });
    hooks.register({
      name: 'first',
      point: 'pre:message',
      priority: 1,
      handler: async () => { order.push(1); return { aborted: false, modified: {} }; },
    });
    hooks.register({
      name: 'middle',
      point: 'pre:message',
      priority: 50,
      handler: async () => { order.push(2); return { aborted: false, modified: {} }; },
    });
    await hooks.execute('pre:message', { data: {} });
    expect(order).toEqual([1, 2, 3]);
  });

  it('same-priority hooks execute in registration order', async () => {
    const order: number[] = [];
    hooks.register({
      name: 'first-registered',
      point: 'pre:tool',
      priority: 10,
      handler: async () => { order.push(1); return { aborted: false, modified: {} }; },
    });
    hooks.register({
      name: 'second-registered',
      point: 'pre:tool',
      priority: 10,
      handler: async () => { order.push(2); return { aborted: false, modified: {} }; },
    });
    hooks.register({
      name: 'third-registered',
      point: 'pre:tool',
      priority: 10,
      handler: async () => { order.push(3); return { aborted: false, modified: {} }; },
    });
    await hooks.execute('pre:tool', { data: {} });
    expect(order).toEqual([1, 2, 3]);
  });

  it('disabled hooks are skipped', async () => {
    const order: number[] = [];
    hooks.register({
      name: 'hook-a',
      point: 'pre:message',
      priority: 1,
      handler: async () => { order.push(1); return { aborted: false, modified: {} }; },
    });
    hooks.register({
      name: 'hook-b',
      point: 'pre:message',
      priority: 2,
      handler: async () => { order.push(2); return { aborted: false, modified: {} }; },
    });
    hooks.register({
      name: 'hook-c',
      point: 'pre:message',
      priority: 3,
      handler: async () => { order.push(3); return { aborted: false, modified: {} }; },
    });
    hooks.disable('hook-b');
    await hooks.execute('pre:message', { data: {} });
    expect(order).toEqual([1, 3]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ABORT CAPABILITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Abort Capability', () => {
  it('hook calling abort() stops the chain', async () => {
    const secondHook = vi.fn(async () => ({ aborted: false, modified: {} }));
    hooks.register({
      name: 'blocker',
      point: 'pre:tool',
      priority: 1,
      handler: async (ctx: IHookContext) => {
        ctx.abort();
        return { aborted: true, modified: {} };
      },
    });
    hooks.register({
      name: 'after-blocker',
      point: 'pre:tool',
      priority: 10,
      handler: secondHook,
    });
    await hooks.execute('pre:tool', { data: { tool: 'bash', command: 'rm -rf /' } });
    expect(secondHook).not.toHaveBeenCalled();
  });

  it('aborted result has aborted=true', async () => {
    hooks.register({
      name: 'aborter',
      point: 'pre:message',
      priority: 1,
      handler: async (ctx: IHookContext) => {
        ctx.abort();
        return { aborted: true, modified: {} };
      },
    });
    const result = await hooks.execute('pre:message', { data: {} });
    expect(result.aborted).toBe(true);
  });

  it('subsequent hooks after abort are not called', async () => {
    const calls: string[] = [];
    hooks.register({
      name: 'first',
      point: 'pre:tool',
      priority: 1,
      handler: async () => { calls.push('first'); return { aborted: false, modified: {} }; },
    });
    hooks.register({
      name: 'aborter',
      point: 'pre:tool',
      priority: 5,
      handler: async (ctx: IHookContext) => { calls.push('aborter'); ctx.abort(); return { aborted: true, modified: {} }; },
    });
    hooks.register({
      name: 'never-called',
      point: 'pre:tool',
      priority: 10,
      handler: async () => { calls.push('never'); return { aborted: false, modified: {} }; },
    });
    await hooks.execute('pre:tool', { data: {} });
    expect(calls).toEqual(['first', 'aborter']);
  });

  it('abort reason captured in result output', async () => {
    hooks.register({
      name: 'aborter-with-reason',
      point: 'pre:send',
      priority: 1,
      handler: async (ctx: IHookContext) => {
        ctx.abort();
        return { aborted: true, modified: {}, output: 'blocked by policy' };
      },
    });
    const result = await hooks.execute('pre:send', { data: {} });
    expect(result.aborted).toBe(true);
    expect(result.output).toBe('blocked by policy');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MODIFY CAPABILITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Modify Capability', () => {
  it('hook calling modify() updates context data', async () => {
    hooks.register({
      name: 'modifier',
      point: 'pre:message',
      priority: 1,
      handler: async (ctx: IHookContext) => {
        ctx.modify('text', 'modified-text');
        return { aborted: false, modified: { text: 'modified-text' } };
      },
    });
    const result = await hooks.execute('pre:message', { data: { text: 'hello' } });
    expect(result.modified.text).toBe('modified-text');
  });

  it('modifications accumulate across hooks', async () => {
    hooks.register({
      name: 'mod-a',
      point: 'pre:tool',
      priority: 1,
      handler: async (ctx: IHookContext) => {
        ctx.modify('foo', 'bar');
        return { aborted: false, modified: { foo: 'bar' } };
      },
    });
    hooks.register({
      name: 'mod-b',
      point: 'pre:tool',
      priority: 2,
      handler: async (ctx: IHookContext) => {
        ctx.modify('baz', 'qux');
        return { aborted: false, modified: { baz: 'qux' } };
      },
    });
    const result = await hooks.execute('pre:tool', { data: { args: {} } });
    expect(result.modified).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('later hooks see modifications from earlier hooks via context data', async () => {
    hooks.register({
      name: 'first-mod',
      point: 'pre:message',
      priority: 1,
      handler: async (ctx: IHookContext) => {
        ctx.modify('text', 'transformed');
        return { aborted: false, modified: { text: 'transformed' } };
      },
    });
    hooks.register({
      name: 'second-reader',
      point: 'pre:message',
      priority: 10,
      handler: async (ctx: IHookContext) => {
        // The second hook should see the modified data
        return { aborted: false, modified: { saw: ctx.data.text } };
      },
    });
    const result = await hooks.execute('pre:message', { data: { text: 'original' } });
    expect(result.modified.saw).toBe('transformed');
  });

  it('result contains all modifications merged', async () => {
    hooks.register({
      name: 'mod1',
      point: 'post:message',
      priority: 1,
      handler: async (ctx: IHookContext) => {
        ctx.modify('a', 1);
        return { aborted: false, modified: { a: 1 } };
      },
    });
    hooks.register({
      name: 'mod2',
      point: 'post:message',
      priority: 2,
      handler: async (ctx: IHookContext) => {
        ctx.modify('b', 2);
        return { aborted: false, modified: { b: 2 } };
      },
    });
    hooks.register({
      name: 'mod3',
      point: 'post:message',
      priority: 3,
      handler: async (ctx: IHookContext) => {
        ctx.modify('c', 3);
        return { aborted: false, modified: { c: 3 } };
      },
    });
    const result = await hooks.execute('post:message', { data: { response: '' } });
    expect(result.modified).toEqual({ a: 1, b: 2, c: 3 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. HOOK POINTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Hook Points', () => {
  describe('message hooks', () => {
    it('pre:message fires before message sent to agent', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'msg-pre', point: 'pre:message', priority: 10, handler });
      await hooks.execute('pre:message', { data: { text: 'test' } });
      expect(handler).toHaveBeenCalled();
    });

    it('post:message fires after agent response received', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'msg-post', point: 'post:message', priority: 10, handler });
      await hooks.execute('post:message', { data: { response: 'reply' } });
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('tool hooks', () => {
    it('pre:tool fires before tool execution', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'tool-pre', point: 'pre:tool', priority: 10, handler });
      await hooks.execute('pre:tool', { data: { tool: 'read', args: {} } });
      expect(handler).toHaveBeenCalled();
    });

    it('post:tool fires after tool completes', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'tool-post', point: 'post:tool', priority: 10, handler });
      await hooks.execute('post:tool', { data: { tool: 'read', result: 'content' } });
      expect(handler).toHaveBeenCalled();
    });

    it('pre:tool:fail fires on tool error', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'tool-fail', point: 'pre:tool:fail', priority: 10, handler });
      await hooks.execute('pre:tool:fail', { data: { tool: 'bash', error: new Error('oops') } });
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('agent lifecycle hooks', () => {
    it('on:spawn fires when agent spawned', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'spawn', point: 'on:spawn', priority: 10, handler });
      await hooks.execute('on:spawn', { data: { agentId: 'a1' } });
      expect(handler).toHaveBeenCalled();
    });

    it('on:kill fires when agent killed', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'kill', point: 'on:kill', priority: 10, handler });
      await hooks.execute('on:kill', { data: { agentId: 'a1' } });
      expect(handler).toHaveBeenCalled();
    });

    it('on:switch fires when switching agents', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'switch', point: 'on:switch', priority: 10, handler });
      await hooks.execute('on:switch', { data: { from: 'a1', to: 'a2' } });
      expect(handler).toHaveBeenCalled();
    });

    it('on:error fires on agent error', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'error', point: 'on:error', priority: 10, handler });
      await hooks.execute('on:error', { data: { agentId: 'a1', error: new Error('fail') } });
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('session hooks', () => {
    it('session:start fires on session boot', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'sess-start', point: 'session:start', priority: 10, handler });
      await hooks.execute('session:start', { data: {} });
      expect(handler).toHaveBeenCalled();
    });

    it('session:end fires on session shutdown', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'sess-end', point: 'session:end', priority: 10, handler });
      await hooks.execute('session:end', { data: {} });
      expect(handler).toHaveBeenCalled();
    });

    it('on:budget fires on budget warning', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'budget', point: 'on:budget', priority: 10, handler });
      await hooks.execute('on:budget', { data: { remaining: 0.5 } });
      expect(handler).toHaveBeenCalled();
    });

    it('on:ratelimit fires on rate limit hit', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'ratelimit', point: 'on:ratelimit', priority: 10, handler });
      await hooks.execute('on:ratelimit', { data: { retryAfter: 5000 } });
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('git hooks', () => {
    it('git:commit fires for commit operations', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'git-commit', point: 'git:commit', priority: 10, handler });
      await hooks.execute('git:commit', { data: { message: 'feat: add feature' } });
      expect(handler).toHaveBeenCalled();
    });

    it('git:push fires for push operations', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'git-push', point: 'git:push', priority: 10, handler });
      await hooks.execute('git:push', { data: { branch: 'main' } });
      expect(handler).toHaveBeenCalled();
    });

    it('git:conflict fires on detected conflict', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'git-conflict', point: 'git:conflict', priority: 10, handler });
      await hooks.execute('git:conflict', { data: { files: ['app.ts'] } });
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('view hooks', () => {
    it('view:mode-change fires on view mode switch', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'view-mode', point: 'view:mode-change', priority: 10, handler });
      await hooks.execute('view:mode-change', { data: { mode: 'focus' } });
      expect(handler).toHaveBeenCalled();
    });

    it('view:focus-change fires on focus target change', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'view-focus', point: 'view:focus-change', priority: 10, handler });
      await hooks.execute('view:focus-change', { data: { target: 'sidebar' } });
      expect(handler).toHaveBeenCalled();
    });

    it('view:notification fires on notification display', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'view-notif', point: 'view:notification', priority: 10, handler });
      await hooks.execute('view:notification', { data: { message: 'done' } });
      expect(handler).toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ERROR ISOLATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error Isolation', () => {
  it('one hook throwing does not break subsequent hooks', async () => {
    const order: string[] = [];
    hooks.register({
      name: 'thrower',
      point: 'pre:message',
      priority: 1,
      handler: async () => { throw new Error('boom'); },
    });
    hooks.register({
      name: 'survivor',
      point: 'pre:message',
      priority: 10,
      handler: async () => { order.push('survived'); return { aborted: false, modified: {} }; },
    });
    await hooks.execute('pre:message', { data: {} });
    expect(order).toEqual(['survived']);
  });

  it('hook error is logged but chain continues', async () => {
    const handlerAfter = vi.fn(async () => ({ aborted: false, modified: {} }));
    hooks.register({
      name: 'error-hook',
      point: 'post:tool',
      priority: 1,
      handler: async () => { throw new Error('internal error'); },
    });
    hooks.register({
      name: 'after-error',
      point: 'post:tool',
      priority: 10,
      handler: handlerAfter,
    });
    const result = await hooks.execute('post:tool', { data: {} });
    expect(handlerAfter).toHaveBeenCalled();
    expect(result.aborted).toBe(false);
  });

  it('execute does not throw even when hooks throw', async () => {
    hooks.register({
      name: 'bad-hook',
      point: 'pre:tool',
      priority: 1,
      handler: async () => { throw new Error('fatal'); },
    });
    await expect(hooks.execute('pre:tool', { data: {} })).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ENABLE/DISABLE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Enable/Disable', () => {
  it('disable makes hook skip during execution', async () => {
    const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
    hooks.register({
      name: 'log-messages',
      point: 'pre:message',
      priority: 10,
      handler,
    });
    hooks.disable('log-messages');
    await hooks.execute('pre:message', { data: {} });
    expect(handler).not.toHaveBeenCalled();
  });

  it('enable re-activates disabled hook', async () => {
    const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
    hooks.register({
      name: 'log-messages',
      point: 'pre:message',
      priority: 10,
      handler,
    });
    hooks.disable('log-messages');
    hooks.enable('log-messages');
    await hooks.execute('pre:message', { data: {} });
    expect(handler).toHaveBeenCalled();
  });

  it('isEnabled returns true for active hooks', () => {
    hooks.register({
      name: 'log-messages',
      point: 'pre:message',
      priority: 10,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    expect(hooks.isEnabled('log-messages')).toBe(true);
  });

  it('isEnabled returns false for disabled hooks', () => {
    hooks.register({
      name: 'log-messages',
      point: 'pre:message',
      priority: 10,
      handler: async () => ({ aborted: false, modified: {} }),
    });
    hooks.disable('log-messages');
    expect(hooks.isEnabled('log-messages')).toBe(false);
  });

  it('isEnabled returns false for non-existent hooks', () => {
    expect(hooks.isEnabled('non-existent')).toBe(false);
  });
});
