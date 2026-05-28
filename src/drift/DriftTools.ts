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
    new DriftDiffTool(manager),
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
    recent: z.string().optional().describe('Show only files with snapshots in last N (e.g. "1h", "30m", "7d").'),
    stale: z.boolean().optional().describe('Show only files whose original path no longer exists on disk.'),
    channel: z.string().optional().describe('Filter snapshots by channel name (e.g. "#armament").'),
    sort: z.enum(['count', 'size', 'name', 'newest']).optional().describe('Sort by: count, size, name, or newest (default: count).'),
  });

  constructor(private manager: DriftManager) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { path, depth, du, flat, channel, sort, recent, stale } = args as {
      path?: string; depth?: number; du?: boolean; flat?: boolean;
      channel?: string; sort?: 'count' | 'size' | 'name' | 'newest';
      recent?: string; stale?: boolean;
    };
    try {
      const stats = await this.manager.getPerFileStats();
      const prefix = path ? (path.endsWith('/') ? path : path + '/') : '';
      const maxDepth = Math.min(depth ?? 2, 5);
      const now = Date.now();

      // Filter by path prefix
      let filtered = prefix
        ? stats.filter(s => s.path.startsWith(prefix))
        : stats;

      // Filter by recency
      if (recent) {
        const match = recent.match(/^(\d+)([smhd])$/);
        if (!match) {
          return { success: true, data: `Invalid --recent format "${recent}". Use e.g. "1h", "30m", "7d".` };
        }
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const ms = unit === 's' ? num * 1000 : unit === 'm' ? num * 60 * 1000 : unit === 'h' ? num * 3600 * 1000 : num * 86400 * 1000;
        const cutoff = now - ms;
        filtered = filtered.filter(s => s.newest >= cutoff);
      }

      // Filter by stale (file path no longer exists on disk)
      if (stale) {
        const fs = await import('node:fs');
        filtered = filtered.filter(s => !fs.existsSync(s.path));
      }

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

/** DriftDiffTool — show the diff between two snapshots of the same file. */
export class DriftDiffTool implements ITool {
  readonly name = 'drift_diff';
  readonly description = `Show the diff between two snapshots of the same file. Takes two snapshot IDs (a and b) and shows line-by-line changes. Use --current to compare against the file's current state on disk instead of a second snapshot. Use drift_snapshots(path: "...") to find IDs.`;

  readonly schema = z.object({
    a: z.string().describe('First snapshot ID (e.g. "s_10").'),
    b: z.string().optional().describe('Second snapshot ID. Omit and use --current to compare against current file.'),
    current: z.boolean().optional().describe('Compare snapshot "a" against the current file on disk.'),
    context: z.number().optional().describe('Lines of context around each change (default: 3).'),
  });

  constructor(private manager: DriftManager) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { a, b, current, context } = args as { a: string; b?: string; current?: boolean; context?: number };
    try {
      if (!a) {
        return { success: false, error: { message: 'Missing required "a" (first snapshot ID).' } };
      }
      if (!b && !current) {
        return { success: false, error: { message: 'Provide --current or a second snapshot ID "b".' } };
      }

      const ctx = context ?? 3;

      // Read snapshot A
      const snapA = await this.manager.readSnapshotContent(a);
      if (!snapA) {
        return { success: false, error: { message: `Snapshot "${a}" not found or content missing.` } };
      }

      // Read snapshot B or current file
      let contentA = snapA.content;
      let contentB: string;
      let labelA = a;
      let labelB: string;

      if (current) {
        const fs = await import('node:fs');
        if (!fs.existsSync(snapA.filePath)) {
          return { success: false, error: { message: `File "${snapA.filePath}" no longer exists on disk. Cannot compare with --current.` } };
        }
        contentB = fs.readFileSync(snapA.filePath, 'utf-8');
        labelB = '(current)';
      } else {
        const snapB = await this.manager.readSnapshotContent(b!);
        if (!snapB) {
          return { success: false, error: { message: `Snapshot "${b}" not found or content missing.` } };
        }
        if (snapA.filePath !== snapB.filePath) {
          return { success: false, error: { message: `Snapshots "${a}" and "${b}" are from different files: "${snapA.filePath}" vs "${snapB.filePath}". Use drift_snapshots(path: "...") to find snapshots for a specific file.` } };
        }
        contentB = snapB.content;
        labelB = b!;
      }

      // Line diff
      const linesA = contentA.split('\n');
      const linesB = contentB.split('\n');

      // Simple LCS-based diff
      const result = this.diff(linesA, linesB);

      // Format as unified diff
      const output: string[] = [];
      const filePath = snapA.filePath;
      output.push(`--- ${filePath}  (${labelA})`);
      output.push(`+++ ${filePath}  (${labelB})`);

      // Group changes into hunks with context
      const hunks = this.buildHunks(result, ctx);
      for (const hunk of hunks) {
        output.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
        for (const line of hunk.lines) {
          output.push(line);
        }
      }

      if (output.length <= 2) {
        return { success: true, data: `No differences between ${a} and ${b ?? 'current'} for ${filePath} — snapshots are identical.` };
      }

      return { success: true, data: output.join('\n') };
    } catch (e: unknown) {
      return { success: false, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }

  /** Simple Myers-like diff: returns array of {type: 'same'|'add'|'del', line: string} */
  private diff(a: string[], b: string[]): Array<{ type: 'same' | 'add' | 'del'; line: string }> {
    const result: Array<{ type: 'same' | 'add' | 'del'; line: string }> = [];
    // Use a simple longest-common-subsequence approach
    const m = a.length;
    const bLines = b;
    const n = bLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === bLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to build diff
    let i = m, j = n;
    const stack: Array<{ type: 'same' | 'add' | 'del'; line: string }> = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === bLines[j - 1]) {
        stack.push({ type: 'same', line: a[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        stack.push({ type: 'add', line: bLines[j - 1] });
        j--;
      } else {
        stack.push({ type: 'del', line: a[i - 1] });
        i--;
      }
    }

    // Reverse to get chronological order
    for (let k = stack.length - 1; k >= 0; k--) {
      result.push(stack[k]);
    }
    return result;
  }

  /** Group diff results into hunks with surrounding context. */
  private buildHunks(diff: Array<{ type: 'same' | 'add' | 'del'; line: string }>, context: number):
    Array<{ oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[] }> {
    const hunks: Array<{ oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[] }> = [];
    let i = 0;
    while (i < diff.length) {
      // Find the next change
      let start = -1;
      for (let j = i; j < diff.length; j++) {
        if (diff[j].type !== 'same') { start = j; break; }
      }
      if (start === -1) break;

      // Include leading context
      const leadStart = Math.max(i, start - context);
      const leadLines: Array<{ type: 'same' | 'add' | 'del'; line: string }> = [];
      let oldLine = 1, newLine = 1;
      // Count lines before start
      for (let k = 0; k < start; k++) {
        if (diff[k].type === 'same') { oldLine++; newLine++; }
        else if (diff[k].type === 'del') oldLine++;
        else newLine++;
      }

      // Collect the changed region and trailing context
      const hunkLines: string[] = [];
      let end = start;
      let changedCount = 0;
      for (let j = start; j < diff.length && (diff[j].type !== 'same' || changedCount < context); j++) {
        end = j;
        const d = diff[j];
        if (d.type === 'same') {
          hunkLines.push(' ' + d.line);
          oldLine++; newLine++;
          changedCount++;
        } else if (d.type === 'del') {
          hunkLines.push('-' + d.line);
          oldLine++;
          changedCount = 0;
        } else {
          hunkLines.push('+' + d.line);
          newLine++;
          changedCount = 0;
        }
      }

      // Count old/new lines in this hunk
      let oldCount = 0, newCount = 0;
      for (const l of hunkLines) {
        if (l.startsWith('-')) oldCount++;
        else if (l.startsWith('+')) newCount++;
        else { oldCount++; newCount++; }
      }

      // Actually compute oldStart/newStart properly
      let oldStart = 1, newStart = 1;
      for (let k = 0; k < start; k++) {
        if (diff[k].type === 'same' || diff[k].type === 'del') oldStart++;
        if (diff[k].type === 'same' || diff[k].type === 'add') newStart++;
      }
      // Adjust for leading context
      oldStart -= Math.min(context, start - i);
      newStart -= Math.min(context, start - i);
      if (oldStart < 1) oldStart = 1;
      if (newStart < 1) newStart = 1;

      hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
      i = end + 1;
    }
    return hunks;
  }
}
