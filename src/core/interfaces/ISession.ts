import { IMessage } from './IMessage.js';
import { IUsageStats } from './IUsageStats.js';

/** Represents a conversation session with message history and usage tracking. */
export interface ISession {
  getId(): string;
  getMessages(): IMessage[];
  addMessage(message: IMessage): void;
  getTurnCount(): number;
  getUsage(): IUsageStats;
  clear(): void;
  export(): ISessionExport;
  import(data: ISessionExport): void;
  getLastUserMessage(): string | undefined;
  getLastAssistantMessage(): string | undefined;
  undo(): void;
  getMode(): SessionMode;
  setMode(mode: SessionMode): void;
}

/** Mode of the session: execution or planning. */
export type SessionMode = 'execute' | 'plan';

/** Serializable snapshot of a session for export/import. */
export interface ISessionExport {
  id: string;
  messages: IMessage[];
  turnCount: number;
  usage: IUsageStats;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
