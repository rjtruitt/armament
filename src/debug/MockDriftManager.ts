import type { IDriftManager, IDriftSnapshot, IDriftStats } from '../drift/interfaces/IDrift.js';

interface MockEntry {
  id: string;
  channel: string;
  path: string;
  hash: string;
  reason: string;
  tool: string;
  timestamp: number;
  size: number;
  content: string;
}

/** In-memory drift storage for tests. */
export class MockDriftManager implements IDriftManager {
  private _entries: MockEntry[] = [];
  private _counter = 0;

  async snapshot(channelName: string, filePath: string, reason: string, tool: string): Promise<IDriftSnapshot> {
    this._counter++;
    const id = `s_${this._counter}`;
    const hash = `${id}-hash`;
    const timestamp = Date.now();
    const size = 0;
    this._entries.push({ id, channel: channelName, path: filePath, hash, reason, tool, timestamp, size, content: '' });
    return { id, channel: channelName, path: filePath, hash, reason, tool, timestamp, size };
  }

  async listSnapshots(channelName: string, filePath?: string): Promise<IDriftSnapshot[]> {
    let filtered = this._entries.filter(e => e.channel === channelName);
    if (filePath) {
      filtered = filtered.filter(e => e.path === filePath);
    }
    return filtered.map(e => ({
      id: e.id,
      channel: e.channel,
      path: e.path,
      hash: e.hash,
      reason: e.reason,
      tool: e.tool,
      timestamp: e.timestamp,
      size: e.size,
    }));
  }

  async rollback(channelName: string, snapshotId: string): Promise<boolean> {
    const entry = this._entries.find(e => e.id === snapshotId);
    if (!entry) return false;
    // Add a new snapshot with rollback-to-<id> reason (don't delete the original)
    this._counter++;
    const rollbackId = `s_${this._counter}`;
    this._entries.push({
      id: rollbackId, channel: channelName, path: entry.path,
      hash: entry.hash, reason: `rollback-to-${snapshotId}`,
      tool: 'rollback', timestamp: Date.now(), size: entry.size, content: entry.content,
    });
    return true;
  }

  async getStats(channelName: string): Promise<IDriftStats> {
    const entries = this._entries.filter(e => e.channel === channelName);
    const paths = [...new Set(entries.map(e => e.path))];
    return {
      channelName,
      snapshotsCount: entries.length,
      totalSizeBytes: entries.reduce((sum, e) => sum + e.size, 0),
      paths,
    };
  }

  async prune(opts?: { days?: number; staleOnly?: boolean }): Promise<number> {
    const cutoff = opts?.days ? Date.now() - opts.days * 24 * 60 * 60 * 1000 : 0;
    const before = this._entries.length;
    this._entries = this._entries.filter(e => {
      if (opts?.staleOnly) return true; // skip in mock, needs real fs
      if (cutoff > 0 && e.timestamp < cutoff) return false;
      return true;
    });
    return before - this._entries.length;
  }

  async getPerFileStats(): Promise<Array<{ path: string; count: number; totalSize: number; newest: number }>> {
    const map = new Map<string, { count: number; totalSize: number; newest: number }>();
    for (const e of this._entries) {
      const existing = map.get(e.path) ?? { count: 0, totalSize: 0, newest: 0 };
      existing.count++;
      existing.totalSize += e.size;
      if (e.timestamp > existing.newest) existing.newest = e.timestamp;
      map.set(e.path, existing);
    }
    return [...map.entries()].map(([path, stats]) => ({ path, ...stats }));
  }
}
