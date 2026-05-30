/** Streaming message implementation and message-history utilities for ChannelAgent. */

import type { ITool, ToolResult } from 'iteratio';
import type { IAgentLoop, IMessageManager, CompactionResult } from 'iteratio';
import type { ILLMProvider } from './ProviderPool.js';
import { logError } from '../core/index.js';

/**
 * Sanitizes orphaned tool messages in both directions:
 *
 * 1. Tool responses (role: "tool") whose tool_call_id doesn't match any
 *    assistant message's tool_calls — these are orphaned by compaction or
 *    session truncation and would cause a 400 error from the API.
 *
 * 2. Assistant messages with tool_calls that have no matching tool response
 *    after them — strips the tool_calls so the API doesn't expect results.
 *
 * 3. Tool results that are **interleaved** with another assistant message
 *    — e.g. assistant(A,tc), assistant(B,tc), tool(B), tool(A) — are
 *    **reordered** so each tool result sits right after its originating
 *    assistant. The API requires: assistant(tc) → tool → tool → assistant.
 *    Reordering preserves all data instead of dropping calls or results.
 */
export function sanitizeOrphanedToolCalls(mm: IMessageManager): void {
  const messages = mm.getMessages();
  if (messages.length === 0) return;

  // --- Pass 1: collect all valid tool_call_ids from assistant messages ---
  const validToolCallIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id) validToolCallIds.add(tc.id);
      }
    }
  }

  // --- Pass 2: remove tool responses whose tool_call_id has no matching assistant ---
  let changed = false;
  const filtered = messages.filter((msg) => {
    if (msg.role === 'tool' && msg.tool_call_id && !validToolCallIds.has(msg.tool_call_id)) {
      changed = true;
      return false; // drop orphaned tool response
    }
    return true;
  });

  // --- Pass 3: fix blocked tool results (interleaved or blocked by user/system messages) ---
  // The API requires: assistant(tc) → tool → tool → ... no other roles in between.
  // If a tool result appears after another assistant (interleaved) OR after a
  // non-tool message (blocked by user/system), strip the tool_calls from the
  // originating assistant. The orphaned tool result gets dropped by Pass 2.
  const assistantIndices: number[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (filtered[i].role === 'assistant') assistantIndices.push(i);
  }

  for (let ai = 0; ai < assistantIndices.length; ai++) {
    const idx = assistantIndices[ai];
    const msg = filtered[idx];
    if (!msg.tool_calls || msg.tool_calls.length === 0) continue;

    const nextAssistantIdx = assistantIndices[ai + 1] ?? filtered.length;

    // Collect tool call IDs for THIS assistant
    const tcIds = new Set(msg.tool_calls.filter(tc => tc.id).map(tc => tc.id));

    // Check if any tool result is blocked (user/system in between originating
    // assistant and its tool result) or entirely missing (no matching tool msg).
    let blockedOrMissing = false;
    for (const tcId of tcIds) {
      let foundBlockerBeforeResult = false;
      let foundResult = false;
      for (let j = idx + 1; j < filtered.length; j++) {
        if (filtered[j].role === 'tool' && filtered[j].tool_call_id === tcId) {
          foundResult = true;
          break; // found the result — check if we saw a blocker along the way
        }
        // Non-tool message before finding this result = blocked
        if (filtered[j].role !== 'tool') {
          foundBlockerBeforeResult = true;
        }
      }
      if (!foundResult || foundBlockerBeforeResult) {
        blockedOrMissing = true;
        break;
      }
    }

    if (blockedOrMissing) {
      filtered[idx] = { ...msg, tool_calls: undefined };
      changed = true;
    }
  }

  if (changed) {
    mm.clear();
    for (const m of filtered) {
      mm.addMessage(m);
    }
  }
}

