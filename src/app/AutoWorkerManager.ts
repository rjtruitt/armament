/**
 * AutoWorkerManager — per-channel configurable background workers.
 *
 * Each channel has a config file at .armaws/auto-workers.json with per-type settings.
 * Worker types are defined by config + prompt templates — no hardcoded type list.
 * Any key in the config is a valid worker type. Add new types by creating a prompt
 * template and adding a config entry.
 *
 * Workers appear as sidebar sub-channels (unlike HistoryScribe which is hidden).
 * Workers only spawn when the channel has recent activity (user messages or agent
 * responses within maxIdleMinutes).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ChannelAgent } from '../providers/ChannelAgent.js';
import type { ChannelLifecycleCallbacks } from './ChannelLifecycleTypes.js';
import { getArmaPath, getChannelRoot } from './ChannelPaths.js';

/** Per-worker-type config entry. */
export interface WorkerTypeConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxIdleMinutes: number;
  model: string; // "" = use channel default
}

/** Per-channel config — Record<workerType, WorkerTypeConfig>. */
export type ChannelWorkerConfig = Record<string, WorkerTypeConfig>;

/** Default configs for new/unknown types. */
const DEFAULT_TYPE_CONFIG: Omit<WorkerTypeConfig, 'enabled'> = {
  intervalMinutes: 120,
  maxIdleMinutes: 15,
  model: '',
};

/** Dependencies injected from the host. */
export interface AutoWorkerManagerDeps {
  getChannelAgent(channel: string): ChannelAgent | undefined;
  getRuntime(channel: string): import('../a2a/TaskRuntime.js').TaskRuntime | undefined;
  getChannelMessages(channel: string): Array<{ type: string; sender: string; content: string; timestamp: Date }>;
  callbacks: ChannelLifecycleCallbacks;
  getChannelRoot(channel: string): string;
  getArmaPath(channel: string): string;
}

export class AutoWorkerManager {
  private deps: AutoWorkerManagerDeps;
  /** Per-channel config cache: channel → Record<type, WorkerTypeConfig>. */
  private _configs = new Map<string, ChannelWorkerConfig>();
  /** Per-channel per-type active timer handles: channel → Map<type, timer>. */
  private _timers = new Map<string, Map<string, ReturnType<typeof setInterval>>>();
  /** Per-channel last-known-active timestamp (updated on user message or agent activity). */
  private _lastActive = new Map<string, number>();
  /** Suppress file writes (set during tests). */
  private _noPersist = false;

  constructor(deps: AutoWorkerManagerDeps) {
    this.deps = deps;
  }

  /** Suppress config file writes (for test isolation). */
  setNoPersist(val: boolean): void { this._noPersist = val; }

  // ─── Config loading / saving ───────────────────────────────────────────────

  /** Full path to the auto-workers config file for a channel. */
  private configPath(channel: string): string {
    return join(this.deps.getArmaPath(channel), 'auto-workers.json');
  }

