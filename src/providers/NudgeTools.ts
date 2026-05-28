/** Nudge tools — recurring or one-shot timed prompts via setInterval/setTimeout. */

import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';

/**
 * NudgeStatus type definition.
 */
export type NudgeStatus = 'active' | 'paused' | 'fired' | 'expired';

/** Represents a scheduled nudge with timing, recurrence, and execution state. */
export interface NudgeJob {
  id: string;
  prompt: string;
  intervalMs: number;
  recurring: boolean;
  durable: boolean;
  hidden: boolean;
  skipIdleCheck: boolean;
  status: NudgeStatus;
  createdAt: number;
  lastFiredAt?: number;
  nextFireAt: number;
  fireCount: number;
  expiresAt?: number;
}

/** Callback invoked when a nudge fires. */
export interface NudgeExecutor {
  (prompt: string, jobId: string, hidden?: boolean): void;
}

/** In-memory store managing timer-based nudges with idle-gating. */
export class NudgeStore {
  private jobs: Map<string, NudgeJob> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>> = new Map();
  private counter = 0;
  private executor: NudgeExecutor;
  private idleCheck?: () => boolean;

  constructor(executor: NudgeExecutor, opts?: { idleCheck?: () => boolean }) {
    this.executor = executor;
    this.idleCheck = opts?.idleCheck;
  }

  /**
   * Create.
   */
  create(prompt: string, intervalMs: number, opts?: { recurring?: boolean; durable?: boolean; hidden?: boolean; skipIdleCheck?: boolean; fireNow?: boolean; expiresInMs?: number }): NudgeJob {
    const id = `nudge-${++this.counter}`;
    const recurring = opts?.recurring ?? true;
    const now = Date.now();
    const job: NudgeJob = {
      id,
      prompt,
      intervalMs,
      recurring,
      durable: opts?.durable ?? false,
      hidden: opts?.hidden ?? false,
      skipIdleCheck: opts?.skipIdleCheck ?? false,
      status: 'active',
      createdAt: now,
      nextFireAt: now + intervalMs,
      fireCount: 0,
      expiresAt: opts?.expiresInMs ? now + opts.expiresInMs : (recurring ? now + 7 * 24 * 60 * 60 * 1000 : undefined),
    };
    this.jobs.set(id, job);
    this.startTimer(job);
    if (opts?.fireNow) {
      // Fire immediately — skip idleCheck since this was explicitly requested at creation
      job.fireCount++;
      job.lastFiredAt = Date.now();
      this.executor(job.prompt, job.id, job.hidden);
    }
    return job;
  }

  /**
   * Delete.
   */
  delete(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    this.clearTimer(id);
    this.jobs.delete(id);
    return true;
  }

  /**
   * List.
   */
  list(): NudgeJob[] {
    return [...this.jobs.values()];
  }

  /**
   * Get.
   */
  get(id: string): NudgeJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Shutdown.
   */
  shutdown(): void {
    for (const id of this.timers.keys()) {
      this.clearTimer(id);
    }
    this.jobs.clear();
  }

  private startTimer(job: NudgeJob): void {
    if (job.recurring) {
      const timer = setInterval(() => this.fire(job.id), job.intervalMs);
      this.timers.set(job.id, timer);
    } else {
      const timer = setTimeout(() => this.fire(job.id), job.intervalMs);
      this.timers.set(job.id, timer);
    }
  }

  private fire(id: string): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'active') return;

    if (job.expiresAt && Date.now() > job.expiresAt) {
      job.status = 'expired';
      this.clearTimer(id);
      return;
    }

    if (this.idleCheck && !this.idleCheck() && !job.skipIdleCheck) {
      return;
    }

    job.lastFiredAt = Date.now();
    job.fireCount++;
    job.nextFireAt = Date.now() + job.intervalMs;

    this.executor(job.prompt, job.id, job.hidden);

    if (!job.recurring) {
      job.status = 'fired';
      this.clearTimer(id);
      this.jobs.delete(id);
    }
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearInterval(timer);
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}

