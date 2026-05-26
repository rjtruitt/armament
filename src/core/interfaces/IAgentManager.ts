/** A running agent instance with model, status, and usage tracking. */
export interface IAgentInstance {
  id: string;
  name: string;
  channelId: string;
  model: string;
  provider: string;
  systemPrompt?: string;
  status: AgentStatus;
  turnCount: number;
  tokenUsage: number;
  cost: number;
  createdAt: number;
  lastActivity: number;
  parentId?: string;
  childIds: string[];
}
/** Type union for AgentStatus: idle, thinking, streaming, waiting, stopped, error. */
export type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'tool-use' | 'waiting' | 'stopped' | 'error';
/** Interface for IAgentManager. */
export interface IAgentManager {
  spawn(name: string, opts?: IAgentSpawnOptions): Promise<IAgentInstance>;
  kill(id: string): void;
  killAll(): void;
  get(id: string): IAgentInstance | undefined;
  getByName(name: string): IAgentInstance | undefined;
  getAll(): IAgentInstance[];
  getRunning(): IAgentInstance[];
  setActive(id: string): void;
  getActive(): IAgentInstance | undefined;
  pause(id: string): void;
  resume(id: string): void;
  sendMessage(id: string, message: string): Promise<void>;
  getStatus(id: string): AgentStatus;
  fork(id: string, name?: string): Promise<IAgentInstance>;
  join(ids: string[]): Promise<string>;
}
/** Options for spawning a new agent instance. */
export interface IAgentSpawnOptions {
  model?: string;
  provider?: string;
  systemPrompt?: string;
  parentId?: string;
  tools?: string[];
  maxTurns?: number;
  background?: boolean;
}