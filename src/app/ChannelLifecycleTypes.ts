import { ProviderPool, AskUserHandler, CatalogManager } from '../providers/index.js';
import { DriftManager } from '../drift/index.js';
import { SessionPersistence } from '../session/index.js';
import type { McpManager } from './McpManager.js';
import { ThreadCoordinator } from '../threads/index.js';

/**
 * Minimal channel info tracked in the channel list.
 */
export interface ChannelInfo {
  name: string;
  agentId?: string;
  active: boolean;
}

/**
 * Agent info tracked in the agent manager list.
 */
export interface AgentInfo {
  id: string;
  name: string;
  model: string;
  provider: string;
  systemPrompt?: string;
  status: string;
  turnCount: number;
  tokenUsage: number;
  cost: number;
}

/**
 * Callbacks the host provides for TUI interactions.
 */
export interface ChannelLifecycleCallbacks {
  writeMessage(type: string, sender: string, text: string, channel?: string): void;
  addChannel(name: string): void;
  setActiveChannel(name: string): void;
  removeChannel(name: string): void;
  removeAgent(name: string): void;
  startThinking(channel: string): void;
  stopThinking(channel: string): void;
  updateAgentStatus(channel: string, status: string): void;
  addChannelChild(channel: string, child: { id: string; label: string; status: string; role: string }): void;
  updateChannelChild(channel: string, childId: string, update: { status: string }): void;
  removeChannelChild(channel: string, childId: string): void;
  writeToolBlock(toolName: string, argsStr: string, result: any, durationMs: number, channel: string): void;
  getChannelMessages(channel: string | undefined): Array<{ type: any; sender: string; content: string; timestamp: Date }>;
  beginStreamMessage?(nick: string, channel: string): void;
  resumeAgent?(channel: string): void;
  /** Trim channel buffer to keep system messages + last N non-system messages. */
  trimChannelBuffer(channel: string, summary: string, keepCount: number): void;
}

/**
 * Dependencies injected from the host.
 */
export interface ChannelLifecycleDeps {
  config: any;
  providerPool: ProviderPool;
  mcpManager: McpManager;
  catalogManager: CatalogManager;
  driftManager: DriftManager;
  sessionPersistence: SessionPersistence;
  askUserHandler: AskUserHandler;
  callbacks: ChannelLifecycleCallbacks;
  threadCoordinator?: ThreadCoordinator;
  calculateCost(model: string, inputTokens: number, outputTokens: number, cacheRead?: number, cacheWrite?: number): number;
  getUsageStats(): { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number; maxBudget?: number };
  updateUsageStats(input: number, output: number, total: number, cost: number): void;
  trackModelCost(model: string, cost: number, input: number, output: number): void;
  refreshProviderStats(): void;
  getActiveToolNames(): string[];
  setActiveToolNames(names: string[]): void;
}
