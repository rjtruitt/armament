/**
 * Mock implementation of ISessionPersistence for testing.
 *
 * Stores session manifests and channel state in memory without filesystem I/O.
 * Provides test helpers (mockSetManifest, mockSetChannelState, reset) and
 * inspection properties (isInitialized, saveCount, storedChannels).
 */

import type {
  ISessionPersistence,
  ISessionManifest,
  IChannelStateFile,
  IChannelManifestEntry,
} from '../session/index.js';
import { armaDataDir } from '../app/ChannelPaths.js';

/** In-memory session persistence for deterministic test scenarios. */
export class MockSessionPersistence implements ISessionPersistence {
  private _manifest: ISessionManifest | null = null;
  private _channels: Map<string, IChannelStateFile> = new Map();
  private _initialized = false;
  private _saveCount = 0;
  private _workspace = '';

  /**
   * Initialize.
   */
  async initialize(workspace: string): Promise<void> {
    this._workspace = workspace;
    this._initialized = true;
  }

  /**
   * Save channel.
   */
  async saveChannel(channelName: string, state: IChannelStateFile): Promise<void> {
    this._channels.set(channelName, state);
    this._saveCount++;
  }

  /**
   * Delete channel.
   */
  async deleteChannel(channelName: string): Promise<void> {
    this._channels.delete(channelName);
    if (this._manifest) {
      this._manifest.channels = this._manifest.channels.filter(c => c.name !== channelName);
    }
  }

  /**
   * Deregister channel.
   */
  async deregisterChannel(channelName: string): Promise<void> {
    if (this._manifest) {
      this._manifest.channels = this._manifest.channels.filter(c => c.name !== channelName);
    }
  }

  /**
   * Save manifest.
   */
  async saveManifest(manifest: ISessionManifest): Promise<void> {
    this._manifest = manifest;
  }

  /**
   * Load manifest.
   */
  async loadManifest(): Promise<ISessionManifest | null> {
    return this._manifest;
  }

  /**
   * Load channel state.
   */
  async loadChannelState(channelName: string): Promise<IChannelStateFile | null> {
    return this._channels.get(channelName) ?? null;
  }

  /**
   * Checks whether active session exists.
   */
  hasActiveSession(): boolean {
    return this._manifest !== null;
  }

  /**
   * Gets the session dir.
   */
  getSessionDir(): string {
    return `${armaDataDir()}/sessions`;
  }

  /**
   * Backup.
   */
  async backup(): Promise<void> {
  }

  /**
   * Export session.
   */
  async exportSession(_outputPath: string): Promise<void> {
  }

  /**
   * Gets the suspended channels.
   */
  getSuspendedChannels(): IChannelManifestEntry[] {
    if (!this._manifest) return [];
    return this._manifest.channels.filter(c => c.status === 'suspended');
  }

  /**
   * Shutdown.
   */
  shutdown(): void {
  }


  /**
   * Gets the is initialized.
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Gets the save count.
   */
  get saveCount(): number {
    return this._saveCount;
  }

  /**
   * Gets the stored channels.
   */
  get storedChannels(): string[] {
    return Array.from(this._channels.keys());
  }

  /**
   * Gets the stored channel.
   */
  getStoredChannel(name: string): IChannelStateFile | undefined {
    return this._channels.get(name);
  }

  /**
   * Mock set manifest.
   */
  mockSetManifest(manifest: ISessionManifest): void {
    this._manifest = manifest;
  }

  /**
   * Mock set channel state.
   */
  mockSetChannelState(channelName: string, state: IChannelStateFile): void {
    this._channels.set(channelName, state);
  }

  /**
   * Reset.
   */
  reset(): void {
    this._manifest = null;
    this._channels.clear();
    this._saveCount = 0;
    this._initialized = false;
  }
}
