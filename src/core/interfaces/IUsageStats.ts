/** Tracks token usage, cost, and context utilization across a session or agent. */
export interface IUsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  turnsUsed: number;
  requestCount: number;
  avgLatencyMs: number;
  contextUsed: number;
  contextCapacity: number;
}

/** Tracks how much of the context window has been consumed. */
export interface IContextUsage {
  used: number;
  capacity: number;
  remaining: number;
  percentage: number;
}

/** Cost breakdown grouped by provider, model, with cache savings. */
export interface ICostBreakdown {
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  total: number;
  savedByCache: number;
}
