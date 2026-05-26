/**
 * Tests for NudgeTools: set_nudge, remove_nudge, nudge_list, wakeup
 * and PlanModeTools: enter_plan_mode, exit_plan_mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NudgeStore,
  SetNudgeTool,
  RemoveNudgeTool,
  NudgeListTool,
  WakeupTool,
  createNudgeTools,
} from '../providers/NudgeTools.js';
import {
  EnterPlanModeTool,
  ExitPlanModeTool,
  createPlanModeTools,
} from '../providers/PlanModeTools.js';

const ctx = { turnNumber: 1, state: {}, metadata: {} };

describe('NudgeStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('creates a job with incremental ID', () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const job = store.create('test prompt', 60_000);
    expect(job.id).toBe('nudge-1');
    expect(job.prompt).toBe('test prompt');
    expect(job.intervalMs).toBe(60_000);
    expect(job.status).toBe('active');
    store.shutdown();
  });

  it('fires recurring job on interval', () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    store.create('ping', 1000, { recurring: true });
    vi.advanceTimersByTime(3500);
    expect(executor).toHaveBeenCalledTimes(3);
    expect(executor).toHaveBeenCalledWith('ping', 'nudge-1', false);
    store.shutdown();
  });

  it('fires one-shot job once then removes', () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    store.create('once', 1000, { recurring: false });
    vi.advanceTimersByTime(3000);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(store.list().length).toBe(0);
    store.shutdown();
  });

  it('deletes a job', () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const job = store.create('del', 1000);
    expect(store.delete(job.id)).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(executor).not.toHaveBeenCalled();
    store.shutdown();
  });

  it('returns false for deleting nonexistent job', () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    expect(store.delete('nudge-999')).toBe(false);
    store.shutdown();
  });

  it('respects idleCheck — skips fire when not idle', () => {
    const executor = vi.fn();
    let idle = false;
    const store = new NudgeStore(executor, { idleCheck: () => idle });
    store.create('gated', 1000, { recurring: true });
    vi.advanceTimersByTime(2500);
    expect(executor).not.toHaveBeenCalled();
    idle = true;
    vi.advanceTimersByTime(1000);
    expect(executor).toHaveBeenCalledTimes(1);
    store.shutdown();
  });

  it('expires recurring jobs after 7 days by default', () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    store.create('expire', 60_000, { recurring: true });
    // Advance 7 days + 1 minute
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 60_000);
    const job = store.get('nudge-1');
    expect(job?.status).toBe('expired');
    store.shutdown();
  });

  it('lists all jobs', () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    store.create('a', 1000);
    store.create('b', 2000);
    expect(store.list().length).toBe(2);
    store.shutdown();
  });

  it('shutdown clears all timers', () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    store.create('x', 1000);
    store.shutdown();
    vi.advanceTimersByTime(5000);
    expect(executor).not.toHaveBeenCalled();
  });
});

describe('SetNudgeTool', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('creates a recurring schedule', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new SetNudgeTool(store);
    const result = await tool.execute({ interval: '5m', prompt: 'check status', recurring: true }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('nudge-1');
    expect(result.data).toContain('every 5m');
    store.shutdown();
  });

  it('creates a one-shot schedule', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new SetNudgeTool(store);
    const result = await tool.execute({ interval: '30s', prompt: 'remind', recurring: false }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('once in 30s');
    store.shutdown();
  });

  it('rejects invalid interval format', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new SetNudgeTool(store);
    const result = await tool.execute({ interval: 'banana', prompt: 'x' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGS');
    store.shutdown();
  });

  it('rejects interval less than 10 seconds', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new SetNudgeTool(store);
    const result = await tool.execute({ interval: '5s', prompt: 'too fast' }, ctx);
    expect(result.success).toBe(false);
    store.shutdown();
  });

  it('parses various interval formats', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new SetNudgeTool(store);

    await tool.execute({ interval: '30s', prompt: 'a' }, ctx);
    await tool.execute({ interval: '2m', prompt: 'b' }, ctx);
    await tool.execute({ interval: '1h', prompt: 'c' }, ctx);
    await tool.execute({ interval: '1d', prompt: 'd' }, ctx);

    const jobs = store.list();
    expect(jobs[0].intervalMs).toBe(30_000);
    expect(jobs[1].intervalMs).toBe(120_000);
    expect(jobs[2].intervalMs).toBe(3_600_000);
    expect(jobs[3].intervalMs).toBe(86_400_000);
    store.shutdown();
  });
});

describe('RemoveNudgeTool', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('deletes an existing job', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    store.create('x', 60_000);
    const tool = new RemoveNudgeTool(store);
    const result = await tool.execute({ job_id: 'nudge-1' }, ctx);
    expect(result.success).toBe(true);
    expect(store.list().length).toBe(0);
    store.shutdown();
  });

  it('fails for nonexistent job', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new RemoveNudgeTool(store);
    const result = await tool.execute({ job_id: 'nudge-999' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    store.shutdown();
  });
});

describe('NudgeListTool', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lists all jobs with details', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    store.create('prompt A', 60_000, { recurring: true });
    store.create('prompt B', 120_000, { recurring: false });
    const tool = new NudgeListTool(store);
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('nudge-1');
    expect(data).toContain('nudge-2');
    expect(data).toContain('recurring');
    expect(data).toContain('one-shot');
    store.shutdown();
  });

  it('returns "No scheduled jobs" when empty', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new NudgeListTool(store);
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toBe('No scheduled jobs.');
    store.shutdown();
  });
});

describe('WakeupTool', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('creates a one-shot wakeup', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new WakeupTool(store);
    const result = await tool.execute({ delay: '2m', prompt: 'check CI', reason: 'Waiting for pipeline' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('nudge-1');
    expect(result.data).toContain('Waiting for pipeline');
    store.shutdown();
  });

  it('fires the wakeup after the delay', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new WakeupTool(store);
    await tool.execute({ delay: '30s', prompt: 'wake', reason: 'test' }, ctx);
    vi.advanceTimersByTime(30_000);
    expect(executor).toHaveBeenCalledWith('wake', 'nudge-1', false);
    store.shutdown();
  });

  it('rejects delay over 1 hour', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new WakeupTool(store);
    const result = await tool.execute({ delay: '2h', prompt: 'x', reason: 'y' }, ctx);
    expect(result.success).toBe(false);
    store.shutdown();
  });

  it('requires all three arguments', async () => {
    const executor = vi.fn();
    const store = new NudgeStore(executor);
    const tool = new WakeupTool(store);
    const r1 = await tool.execute({ delay: '1m', prompt: 'x' }, ctx);
    expect(r1.success).toBe(false);
    const r2 = await tool.execute({ delay: '1m', reason: 'y' }, ctx);
    expect(r2.success).toBe(false);
    store.shutdown();
  });
});

describe('createNudgeTools', () => {
  it('returns store and 4 tools', () => {
    const { store, tools } = createNudgeTools(vi.fn());
    expect(tools.length).toBe(4);
    const names = tools.map(t => t.name);
    expect(names).toContain('set_nudge');
    expect(names).toContain('remove_nudge');
    expect(names).toContain('nudge_list');
    expect(names).toContain('wakeup');
    store.shutdown();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan Mode Tools
// ─────────────────────────────────────────────────────────────────────────────

describe('EnterPlanModeTool', () => {
  it('returns success with instructions', async () => {
    const tool = new EnterPlanModeTool();
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('plan mode');
  });

  it('fires onEnterPlan callback', async () => {
    const onEnterPlan = vi.fn();
    const tool = new EnterPlanModeTool({ onEnterPlan });
    await tool.execute({}, ctx);
    expect(onEnterPlan).toHaveBeenCalled();
  });
});

describe('ExitPlanModeTool', () => {
  it('returns success with plan submitted message', async () => {
    const tool = new ExitPlanModeTool();
    const result = await tool.execute({ plan: '## Steps\n1. Do thing\n2. Do other' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('submitted');
  });

  it('fails without plan text', async () => {
    const tool = new ExitPlanModeTool();
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGS');
  });

  it('fires onExitPlan callback with plan text', async () => {
    const onExitPlan = vi.fn();
    const tool = new ExitPlanModeTool({ onExitPlan });
    await tool.execute({ plan: 'my plan' }, ctx);
    expect(onExitPlan).toHaveBeenCalledWith(expect.any(String), 'my plan');
  });
});

describe('createPlanModeTools', () => {
  it('returns 2 tools', () => {
    const tools = createPlanModeTools();
    expect(tools.length).toBe(2);
    const names = tools.map(t => t.name);
    expect(names).toContain('enter_plan_mode');
    expect(names).toContain('exit_plan_mode');
  });
});
