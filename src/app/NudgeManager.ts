/** NudgeManager — manages user/tool-created nudges (created via /nudge REPL or set_nudge tool). */

import type { NudgeStore } from '../providers/index.js';
import { parseScheduleInterval } from '../providers/NudgeTools.js';
import { ScheduledPrompt } from './ScheduledPrompt.js';

/**
 * Describes a nudge that is currently active on a channel.
 */
export interface ActiveNudge {
  jobId: string;
  channel: string;
  prompt: string;
  fireCount: number;
  status: string;
  every?: string;
}

/**
 * Nudge manager class. Handles user/tool-created nudges only.
 * Each nudge is backed by a ScheduledPrompt for lifecycle management.
 * Auto-nudge / history scribe is managed separately by ChannelLifecycle.
 */
export class NudgeManager {
  /** Per-channel nudge stores. */
  private _nudgeStores = new Map<string, NudgeStore>();
  /** Reverse lookup: jobId -> channel name, for delete/list. */
  private _jobToChannel = new Map<string, string>();
  /** Tracks ScheduledPrompt instances by job ID so delete() can clean them up. */
  private _prompts = new Map<string, ScheduledPrompt>();

  /** Register a channel's nudge store. Called when a ChannelAgent is created. */
  registerStore(chName: string, store: NudgeStore): void {
    this._nudgeStores.set(chName, store);
  }

  /** Get a channel's nudge store, or undefined if not yet registered. */
  getStore(chName: string): NudgeStore | undefined {
    return this._nudgeStores.get(chName);
  }

  /** Unregister a channel's nudge store (on channel leave). */
  unregisterStore(chName: string): void {
    this._nudgeStores.delete(chName);
    // Stop any prompts for this channel
    for (const [jobId, ch] of this._jobToChannel) {
      if (ch === chName) {
        this._prompts.get(jobId)?.stop();
        this._prompts.delete(jobId);
        this._jobToChannel.delete(jobId);
      }
    }
  }

  /** List all active nudges, optionally filtered by channel. */
  list(chName?: string): ActiveNudge[] {
    const result: ActiveNudge[] = [];
    for (const [ch, store] of this._nudgeStores) {
      if (chName && ch !== chName) continue;
      for (const job of store.list()) {
        result.push({
          jobId: job.id,
          channel: ch,
          prompt: job.prompt,
          fireCount: job.fireCount,
          status: job.status,
          every: this._fmt(job.intervalMs),
        });
      }
    }
    return result;
  }

  /**
   * Format milliseconds to a human-readable interval string (e.g. "5m", "2d").
   */
  private _fmt(ms: number): string {
    if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)}d`;
    if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
    if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
    return `${Math.round(ms / 1000)}s`;
  }

  /** Create a nudge on a channel immediately. Returns the job ID or null if channel has no store. */
  create(chName: string, every: string, prompt: string): string | null {
    const store = this._nudgeStores.get(chName);
    if (!store) return null;
    const ms = parseScheduleInterval(every);
    if (ms <= 0) return null;
    const sp = new ScheduledPrompt(store);
    const jobId = sp.start(prompt, ms, {
      hidden: false,
      expiresInMs: 7 * 24 * 60 * 60 * 1000,
    });
    if (!jobId) return null;
    this._jobToChannel.set(jobId, chName);
    this._prompts.set(jobId, sp);
    return jobId;
  }

  /** Delete a nudge by job ID. Returns true if found and deleted. */
  delete(jobId: string): boolean {
    const chName = this._jobToChannel.get(jobId);
    if (!chName) return false;
    const sp = this._prompts.get(jobId);
    if (!sp) return false;
    sp.stop();
    this._prompts.delete(jobId);
    this._jobToChannel.delete(jobId);
    return true;
  }
}
