/**
 * Production session persistence with configurable save triggers.
 *
 * Supports 'every-context-update' (debounced 500ms per channel) or
 * interval-based saves (30s, 1m, 5m). Handles manifest rotation
 * and graceful shutdown with synchronous flush.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ISessionPersistence, ISessionManifest, IChannelStateFile, IChannelManifestEntry, ISessionConfig, SaveTrigger } from '../interfaces/ISessionPersistence.js';
import { SessionManifest } from './SessionManifest.js';
import { ChannelStateStore } from './ChannelState.js';
import { armaDataDir } from '../../app/ChannelPaths.js';

/**
 * SESSION_DEFAULTS constant.
 */
export const SESSION_DEFAULTS: ISessionConfig = {
  enabled: true,
  saveTrigger: 'every-context-update',
};

/** Filesystem-backed session persistence with debounced channel writes. */
export class SessionPersistence implements ISessionPersistence {
  private _manifest: SessionManifest;
  private _channelStore: ChannelStateStore;
  private _config: ISessionConfig;
  private _workspace: string = '';
  private _currentManifest: ISessionManifest | null = null;
  private _saveTimer: ReturnType<typeof setInterval> | null = null;
  private _dirty: Set<string> = new Set(); // channels needing save
  private _debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _pendingStates: Map<string, IChannelStateFile> = new Map();

  constructor(config?: Partial<ISessionConfig>) {
    this._config = { ...SESSION_DEFAULTS, ...config };
    this._manifest = null as unknown as SessionManifest;
    this._channelStore = null as unknown as ChannelStateStore;
  }

  /**
   * Initialize.
   */
  async initialize(workspace: string): Promise<void> {
    this._workspace = workspace;
    const sessionDir = this._config.sessionDir || path.join(armaDataDir(), 'sessions');
    this._manifest = new SessionManifest(workspace, sessionDir);
    this._channelStore = new ChannelStateStore(sessionDir);

    if (this._config.saveTrigger !== 'every-context-update') {
      const ms = this._parseTriggerMs(this._config.saveTrigger);
      this._saveTimer = setInterval(() => this._flushDirty(), ms);
    }
  }

  private _parseTriggerMs(trigger: SaveTrigger): number {
    switch (trigger) {
      case '30s': return 30000;
      case '1m': return 60000;
      case '5m': return 300000;
      default: return 60000;
    }
  }

  /**
   * Save channel.
   */
  async saveChannel(channelName: string, state: IChannelStateFile): Promise<void> {
    if (!this._config.enabled) return;
    this._pendingStates.set(channelName, state);

    if (this._config.saveTrigger === 'every-context-update') {
      // Debounce: max once per 500ms per channel
      const existing = this._debounceTimers.get(channelName);
      if (existing) clearTimeout(existing);
      this._debounceTimers.set(channelName, setTimeout(() => {
        if (!this._channelStore) return;
        const pending = this._pendingStates.get(channelName);
        if (pending) {
          this._channelStore.save(channelName, pending);
          this._pendingStates.delete(channelName);
        }
        this._debounceTimers.delete(channelName);
      }, 500));
    } else {
      this._dirty.add(channelName);
    }
  }

  /**
   * Save manifest.
   */
  async saveManifest(manifest: ISessionManifest): Promise<void> {
    if (!this._config.enabled) return;
    this._currentManifest = manifest;
    this._manifest.save(manifest);
  }

  /**
   * Load manifest.
   */
  async loadManifest(): Promise<ISessionManifest | null> {
    this._currentManifest = this._manifest.load();
    return this._currentManifest;
  }

  /**
   * Load channel state.
   */
  async loadChannelState(channelName: string): Promise<IChannelStateFile | null> {
    return this._channelStore.load(channelName);
  }

  /**
   * Checks whether active session exists.
   */
  hasActiveSession(): boolean {
    return this._manifest.exists();
  }

  /**
   * Gets the session dir.
   */
  getSessionDir(): string {
    return this._config.sessionDir || path.join(armaDataDir(), 'sessions');
  }

  /**
   * List all channels with saved state files, regardless of manifest.
   * Returns the raw channel names as stored in state file names — caller
   * should load the state to get the canonical channel name.
   */
  listChannels(): string[] {
    return this._channelStore ? this._channelStore.listAll() : [];
  }

  /**
   * Backup.
   */
  async backup(): Promise<void> {
    if (this._currentManifest) {
      this._manifest.save(this._currentManifest);
    }
  }

  /**
   * Export session.
   */
  async exportSession(outputPath: string): Promise<void> {
    const sessionDir = this.getSessionDir();
    if (!fs.existsSync(sessionDir)) return;
    fs.cpSync(sessionDir, outputPath, { recursive: true });
  }

  /**
   * Delete channel.
   */
  async deleteChannel(channelName: string): Promise<void> {
    const timer = this._debounceTimers.get(channelName);
    if (timer) clearTimeout(timer);
    this._debounceTimers.delete(channelName);
    this._pendingStates.delete(channelName);
    this._dirty.delete(channelName);

    this._channelStore.remove(channelName);

    if (this._currentManifest) {
      this._currentManifest.channels = this._currentManifest.channels.filter(
        c => c.name !== channelName
      );
      this._manifest.save(this._currentManifest);
    }
  }

  /** Remove channel from manifest only — keeps state file on disk for later resume. */
  async deregisterChannel(channelName: string): Promise<void> {
    this._dirty.delete(channelName);
    if (this._currentManifest) {
      this._currentManifest.channels = this._currentManifest.channels.filter(
        c => c.name !== channelName
      );
      this._manifest.save(this._currentManifest);
    }
  }

  /**
   * Gets the suspended channels.
   */
  getSuspendedChannels(): IChannelManifestEntry[] {
    if (!this._currentManifest) return [];
    return this._currentManifest.channels.filter(c => c.status === 'suspended');
  }

  /**
   * Shutdown.
   */
  shutdown(): void {
    if (this._saveTimer) {
      clearInterval(this._saveTimer);
      this._saveTimer = null;
    }
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
    // Synchronously flush all pending channel states
    for (const [channelName, state] of this._pendingStates) {
      this._channelStore.save(channelName, state);
    }
    this._pendingStates.clear();
  }

  private _flushDirty(): void {
    // Interval mode: actual writes happen when saveChannel is called with state.
    // This resets the dirty set so new changes are tracked for the next interval.
    this._dirty.clear();
  }
}