/** Event yielded from the streaming message generator. */
export interface StreamEvent {
  type: 'text' | 'thinking' | 'tool_start' | 'tool_progress' | 'tool_call' | 'tool_result' | 'done';
  text?: string;
  toolName?: string;
  /** Tool call with id, name, and JSON-string arguments. */
  toolCall?: { id?: string; name?: string; arguments?: string };
  /** Tool result with success status, data, and optional error details. */
  result?: { success: boolean; data?: unknown; error?: { message: string; code?: string; details?: unknown }; durationMs?: number };
  durationMs?: number;
  bytes?: number;
}

/** Configuration subset needed by the streaming implementation. */
export interface StreamingConfig {
  name: string;
  provider: ILLMProvider;
  maxTurns?: number;
  maxOutputTokens?: number;
  thinking?: { enabled: boolean; budgetTokens: number };
  /** Provider-specific options passed verbatim (effort, reasoning_effort, top_p, etc.). */
  modelOptions?: Record<string, unknown>;
  /** If true, the streaming loop should abort ASAP — used for interrupt. */
  isInterrupted?: () => boolean;
  onTurnStart?: (turnNumber: number) => void;
  onTurnComplete?: (turnNumber: number, response: string) => void;
  onToolCall?: (toolName: string, args: unknown) => void;
  onToolResult?: (toolName: string, args: unknown, result: ToolResult, durationMs: number) => void;
  onUsage?: (usage: { input_tokens: number; output_tokens: number; total_tokens: number }) => void;
  onCompaction?: (result: CompactionResult) => void;
  onSessionDirty?: (channelName: string) => void;
}

/** Mutable state passed into the streaming loop from ChannelAgent. */
export interface StreamingState {
  turnCount: number;
  totalTokens: number;
  cacheRead: number;
  cacheWrite: number;
  status: 'idle' | 'thinking' | 'tool_use' | 'complete' | 'error';
  injectedMessages: string[];
  /** Per-tool failure tracking — { failCount, lastFailureMs } for time-based cooldown. */
  toolFailCounts: Map<string, { count: number; lastFailure: number }>;
}

const MAX_TOOL_FAILURES = 5;
/** Agent-level circuit breaker cooldown — matches the BashCircuitBreaker cooldown. */
const TOOL_FAIL_COOLDOWN_MS = 15_000;

/** Build the options object passed to provider.invokeStream. */
function buildInvokeOptions(
  config: StreamingConfig,
  toolDefs: unknown[],
): Record<string, unknown> {
  const options: Record<string, unknown> = { temperature: 0.7 };
  if (config.maxOutputTokens) options.max_tokens = config.maxOutputTokens;
  if (config.thinking) {
    options.thinking = config.thinking;
    if (!options.max_tokens) options.max_tokens = 16000;
  }
  if (config.modelOptions) Object.assign(options, config.modelOptions);
  if (toolDefs.length > 0) options.tools = toolDefs;
  return options;
}

/** Handle empty LLM response: retry or give up. */
function tryHandleSilentRetry(
  fullText: string,
  hasToolCalls: boolean,
  silentRetries: number,
  maxRetries: number,
): { shouldContinue: boolean; shouldBreak: boolean; errorText?: string } {
  if (fullText || hasToolCalls) return { shouldContinue: false, shouldBreak: false };
  if (silentRetries < maxRetries) return { shouldContinue: true, shouldBreak: false };
  return {
    shouldContinue: false,
    shouldBreak: true,
    errorText: `[LLM returned no response after ${maxRetries} retries. The API may be degraded. Try again.]`,
  };
}

