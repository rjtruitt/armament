import { IProviderConfig } from './IProviderConfig.js';

/** Drift configuration — inlined here to avoid cross-package import from drift/. */
export interface IDriftConfig {
  enabled?: boolean;
  retentionDays?: number;
  autoPruneStaleOnStart?: boolean;
  maxSizeBytes?: number;
}

/** Session persistence configuration — inlined here to avoid cross-package import from session/. */
export interface ISessionConfig {
  enabled: boolean;
  saveTrigger: 'every-context-update' | '30s' | '1m' | '5m';
  sessionDir?: string;
}

/** Completion subsystem configuration — inlined here to avoid cross-package import from a2a/. */
export interface ICompletionConfig {
  graceTimerMs: number;
  zombieThresholdTurns: number;
  zombieThresholdMs: number;
  autoMergeOnComplete: boolean;
  runTestsOnComplete: boolean;
  notifyParentOnAllComplete: boolean;
}

/** Full configuration for a REPL session — providers, model, permissions, drift, and persistence. */
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

/** Model inference parameters — temperature, maxTokens, topP, stop sequences. */
export interface IModelConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
  stop: string[];
}

/** Rate limiting configuration with optional adaptive throttling and per-model overrides. */
export interface IRateLimitConfig {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  adaptive?: boolean;
  initialRate?: number;
  minRate?: number;
  maxRate?: number;
  perModel?: Record<string, { requestsPerMinute?: number; tokensPerMinute?: number }>;
}
