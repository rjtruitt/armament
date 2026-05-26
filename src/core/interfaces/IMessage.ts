/** Type union for MessageRole: user, assistant, system, tool. */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
/** A single message in a conversation with role, content, and optional tool calls. */
export interface IMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: IMessageMetadata;
  toolCalls?: IToolCall[];
  toolResults?: IToolResult[];
  thinking?: string;
}
/** Metadata attached to a message (model, provider, usage, timing). */
export interface IMessageMetadata {
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost?: number;
  latencyMs?: number;
  turnNumber?: number;
}
/** A tool invocation within a message with ID, name, and arguments. */
export interface IToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  startTime?: number;
}
/** The result of a tool call including output and optional error. */
export interface IToolResult {
  toolCallId: string;
  output: string;
  error?: string;
  durationMs?: number;
  aborted?: boolean;
}