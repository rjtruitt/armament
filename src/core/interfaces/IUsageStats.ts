/** Interface for IUsageStats.
 * @property {number} inputTokens - Description of inputTokens.
 * @property {number} outputTokens - Description of outputTokens.
 * @property {number} totalTokens - Description of totalTokens.
 * @property {number} cacheReadTokens - Description of cacheReadTokens.
 * @property {number} cacheWriteTokens - Description of cacheWriteTokens.
 * @property {number} estimatedCost - Description of estimatedCost.
 * @property {number} turnsUsed - Description of turnsUsed.
 * @property {number} requestCount - Description of requestCount.
 * @property ... and 3 more properties.
 */
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

/** Interface for IContextUsage.
 * @property {number} used - Description of used.
 * @property {number} capacity - Description of capacity.
 * @property {number} remaining - Description of remaining.
 * @property {number} percentage - Description of percentage.
 */
export interface IContextUsage {
  used: number;
  capacity: number;
  remaining: number;
  percentage: number;
}

/** Interface for ICostBreakdown.
 * @property {Record<string, number>} byProvider - Description of byProvider.
 * @property {Record<string, number>} byModel - Description of byModel.
 * @property {number} total - Description of total.
 * @property {number} savedByCache - Description of savedByCache.
 */
export interface ICostBreakdown {
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  total: number;
  savedByCache: number;
}
