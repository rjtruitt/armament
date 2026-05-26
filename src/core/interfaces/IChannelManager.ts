/** A communication channel with an agent or system stream. */
export interface IChannel {
  id: string;
  name: string;
  type: 'agent' | 'system' | 'debug' | 'log';
  agentId?: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  active: boolean;
  unreadCount: number;
  createdAt: number;
  lastActivity: number;
}
/** Interface for IChannelManager. */
export interface IChannelManager {
  create(name: string, opts?: Partial<IChannel>): IChannel;
  destroy(id: string): void;
  get(id: string): IChannel | undefined;
  getByName(name: string): IChannel | undefined;
  getAll(): IChannel[];
  getActive(): IChannel | undefined;
  setActive(id: string): void;
  next(): IChannel | undefined;
  previous(): IChannel | undefined;
  getUnreadTotal(): number;
  markRead(id: string): void;
  rename(id: string, newName: string): void;
  list(): IChannelListEntry[];
}
/** Summary entry for a channel in a list display. */
export interface IChannelListEntry {
  id: string;
  name: string;
  type: string;
  active: boolean;
  unread: number;
  model?: string;
  status: 'running' | 'idle' | 'stopped' | 'error';
}