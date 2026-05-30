/** Adapts flight-controller Model to iteratio ILLMProvider interface. */

import type { ILLMProvider } from './ProviderPool.js';
import { logError, logWarn } from '../core/index.js';

/** Safe JSON.parse — returns null on failure instead of throwing. */
function safeParseJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

/** Strip lone surrogates from a string — they break JSON serialization to LLM APIs.
 *  JavaScript allows lone surrogates in strings (e.g. broken emoji, truncated UTF-16),
 *  but JSON requires valid UTF-8. Replaces them with the Unicode replacement char. */
function sanitizeContent(s: string): string {
  return s.replace(/[\uD800-\uDFFF]/gu, '\uFFFD');
}

/** Normalized message format used by the adapter layer. */
export interface SimpleMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Content can be a plain string or an array of content blocks (for multi-modal). */
  content: string | Record<string, unknown>[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
  /** Reasoning/thinking content from models that support it (DeepSeek, o1/o3). Must be echoed back. */
  reasoning?: string;
}

/** OpenAI-style function tool definition passed to the model. */
export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

/** Normalized response from any LLM invocation. */
export interface SimpleLLMResponse {
  content: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
  reasoning?: string;
  finish_reason: string;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number; cache_read_tokens?: number; cache_write_tokens?: number };
  model?: string;
}

/** A single content block from a flight-controller model response/stream. */
interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  args?: unknown;
  arguments?: unknown;
  toolCallId?: string;
  content?: string;
  bytes?: number;
}

/** Minimal shape for a flight-controller model response. */
interface FlightControllerResponse {
  content?: ContentBlock[];
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
}

/** Minimal shape for a flight-controller stream chunk. */
interface FlightControllerStreamChunk {
  content?: ContentBlock[];
  done?: boolean;
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
}

interface FlightControllerModel {
  sendMessage(context: Record<string, unknown>): Promise<FlightControllerResponse>;
  sendMessageStream?(context: Record<string, unknown>): AsyncGenerator<FlightControllerStreamChunk>;
  getIdentity(): { id: string; displayName: string; provider: { id: string; displayName: string } };
  getCapabilities?(): { features?: { supportsStreaming?: boolean } };
}

/** Adapts a flight-controller Model to the ILLMProvider interface with token tracking. */
export class ModelToLLMAdapter implements ILLMProvider {
  private _lifetimeTokens = { input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0 };

  constructor(private model: FlightControllerModel) {}

  /**
   * Gets the lifetime tokens.
   */
  getLifetimeTokens(): { input: number; output: number; total: number; cacheRead: number; cacheWrite: number } {
    return this._lifetimeTokens;
  }

  /** Manually credits token usage from external sources (e.g. streaming tallies). */
  addExternalUsage(input: number, output: number, cacheRead = 0, cacheWrite = 0): void {
    this._lifetimeTokens.input += input;
    this._lifetimeTokens.output += output;
    this._lifetimeTokens.total += input + output;
    this._lifetimeTokens.cacheRead += cacheRead;
    this._lifetimeTokens.cacheWrite += cacheWrite;
  }

  /** Sends messages to the model synchronously and returns a structured response. */
  async invoke(messages: SimpleMessage[], options?: Record<string, unknown>): Promise<SimpleLLMResponse> {
    const rawMessages = messages.map(m => {
      const content: Record<string, unknown>[] = [];

      if (m.content && m.role !== 'tool') {
        if (Array.isArray(m.content)) {
          // Already content blocks (e.g. multi-modal: text + image) — sanitize text blocks
          content.push(...(m.content as Record<string, unknown>[]).map(b => {
            if (b.type === 'text' && typeof b.text === 'string') {
              return { ...b, text: sanitizeContent(b.text) };
            }
            return b;
          }));
        } else {
          content.push({ type: 'text' as const, text: sanitizeContent(m.content) });
        }
      }

      if (m.role === 'assistant' && m.reasoning) {
        content.push({ type: 'thinking' as const, thinking: sanitizeContent(m.reasoning) });
      }

      if (m.role === 'assistant' && m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_call' as const,
            id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? safeParseJSON(tc.arguments) : tc.arguments,
          });
        }
      }

