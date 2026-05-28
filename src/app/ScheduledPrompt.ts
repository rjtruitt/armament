/**
 * ScheduledPrompt — reusable wrapper around a single recurring nudge job on a NudgeStore.
 *
 * Other features (HistoryScribe, status updates, etc.) can use this instead of
 * managing NudgeStore create/delete directly.
 *
 * Usage:
 *   const sp = new ScheduledPrompt(store);
 *   sp.start('Check CI status', 5 * 60 * 1000, { hidden: true, fireNow: true });
 *   sp.stop();        // cancel
 *   sp.restart(...);  // stop + start with new params
 */

import type { NudgeStore } from '../providers/index.js';

export interface ScheduledPromptOptions {
  hidden?: boolean;
  fireNow?: boolean;
  expiresInMs?: number;
}

export class ScheduledPrompt {
  private _jobId: string | null = null;
  private _store: NudgeStore | null = null;

  constructor(store?: NudgeStore) {
    if (store) this._store = store;
  }

  /** Attach or replace the backing NudgeStore. Cancels any active job first. */
  setStore(store: NudgeStore): void {
    this.stop();
    this._store = store;
  }

  /** Get the backing store (or null if not attached). */
  get store(): NudgeStore | null {
    return this._store;
  }

  /** Whether a recurring job is currently active. */
  get active(): boolean {
    return this._jobId !== null;
  }

  /** Get the current job ID, if any. */
  get jobId(): string | null {
    return this._jobId;
  }

  /**
   * Start (or restart) a recurring nudge job.
   * If a job was already running, it is cancelled first.
   * Returns the job ID, or null if no store is attached.
   */
  start(prompt: string, intervalMs: number, opts: ScheduledPromptOptions = {}): string | null {
    this.stop();
    if (!this._store) return null;
    const job = this._store.create(prompt, intervalMs, {
      recurring: true,
      hidden: opts.hidden ?? false,
      fireNow: opts.fireNow ?? false,
      expiresInMs: opts.expiresInMs ?? 7 * 24 * 60 * 60 * 1000,
    });
    this._jobId = job.id;
    return job.id;
  }

  /**
   * Cancel the current job, if any.
   */
  stop(): void {
    if (this._jobId && this._store) {
      this._store.delete(this._jobId);
    }
    this._jobId = null;
  }

  /**
   * Convenience: stop + start with new params.
   */
  restart(prompt: string, intervalMs: number, opts: ScheduledPromptOptions = {}): string | null {
    return this.start(prompt, intervalMs, opts);
  }
}
