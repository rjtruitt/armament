import { IProviderConfig } from './IProviderConfig.js';

/** Drift configuration (inlined to avoid cross-package import from drift/). */
export interface IDriftConfig {
  enabled?: boolean;
  retentionDays?: number;
  autoPruneStaleOnStart?: boolean;
  maxSizeBytes?: number;
}

/** Session persistence configuration (inlined to avoid cross-package import from session/). */
export interface ISessionConfig {
  enabled: boolean;
  saveTrigger: 'every-context-update' | '30s' | '1m' | '5m';
  sessionDir?: string;
}

/** Completion subsystem configuration (inlined to avoid cross-package import from a2a/). */
export interface ICompletionConfig {
  graceTimerMs: number;
  zombieThresholdTurns: number;
  zombieThresholdMs: number;
  autoMergeOnComplete: boolean;
  runTestsOnComplete: boolean;
  notifyParentOnAllComplete: boolean;
}

/** Configuration for the REPL session environment.
 * @property {string} agentName - Name of the agent to spawn for this session.
 * @property {string} [systemPrompt] - Optional system prompt to override the default.
 * @property {boolean} showThinking - Whether to display the agent's thinking trace.
 * @property {boolean} showToolCalls - Whether to display tool call invocations.
 * @property {boolean} compact - Whether to render output in compact mode.
 * @property {boolean} verbose - Whether to enable verbose diagnostic output.
 * @property {boolean} streaming - Whether to stream responses in real time.
 * @property {number} maxTurns - Maximum number of conversation turns before stopping.
 * @property {number} [maxBudget] - Optional maximum spend cap for the session.
 * @property {number} maxRetries - Maximum number of retry attempts on failure.
 * @property {boolean} noColor - Whether to disable ANSI color output.
 * @property {boolean} [noTui] - Whether to disable the TUI renderer and use raw I/O.
 * @property {boolean} [mouse] - Whether to enable mouse input support in the TUI.
 * @property {'text' | 'json' | 'stream-json'} outputFormat - Format for output rendering.
 * @property {boolean} promptCaching - Whether to enable prompt caching (e.g., for Anthropic).
 * @property {boolean} autoSave - Whether to auto-save session state periodically.
 * @property {boolean} hotReload - Whether to enable hot-reloading of config changes.
 * @property {string} [configPath] - Path to a custom configuration file.
 * @property {string} [memoryPath] - Path to a custom memory/persistence file.
 * @property {string} theme - TUI theme name.
 * @property {IProviderConfig[]} providers - List of provider configurations.
 * @property {string} [defaultProvider] - Identifier of the default provider.
 * @property {string} [defaultModel] - Name of the default model.
 * @property {string[]} fallbackChain - Ordered list of provider IDs for fallback.
 * @property {IRateLimitConfig} [rateLimits] - Rate limiting configuration.
 * @property {IModelConfig} modelConfig - Model parameters (temperature, maxTokens, etc.).
 * @property {Record<string, 'allow' | 'ask' | 'deny'>} toolPermissions - Per-tool permission overrides.
 * @property {Partial<IDriftConfig>} [drift] - Drift detection and retention settings.
 * @property {Partial<ISessionConfig>} [sessionPersistence] - Session save/restore configuration.
 * @property {Partial<ICompletionConfig>} [completion] - Sub-agent completion and merge settings.
 */
export interface IReplConfig {
  agentName: string;
  systemPrompt?: string;
  showThinking: boolean;
  showToolCalls: boolean;
  compact: boolean;
  verbose: boolean;
  streaming: boolean;
  maxTurns: number;
  maxBudget?: number;
  maxRetries: number;
  noColor: boolean;
  noTui?: boolean;
  mouse?: boolean;
  outputFormat: 'text' | 'json' | 'stream-json';
  promptCaching: boolean;
  autoSave: boolean;
  hotReload: boolean;
  configPath?: string;
  memoryPath?: string;
  theme: string;
  providers: IProviderConfig[];
  defaultProvider?: string;
  defaultModel?: string;
  fallbackChain: string[];
  rateLimits?: IRateLimitConfig;
  modelConfig: IModelConfig;
  toolPermissions: Record<string, 'allow' | 'ask' | 'deny'>;
  drift?: Partial<IDriftConfig>;
  sessionPersistence?: Partial<ISessionConfig>;
  completion?: Partial<ICompletionConfig>;
}

/** Model inference parameters.
 * @property {number} temperature - Sampling temperature (0 = deterministic, higher = more random).
 * @property {number} maxTokens - Maximum tokens to generate per response.
 * @property {number} topP - Nucleus sampling probability threshold.
 * @property {string[]} stop - Stop sequences that end generation.
 */
export interface IModelConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
  stop: string[];
}

/** Rate limiting configuration with optional adaptive throttling.
 * @property {number} [requestsPerMinute] - Maximum requests per minute allowed.
 * @property {number} [tokensPerMinute] - Maximum tokens per minute allowed.
 * @property {boolean} [adaptive] - Whether to dynamically adjust rate limits based on observed latency/errors.
 * @property {number} [initialRate] - Starting rate when adaptive throttling is enabled.
 * @property {number} [minRate] - Minimum rate floor when adaptively throttled.
 * @property {number} [maxRate] - Maximum rate ceiling when adaptively throttled.
 * @property {Record<string, { requestsPerMinute?: number; tokensPerMinute?: number }>} [perModel] - Per-model rate limit overrides keyed by model name.
 */
export interface IRateLimitConfig {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  adaptive?: boolean;
  initialRate?: number;
  minRate?: number;
  maxRate?: number;
  perModel?: Record<string, { requestsPerMinute?: number; tokensPerMinute?: number }>;
}