      if (m.role === 'tool' && m.tool_call_id) {
        content.push({
          type: 'tool_result' as const,
          toolCallId: m.tool_call_id,
          content: m.content || '',
        });
      }

      const msg: Record<string, unknown> = {
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content,
      };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.name) msg.name = m.name;
      return msg;
    });

    const openAIMessages: Record<string, unknown>[] = [];
    for (const msg of rawMessages) {
      openAIMessages.push(msg);
    }
    for (const msg of openAIMessages) delete msg._isToolResult;

    const context: Record<string, unknown> = {
      messages: openAIMessages,
      maxTokens: options?.max_tokens,
      temperature: options?.temperature ?? 0.7,
      topP: options?.top_p,
      stopSequences: options?.stop,
    };
    if (options?.thinking) {
      context.thinking = options.thinking;
    }
    if (options?.tools) {
      context.tools = (options.tools as Record<string, unknown>[]).map((t: Record<string, unknown>) => {
        if (t.type === 'function' && t.function) return t;
        return {
          type: 'function',
          function: {
            name: t.name as string,
            description: t.description as string | undefined,
            parameters: t.input_schema ?? t.parameters ?? { type: 'object', properties: {} },
          },
        };
      });
    }

    const response = await this.model.sendMessage(context);

    const textContent = (response.content ?? [])
      .filter((c: ContentBlock) => c.type === 'text')
      .map((c: ContentBlock) => c.text ?? '')
      .join('');

    const toolCalls = (response.content ?? [])
      .filter((c: ContentBlock) => c.type === 'tool_call' && c.id != null)
      .map((c: ContentBlock) => ({
        id: c.id!,
        name: c.name ?? 'unknown',
        arguments: JSON.stringify(c.args ?? c.arguments ?? {}),
      }));

    const reasoningText = (response.content ?? [])
      .filter((c: ContentBlock) => c.type === 'thinking')
      .map((c: ContentBlock) => c.thinking ?? c.text ?? '')
      .join('');

    if (response.usage) {
      const inp = response.usage.inputTokens ?? 0;
      const out = response.usage.outputTokens ?? 0;
      const cr = response.usage.cacheReadTokens ?? 0;
      const cw = response.usage.cacheWriteTokens ?? 0;
      this._lifetimeTokens.input += inp;
      this._lifetimeTokens.output += out;
      this._lifetimeTokens.total += inp + out;
      this._lifetimeTokens.cacheRead += cr;
      this._lifetimeTokens.cacheWrite += cw;
    }

    return {
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      reasoning: reasoningText || undefined,
      finish_reason: response.finishReason === 'tool_calls' ? 'tool_calls' : 'stop',
      usage: response.usage ? {
        input_tokens: response.usage.inputTokens ?? 0,
        output_tokens: response.usage.outputTokens ?? 0,
        total_tokens: (response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0),
        cache_read_tokens: response.usage.cacheReadTokens ?? 0,
        cache_write_tokens: response.usage.cacheWriteTokens ?? 0,
      } : undefined,
      model: this.model.getIdentity().id,
    };
  }

  /** Streams model output, yielding incremental text, tool calls, and usage chunks. */
  async *invokeStream(messages: SimpleMessage[], options?: Record<string, unknown>): AsyncGenerator<{ type: string; text?: string; toolName?: string; toolCall?: Record<string, unknown>; usage?: Record<string, unknown>; bytes?: number }> {
    const capabilities = this.model.getCapabilities?.();
    const supportsStreaming = capabilities?.features?.supportsStreaming ?? true;
    if (!supportsStreaming || !this.model.sendMessageStream) {
      const result = await this.invoke(messages, options);
      yield { type: 'text', text: result.content };
      if (result.tool_calls) {
        for (const tc of result.tool_calls) {
          yield { type: 'tool_call', toolCall: tc };
        }
      }
      yield { type: 'done' };
      return;
    }

    const rawMessages = messages.map(m => {
      const content: Record<string, unknown>[] = [];
      if (m.content && m.role !== 'tool') {
        if (Array.isArray(m.content)) {
          // Already content blocks (e.g. multi-modal: text + image) — sanitize text blocks
          content.push(...(m.content as Record<string, unknown>[]).map(b => {
            if (b.type === 'text' && typeof b.text === 'string') {
              return { ...b, text: sanitizeContent(b.text) };
            }
            return b;
          }));
        } else {
          content.push({ type: 'text' as const, text: sanitizeContent(m.content) });
        }
      }
      if (m.role === 'assistant' && m.reasoning) {
        content.push({ type: 'thinking' as const, thinking: sanitizeContent(m.reasoning) });
      }
      if (m.role === 'assistant' && m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_call' as const,
            id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? safeParseJSON(tc.arguments) : tc.arguments,
          });
        }
      }
      if (m.role === 'tool' && m.tool_call_id) {
        content.push({
          type: 'tool_result' as const,
          toolCallId: m.tool_call_id,
          content: m.content || '',
        });
      }
      const msg: Record<string, unknown> = { role: m.role, content };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.name) msg.name = m.name;
      return msg;
    });

    const openAIMessages2: Record<string, unknown>[] = [];
    for (const msg of rawMessages) {
      openAIMessages2.push(msg);
    }

    const context: Record<string, unknown> = {
      messages: openAIMessages2,
      maxTokens: options?.max_tokens,
      temperature: options?.temperature ?? 0.7,
      topP: options?.top_p,
      stopSequences: options?.stop,
    };
    if (options?.thinking) {
      context.thinking = options.thinking;
    }
    if (options?.tools) {
      context.tools = (options.tools as Record<string, unknown>[]).map((t: Record<string, unknown>) => {
        if (t.type === 'function' && t.function) return t;
        return {
          type: 'function',
          function: {
            name: t.name as string,
            description: t.description as string | undefined,
            parameters: t.input_schema ?? t.parameters ?? { type: 'object', properties: {} },
          },
        };
      });
    }

    try {
      for await (const chunk of this.model.sendMessageStream(context)) {
        for (const block of chunk.content ?? []) {
          if (block.type === 'text') {
            yield { type: 'text', text: block.text };
          } else if (block.type === 'thinking') {
            yield { type: 'thinking', text: block.thinking ?? block.text };
          } else if (block.type === 'tool_start') {
            yield { type: 'tool_start', toolName: block.name };
          } else if (block.type === 'tool_progress') {
            yield { type: 'tool_progress', toolName: block.name, bytes: block.bytes };
          } else if (block.type === 'tool_call') {
            yield { type: 'tool_call', toolCall: { id: block.id, name: block.name, arguments: JSON.stringify(block.args ?? block.arguments ?? {}) } };
          }
        }
        if (chunk.done && chunk.usage) {
          const inp = chunk.usage.inputTokens ?? 0;
          const out = chunk.usage.outputTokens ?? 0;
          const cr = chunk.usage.cacheReadTokens ?? 0;
          const cw = chunk.usage.cacheWriteTokens ?? 0;
          const tot = inp + out;
          this._lifetimeTokens.input += inp;
          this._lifetimeTokens.output += out;
          this._lifetimeTokens.total += tot;
          this._lifetimeTokens.cacheRead += cr;
          this._lifetimeTokens.cacheWrite += cw;
          yield { type: 'usage', usage: { input_tokens: inp, output_tokens: out, total_tokens: tot, cache_read_tokens: cr, cache_write_tokens: cw } };
        }
        if (chunk.done) {
          yield { type: 'done' };
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Streaming is not implemented/i.test(msg)) {
        // Fall back to non-streaming for providers that don't support streaming (e.g. Gemini)
        const result = await this.invoke(messages, options);
        yield { type: 'text', text: result.content };
        if (result.tool_calls) {
          for (const tc of result.tool_calls) {
            yield { type: 'tool_call', toolCall: tc };
          }
        }
        yield { type: 'done' };
        return;
      }
      const isRateLimit = /throttl|rate.limit|too.many|TPM|RPM|429/i.test(msg);
      if (isRateLimit) {
        logWarn('adapter', `Rate limit hit: ${msg}`);
      } else {
        logError('adapter', `Stream error: ${msg}`, err);
      }
      throw err;
    }
  }

  /**
   * Gets the info.
   */
  getInfo() {
    const identity = this.model.getIdentity();
    return {
      provider: identity.provider?.id ?? 'unknown',
      model: identity.id,
      capabilities: ['tool_calling', 'streaming'],
    };
  }

  /**
   * Shutdown.
   */
  async shutdown(): Promise<void> {}
}
