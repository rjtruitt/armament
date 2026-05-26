/**
 * Mock implementation of ICompletionManager for testing.
 *
 * Provides deterministic completion tracking without real timers,
 * plus test helpers (triggerReap, reset) for verifying completion flows.
 */

import type {
  ICompletionManager,
  ICompletionResult,
  IGraceTimer,
  CompletionStatus,
} from '../a2a/index.js';

/**
 * In-memory completion manager that simulates grace timers
 * without actual setTimeout, enabling synchronous test assertions.
 */
export class MockCompletionManager implements ICompletionManager {
  private _results: Map<string, ICompletionResult> = new Map();
  private _graceTimers: Map<string, MockGraceTimer> = new Map();
  private _reapHandlers: Array<(workerId: string, result: ICompletionResult) => void> = [];
  private _allCompleteHandlers: Array<(parentChannel: string, results: ICompletionResult[]) => void> = [];

  /**
   * Report complete.
   */
  reportComplete(workerId: string, parentChannel: string, result: string): void {
    const completion: ICompletionResult = {
      workerId,
      parentChannel,
      status: 'complete',
      result,
      timestamp: Date.now(),
    };
    this._results.set(workerId, completion);

    const timer = new MockGraceTimer(workerId, 120000);
    this._graceTimers.set(workerId, timer);

    if (this.isAllComplete(parentChannel)) {
      const results = this.getAllForParent(parentChannel);
      for (const handler of this._allCompleteHandlers) {
        handler(parentChannel, results);
      }
    }
  }

  /**
   * Report partial.
   */
  reportPartial(workerId: string, parentChannel: string, progress: number, blockedOn?: string): void {
    this._results.set(workerId, {
      workerId,
      parentChannel,
      status: 'partial',
      progress,
      blockedOn,
      timestamp: Date.now(),
    });
  }

  /**
   * Gets the result.
   */
  getResult(workerId: string): ICompletionResult | undefined {
    return this._results.get(workerId);
  }

  /**
   * Gets the grace timer.
   */
  getGraceTimer(workerId: string): IGraceTimer | undefined {
    return this._graceTimers.get(workerId);
  }

  /**
   * Checks whether all complete.
   */
  isAllComplete(parentChannel: string): boolean {
    const forParent = this.getAllForParent(parentChannel);
    if (forParent.length === 0) return false;
    return forParent.every(r => r.status === 'complete');
  }

  /**
   * Gets the all for parent.
   */
  getAllForParent(parentChannel: string): ICompletionResult[] {
    return Array.from(this._results.values()).filter(r => r.parentChannel === parentChannel);
  }

  /**
   * On reap.
   */
  onReap(handler: (workerId: string, result: ICompletionResult) => void): void {
    this._reapHandlers.push(handler);
  }

  /**
   * On all complete.
   */
  onAllComplete(handler: (parentChannel: string, results: ICompletionResult[]) => void): void {
    this._allCompleteHandlers.push(handler);
  }

  /**
   * Cancel grace.
   */
  cancelGrace(workerId: string): void {
    this._graceTimers.delete(workerId);
  }

  /**
   * Shutdown.
   */
  shutdown(): void {
    this._graceTimers.clear();
  }


  /** Test helper: manually triggers reap for a worker, simulating grace timer expiry. */
  triggerReap(workerId: string): void {
    const result = this._results.get(workerId);
    if (!result) return;
    result.status = 'reaping' as CompletionStatus;
    this._graceTimers.delete(workerId);
    for (const handler of this._reapHandlers) {
      handler(workerId, result);
    }
  }

  /**
   * Gets the result count.
   */
  get resultCount(): number {
    return this._results.size;
  }

  /**
   * Gets the active grace timers.
   */
  get activeGraceTimers(): number {
    return this._graceTimers.size;
  }

  /**
   * Reset.
   */
  reset(): void {
    this._results.clear();
    this._graceTimers.clear();
    this._reapHandlers = [];
    this._allCompleteHandlers = [];
  }
}

class MockGraceTimer implements IGraceTimer {
  readonly workerId: string;
  readonly startedAt: number;
  readonly expiresAt: number;
  private _cancelled = false;

  constructor(workerId: string, durationMs: number) {
    this.workerId = workerId;
    this.startedAt = Date.now();
    this.expiresAt = this.startedAt + durationMs;
  }

  remaining(): number {
    if (this._cancelled) return 0;
    return Math.max(0, this.expiresAt - Date.now());
  }

  cancel(): void {
    this._cancelled = true;
  }
}
