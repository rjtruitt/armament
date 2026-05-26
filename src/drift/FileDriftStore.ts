/**
 * FileDriftStore — global file-based snapshot archive.
 *
 * Stores snapshots of non-binary files in a content-addressed archive.
 * Each snapshot captures the file content + metadata for later rollback.
 * Single store for all channels — each entry has a `channel` field.
 *
 * Layout:
 *   .arma/drift/
 *     index.json     { version, counter, files: { "/path": [ { id, channel, hash, reason, tool, ts, size } ] } }
 *     content/
 *       <sha256hex>  (raw file bytes)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

/** A single snapshot entry in the index. */
export interface DriftEntry {
  id: string;
  channel: string;    // which channel made this snapshot
  hash: string;       // SHA256 hex of content
  reason: string;
  tool: string;       // 'edit_file' | 'write_file' | 'append_file' | 'manual'
  ts: number;
  size: number;       // bytes
}

/** On-disk index format. */
interface DriftIndex {
  version: number;
  counter: number;
  files: Record<string, DriftEntry[]>;
}

export interface DriftStoreStats {
  totalSnapshots: number;
  totalPaths: number;
  totalSizeBytes: number;
  paths: string[];
}

/** Read and optionally create the index file. */
function loadIndex(driftDir: string): DriftIndex {
  const indexPath = join(driftDir, 'index.json');
  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, 'utf-8');
      return JSON.parse(raw) as DriftIndex;
    } catch {
      // Corrupt — start fresh
    }
  }
  return { version: 1, counter: 0, files: {} };
}

/** Atomic write: write to temp file, rename to target. */
function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + '.tmp.' + process.pid;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, filePath);
}

/** Compute SHA256 hex of a buffer. */
function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Content-addressed file snapshot store.
 * Single global store at ~/.arma/drift/, entries tagged by channel.
 */
export class FileDriftStore {
  private _driftDir: string;
  private _contentDir: string;
  private _maxSizeBytes: number;

  constructor(driftDir: string, maxSizeBytes = 0) {
    this._driftDir = driftDir;
    this._contentDir = join(driftDir, 'content');
    this._maxSizeBytes = maxSizeBytes;
    mkdirSync(this._contentDir, { recursive: true });
  }

  /** Set the max size limit for auto-pruning after snapshots. */
  setMaxSizeBytes(maxSizeBytes: number): void {
    this._maxSizeBytes = maxSizeBytes;
  }

  /** The drift directory path. */
  get driftDir(): string { return this._driftDir; }

  /**
   * Save a snapshot of a file at the given path.
   * Reads the current file content, hashes it, stores in content archive,
   * and appends an entry to the index.
   */
  async saveSnapshot(channel: string, filePath: string, reason: string, tool: string): Promise<DriftEntry> {
    let content: Buffer;
    try {
      content = readFileSync(filePath);
    } catch {
      throw new Error(`Cannot read file for snapshot: ${filePath}`);
    }

    const hash = sha256(content);
    const size = content.length;
    const indexPath = join(this._driftDir, 'index.json');

    // Write content (idempotent — same hash = same file, skip if exists)
    const contentPath = join(this._contentDir, hash);
    if (!existsSync(contentPath)) {
      atomicWrite(contentPath, content.toString('utf-8'));
    }

    // Load + update index
    const index = loadIndex(this._driftDir);
    index.counter += 1;
    const id = `s_${index.counter}`;

    const entry: DriftEntry = { id, channel, hash, reason, tool, ts: Date.now(), size };

    if (!index.files[filePath]) {
      index.files[filePath] = [];
    }
    index.files[filePath].push(entry);

    // Write index atomically
    atomicWrite(indexPath, JSON.stringify(index, null, 2));

    return entry;
  }

  /**
   * Get snapshots for a specific path, or all snapshots if path omitted.
   */
  async getSnapshots(channel?: string, filePath?: string): Promise<DriftEntry[]> {
    const index = loadIndex(this._driftDir);
    let all: DriftEntry[] = [];
    for (const [path, entries] of Object.entries(index.files)) {
      if (filePath && path !== filePath) continue;
      all.push(...entries);
    }
    if (channel) {
      all = all.filter(e => e.channel === channel);
    }
    // Sort by timestamp descending (newest first)
    all.sort((a, b) => b.ts - a.ts);
    return all;
  }

  /**
   * Find a single snapshot by id.
   */
  async getSnapshot(id: string): Promise<{ entry: DriftEntry; filePath: string } | null> {
    const index = loadIndex(this._driftDir);
    for (const [filePath, entries] of Object.entries(index.files)) {
      for (const entry of entries) {
        if (entry.id === id) {
          return { entry, filePath };
        }
      }
    }
    return null;
  }