/** Execute one tool call with circuit breaker. Returns the result, duration, and parsed args. */
async function executeOneTool(
  tc: { id: string; name: string; arguments: string },
  loop: IAgentLoop,
  state: StreamingState,
  config: StreamingConfig,
  onToolCall: ((name: string, args: unknown) => void) | undefined,
): Promise<{ result: ToolResult; durationMs: number; args: unknown }> {
  let args: unknown;
  try {
    args = JSON.parse(tc.arguments);
  } catch (parseErr: unknown) {
    const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    return {
      result: { success: false, error: { message: `Invalid JSON in tool arguments: ${errMsg}.`, code: 'PARSE_ERROR' } },
      durationMs: 0,
      args: {},
    };
  }

  const failEntry = state.toolFailCounts.get(tc.name);
  let failCount = failEntry?.count ?? 0;
  if (failEntry && Date.now() - failEntry.lastFailure >= TOOL_FAIL_COOLDOWN_MS) {
    failCount = 0;
    state.toolFailCounts.delete(tc.name);
  }
  if (failCount >= MAX_TOOL_FAILURES) {
    return {
      result: { success: false, error: { message: `CIRCUIT BREAKER: "${tc.name}" has failed ${failCount} consecutive times. Try a different approach.`, code: 'CIRCUIT_BREAK' } },
      durationMs: 0,
      args,
    };
  }

  onToolCall?.(tc.name, args);
  config.onToolCall?.(tc.name, args);
  const startMs = Date.now();
  const tool = loop.getTool(tc.name);
  let result: ToolResult;
  if (tool) {
    try {
      result = await tool.execute(args, { turnNumber: state.turnCount, state: {}, metadata: {} });
    } catch (e: unknown) {
      result = { success: false, error: { message: e instanceof Error ? e.message : String(e), code: 'TOOL_ERROR' } };
    }
  } else {
    result = { success: false, error: { message: `Tool not found: ${tc.name}`, code: 'NOT_FOUND' } };
  }

  const durationMs = Date.now() - startMs;
  if (!result.success) {
    state.toolFailCounts.set(tc.name, { count: failCount + 1, lastFailure: Date.now() });
  } else {
    state.toolFailCounts.delete(tc.name);
  }
  return { result, durationMs, args };
}

/** Add tool result messages to the message manager. */
function addToolResults(
  mm: IMessageManager,
  toolResults: Array<{ tc: { id: string; name: string; arguments: string }; result: ToolResult; durationMs: number }>,
): void {
  for (const { tc, result } of toolResults) {
    const rawContent = result.success ? result.data : result.error;
    const safeContent = typeof rawContent === 'string'
      ? rawContent.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
      : rawContent;
    mm.addMessage({
      role: 'tool',
      content: JSON.stringify(safeContent),
      tool_call_id: tc.id,
    });
  }
}

/**
 * Runs the streaming message loop. Yields StreamEvents as the provider streams responses.
 * Handles tool execution, circuit-breaking, message injection, and compaction.
 */
