import { dirname } from 'path';

/** A pending permission request awaiting user approval or denial.
 * @property {string} id - Unique identifier for this permission request.
 * @property {string} path - Filesystem path the tool is attempting to access.
 * @property {string} [originalPath] - The original path before symlink resolution, if different.
 * @property {string} tool - Name of the tool requesting access.
 * @property {string} channel - Channel identifier where the request originated.
 * @property {number} createdAt - Unix timestamp (ms) when the request was created.
 */
export interface PermissionRequest {
  id: string;
  path: string;
  originalPath?: string;
  tool: string;
  channel: string;
  createdAt: number;
  resolve: (allowed: boolean) => void;
}

const remembered = new Map<string, Set<string>>();

/** Check whether a path has been previously remembered (approved) for a channel.
 * @param {string} channel - The channel to check remembered permissions for.
 * @param {string} path - The filesystem path to check.
 * @returns {boolean} - True if the path (or any parent) was previously approved for this channel.
 */
export function isRemembered(channel: string, path: string): boolean {
  const set = remembered.get(channel);
  if (!set) return false;
  let current = path;
  while (current.length > 1) {
    if (set.has(current)) return true;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

function remember(channel: string, path: string): void {
  if (!remembered.has(channel)) remembered.set(channel, new Set());
  remembered.get(channel)!.add(path);
}

/** Class representing PermissionStore. */
export class PermissionStore {
  private pending: Map<string, PermissionRequest> = new Map();
  private listeners: Set<() => void> = new Set();
  private counter = 0;
  /** Channels in god mode — all permission requests auto-approved. */
  private _godMode: Set<string> = new Set();
  /** Global god mode override — if true, ALL channels are in god mode. */
  private _globalGodMode = false;

  /** Check if a channel has god mode enabled (global or per-channel). Workers inherit parent's god mode. */
  isGodMode(channel: string): boolean {
    if (this._globalGodMode) return true;
    if (this._godMode.has(channel)) return true;
    // Workers inherit parent's god mode (worker-{parent}-{timestamp})
    for (const gm of this._godMode) {
      const bare = gm.startsWith('#') ? gm.slice(1) : gm;
      if (channel.includes(`worker-${bare}`) || channel.includes(`-${bare}-`)) return true;
    }
    return false;
  }

  /** Toggle per-channel god mode. Returns new state. */
  toggleGodMode(channel: string): boolean {
    if (this._godMode.has(channel)) {
      this._godMode.delete(channel);
      return false;
    }
    this._godMode.add(channel);
    return true;
  }

  /** Enable global god mode for all channels. */
  setGlobalGodMode(enabled: boolean): void {
    this._globalGodMode = enabled;
  }

  /**
   * On new request.
   */
  onNewRequest(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
    try {
      const { getGlobalEventBus } = require('./EventBus.js');
      getGlobalEventBus().emit({ type: 'permission:pending', pending: this.listPending() });
    } catch {}
  }

  /**
   * Request — auto-approves if channel is in god mode.
   */
  request(path: string, tool: string, channel: string, originalPath?: string): Promise<boolean> {
    // God mode bypass
    if (this.isGodMode(channel)) {
      return Promise.resolve(true);
    }
    return new Promise(resolve => {
      const id = `perm-${++this.counter}`;
      this.pending.set(id, { id, path, originalPath, tool, channel, createdAt: Date.now(), resolve });
      this.notify();
      // Auto-deny after 2 minutes, or after 5 seconds if no listeners
      setTimeout(() => {
        if (this.pending.has(id) && this.listeners.size === 0) {
          this.pending.get(id)!.resolve(false);
          this.pending.delete(id);
        }
      }, this.listeners.size === 0 ? 5000 : 120_000);
    });
  }

  /**
   * Approve and remember the path.
   */
  approve(id: string): boolean {
    const req = this.pending.get(id);
    if (!req) return false;
    req.resolve(true);
    this.pending.delete(id);
    remember(req.channel, req.path);
    return true;
  }

  /**
   * Approve once — resolves the request without remembering the path.
   */
  approveOnce(id: string): boolean {
    const req = this.pending.get(id);
    if (!req) return false;
    req.resolve(true);
    this.pending.delete(id);
    return true;
  }
  /**
   * Deny.
   */
  deny(id: string): boolean {
    const req = this.pending.get(id);
    if (!req) return false;
    req.resolve(false);
    this.pending.delete(id);
    return true;
  }

  /**
   * List pending.
   */
  listPending(): { id: string; path: string; originalPath?: string; tool: string; channel: string }[] {
    return Array.from(this.pending.values()).map(({ id, path, originalPath, tool, channel }) => ({ id, path, originalPath, tool, channel }));
  }

  /** Remember a path for a channel so future accesses don't prompt. */
  rememberPath(channel: string, path: string): void {
    remember(channel, path);
  }
}

const KEY = '__armamentPermissionStore';
/** Get the singleton PermissionStore instance, creating it if needed.
 * @returns {PermissionStore} - The global PermissionStore singleton.
 */
export function getPermissionStore(): PermissionStore {
  const g = globalThis as any;
  if (!g[KEY]) g[KEY] = new PermissionStore();
  return g[KEY];
}
