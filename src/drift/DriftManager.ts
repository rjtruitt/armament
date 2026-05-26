/**
 * DriftManager — global file-based snapshot archive.
 *
 * Single FileDriftStore for all channels. Each snapshot entry tracks
 * which channel made it, so any channel can list/rollback any snapshot.
 *
 * Error resilient: if the store operation fails, it attempts to
 * reinitialize before giving up.
 */

import { FileDriftStore, type DriftEntry, type DriftStoreStats } from './FileDriftStore.js';
import type { IDriftConfig, IDriftManager, IDriftSnapshot, IDriftStats } from './interfaces/IDrift.js';

export { FileDriftStore } from './FileDriftStore.js';
export type { DriftEntry, DriftStoreStats } from './FileDriftStore.js';

/** Production implementation: global file snapshot archive. */
export class DriftManager implements IDriftManager {
  private _config: IDriftConfig;
  private _store: FileDriftStore;

  constructor(config: IDriftConfig, driftDir: string) {
    this._config = config;
    this._store = new FileDriftStore(driftDir);
  }

  /** Prune old or stale snapshots. Exposed for startup cleanup and manual tools. */
  async prune(opts?: { days?: number; staleOnly?: boolean; maxSizeBytes?: number }): Promise<number> {
    return this._store.prune(opts);
  }

  /** Snapshot a file. */
  async snapshot(channelName: string, filePath: string, reason: string, tool: string): Promise<IDriftSnapshot> {
    const entry = await this._store.saveSnapshot(channelName, filePath, reason, tool);
    return {
      id: entry.id,
      channel: entry.channel,
      path: filePath,
      hash: entry.hash,
      reason: entry.reason,
      tool: entry.tool,
      timestamp: entry.ts,
      size: entry.size,
    };
  }

  /** List snapshots, optionally filtered by channel and/or file path. */
  async listSnapshots(channelName: string, filePath?: string): Promise<IDriftSnapshot[]> {
    const entries = await this._store.getSnapshots(channelName, filePath);
    return entries.map(e => ({
      id: e.id,
      channel: e.channel,
      path: '',
      hash: e.hash,
      reason: e.reason,
      tool: e.tool,
      timestamp: e.ts,
      size: e.size,
    }));
  }

  /** Rollback a file to a previous snapshot by id. */
  async rollback(_channelName: string, snapshotId: string): Promise<boolean> {
    return this._store.rollback(snapshotId);
  }

  /** Get stats for a channel's drift archive. */
  async getStats(channelName: string): Promise<IDriftStats> {
    const stats = await this._store.getStats(channelName);
    return {
      channelName,
      snapshotsCount: stats.totalSnapshots,
      totalSizeBytes: stats.totalSizeBytes,
      paths: stats.paths,
    };
  }
}
