/** Filesystem store for individual channel state files. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IChannelStateFile } from '../interfaces/ISessionPersistence.js';

/** Saves and loads per-channel state as JSON files within the session directory. */
export class ChannelStateStore {
  private _dir: string;

  constructor(sessionDir: string) {
    this._dir = path.join(sessionDir, 'channels');
  }

  private _slugify(channelName: string): string {
    return channelName.replace(/^#/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  }

  private _filePath(channelName: string): string {
    return path.join(this._dir, `${this._slugify(channelName)}.state.json`);
  }

  /**
   * Save.
   */
  save(channelName: string, state: IChannelStateFile): void {
    fs.mkdirSync(this._dir, { recursive: true });
    fs.writeFileSync(this._filePath(channelName), JSON.stringify(state, null, 2));
  }

  /**
   * Load.
   */
  load(channelName: string): IChannelStateFile | null {
    const fp = this._filePath(channelName);
    if (!fs.existsSync(fp)) return null;
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Remove.
   */
  remove(channelName: string): void {
    const fp = this._filePath(channelName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  /**
   * List all.
   */
  listAll(): string[] {
    if (!fs.existsSync(this._dir)) return [];
    return fs.readdirSync(this._dir)
      .filter(f => f.endsWith('.state.json'))
      .map(f => f.replace('.state.json', ''));
  }
}
