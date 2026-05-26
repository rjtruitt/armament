/**
 * ProviderRateLimit — rate limiting and request windowing for providers.
 *
 * Extracted from ProviderRegistry to isolate the rate-limiting concern.
 * Tracks per-provider request windows and determines rate-limit status.
 */

import type { ProviderConfig } from './ProviderRegistry.js';

interface RequestRecord {
  tokens: number;
  timestamp: number;
}

/**
 * Provider rate limit class.
 */
export class ProviderRateLimit {
  private _requestWindow: Map<string, RequestRecord[]> = new Map();

  /** Initialize tracking for a provider. */
  register(id: string): void {
    this._requestWindow.set(id, []);
  }

  /** Remove tracking for a provider. */
  unregister(id: string): void {
    this._requestWindow.delete(id);
  }

  /** Record a request for rate limiting purposes. */
  recordRequest(id: string, tokens: number): void {
    const window = this._requestWindow.get(id) ?? [];
    window.push({ tokens, timestamp: Date.now() });
    this._requestWindow.set(id, window);
  }

  /** Check if a provider is currently rate-limited. */
  isRateLimited(id: string, rateLimit: { rpm: number; tpm: number } | undefined): boolean {
    if (!rateLimit) return false;
    const now = Date.now();
    const window = (this._requestWindow.get(id) ?? []).filter(r => now - r.timestamp < 60_000);
    this._requestWindow.set(id, window);
    if (window.length >= rateLimit.rpm) return true;
    const totalTokens = window.reduce((sum, r) => sum + r.tokens, 0);
    if (totalTokens >= rateLimit.tpm) return true;
    return false;
  }

  /** Get remaining capacity for a provider. */
  getRemaining(id: string, rateLimit: { rpm: number; tpm: number } | undefined): { rpm: number; tpm: number } {
    if (!rateLimit) return { rpm: Infinity, tpm: Infinity };
    const now = Date.now();
    const window = (this._requestWindow.get(id) ?? []).filter(r => now - r.timestamp < 60_000);
    const usedTokens = window.reduce((sum, r) => sum + r.tokens, 0);
    return {
      rpm: Math.max(0, rateLimit.rpm - window.length),
      tpm: Math.max(0, rateLimit.tpm - usedTokens),
    };
  }

  /** Get the wait time before rate limit resets for a provider (ms). */
  waitTime(id: string, rateLimit: { rpm: number; tpm: number } | undefined): number {
    if (!this.isRateLimited(id, rateLimit)) return 0;
    const window = this._requestWindow.get(id) ?? [];
    if (window.length === 0) return 0;
    const oldest = window[0].timestamp;
    return Math.max(0, 60_000 - (Date.now() - oldest));
  }

  /** Reset the request window for a provider. */
  reset(id: string): void {
    this._requestWindow.set(id, []);
  }
}
