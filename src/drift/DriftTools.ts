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
    new DriftTreeTool(manager),
  ];
}

/** DriftTreeTool — browse the drift snapshot filesystem like find/ls/du. */
export class DriftTreeTool implements ITool {
  readonly name = 'drift_tree';
  readonly description = `Browse the drift snapshot filesystem as a directory tree. Shows tracked files grouped by directory, with snapshot count and size. Use --path to zoom in, --depth to recurse, --du for sizes, --flat for a flat file list, --channel to filter by channel, --sort to order.`;

  readonly schema = z.object({
    path: z.string().optional().describe('Directory prefix to show (e.g. "armament/src/app"). Omit for root.'),
    depth: z.number().optional().describe('Max directory depth to recurse (default: 2, max: 5).'),
    du: z.boolean().optional().describe('Show human-readable sizes for each file/dir.'),
    flat: z.boolean().optional().describe('Show flat file list instead of tree (like find).'),
    channel: z.string().optional().describe('Filter snapshots by channel name (e.g. "#armament").'),
    sort: z.enum(['count', 'size', 'name', 'newest']).optional().describe('Sort by: count, size, name, or newest (default: count).'),
  });

  constructor(private manager: DriftManager) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { path, depth, du, flat, channel, sort } = args as {
      path?: string; depth?: number; du?: boolean; flat?: boolean;
      channel?: string; sort?: 'count' | 'size' | 'name' | 'newest';
    };
    try {
      const stats = await this.manager.getPerFileStats();
      const prefix = path ? (path.endsWith('/') ? path : path + '/') : '';
      const maxDepth = Math.min(depth ?? 2, 5);

      // Filter by path prefix
      let filtered = prefix
        ? stats.filter(s => s.path.startsWith(prefix))
        : stats;

      if (filtered.length === 0) {
        return { success: true, data: `No drift snapshots match path "${path ?? '(root)'}". Use drift_tree without --path to see all files.` };
      }

      // Build tree from flat file list
      interface TreeNode {
        name: string;
        isDir: boolean;
        count: number;
        totalSize: number;
        newest: number;
        channels: Map<string, number>;
        children: Map<string, TreeNode>;
      }

      const root: TreeNode = { name: '(drift)', isDir: true, count: 0, totalSize: 0, newest: 0, channels: new Map(), children: new Map() };

      for (const f of filtered) {
        let relPath = prefix ? f.path.slice(prefix.length) : f.path;
        if (relPath.startsWith('/')) relPath = relPath.slice(1);
        const parts = relPath.split('/');
        let node = root;
        // Walk directory parts
        for (let i = 0; i < parts.length - 1; i++) {
          const dirName = parts[i];
          if (!dirName) continue;
          if (!node.children.has(dirName)) {
            node.children.set(dirName, { name: dirName, isDir: true, count: 0, totalSize: 0, newest: 0, channels: new Map(), children: new Map() });
          }
          node = node.children.get(dirName)!;
        }
        // File leaf
        const fileName = parts[parts.length - 1];
        if (!fileName) continue;
        const leaf: TreeNode = { name: fileName, isDir: false, count: f.count, totalSize: f.totalSize, newest: f.newest, channels: new Map(), children: new Map() };
        leaf.channels.set('all', f.count);
        node.children.set(fileName, leaf);
      }

      // Propagate counts up — only for directories, NOT file leaves
      function accumulate(node: TreeNode): void {
        if (!node.isDir) return; // File leaves keep their own counts
        node.count = 0;
        node.totalSize = 0;
        node.newest = 0;
        for (const child of node.children.values()) {
          accumulate(child);
          node.count += child.count;
          node.totalSize += child.totalSize;
          if (child.newest > node.newest) node.newest = child.newest;
        }
      }
      accumulate(root);

      // Render
      const lines: string[] = [];
      const sortFns: Record<string, (a: TreeNode, b: TreeNode) => number> = {
        count: (a, b) => b.count - a.count,
        size: (a, b) => b.totalSize - a.totalSize,
        name: (a, b) => a.name.localeCompare(b.name),
        newest: (a, b) => b.newest - a.newest,
      };
      const sorter = sortFns[sort ?? 'count'];
      const showChannels = !!channel;

      function fmtSize(bytes: number): string {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
      }

      function fmtTime(ts: number): string {
        if (!ts) return '';
        const d = new Date(ts);
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${month}/${day}`;
      }

      function render(node: TreeNode, indent: string, isLast: boolean, d: number): void {
        const prefix2 = isLast ? '└── ' : '├── ';
        const connector = isLast ? '    ' : '│   ';
        let label = node.name;
        if (node.isDir) label += '/';

        if (du) {
          const sizeStr = fmtSize(node.totalSize);
          const dateStr = sort === 'newest' ? `, latest ${fmtTime(node.newest)}` : '';
          label += `  (${node.count} snaps, ${sizeStr}${dateStr})`;
        } else {
          const dateStr = sort === 'newest' ? `, latest ${fmtTime(node.newest)}` : '';
          label += `  (${node.count}${dateStr})`;
        }
        lines.push(indent + prefix2 + label);

        if (node.isDir && d < maxDepth) {
          const sorted = [...node.children.values()].sort(sorter);
          for (let i = 0; i < sorted.length; i++) {
            const child = sorted[i];
            const last = i === sorted.length - 1;
            render(child, indent + connector, last, d + 1);
          }
        } else if (node.isDir && d >= maxDepth && node.children.size > 0) {
          lines.push(indent + connector + `(${node.children.size} entries — use --depth ${d + 1} or --path to drill in)`);
        }
      }

      // Flat mode (like find)
      function renderFlat(node: TreeNode, dirPath: string): void {
        if (!node.isDir) {
          const sizeStr = du ? `  ${fmtSize(node.totalSize)}` : '';
          lines.push(`${dirPath}${node.name}  (${node.count} snaps${sizeStr})`);
        } else {
          const sorted = [...node.children.values()].sort(sorter);
          for (const child of sorted) {
            renderFlat(child, dirPath + node.name + '/');
          }
        }
      }

      const totalSnaps = filtered.reduce((s, f) => s + f.count, 0);
      const totalFiles = filtered.length;

      if (flat) {
        const header = `Drift files${prefix ? ` under "${prefix.slice(0, -1)}"` : ''} (${totalFiles} files, ${totalSnaps} snaps)`;
        lines.push(header);
        lines.push('─'.repeat(header.length));
        const sortedRoot = [...root.children.values()].sort(sorter);
        for (const child of sortedRoot) {
          renderFlat(child, '');
        }
      } else {
        const header = `Drift tree${prefix ? ` for "${prefix.slice(0, -1)}"` : ''} (${totalFiles} files, ${totalSnaps} total snapshots)`;
        lines.push(header);
        lines.push('─'.repeat(header.length));
        const sortedRoot = [...root.children.values()].sort(sorter);
        for (let i = 0; i < sortedRoot.length; i++) {
          render(sortedRoot[i], '', i === sortedRoot.length - 1, 0);
        }
      }

      return { success: true, data: lines.join('\n') };
    } catch (e: unknown) {
      return { success: false, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
}