export async function* runStreamingLoop(
  loop: IAgentLoop,
  config: StreamingConfig,
  state: StreamingState,
  augmentedInput: string | Record<string, unknown>[],
  onToolCall: ((name: string, args: unknown) => void) | undefined,
  runPostCompact: (result: CompactionResult, mm: IMessageManager) => Promise<void>,
): AsyncGenerator<StreamEvent> {
  const provider = config.provider as ILLMProvider & {
    invokeStream?: (messages: unknown[], options?: unknown) => AsyncGenerator<{
      type: string; text?: string; toolName?: string;
      toolCall?: { id: string; name: string; arguments: string };
      usage?: Record<string, number>; bytes?: number;
    }>;
  };

  if (!provider.invokeStream) {
    const response = await loop.runTurn(typeof augmentedInput === 'string' ? augmentedInput : '', config.maxTurns);
    yield { type: 'text', text: response };
    yield { type: 'done' };
    return;
  }

  try {
    const mm = loop.getMessageManager();
    sanitizeOrphanedToolCalls(mm);
    mm.addMessage({ role: 'user', content: augmentedInput } as any);
    const maxIterations = config.maxTurns ?? 200;
    const MAX_SILENT_RETRIES = 3;
    let silentRetries = 0;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      if (config.isInterrupted?.()) {
        state.status = 'idle';
        break;
      }

      sanitizeOrphanedToolCalls(mm);
      const messages = mm.getMessages();
      const options = buildInvokeOptions(config, loop.getToolDefinitions());

      // ------ Stream chunks ------
      let fullText = '';
      let fullThinking = '';
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
      let hasToolCalls = false;

      for await (const chunk of provider.invokeStream(messages, options)) {
        if (chunk.type === 'text' && chunk.text) {
          fullText += chunk.text;
          yield { type: 'text', text: chunk.text };
        } else if (chunk.type === 'thinking' && chunk.text) {
          fullThinking += chunk.text;
          yield { type: 'thinking', text: chunk.text };
        } else if (chunk.type === 'tool_start') {
          yield { type: 'tool_start', toolName: chunk.toolName };
        } else if (chunk.type === 'tool_progress') {
          yield { type: 'tool_progress', toolName: chunk.toolName, bytes: chunk.bytes };
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          toolCalls.push(chunk.toolCall);
          hasToolCalls = true;
          yield { type: 'tool_call', toolCall: chunk.toolCall };
        } else if (chunk.type === 'usage' && chunk.usage) {
          const totalTok = chunk.usage.total_tokens || (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0);
          state.totalTokens += totalTok;
          state.cacheRead += chunk.usage.cache_read_tokens ?? 0;
          state.cacheWrite += chunk.usage.cache_write_tokens ?? 0;
          config.onUsage?.({
            input_tokens: chunk.usage.input_tokens || 0,
            output_tokens: chunk.usage.output_tokens || 0,
            total_tokens: totalTok,
          });
        }
      }

      // ------ Silent retry ------
      if (!fullText && !hasToolCalls) {
        silentRetries++;
        const retry = tryHandleSilentRetry(fullText, hasToolCalls, silentRetries, MAX_SILENT_RETRIES);
        if (retry.shouldContinue) {
          state.status = 'thinking';
          continue;
        }
        if (retry.errorText) {
          yield { type: 'text', text: retry.errorText };
          mm.addMessage({ role: 'assistant', content: `[No response — retries exhausted]` });
        }
        break;
      }

      mm.addMessage({
        role: 'assistant',
        content: fullText,
        tool_calls: toolCalls.length > 0 ? toolCalls.map(tc => ({
          id: tc.id, name: tc.name, arguments: tc.arguments,
        })) : undefined,
        reasoning: fullThinking || undefined,
      });

      // ------ Stop check ------
      if (!hasToolCalls && state.injectedMessages.length === 0) break;

      // ------ Tool execution ------
      state.status = 'tool_use';
      let hitTerminal = false;
      const toolResults: Array<{ tc: typeof toolCalls[0]; result: ToolResult; durationMs: number }> = [];
      for (const tc of toolCalls) {
        const executed = await executeOneTool(tc, loop, state, config, onToolCall);
        config.onToolResult?.(tc.name, executed.args, executed.result, executed.durationMs);
        yield { type: 'tool_result' as const, toolName: tc.name, toolCall: tc, result: executed.result, durationMs: executed.durationMs };
        toolResults.push({ tc, result: executed.result, durationMs: executed.durationMs });
        if (executed.result.success && (executed.result.data as Record<string, unknown> | undefined)?._terminal) {
          hitTerminal = true;
        }
      }
      addToolResults(mm, toolResults);

      if (hitTerminal) break;

      while (state.injectedMessages.length > 0) {
        const injected = state.injectedMessages.shift()!;
        mm.addMessage({ role: 'user', content: injected });
      }

      state.status = 'thinking';
    }

    mm.takeSnapshot();
    if (mm.shouldCompact()) {
      const result = await mm.autoCompact();
      if (result) {
        config.onCompaction?.(result);
        await runPostCompact(result, mm);
      }
    }
    config.onSessionDirty?.(config.name);
    state.status = 'idle';
    config.onTurnComplete?.(state.turnCount, '');
    yield { type: 'done' };
  } catch (err: unknown) {
    logError('agent', `sendMessageStreaming error on ${config.name}`, err);
    state.status = 'idle';
    config.onTurnComplete?.(state.turnCount, '');
    throw err;
  }
}