/**
 * Parse schedule interval function.
 */
export function parseScheduleInterval(schedule: string): number {
  const match = schedule.match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day)s?$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit === 's' || unit === 'sec') return val * 1000;
    if (unit === 'm' || unit === 'min') return val * 60 * 1000;
    if (unit === 'h' || unit === 'hr') return val * 60 * 60 * 1000;
    if (unit === 'd' || unit === 'day') return val * 24 * 60 * 60 * 1000;
  }
  const num = parseInt(schedule, 10);
  if (!isNaN(num) && num > 0) return num * 1000;
  return 0;
}

/** Tool for creating recurring or one-shot nudges. */
export class SetNudgeTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'set_nudge';
  /**
   * description property.
   */
  readonly description = `Nudge the agent on a recurring or one-shot schedule.
  
Usage (every 5 min): {"interval": "5m", "prompt": "Check CI status for PR #47", "recurring": true}
Usage (one-shot in 30s): {"interval": "30s", "prompt": "Remind user: deploy freeze starts tomorrow", "recurring": false}

Interval format: "30s", "5m", "1h", "2d" (seconds, minutes, hours, days)

Options:
- recurring: true = fires repeatedly until deleted or expired (default, auto-expires after 7 days)
- recurring: false = fires once then auto-deletes
- durable: true = survives session restarts (saved to disk)
- durable: false = session-only (default)
- hidden: true = nudge is injected silently (not shown in chat), useful for background nudges

The nudge fires when the session is idle (not mid-query).
Returns a job ID for use with remove_nudge.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    interval: z.string().describe('How often to fire: "30s", "5m", "1h", "2d"'),
    prompt: z.string().describe('The prompt to enqueue at each fire time'),
    recurring: z.boolean().optional().describe('true = repeat until deleted (default). false = fire once.'),
    durable: z.boolean().optional().describe('true = persist across restarts. false = session-only (default).'),
    hidden: z.boolean().optional().describe('true = inject silently (no chat output). false = show in chat (default).'),
    fireNow: z.boolean().optional().describe('true = fire immediately on create, then on schedule. false = wait for first interval (default).'),
  });

  constructor(private store: NudgeStore) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { interval, prompt, recurring, durable, hidden, fireNow } = args as { interval: string; prompt: string; recurring?: boolean; durable?: boolean; hidden?: boolean; fireNow?: boolean };
    if (!interval || !prompt) {
      return { success: false, error: { message: 'interval and prompt are required', code: 'INVALID_ARGS' } };
    }
    const ms = parseScheduleInterval(interval);
    if (ms <= 0) {
      return { success: false, error: { message: `Invalid interval "${interval}". Use format like "30s", "5m", "1h", "2d".`, code: 'INVALID_ARGS' } };
    }
    if (ms < 10_000) {
      return { success: false, error: { message: `Interval too short (${ms}ms). Minimum is 10 seconds.`, code: 'INVALID_ARGS' } };
    }

    const job = this.store.create(prompt, ms, { recurring: recurring ?? true, durable: durable ?? false, hidden, fireNow });
    const label = job.recurring ? `every ${interval}` : `once in ${interval}`;
    return { success: true, data: `Scheduled ${job.id}: fires ${label}. Next fire: ${new Date(job.nextFireAt).toLocaleTimeString()}` };
  }
}

/** Tool for cancelling a previously scheduled nudge. */
export class RemoveNudgeTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'remove_nudge';
  /**
   * description property.
   */
  readonly description = `Cancel a nudge. It will not fire again.

Usage: {"job_id": "sched-1"}`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    job_id: z.string().describe('Job ID returned by set_nudge'),
  });

  constructor(private store: NudgeStore) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { job_id } = args as { job_id: string };
    if (!job_id) {
      return { success: false, error: { message: 'job_id is required', code: 'INVALID_ARGS' } };
    }
    const deleted = this.store.delete(job_id);
    if (!deleted) {
      return { success: false, error: { message: `Job not found: ${job_id}`, code: 'NOT_FOUND' } };
    }
    return { success: true, data: `Deleted ${job_id}. It will not fire again.` };
  }
}

/** Tool that lists all active/paused/expired nudges. */
export class NudgeListTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'nudge_list';
  /**
   * description property.
   */
  readonly description = `List all active nudges. No arguments needed.

