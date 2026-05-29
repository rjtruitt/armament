/** Unified interface for invoking any LLM provider through the adapter layer. */

/**
 * Normalized message input accepted by all providers.
 * Messages have already been converted to the universal format by ModelToLLMAdapter
 * before reaching this interface.
 */
export interface ILLMProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
  reasoning?: string;
}

/**
 * Normalized response from any LLM invocation.
 * Tool calls always have string-serialized arguments (JSON) that must be parsed
 * before execution. See tool-system.md contract for details.
 */
export interface ILLMProviderResponse {
  content: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
  reasoning?: string;
  finish_reason: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
  };
  model?: string;
}

/** Provider metadata returned by getInfo(). */
export interface ILLMProviderInfo {
  provider: string;
  model: string;
  capabilities: string[];
}

/** Unified interface for invoking any LLM provider through the adapter layer. */
export interface ILLMProvider {
  /** Send messages and return a structured response. */
  invoke(messages: ILLMProviderMessage[], options?: Record<string, unknown>): Promise<ILLMProviderResponse>;
  /** Provider metadata (id, model, capabilities). */
  getInfo?(): ILLMProviderInfo;
  /** Gracefully shut down provider resources (connections, timers). */
  shutdown?(): Promise<void>;
}

/** Options for creating a provider instance via the pool. */
export interface IProviderPoolOptions {
  region?: string;
  profile?: string;
  apiKey?: string;
  baseURL?: string;
  streaming?: boolean;
  providerName?: string;
}

/**
 * Deduplicating provider pool — ensures each (type, model) combo has at most
 * one active provider instance. Manages lifecycle, auth, and rate limiting.
 */
export interface IProviderPool {
  /** Get or create a provider instance for the given type and model. */
  getOrCreate(providerType: string, model: string, opts?: IProviderPoolOptions): Promise<ILLMProvider>;
  /** Get an existing provider instance, or undefined if not yet created. */
  get(providerType: string, model: string): ILLMProvider | undefined;
  /** Check if a provider instance already exists for the given type and model. */
  has(providerType: string, model: string): boolean;
  /** Number of active provider instances in the pool. */
  readonly size: number;
}
