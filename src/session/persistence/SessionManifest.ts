/** Manages the active.session manifest file with backup rotation. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ISessionManifest } from '../interfaces/ISessionPersistence.js';
import { armaDataDir } from '../../app/ChannelPaths.js';

/** Reads, writes, and rotates the session manifest file on disk. */
export class SessionManifest {
  private _dir: string;

  constructor(_workspace: string, sessionDir?: string) {
    this._dir = sessionDir || path.join(armaDataDir(), 'sessions');
  }

  /**
   * Gets the manifest path.
   */
  get manifestPath(): string {
    return path.join(this._dir, 'active.session');
  }

  /**
   * Gets the backup path.
   */
  get backupPath(): string {
    return path.join(this._dir, 'active.session.backup');
  }

  /**
   * Exists.
   */
  exists(): boolean {
    return fs.existsSync(this.manifestPath);
  }

  /**
   * Save.
   */
  save(manifest: ISessionManifest): void {
    fs.mkdirSync(this._dir, { recursive: true });
    // Rotate: current → backup
    if (fs.existsSync(this.manifestPath)) {
      fs.copyFileSync(this.manifestPath, this.backupPath);
    }
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Load.
   */
  load(): ISessionManifest | null {
    if (!this.exists()) return null;
    try {
      const raw = fs.readFileSync(this.manifestPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Remove.
   */
  remove(): void {
    if (fs.existsSync(this.manifestPath)) {
      fs.unlinkSync(this.manifestPath);
    }
  }
}
