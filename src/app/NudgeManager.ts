/** NudgeManager — reads core-nudges.md and manages per-channel scheduled prompts. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NudgeStore } from '../providers/index.js';
import { parseScheduleInterval } from '../providers/NudgeTools.js';
import { armaDataDir } from './ChannelPaths.js';

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

const NUDGE_FILE = join(armaDataDir(), 'core-nudges.md');

/**
 * Nudge manager class.
 */
export class NudgeManager {
  /** Per-channel nudge stores. */
  private _nudgeStores = new Map<string, NudgeStore>();
  /** Tracks which channels have had their nudges loaded. */
  private _loadedChannels = new Set<string>();
  /** Cached parsed prompt text (read once from core-nudges.md). */
  private _prompt: string | null = null;
  /** Reverse lookup: jobId → channel name, for delete/list. */
  private _jobToChannel = new Map<string, string>();

  /** Register a channel's nudge store. Called when a ChannelAgent is created. */
  registerStore(chName: string, store: NudgeStore): void {
    this._nudgeStores.set(chName, store);
  }

  /** Unregister a channel's nudge store (on channel leave). */
  unregisterStore(chName: string): void {
    this._nudgeStores.delete(chName);
    this._loadedChannels.delete(chName);
    // Clean up job-to-channel mapping
    for (const [jobId, ch] of this._jobToChannel) {
      if (ch === chName) this._jobToChannel.delete(jobId);
    }
  }

  /** Load nudges from core-nudges.md for a specific channel. Called once per channel after first user message. */
  loadForChannel(chName: string): void {
    if (this._loadedChannels.has(chName)) return;
    const store = this._nudgeStores.get(chName);
    if (!store) return;

    let prompt: string | null = null;

    if (!this._prompt) {
      if (!existsSync(NUDGE_FILE)) {
        this._loadedChannels.add(chName);
        return;
      }
      const content = readFileSync(NUDGE_FILE, 'utf-8');
      this._prompt = this._extractPrompt(content);
    }
    prompt = this._prompt;

    if (!prompt) {
      this._loadedChannels.add(chName);
      return;
    }

    // Default 5m interval — single prompt from file content
    const job = store.create(prompt, 5 * 60 * 1000, {
      recurring: true,
      hidden: true,
      fireNow: true,
      expiresInMs: 7 * 24 * 60 * 60 * 1000,
    });
    this._jobToChannel.set(job.id, chName);
    this._loadedChannels.add(chName);
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
    const job = store.create(prompt, ms, {
      recurring: true,
      hidden: false,
      expiresInMs: 7 * 24 * 60 * 60 * 1000,
    });
    this._jobToChannel.set(job.id, chName);
    return job.id;
  }

  /** Delete a nudge by job ID. Returns true if found and deleted. */
  delete(jobId: string): boolean {
    const chName = this._jobToChannel.get(jobId);
    if (!chName) return false;
    const store = this._nudgeStores.get(chName);
    if (!store) return false;
    const ok = store.delete(jobId);
    if (ok) this._jobToChannel.delete(jobId);
    return ok;
  }

  // --- Private ---

  /**
   * Extract the prompt text from core-nudges.md content.
   * Strips # header lines and content inside fenced code blocks (```).
   * The remaining lines are joined with newlines and returned as a single prompt string.
   * @returns The extracted prompt, or null if content is empty after filtering.
   */
  private _extractPrompt(content: string): string | null {
    const lines: string[] = [];
    let inFence = false;
    for (const raw of content.split('\n')) {
      const line = raw.trimEnd();
      // Skip fenced code blocks
      if (/^```/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      // Skip heading/comment lines
      if (/^#/.test(line)) continue;
      // Skip blank lines at start
      if (lines.length === 0 && line.trim() === '') continue;
      lines.push(line);
    }
    const prompt = lines.map(l => l.trim()).join('\n').trim();
    return prompt.length > 0 ? prompt : null;
  }

}
