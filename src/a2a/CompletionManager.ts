/**
 * Tracks worker agent completion status with grace timers.
 *
 * When a worker reports complete, a grace timer starts. If the parent
 * doesn't reap the result before expiry, reap handlers are invoked.
 * Supports aggregation: fires onAllComplete when every worker for a
 * parent channel is done.
 */

import type { ICompletionManager, ICompletionResult, ICompletionConfig, IGraceTimer, CompletionStatus } from './interfaces/ICompletion.js';

/** Default configuration values for the completion manager (2-min grace, 5-min zombie threshold). */
export const COMPLETION_DEFAULTS: ICompletionConfig = {
  graceTimerMs: 120000, // 2 minutes
  zombieThresholdTurns: 5,
  zombieThresholdMs: 300000, // 5 minutes
  autoMergeOnComplete: true,
  runTestsOnComplete: false,
  notifyParentOnAllComplete: true,
};

/** Production completion manager with real setTimeout-based grace timers. */
export class CompletionManager implements ICompletionManager {
  private _config: ICompletionConfig;
  private _results: Map<string, ICompletionResult> = new Map();
  private _graceTimers: Map<string, GraceTimer> = new Map();
  private _reapHandlers: Array<(workerId: string, result: ICompletionResult) => void> = [];
  private _allCompleteHandlers: Array<(parentChannel: string, results: ICompletionResult[]) => void> = [];

  constructor(config?: Partial<ICompletionConfig>) {
    this._config = { ...COMPLETION_DEFAULTS, ...config };
  }

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

    const timer = new GraceTimer(workerId, this._config.graceTimerMs, () => {
      this._handleReap(workerId);
    });
    this._graceTimers.set(workerId, timer);

    if (this._config.notifyParentOnAllComplete && this.isAllComplete(parentChannel)) {
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
    const completion: ICompletionResult = {
      workerId,
      parentChannel,
      status: 'partial',
      progress,
      blockedOn,
      timestamp: Date.now(),
    };
    this._results.set(workerId, completion);
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
    const timer = this._graceTimers.get(workerId);
    if (timer) {
      timer.cancel();
      this._graceTimers.delete(workerId);
    }
  }

  /**
   * Shutdown.
   */
  shutdown(): void {
    for (const timer of this._graceTimers.values()) {
      timer.cancel();
    }
    this._graceTimers.clear();
  }

  private _handleReap(workerId: string): void {
    const result = this._results.get(workerId);
    if (!result) return;

    result.status = 'reaping' as CompletionStatus;
    this._graceTimers.delete(workerId);

    for (const handler of this._reapHandlers) {
      handler(workerId, result);
    }
  }
}

class GraceTimer implements IGraceTimer {
  readonly workerId: string;
  readonly startedAt: number;
  readonly expiresAt: number;
  private _timer: ReturnType<typeof setTimeout>;
  private _cancelled = false;

  constructor(workerId: string, durationMs: number, onExpire: () => void) {
    this.workerId = workerId;
    this.startedAt = Date.now();
    this.expiresAt = this.startedAt + durationMs;
    this._timer = setTimeout(() => {
      if (!this._cancelled) onExpire();
    }, durationMs);
  }

  remaining(): number {
    if (this._cancelled) return 0;
    return Math.max(0, this.expiresAt - Date.now());
  }

  cancel(): void {
    this._cancelled = true;
    clearTimeout(this._timer);
  }
}
