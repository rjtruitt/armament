/** Shared flight-controller provider pool with per-model deduplication. */

import {
  BedrockProvider,
  OpenAIProvider,
  AnthropicProvider,
  GeminiProvider,
  AWSSSOAuth,
  ModelIdentity,
  ModelCapability,
  type DeviceCodeInfo,
  type ContentType,
  type IAuthHandler,
} from 'flight-controller';
import { ModelToLLMAdapter } from './ModelToLLMAdapter.js';
import type { ILLMProvider, IProviderPool } from '../core/index.js';

export type { ILLMProvider };

/** Configuration for ProviderPool, including auth event callbacks. */
export interface ProviderPoolConfig {
  onDeviceCode?: (info: DeviceCodeInfo) => void;
}

/** Minimum provider interface for the pool (duck-typing for provider instances). */
interface PooledProvider {
  getCapabilities?: () => { features?: { supportsStreaming?: boolean } };
  shutdown?: () => Promise<void>;
}

/** Deduplicating pool of LLM provider instances keyed by provider:model. */
export class ProviderPool implements IProviderPool {
  private _pool: Map<string, { provider: PooledProvider; adapter: ILLMProvider; opts?: { apiKey?: string; baseURL?: string; region?: string; profile?: string; streaming?: boolean; providerName?: string } }> = new Map();
  private _config: ProviderPoolConfig;

  constructor(config: ProviderPoolConfig = {}) {
    this._config = config;
  }

  /**
   * Sets the config.
   */
  setConfig(config: Partial<ProviderPoolConfig>): void {
    Object.assign(this._config, config);
  }

  private makeKey(providerType: string, model: string): string {
    return `${providerType}:${model}`;
  }

  /** Returns an existing adapter or creates a new one for the given provider/model pair. */
  async getOrCreate(providerType: string, model: string, opts?: {
    region?: string;
    profile?: string;
    apiKey?: string;
    baseURL?: string;
    streaming?: boolean;
    providerName?: string;
  }): Promise<ILLMProvider> {
    const key = this.makeKey(providerType, model);

    // If streaming flag changed on a cached provider, purge so it recreates with new capabilities
    if (opts?.streaming !== undefined && this._pool.has(key)) {
      const existing = this._pool.get(key)!;
      const caps = (existing.provider as { getCapabilities?: () => { features?: { supportsStreaming?: boolean } } }).getCapabilities?.();
      const currentStreaming = caps?.features?.supportsStreaming;
      if (currentStreaming !== undefined && currentStreaming !== opts.streaming) {
        this._pool.delete(key);
      }
    }

    // Purge cached entry if API key, baseURL, region, or profile changed
    if (this._pool.has(key) && opts) {
      const existing = this._pool.get(key)!;
      const o = existing.opts ?? {};
      if ((opts.apiKey !== undefined && o.apiKey !== opts.apiKey) ||
          (opts.baseURL !== undefined && o.baseURL !== opts.baseURL) ||
          (opts.region !== undefined && o.region !== opts.region) ||
          (opts.profile !== undefined && o.profile !== opts.profile)) {
        this._pool.delete(key);
      }
    }

    if (this._pool.has(key)) {
      return this._pool.get(key)!.adapter;
    }

    // Provider variable branches across BedrockProvider, OpenAIProvider, etc. — no single concrete type
    let provider: unknown;

    if (providerType === 'bedrock') {
      const region = opts?.region ?? 'us-west-2';

      const identity = new ModelIdentity({
        id: model,
        displayName: extractNick(model),
        provider: { id: 'bedrock', displayName: 'AWS Bedrock', region },
        family: model.includes('claude') ? 'claude' : undefined,
      });

      const capabilities = {
        capabilities: new Set([ModelCapability.CHAT, ModelCapability.FUNCTION_CALLING, ModelCapability.STREAMING]),
        features: {
          contextWindow: 200000,
          maxOutputTokens: 64000,
          supportsStreaming: true,
          supportsFunctions: true,
          supportsVision: false,
          supportsAudio: false,
        },
        toolHandling: { mode: 'native' as const, maxTools: 64, supportsParallel: true },
        inputTypes: new Set<ContentType>(['text']),
        outputTypes: new Set<ContentType>(['text']),
      };
      provider = new BedrockProvider({
        identity,
        capabilities,
        modelId: model,
        region,
        profile: opts?.profile,
      });

      if (opts?.profile && (provider as { awsAuth?: { setAuthHandler: (h: IAuthHandler) => void } }).awsAuth?.setAuthHandler) {
        const onDeviceCode = this._config.onDeviceCode;
        const authHandler: IAuthHandler = {
          async handleDeviceCodeAuth(info: DeviceCodeInfo): Promise<void> {
            onDeviceCode?.(info);
          },
          async handleBrowserAuth(_url: string): Promise<string> { return ''; },
          async handleRefreshPrompt(_message: string): Promise<boolean> { return false; },
          async handleAuthError(_error: Error): Promise<void> {},
          onAuthenticationFailed(_info: { provider: string; reason: string; canRetry: boolean }): void {},
        };
        (provider as { awsAuth: { setAuthHandler: (h: IAuthHandler) => void } }).awsAuth.setAuthHandler(authHandler);
      }
    } else if (providerType === 'openai' || providerType === 'anthropic' || providerType === 'gemini' || providerType === 'ollama') {
      const displayNames: Record<string, string> = {
        openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini', ollama: 'Ollama',
      };
      const apiKey = providerType === 'ollama' ? 'ollama' : opts?.apiKey;
      if (!apiKey) throw new Error(`API key is required for ${displayNames[providerType]} provider`);

      const identity = new ModelIdentity({
        id: model,
        displayName: extractNick(model),
        provider: { id: providerType, displayName: opts?.providerName ?? displayNames[providerType] },
        family: model.includes('gpt') ? 'gpt' : model.includes('claude') ? 'claude' : model.includes('gemini') ? 'gemini' : undefined,
      });

      const capabilities = {
        capabilities: new Set([ModelCapability.CHAT, ModelCapability.FUNCTION_CALLING, ModelCapability.STREAMING]),
        features: {
          contextWindow: 200000,
          maxOutputTokens: 64000,
          supportsStreaming: opts?.streaming ?? true,
          supportsFunctions: true,
          supportsVision: false,
          supportsAudio: false,
        },
        toolHandling: { mode: 'native' as const, maxTools: 64, supportsParallel: true },
        inputTypes: new Set<ContentType>(['text']),
        outputTypes: new Set<ContentType>(['text']),
      };

      const baseConfig = { identity, capabilities, modelId: model };

      if (providerType === 'anthropic') {
        provider = new AnthropicProvider({ ...baseConfig, apiKey, baseURL: opts?.baseURL });
      } else if (providerType === 'gemini') {
        provider = new GeminiProvider({ ...baseConfig, apiKey });
      } else {
        provider = new OpenAIProvider({ ...baseConfig, apiKey, baseURL: opts?.baseURL });
      }
    }

    if (!provider) {
      throw new Error(`Unsupported provider type: ${providerType}`);
    }

    const adapter = new ModelToLLMAdapter(provider as any);
    this._pool.set(key, { provider, adapter, opts });
    return adapter;
  }

