/**
 * Message protocol between main thread and agent worker threads.
 * All communication is via structured clone over MessagePort.
 */

import type { ToolResult } from 'iteratio';

// --- Stream chunk types (worker → main) ---

/** Stream chunk types sent from worker to main thread. */
export type StreamChunk =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_start'; toolName: string }
  | { kind: 'tool_progress'; toolName: string; bytes: number }
  | { kind: 'tool_call'; toolCall: { id: string; name: string; arguments: string } }
  | { kind: 'tool_result'; toolName: string; toolCall: any; result: ToolResult; durationMs: number }
  | { kind: 'done' };

// --- Main → Worker messages ---

/** Messages sent from main thread to worker. */
export type InboundMessage =
  | { type: 'send_message'; id: string; input: string }
  | { type: 'register_tool'; toolDef: SerializedToolDef }
  | { type: 'deregister_tool'; name: string }
  | { type: 'export_session'; id: string }
  | { type: 'import_session'; state: any }
  | { type: 'compact'; force: boolean; id: string }
  | { type: 'interrupt' }
  | { type: 'shutdown' }
  | { type: 'add_sticky'; content: string; position: 'top' | 'bottom' | 'both' }
  | { type: 'add_system_message'; content: string }
  | { type: 'remove_sticky'; index: number }
  | { type: 'mark_complete' }
  | { type: 'mark_error' }
  | { type: 'mcp_tool_result'; requestId: string; result: ToolResult }
  | { type: 'subworker_complete'; workerId: string; response: string }
  | { type: 'subworker_error'; workerId: string; error: string }
  | { type: 'set_workspace'; workspace: string };

// --- Worker → Main messages ---

/** Messages sent from worker to main thread. */
export type OutboundMessage =
  | { type: 'ready' }
  | { type: 'stream_chunk'; chunk: StreamChunk }
  | { type: 'turn_start'; turnNumber: number }
  | { type: 'turn_complete'; turnNumber: number; response: string }
  | { type: 'tool_call'; toolName: string; args: unknown }
  | { type: 'tool_result'; toolName: string; args: unknown; result: ToolResult; durationMs: number }
  | { type: 'usage'; usage: { input_tokens: number; output_tokens: number; total_tokens: number; cache_read_tokens?: number; cache_write_tokens?: number } }
  | { type: 'error'; message: string; code?: string; fatal?: boolean }
  | { type: 'status_change'; status: string }
  | { type: 'session_dirty'; channelName: string }
  | { type: 'compaction'; before: number; after: number }
  | { type: 'export_session_result'; id: string; state: any }
  | { type: 'compact_result'; id: string; result: any }
  | { type: 'context_usage'; current: number; max: number; percent: number; headroom: number }
  | { type: 'request_subworker'; id: string; config: SubworkerConfig }
  | { type: 'worker_progress'; workerId: string; progress: string; percent?: number }
  | { type: 'worker_complete'; workerId: string; response: string }
  | { type: 'worker_error'; workerId: string; error: string }
  | { type: 'worker_ask'; workerId: string; question: string }
  | { type: 'mcp_tool_request'; requestId: string; server: string; tool: string; args: unknown }
  | { type: 'auth_required'; provider: string; info: any }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; component: string; message: string; data?: any };

// --- Config passed as workerData ---

/** Configuration passed to a channel worker thread via workerData. */
export interface ChannelThreadConfig {
  channelName: string;
  provider: {
    type: string;
    model: string;
    region?: string;
    profile?: string;
    apiKey?: string;
    baseUrl?: string;
    streaming?: boolean;
  };
  systemPrompt?: string;
  maxTurns?: number;
  maxOutputTokens?: number;
  tools: SerializedToolDef[];
  stickyNotes?: Array<{ content: string; position: 'top' | 'bottom' | 'both' }>;
  contextWindow?: {
    maxTokens: number;
    compactThreshold: number;
    recentMessagesToKeep: number;
    summaryTargetRatio: number;
  };
  isWorker?: boolean;
  parentChannel?: string;
  workerMaxTurns?: number;
}

/** Serialized tool definition sent across threads. */
export interface SerializedToolDef {
  name: string;
  description: string;
  inputSchema: any;
  isMcp?: boolean;
  mcpServer?: string;
}

/** Configuration for spawning a sub-worker thread. */
export interface SubworkerConfig {
  name: string;
  task: string;
  model?: string;
  systemPrompt?: string;
  tools?: SerializedToolDef[];
}

// --- Thread handle metadata (main-thread side) ---

/** Metadata about a running thread, tracked on the main thread side. */
export interface ThreadInfo {
  channelName: string;
  model: string;
  providerType: string;
  status: 'idle' | 'thinking' | 'tool_use' | 'streaming' | 'error' | 'dead';
  turnCount: number;
  totalTokens: number;
  cacheRead: number;
  cacheWrite: number;
  contextPercent: number;
  contextTokens: number;
  startedAt: number;
  lastActivity: number;
}
