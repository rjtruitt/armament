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

/** Interface for IReplConfig.
 * @property {string} agentName - Description of agentName.
 * @property {string} systemPrompt - Description of systemPrompt.
 * @property {boolean} showThinking - Description of showThinking.
 * @property {boolean} showToolCalls - Description of showToolCalls.
 * @property {boolean} compact - Description of compact.
 * @property {boolean} verbose - Description of verbose.
 * @property {boolean} streaming - Description of streaming.
 * @property {number} maxTurns - Description of maxTurns.
 * @property ... and 21 more properties.
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

/** Interface for IModelConfig.
 * @property {number} temperature - Description of temperature.
 * @property {number} maxTokens - Description of maxTokens.
 * @property {number} topP - Description of topP.
 * @property {string} stop - Description of stop.
 */
export interface IModelConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
  stop: string[];
}

/** Interface for IRateLimitConfig.
 * @property {number} requestsPerMinute - Description of requestsPerMinute.
 * @property {number} tokensPerMinute - Description of tokensPerMinute.
 * @property {boolean} adaptive - Description of adaptive.
 * @property {number} initialRate - Description of initialRate.
 * @property {number} minRate - Description of minRate.
 * @property {number} maxRate - Description of maxRate.
 * @property {Record<string, { requestsPerMinute?: number; tokensPerMinute?: number }>} perModel - Description of perModel.
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
