/** Drift tools for agents to snapshot and roll back file changes. */

import type { ITool, ToolResult, ToolContext } from 'iteratio';
import type { DriftManager } from './DriftManager.js';
import { z } from 'zod';

/** DriftStatusTool — shows snapshot stats for this channel. */
export class DriftStatusTool implements ITool {
  readonly name = 'drift_status';
  readonly description = `Show drift snapshot status for this channel. Returns total snapshots, stored size, and tracked file paths. Use --path to filter by file.`;
  readonly schema = z.object({
    path: z.string().optional().describe('Optional file path to filter status by'),
  });

  constructor(private manager: DriftManager, private channel: string) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { path } = args as { path?: string };
    try {
      if (path) {
        const snapshots = await this.manager.listSnapshots(this.channel, path);
        return {
          success: true,
          data: { channel: this.channel, path, snapshots: snapshots.length, entries: snapshots },
        };
      }
      const stats = await this.manager.getStats(this.channel);
      return {
        success: true,
        data: {
          channel: stats.channelName,
          snapshotsCount: stats.snapshotsCount,
          totalSizeBytes: stats.totalSizeBytes,
          paths: stats.paths,
        },
      };
    } catch (e: unknown) {
      return { success: false, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
}

/** DriftSnapshotTool — manually snapshot a file. */
export class DriftSnapshotTool implements ITool {
  readonly name = 'drift_snapshot';
  readonly description = `Save a snapshot of a file's current state for later rollback. Used for tracking files changed via bash or other non-write/edit tools. Auto-snapshots happen automatically on write_file, edit_file, and append_file.`;
  readonly schema = z.object({
    path: z.string().describe('Absolute path to the file to snapshot'),
    reason: z.string().describe('Why this snapshot is being taken'),
  });

  constructor(private manager: DriftManager, private channel: string) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { path, reason } = args as { path: string; reason: string };
    if (!path) {
      return { success: false, error: { message: 'Missing required "path"' } };
    }
    if (!reason) {
      return { success: false, error: { message: 'Missing required "reason"' } };
    }
    try {
      const snapshot = await this.manager.snapshot(this.channel, path, reason, 'manual');
      return { success: true, data: snapshot };
    } catch (e: unknown) {
      return { success: false, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
}

/** DriftSnapshotListTool — list all snapshots, optionally filtered by path. */
export class DriftSnapshotListTool implements ITool {
  readonly name = 'drift_snapshots';
  readonly description = `List all snapshots for this channel. Use "path" to filter by file path. Returns snapshot IDs you can use with drift_rollback.`;
  readonly schema = z.object({
    path: z.string().optional().describe('Optional file path to filter snapshots by'),
  });

  constructor(private manager: DriftManager, private channel: string) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { path } = args as { path?: string };
    try {
      const snapshots = await this.manager.listSnapshots(this.channel, path);
      return { success: true, data: snapshots };
    } catch (e: unknown) {
      return { success: false, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
}

/** DriftRollbackTool — restore a file from a snapshot by id. */
export class DriftRollbackTool implements ITool {
  readonly name = 'drift_rollback';
  readonly description = `Restore a file to a previous state from a drift snapshot. Use a snapshot ID from drift_snapshots. Overwrites the current file content at its original path.`;
  readonly schema = z.object({
    id: z.string().describe('The snapshot ID to roll back to (e.g. "s_3"). Get IDs from drift_snapshots.'),
  });

  constructor(private manager: DriftManager, private channel: string) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { id } = args as { id: string };
    if (!id) {
      return { success: false, error: { message: 'Missing required "id". Use drift_snapshots to list available IDs.' } };
    }
    try {
      const ok = await this.manager.rollback(this.channel, id);
      if (ok) {
        return { success: true, data: `Rolled back snapshot ${id}` };
      }
      return { success: false, error: { message: `Snapshot "${id}" not found or content missing` } };
    } catch (e: unknown) {
      return { success: false, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
}

/** DriftPruneTool — prune old or stale snapshots. */
export class DriftPruneTool implements ITool {
  readonly name = 'drift_prune';
  readonly description = `Remove old drift snapshots to free disk space. Use --days to prune by age, --stale to prune snapshots for files that no longer exist.`;
  readonly schema = z.object({
    days: z.number().optional().describe('Remove snapshots older than this many days'),
    staleOnly: z.boolean().optional().describe('Only remove snapshots for paths that no longer exist'),
  });

  constructor(private manager: DriftManager, private channel: string) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { days, staleOnly } = args as { days?: number; staleOnly?: boolean };
    try {
      const count = await this.manager.prune({ days, staleOnly });
      let msg = `Pruned ${count} snapshot${count !== 1 ? 's' : ''}.`;
      if (days) msg += ` (older than ${days} days)`;
      if (staleOnly) msg += ` (stale paths only)`;
      return { success: true, data: msg };
    } catch (e: unknown) {
      return { success: false, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
}

/** Create the current set of drift tools. */
export function createDriftTools(manager: DriftManager, channel: string): ITool[] {
  return [
    new DriftStatusTool(manager, channel),
    new DriftSnapshotTool(manager, channel),
    new DriftSnapshotListTool(manager, channel),
    new DriftRollbackTool(manager, channel),
    new DriftPruneTool(manager, channel),
  ];
}
