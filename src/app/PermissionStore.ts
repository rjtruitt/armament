import { dirname } from 'path';

/** Interface for PermissionRequest.
 * @property {string} id - Description of id.
 * @property {string} path - Description of path.
 * @property {string} originalPath - Description of originalPath.
 * @property {string} tool - Description of tool.
 * @property {string} channel - Description of channel.
 * @property {number} createdAt - Description of createdAt.
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

/** Is remembered.
 * @param {string} channel - Description of channel.
 * @param {string} path - Description of path.
 * @returns {boolean} - Description of return value.
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

  /** Check if a channel has god mode enabled (global or per-channel). */
  isGodMode(channel: string): boolean {
    if (this._globalGodMode) return true;
    return this._godMode.has(channel);
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
/** Get permission store.
 * @returns {PermissionStore} - Description of return value.
 */
export function getPermissionStore(): PermissionStore {
  const g = globalThis as any;
  if (!g[KEY]) g[KEY] = new PermissionStore();
  return g[KEY];
}
