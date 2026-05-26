/** Supported LLM provider types. */
export type ProviderType = 'bedrock' | 'anthropic' | 'openai' | 'gemini' | 'ollama';

/** Per-model configuration including pricing and cache behavior. */
export interface IModelPricing {
  name: string;
  /** Input price per million tokens (USD). Defaults to 3 if omitted. */
  inputPrice?: number;
  /** Output price per million tokens (USD). Defaults to 15 if omitted. */
  outputPrice?: number;
  /** Cache read multiplier (e.g. 0.1 = 90% off for Claude, 0.5 = 50% off for OpenAI). Defaults to 0.1. */
  cacheReadMultiplier?: number;
  /** Cache write multiplier (e.g. 1.25 = 25% premium for Claude, 0 = no write cost for OpenAI). Defaults to 1.25. */
  cacheWriteMultiplier?: number;
}

/** Configuration for a single LLM provider including auth, model, and rate-limit settings. */
export interface IProviderConfig {
  type: ProviderType;
  name?: string;
  enabled?: boolean;
  models: IModelPricing[];
  defaultModel?: string;
  apiKey?: string;
  region?: string;
  profile?: string;
  auth?: 'sso' | 'credentials' | 'assume-role' | 'api-key' | 'adc';
  ssoStartUrl?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
  roleArn?: string;
  tokenCache?: boolean;
  autoRefresh?: boolean;
  crossRegionInference?: boolean;
  baseUrl?: string;
  timeout?: number;
  streaming?: boolean;
  rateLimit?: number;
  tokenLimit?: number;
  budget?: number;
}
