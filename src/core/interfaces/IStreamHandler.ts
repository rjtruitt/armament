/** Interface for IStreamHandler. */
export interface IStreamHandler {
  onToken(token: string): void;
  onThinking(text: string): void;
  onToolStart(call: IStreamToolEvent): void;
  onToolEnd(result: IStreamToolResult): void;
  onError(error: Error): void;
  onComplete(metadata: IStreamMetadata): void;
  onInterrupt(): void;
  isInterrupted(): boolean;
}
/** An event representing a tool call during streaming. */
export interface IStreamToolEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  startTime: number;
}
/** The result of a completed tool call during streaming. */
export interface IStreamToolResult {
  id: string;
  output: string;
  durationMs: number;
  error?: string;
}
/** Metadata about a completed streaming response (usage, timing, cost). */
export interface IStreamMetadata {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
  provider: string;
  latencyMs: number;
  cost: number;
}