  /**
   * Get.
   */
  get(providerType: string, model: string): ILLMProvider | undefined {
    return this._pool.get(this.makeKey(providerType, model))?.adapter;
  }

  /**
   * Has.
   */
  has(providerType: string, model: string): boolean {
    return this._pool.has(this.makeKey(providerType, model));
  }

  /**
   * Gets the size.
   */
  get size(): number {
    return this._pool.size;
  }

  /** Aggregates lifetime token usage per model across all pooled adapters. */
  getPerModelStats(): Map<string, { tokens: number; input: number; output: number; cacheRead: number; cacheWrite: number; providerName?: string }> {
    const stats = new Map<string, { tokens: number; input: number; output: number; cacheRead: number; cacheWrite: number; providerName?: string }>();
    for (const [key, entry] of this._pool) {
      const adapter = entry.adapter as ModelToLLMAdapter;
      if (adapter.getLifetimeTokens) {
        const lt = adapter.getLifetimeTokens();
        stats.set(key, { tokens: lt.total, input: lt.input, output: lt.output, cacheRead: lt.cacheRead, cacheWrite: lt.cacheWrite, providerName: entry.opts?.providerName });
      }
    }
    return stats;
  }
}

/** Extracts a short nickname from a full model ID string. */
export function extractNick(model: string): string {
  const match = model.match(/claude-(\w+)/i);
  if (match) return match[1];
  if (model.includes('gpt')) {
    const gptMatch = model.match(/gpt-(\S+)/i);
    return gptMatch ? `gpt-${gptMatch[1]}` : 'gpt';
  }
  if (model.includes('gemini')) {
    const gemMatch = model.match(/gemini-(\S+)/i);
    return gemMatch ? `gemini-${gemMatch[1]}` : 'gemini';
  }
  // For unknown model families, return the full model name
  return model;
}
