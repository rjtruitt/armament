/**
 * Interface for a channel agent — decouples a2a and core from providers.
 *
 * The concrete ChannelAgent class in providers/ implements this interface.
 * Core and a2a code depend only on this shape, never on the concrete class.
 */

import type { ITool, ToolResult } from 'iteratio';
import type { ContextWindowConfig, CompactionResult, MessageManagerState, ContextUsage, RewindSnapshot } from 'iteratio';
import type { ILLMProvider } from './IProviderPool.js';

/**
 * StickyPosition type definition.
 */
export type StickyPosition = 'top' | 'bottom' | 'both';

/** Persistent reminder injected into every agent message. */
export interface StickyNote {
  content: string;
  position: StickyPosition;
}

/** Configuration for constructing a ChannelAgent. */
export interface IChannelAgentConfig {
  name: string;
  provider: ILLMProvider;
  model: string;
  providerType: string;
  providerName?: string;
  systemPrompt?: string;
  parentChannel?: string;
  maxTurns?: number;
  maxOutputTokens?: number;
  thinking?: { enabled: boolean; budgetTokens: number };
  /** Provider-specific options passed verbatim (effort, reasoning_effort, top_p, etc.). */
  modelOptions?: Record<string, unknown>;
  tools?: ITool[];
  stickyNotes?: StickyNote[];
  contextWindow?: ContextWindowConfig;
  onTurnStart?: (turnNumber: number) => void;
  onTurnComplete?: (turnNumber: number, response: string) => void;
  onToolCall?: (toolName: string, args: unknown) => void;
  onToolResult?: (toolName: string, args: unknown, result: ToolResult, durationMs: number) => void;
  onUsage?: (usage: any) => void;
  onCompaction?: (result: CompactionResult) => void;
  onPostCompact?: (result: CompactionResult, summary: string) => Promise<void>;
  onSessionDirty?: (channelName: string) => void;
}

/** Interface for the per-channel agent wrapper. */
import type { StreamEvent } from '../../providers/ChannelAgentStreaming.js';

/**
 * I channel agent interface.
 */
export interface IChannelAgent {
  readonly name: string;
  readonly model: string;
  readonly providerType: string;
  readonly providerName?: string;
  readonly nick: string;
  readonly parentChannel: string | undefined;
  turnCount: number;
  readonly maxTurns: number;
  readonly totalTokens: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly status: 'idle' | 'thinking' | 'tool_use' | 'complete' | 'error';

  /**
   * Queue a user message to inject into the conversation at the next tool-loop boundary.
   * The message will be added as a user-role message during the next streaming loop iteration.
   */
  injectMessage(content: string): void;
  /**
   * Check if a message with the given content is already queued for injection.
   * Used by nudge timers to avoid queuing duplicate maintenance prompts.
   * @returns true if an identical content string is already in the injection queue
   */
  hasPendingInjection(content: string): boolean;
  seedMessages(messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }>): void;
  sendMessage(input: string): Promise<string>;
  sendMessageStreaming(input: string, onToolCall?: (name: string, args: unknown) => void): AsyncGenerator<StreamEvent, void, unknown>;
  sendSystemMessage(content: string, trigger?: string): Promise<string>;
  /** Set the workspace path for the agent's tools (colon-separated for multi-path). */
  setWorkspace(dir: string): void;
  markComplete(): void;
  markError(): void;
  registerTool(tool: ITool): void;
  registerTools(tools: ITool[]): void;
  deregisterTool(name: string): boolean;
  getLastResponse(): string;
  pinFile(path: string): void;
  unpinFile(path: string): boolean;
  readonly pinnedFiles: string[];
  trackFileRead(path: string, lines: number): void;
  getFilesForReinjection(): Array<{ path: string; pinned: boolean }>;
  addStickyNote(content: string, position?: StickyPosition): void;
  removeStickyNote(index: number): StickyNote | null;
  getStickyNotes(): StickyNote[];
  addTokens(count: number): void;
  addCacheTokens(read: number, write: number): void;
  shutdown(): Promise<void>;
  getContextUsage(): ContextUsage;
  compact(force?: boolean): Promise<CompactionResult | null>;
  getSnapshots(): RewindSnapshot[];
  rewind(snapshotId: number): boolean;
  rewindToTurn(turn: number): boolean;
  exportSession(): MessageManagerState;
  importSession(state: Partial<MessageManagerState>): void;
}

/** Factory function type for creating ChannelAgent instances. */
export type ChannelAgentFactory = (config: IChannelAgentConfig) => IChannelAgent;