  /** Load config from disk. Returns empty config if file doesn't exist. */
  loadConfig(channel: string): ChannelWorkerConfig {
    const path = this.configPath(channel);
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return {};
    }
  }

  /** Save config to disk. */
  private saveConfig(channel: string, config: ChannelWorkerConfig): void {
    if (this._noPersist) return;
    const path = this.configPath(channel);
    try {
      mkdirSync(join(this.deps.getArmaPath(channel)), { recursive: true });
      writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
    } catch {
      // Best-effort
    }
  }

  /** Get config for a channel (cached, auto-loaded on first access). */
  getConfig(channel: string): ChannelWorkerConfig {
    let cfg = this._configs.get(channel);
    if (!cfg) {
      cfg = this.loadConfig(channel);
      this._configs.set(channel, cfg);
    }
    return cfg;
  }

  /** Get a specific worker type's config (with defaults for missing fields). */
  getWorkerConfig(channel: string, type: string): WorkerTypeConfig {
    const cfg = this.getConfig(channel);
    const existing = cfg[type];
    return {
      enabled: existing?.enabled ?? false,
      intervalMinutes: existing?.intervalMinutes ?? DEFAULT_TYPE_CONFIG.intervalMinutes,
      maxIdleMinutes: existing?.maxIdleMinutes ?? DEFAULT_TYPE_CONFIG.maxIdleMinutes,
      model: existing?.model ?? '',
    };
  }

  // ─── Config mutations ──────────────────────────────────────────────────────

  /** Enable or disable a worker type. Ensures the config entry exists. */
  setWorkerEnabled(channel: string, type: string, enabled: boolean): void {
    const cfg = this.getConfig(channel);
    if (!cfg[type]) {
      cfg[type] = { ...DEFAULT_TYPE_CONFIG, enabled };
    } else {
      cfg[type].enabled = enabled;
    }
    this.saveConfig(channel, cfg);
    this._rescheduleChannel(channel);
  }

  /** Set the spawn interval for a worker type. */
  setWorkerInterval(channel: string, type: string, minutes: number): void {
    const cfg = this.getConfig(channel);
    if (!cfg[type]) cfg[type] = { ...DEFAULT_TYPE_CONFIG, enabled: false };
    cfg[type].intervalMinutes = Math.max(1, minutes);
    this.saveConfig(channel, cfg);
    this._rescheduleChannel(channel);
  }

  /** Set the max idle time before skipping this worker. */
  setWorkerMaxIdle(channel: string, type: string, minutes: number): void {
    const cfg = this.getConfig(channel);
    if (!cfg[type]) cfg[type] = { ...DEFAULT_TYPE_CONFIG, enabled: false };
    cfg[type].maxIdleMinutes = Math.max(1, minutes);
    this.saveConfig(channel, cfg);
  }

  /** Set the model override for a worker type ("" = channel default). */
  setWorkerModel(channel: string, type: string, model: string): void {
    const cfg = this.getConfig(channel);
    if (!cfg[type]) cfg[type] = { ...DEFAULT_TYPE_CONFIG, enabled: false };
    cfg[type].model = model;
    this.saveConfig(channel, cfg);
  }

  // ─── Channel lifecycle ────────────────────────────────────────────────────

  /** Start timers for all enabled worker types on a channel. */
  startChannel(channel: string): void {
    this._lastActive.set(channel, Date.now());
    this._rescheduleChannel(channel);
  }

  /** Stop all timers for a channel and clear cached config. */
  stopChannel(channel: string): void {
    this._stopTimers(channel);
    this._configs.delete(channel);
    this._lastActive.delete(channel);
  }

  /** Call this when any user message or agent response occurs on the channel. */
  markActive(channel: string): void {
    this._lastActive.set(channel, Date.now());
  }

  // ─── Internal: timer management ────────────────────────────────────────────

  /** Stop all timers for a channel. */
  private _stopTimers(channel: string): void {
    const timers = this._timers.get(channel);
    if (timers) {
      for (const t of timers.values()) clearInterval(t);
      this._timers.delete(channel);
    }
  }

  /** Stop + restart timers for a channel based on current config. */
  private _rescheduleChannel(channel: string): void {
    this._stopTimers(channel);
    const cfg = this.getConfig(channel);
    const newTimers = new Map<string, ReturnType<typeof setInterval>>();

    for (const [type, wc] of Object.entries(cfg)) {
      if (!wc.enabled) continue;
      const intervalMs = wc.intervalMinutes * 60 * 1000;
      const timer = setInterval(() => {
        this._checkAndSpawn(channel, type, wc);
      }, intervalMs);
      newTimers.set(type, timer);
      // Fire immediately if channel has been active recently
      const lastActive = this._lastActive.get(channel) ?? 0;
      if (Date.now() - lastActive < wc.maxIdleMinutes * 60 * 1000) {
        setTimeout(() => this._checkAndSpawn(channel, type, wc), 5000);
      }
    }

    if (newTimers.size > 0) this._timers.set(channel, newTimers);
  }

  /** Check conditions and spawn a worker if appropriate. */
  private _checkAndSpawn(channel: string, type: string, wc: WorkerTypeConfig): void {
    const agent = this.deps.getChannelAgent(channel);
    if (!agent || agent.status !== 'idle') return;

    // Idle guard: don't spawn if channel has been inactive for too long
    const lastActive = this._lastActive.get(channel) ?? 0;
    const idleDuration = Date.now() - lastActive;
    if (idleDuration >= wc.maxIdleMinutes * 60 * 1000) return;

    // Load the prompt template
    const promptPath = join(this.deps.getArmaPath(channel), `auto-worker-${type}.md`);
    if (!existsSync(promptPath)) return;
    const template = readFileSync(promptPath, 'utf-8').trim();
    if (!template) return;

    const channelRoot = this.deps.getChannelRoot(channel);
    const prompt = template
      .replace(/\{channel\}/g, channel)
      .replace(/\{workspace\}/g, channelRoot);

    const runtime = this.deps.getRuntime(channel);
    if (!runtime) return;

    const workerId = `autowkr-${channel.slice(1)}-${type}-${Date.now()}`;
    const model = wc.model || undefined; // undefined = channel default

    // Spawn silently (no notification message) — worker will show in sidebar
    runtime.spawnWorker(workerId, prompt, model, undefined, undefined, undefined, true)
      .then((result) => {
        if (!result.success) {
          this.deps.callbacks.writeMessage('system', 'err',
            `Auto-worker ${type} failed to spawn: ${result.error ?? 'unknown'}`, channel);
        }
      })
      .catch(() => {});
  }
}
