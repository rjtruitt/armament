/** How frequently state is flushed to disk. */
export type SaveTrigger = 'every-context-update' | '30s' | '1m' | '5m';
/** Resume strategy: warm replays full history, cold uses a summary. */
export type ResumeMode = 'warm' | 'cold';
/** Configuration for the session persistence system. */
export interface ISessionConfig {
  enabled: boolean;
  saveTrigger: SaveTrigger;
  sessionDir?: string;
}
/** Top-level manifest tracking all channels and global state. */
export interface ISessionManifest {
  version: number;
  savedAt: string;
  workspace: string;
  activeChannel?: string;
  channels: IChannelManifestEntry[];
  globalConfig: Record<string, unknown>;
  stickyNotes: string[];
  activeTools: string[];
}
/** Summary entry for a channel within the session manifest. */
export interface IChannelManifestEntry {
  name: string;
  stateFile: string;
  status: 'active' | 'suspended';
  model: string;
  provider: string;
  turnCount: number;
  lastActivity: number;
}
/** Full serialized state for a single channel. */
export interface IChannelStateFile {
  channelName: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
    /** Required for 'tool' role messages — the id of the assistant's tool_call this result is for */
    tool_call_id?: string;
    /** Tool invocations on 'assistant' messages (preserved so tool results have valid references) */
    tool_calls?: Array<{ id: string; name: string; arguments: string }>;
  }>;
  chatMessages: Array<{
    type: 'user' | 'agent' | 'system';
    sender: string;
    content: string;
    timestamp: number;
  }>;
  agentConfig: {
    model: string;
    provider: string;
    systemPrompt?: string;
    tools: string[];
  };
  turnCount: number;
  totalTokens: number;
  driftData?: {
    worktreePath: string;
    branchName: string;
    anchorCommit: string;
  };
  children?: IWorkerState[];
  summary?: string;
}
/** Serialized state of a spawned worker agent. */
export interface IWorkerState {
  id: string;
  model: string;
  status: string;
  turnCount: number;
  completionResult?: string;
}
/** Core persistence contract for saving and loading session state. */
export interface ISessionPersistence {
  initialize(workspace: string): Promise<void>;
  saveChannel(channelName: string, state: IChannelStateFile): Promise<void>;
  deleteChannel(channelName: string): Promise<void>;
  deregisterChannel(channelName: string): Promise<void>;
  saveManifest(manifest: ISessionManifest): Promise<void>;
  loadManifest(): Promise<ISessionManifest | null>;
  loadChannelState(channelName: string): Promise<IChannelStateFile | null>;
  hasActiveSession(): boolean;
  getSessionDir(): string;
  backup(): Promise<void>;
  exportSession(outputPath: string): Promise<void>;
  getSuspendedChannels(): IChannelManifestEntry[];
}
/** Controls how a session is resumed (warm or cold) and cascades to children. */
export interface IResumeController {
  detectSession(): Promise<ISessionManifest | null>;
  resumeWarm(channelName: string, state: IChannelStateFile): void;
  resumeCold(channelName: string, state: IChannelStateFile, summary: string): void;
  cascadeToChildren(channelName: string, mode: ResumeMode, state: IChannelStateFile): void;
}