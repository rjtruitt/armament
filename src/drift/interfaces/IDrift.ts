/**
 * Drift interfaces — file-based snapshot archive.
 * No git tags, no worktrees, no multi-project.
 * Single global store at ~/.arma/drift/, entries tagged by channel.
 */

export interface IDriftConfig {
  enabled?: boolean;
  /** Auto-prune snapshots older than this many days on startup (0 = disabled). Default: 0. */
  retentionDays?: number;
  /** On startup, prune snapshots for files that no longer exist. Default: true. */
  autoPruneStaleOnStart?: boolean;
  /** Max total bytes for drift store. Auto-prunes oldest snapshots when exceeded. Default: 0 (unlimited). */
  maxSizeBytes?: number;
}

/** A single file snapshot in the archive. */
export interface IDriftSnapshot {
  id: string;
  channel: string;
  path: string;
  hash: string;
  reason: string;
  tool: string;
  timestamp: number;
  size: number;
}

/** Stats for a channel's drift archive. */
export interface IDriftStats {
  channelName: string;
  snapshotsCount: number;
  totalSizeBytes: number;
  paths: string[];
}

/** Manages per-channel file snapshot archives. */
export interface IDriftManager {
  snapshot(channelName: string, filePath: string, reason: string, tool: string): Promise<IDriftSnapshot>;
  listSnapshots(channelName: string, filePath?: string): Promise<IDriftSnapshot[]>;
  rollback(channelName: string, snapshotId: string): Promise<boolean>;
  getStats(channelName: string): Promise<IDriftStats>;
  getPerFileStats(): Promise<Array<{ path: string; count: number; totalSize: number; newest: number }>>;
  readSnapshotContent(id: string): Promise<{ content: string; filePath: string } | null>;
}
