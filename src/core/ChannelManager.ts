/**
 * Manages channel lifecycle, switching, and unread tracking.
 *
 * Supports up to 50 simultaneous channels with case-insensitive
 * name deduplication, circular next/previous navigation, and
 * event emission on destroy.
 */

import type { IChannel, IChannelManager, IChannelListEntry } from './interfaces/IChannelManager.js';

export type { IChannel, IChannelListEntry };

/** Simplified channel descriptor for external consumers. */
export interface Channel {
  id: string;
  name: string;
  type: 'agent' | 'system' | 'control';
  unread: number;
  messages: any[];
  agentId?: string;
}

const MAX_CHANNELS = 50;

/** Class representing ChannelManager. */
export class ChannelManager implements IChannelManager {
  private channels: Map<string, IChannel> = new Map();
  private activeId: string | undefined;
  private explicitlyActivated = false;
  private idCounter = 0;
  private eventHandlers: Map<string, Array<(...args: any[]) => void>> = new Map();

  /**
   * Create.
   */
  create(name: string, opts?: Partial<IChannel>): IChannel {
    if (!name || name.length === 0) {
      throw new Error('Channel name cannot be empty');
    }
    if (name.includes(' ')) {
      throw new Error('Channel name cannot contain spaces');
    }
    if (name.length > 32) {
      throw new Error('Channel name cannot exceed 32 characters');
    }
    for (const ch of this.channels.values()) {
      if (ch.name.toLowerCase() === name.toLowerCase()) {
        throw new Error(`Channel name "${name}" already exists`);
      }
    }
    if (this.channels.size >= MAX_CHANNELS) {
      throw new Error('Maximum number of channels reached');
    }

    const now = Date.now();
    const id = `chan-${++this.idCounter}-${Date.now()}`;
    const isFirst = this.channels.size === 0;

    const channel: IChannel = {
      id,
      name,
      type: opts?.type ?? 'agent',
      agentId: opts?.agentId,
      model: opts?.model,
      provider: opts?.provider,
      systemPrompt: opts?.systemPrompt,
      active: isFirst,
      unreadCount: 0,
      createdAt: now,
      lastActivity: now,
    };

    this.channels.set(id, channel);

    if (isFirst) {
      this.activeId = id;
    }

    return channel;
  }

  /**
   * Destroy.
   */
  destroy(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel "${channelId}" not found`);
    }

    if (channel.type === 'system') {
      const systemChannels = [...this.channels.values()].filter(c => c.type === 'system');
      if (systemChannels.length <= 1) {
        throw new Error('Cannot destroy the last system channel');
      }
    }

    if (this.activeId === channelId) {
      const allChannels = [...this.channels.values()];
      const idx = allChannels.findIndex(c => c.id === channelId);
      this.channels.delete(channelId);
      const remaining = [...this.channels.values()];
      if (remaining.length > 0) {
        const newIdx = Math.max(0, idx - 1);
        const newActive = remaining[Math.min(newIdx, remaining.length - 1)];
        this.activeId = newActive.id;
        newActive.active = true;
      } else {
        this.activeId = undefined;
      }
    } else {
      this.channels.delete(channelId);
    }

    this.emit('channel:destroyed', channel);
  }

  /**
   * Get.
   */
  get(channelId: string): IChannel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Gets the by name.
   */
  getByName(name: string): IChannel | undefined {
    for (const ch of this.channels.values()) {
      if (ch.name.toLowerCase() === name.toLowerCase()) {
        return ch;
      }
    }
    return undefined;
  }

  /**
   * Gets the all.
   */
  getAll(): IChannel[] {
    return [...this.channels.values()];
  }

  /**
   * Gets the active.
   */
  getActive(): IChannel | undefined {
    if (!this.activeId) return undefined;
    return this.channels.get(this.activeId);
  }

  /**
   * Sets the active.
   */
  setActive(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel "${channelId}" not found`);
    }

    if (this.activeId && this.activeId !== channelId) {
      const prev = this.channels.get(this.activeId);
      if (prev) {
        prev.active = false;
      }
    }

    channel.active = true;
    channel.unreadCount = 0;
    this.activeId = channelId;
    this.explicitlyActivated = true;
  }

  /**
   * Next.
   */
  next(): IChannel | undefined {
    const all = [...this.channels.values()];
    if (all.length === 0) return undefined;
    if (!this.activeId) {
      this.setActive(all[0].id);
      return all[0];
    }
    const idx = all.findIndex(c => c.id === this.activeId);
    const nextIdx = (idx + 1) % all.length;
    this.setActive(all[nextIdx].id);
    return all[nextIdx];
  }

  /**
   * Previous.
   */
  previous(): IChannel | undefined {
    const all = [...this.channels.values()];
    if (all.length === 0) return undefined;
    if (!this.activeId) {
      this.setActive(all[all.length - 1].id);
      return all[all.length - 1];
    }
    const idx = all.findIndex(c => c.id === this.activeId);
    const prevIdx = (idx - 1 + all.length) % all.length;
    this.setActive(all[prevIdx].id);
    return all[prevIdx];
  }

  /**
   * Gets the unread total.
   */
  getUnreadTotal(): number {
    let total = 0;
    for (const ch of this.channels.values()) {
      total += ch.unreadCount;
    }
    return total;
  }

  /**
   * Mark read.
   */
  markRead(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.unreadCount = 0;
    }
  }

  /**
   * Rename.
   */
  rename(channelId: string, newName: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel "${channelId}" not found`);
    }
    if (!newName || newName.length === 0) {
      throw new Error('Channel name cannot be empty');
    }
    for (const ch of this.channels.values()) {
      if (ch.id !== channelId && ch.name.toLowerCase() === newName.toLowerCase()) {
        throw new Error(`Channel name "${newName}" already exists`);
      }
    }
    channel.name = newName;
  }

  /**
   * List.
   */
  list(): IChannelListEntry[] {
    const entries: IChannelListEntry[] = [];
    for (const ch of this.channels.values()) {
      entries.push({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        active: ch.active,
        unread: ch.unreadCount,
        model: ch.model,
        status: ch.active ? 'running' : 'idle',
      });
    }
    return entries;
  }

  /**
   * Increment unread.
   */
  incrementUnread(channelId: string, count: number = 1): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    if (this.explicitlyActivated && channel.id === this.activeId) return;
    channel.unreadCount += count;
  }

  /**
   * Switch to index.
   */
  switchToIndex(index: number): void {
    const all = [...this.channels.values()];
    if (index < 1 || index > all.length) {
      throw new Error(`Channel index ${index} out of range`);
    }
    this.setActive(all[index - 1].id);
  }

  /**
   * Switch to name.
   */
  switchToName(name: string): void {
    const channel = this.getByName(name);
    if (!channel) {
      throw new Error(`Channel "${name}" not found`);
    }
    this.setActive(channel.id);
  }

  /**
   * On.
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }
}