  /**
   * Rollback a snapshot by id — reads stored content, writes it back to the original path,
   * then snapshots the restored state with reason "rollback-to-<id>".
   * Original snapshots are never modified or deleted.
   */
  async rollback(rollbackId: string): Promise<boolean> {
    const found = await this.getSnapshot(rollbackId);
    if (!found) return false;

    const { entry, filePath } = found;
    const contentPath = join(this._contentDir, entry.hash);

    if (!existsSync(contentPath)) {
      return false; // Content missing
    }

    try {
      // Restore the file from the snapshot content
      const content = readFileSync(contentPath, 'utf-8');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf-8');

      // Snapshot the restored state so the rollback itself is tracked
      const newContent = readFileSync(filePath);
      const newHash = sha256(newContent);
      const newSize = newContent.length;
      const newContentPath = join(this._contentDir, newHash);
      if (!existsSync(newContentPath)) {
        atomicWrite(newContentPath, newContent.toString('utf-8'));
      }

      const indexPath = join(this._driftDir, 'index.json');
      const index = loadIndex(this._driftDir);
      index.counter += 1;
      const rollbackSnapshotId = `s_${index.counter}`;
      const rollbackEntry: DriftEntry = {
        id: rollbackSnapshotId, channel: entry.channel, hash: newHash,
        reason: `rollback-to-${rollbackId}`, tool: 'rollback', ts: Date.now(), size: newSize,
      };
      if (!index.files[filePath]) {
        index.files[filePath] = [];
      }
      index.files[filePath].push(rollbackEntry);
      atomicWrite(indexPath, JSON.stringify(index, null, 2));

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stats: total snapshots, unique paths, total stored bytes.
   */
  async getStats(channel?: string): Promise<DriftStoreStats> {
    const index = loadIndex(this._driftDir);
    const paths: string[] = [];
    let totalSnapshots = 0;
    let totalSizeBytes = 0;
    for (const [filePath, entries] of Object.entries(index.files)) {
      const filtered = channel ? entries.filter(e => e.channel === channel) : entries;
      if (filtered.length > 0) {
        paths.push(filePath);
      }
      totalSnapshots += filtered.length;
      for (const e of filtered) {
        totalSizeBytes += e.size;
      }
    }
    return { totalSnapshots, totalPaths: paths.length, totalSizeBytes, paths: paths.sort() };
  }

  /**
   * Prune old or stale snapshots.
   * @param opts.days - Remove snapshots older than this many days
   * @param opts.staleOnly - Only remove snapshots for paths that no longer exist on disk
   * Returns count of removed entries.
   */
  async prune(opts?: { days?: number; staleOnly?: boolean; maxSizeBytes?: number }): Promise<number> {
    const index = loadIndex(this._driftDir);
    const cutoff = opts?.days ? Date.now() - opts.days * 24 * 60 * 60 * 1000 : 0;
    let removed = 0;
    const usedHashes = new Set<string>();

    // Phase 1: remove entries by stale file + age
    for (const [filePath, entries] of Object.entries(index.files)) {
      const keep: DriftEntry[] = [];
      for (const entry of entries) {
        let shouldRemove = false;
        if (opts?.staleOnly && !existsSync(filePath)) {
          shouldRemove = true;
        }
        if (cutoff > 0 && entry.ts < cutoff) {
          shouldRemove = true;
        }
        if (shouldRemove) {
          removed++;
        } else {
          keep.push(entry);
          usedHashes.add(entry.hash);
        }
      }
      if (keep.length > 0) {
        index.files[filePath] = keep;
      } else {
        delete index.files[filePath];
      }
    }

    // Phase 2: size-based pruning — remove oldest entries when total exceeds maxSizeBytes
    if (opts?.maxSizeBytes && opts.maxSizeBytes > 0) {
      // Calculate total size of remaining entries
      let totalSize = 0;
      const allEntries: { path: string; entry: DriftEntry }[] = [];
      for (const [filePath, entries] of Object.entries(index.files)) {
        for (const entry of entries) {
          totalSize += entry.size;
          allEntries.push({ path: filePath, entry });
        }
      }

      if (totalSize > opts.maxSizeBytes) {
        // Sort oldest first, remove until under limit
        allEntries.sort((a, b) => a.entry.ts - b.entry.ts);

        const sizeLimit = opts.maxSizeBytes;
        // Keep a generous minimum of recent entries even if over limit
        const targetSize = Math.floor(sizeLimit * 0.8); // prune to 80% of limit
        for (const { path: fp, entry } of allEntries) {
          if (totalSize <= targetSize) break;
          const fileList = index.files[fp];
          if (fileList) {
            const idx = fileList.findIndex(e => e.id === entry.id);
            if (idx !== -1) {
              fileList.splice(idx, 1);
              removed++;
              totalSize -= entry.size;
              if (fileList.length === 0) {
                delete index.files[fp];
              }
            }
          }
        }
      }
    }

    // Rebuild usedHashes from remaining entries
    usedHashes.clear();
    for (const entries of Object.values(index.files)) {
      for (const entry of entries) {
        usedHashes.add(entry.hash);
      }
    }

    // Clean up orphaned content files (hashes no longer referenced by any entry)
    if (existsSync(this._contentDir)) {
      for (const f of readdirSync(this._contentDir)) {
        if (!usedHashes.has(f)) {
          try { unlinkSync(join(this._contentDir, f)); } catch {}
        }
      }
    }

    // Write cleaned index
    atomicWrite(join(this._driftDir, 'index.json'), JSON.stringify(index, null, 2));
    return removed;
  }

  /** Prune stale snapshots (files that no longer exist on disk). */
  async pruneStale(): Promise<number> {
    return this.prune({ staleOnly: true });
  }
}
