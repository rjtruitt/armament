/** Adapts flight-controller Model to iteratio ILLMProvider interface. */

import type { ILLMProvider } from './ProviderPool.js';
import { logError, logWarn } from '../core/index.js';

/** Normalized message format used by the adapter layer. */
export interface SimpleMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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

interface FlightControllerModel {
  sendMessage(context: any): Promise<any>;
  sendMessageStream?(context: any): AsyncGenerator<any>;
  getIdentity(): { id: string; displayName: string; provider: any };
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
  async invoke(messages: SimpleMessage[], options?: any): Promise<SimpleLLMResponse> {
    const rawMessages = messages.map(m => {
      const content: any[] = [];

      if (m.content && m.role !== 'tool') {
        content.push({ type: 'text' as const, text: m.content });
      }

      if (m.role === 'assistant' && m.reasoning) {
        content.push({ type: 'thinking' as const, thinking: m.reasoning });
      }

      if (m.role === 'assistant' && m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_call' as const,
            id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
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

      const msg: any = {
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content,
      };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.name) msg.name = m.name;
      return msg;
    });

    const openAIMessages: any[] = [];
    for (const msg of rawMessages) {
      openAIMessages.push(msg);
    }
    for (const msg of openAIMessages) delete msg._isToolResult;

    const context: any = {
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
      context.tools = options.tools.map((t: any) => {
        if (t.type === 'function' && t.function) return t;
        return {
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema ?? t.parameters ?? { type: 'object', properties: {} },
          },
        };
      });
    }

    const response = await this.model.sendMessage(context);

    const textContent = (response.content ?? [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    const toolCalls = (response.content ?? [])
      .filter((c: any) => c.type === 'tool_call')
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        arguments: JSON.stringify(c.args ?? c.arguments ?? {}),
      }));

    const reasoningText = (response.content ?? [])
      .filter((c: any) => c.type === 'thinking')
      .map((c: any) => c.thinking ?? c.text ?? '')
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
  async *invokeStream(messages: SimpleMessage[], options?: any): AsyncGenerator<{ type: string; text?: string; toolName?: string; toolCall?: any; usage?: any; bytes?: number }> {
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
      const content: any[] = [];
      if (m.content && m.role !== 'tool') {
        content.push({ type: 'text' as const, text: m.content });
      }
      if (m.role === 'assistant' && m.reasoning) {
        content.push({ type: 'thinking' as const, thinking: m.reasoning });
      }
      if (m.role === 'assistant' && m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_call' as const,
            id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
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
      const msg: any = { role: m.role, content };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.name) msg.name = m.name;
      return msg;
    });

    const openAIMessages2: any[] = [];
    for (const msg of rawMessages) {
      openAIMessages2.push(msg);
    }

    const context: any = {
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
      context.tools = options.tools.map((t: any) => {
        if (t.type === 'function' && t.function) return t;
        return {
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
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
            yield { type: 'tool_progress', toolName: (block as { name?: string }).name, bytes: (block as { bytes?: number }).bytes };
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
    } catch (err: any) {
      const isRateLimit = /throttl|rate.limit|too.many|TPM|RPM|429/i.test(err.message ?? '');
      if (isRateLimit) {
        logWarn('adapter', `Rate limit hit: ${err.message}`);
      } else {
        logError('adapter', `Stream error: ${err.message}`, err);
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