Usage: {}

Shows each nudge's ID, interval, next fire time, status, and fire count.`;
  /**
   * schema property.
   */
  readonly schema = z.object({});

  constructor(private store: NudgeStore) {}

  /**
   * Execute.
   */
  async execute(_args: unknown, _context: ToolContext): Promise<ToolResult> {
    const jobs = this.store.list();
    if (jobs.length === 0) {
      return { success: true, data: 'No scheduled jobs.' };
    }
    const lines = jobs.map(j => {
      const next = j.status === 'active' ? ` next: ${new Date(j.nextFireAt).toLocaleTimeString()}` : '';
      const type = j.recurring ? 'recurring' : 'one-shot';
      const dur = j.durable ? ' [durable]' : '';
      const hd = j.hidden ? ' [hidden]' : '';
      return `${j.id}: [${j.status}] ${type} every ${formatMs(j.intervalMs)}${dur}${hd} — fired ${j.fireCount}x${next}`;
    });
    return { success: true, data: lines.join('\n') };
  }
}

/** Convenience tool for a one-shot delayed wakeup (self-pacing loops). */
export class WakeupTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'wakeup';
  /**
   * description property.
   */
  readonly description = `Schedule a one-shot wakeup after a delay. Use for self-pacing loops — e.g. "check back in 2 minutes."

Usage: {"delay": "2m", "prompt": "Check CI status for PR #47", "reason": "Waiting for CI pipeline (~3 min)"}

This is a convenience wrapper for a one-shot set_nudge. The prompt fires once after the delay, then auto-deletes.
- delay: how long to wait ("30s", "2m", "5m", "1h")
- reason: one sentence explaining why (shown to user and logged)

Use when waiting on external processes (CI, deploys, builds). Do NOT use to poll for worker results — those notify you automatically.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    delay: z.string().describe('How long to wait: "30s", "2m", "5m", "1h"'),
    prompt: z.string().describe('The prompt to fire after the delay'),
    reason: z.string().describe('One sentence: why this delay (shown to user)'),
  });

  constructor(private store: NudgeStore) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { delay, prompt, reason } = args as { delay: string; prompt: string; reason: string };
    if (!delay || !prompt || !reason) {
      return { success: false, error: { message: 'delay, prompt, and reason are required', code: 'INVALID_ARGS' } };
    }
    const ms = parseScheduleInterval(delay);
    if (ms <= 0) {
      return { success: false, error: { message: `Invalid delay "${delay}". Use format like "30s", "2m", "1h".`, code: 'INVALID_ARGS' } };
    }
    if (ms < 10_000) {
      return { success: false, error: { message: `Delay too short. Minimum is 10 seconds.`, code: 'INVALID_ARGS' } };
    }
    if (ms > 3_600_000) {
      return { success: false, error: { message: `Delay too long (max 1 hour). Use set_nudge for longer intervals.`, code: 'INVALID_ARGS' } };
    }

    const job = this.store.create(prompt, ms, { recurring: false, hidden: true });
    return { success: true, data: `Wakeup ${job.id} scheduled in ${delay}. Reason: ${reason}` };
  }
}

function formatMs(ms: number): string {
  if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)}d`;
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

/** Creates a NudgeStore and the five nudge tools that operate on it. */
export function createNudgeTools(executor: NudgeExecutor, opts?: { idleCheck?: () => boolean }): { store: NudgeStore; tools: ITool[] } {
  const store = new NudgeStore(executor, opts);
  return {
    store,
    tools: [
      new SetNudgeTool(store),
      new RemoveNudgeTool(store),
      new NudgeListTool(store),
      new WakeupTool(store),
    ],
  };
}
