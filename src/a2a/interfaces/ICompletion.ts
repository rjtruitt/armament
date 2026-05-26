/** Lifecycle state of a worker agent's task. */
export type CompletionStatus = 'running' | 'complete' | 'partial' | 'stalled' | 'reaping';
/** Result record for a worker agent's completed or in-progress task. */
export interface ICompletionResult {
  workerId: string;
  parentChannel: string;
  status: CompletionStatus;
  result?: string;
  progress?: number;
  blockedOn?: string;
  timestamp: number;
}
/** Configuration for the completion manager. */
export interface ICompletionConfig {
  graceTimerMs: number;
  zombieThresholdTurns: number;
  zombieThresholdMs: number;
  autoMergeOnComplete: boolean;
  runTestsOnComplete: boolean;
  notifyParentOnAllComplete: boolean;
}
/** A countdown timer granting a completed worker a window before reaping. */
export interface IGraceTimer {
  workerId: string;
  startedAt: number;
  expiresAt: number;
  remaining(): number;
  cancel(): void;
}
/** Manages worker completion reports, grace timers, and aggregated notifications. */
export interface ICompletionManager {
  reportComplete(workerId: string, parentChannel: string, result: string): void;
  reportPartial(workerId: string, parentChannel: string, progress: number, blockedOn?: string): void;
  getResult(workerId: string): ICompletionResult | undefined;
  getGraceTimer(workerId: string): IGraceTimer | undefined;
  isAllComplete(parentChannel: string): boolean;
  getAllForParent(parentChannel: string): ICompletionResult[];
  onReap(handler: (workerId: string, result: ICompletionResult) => void): void;
  onAllComplete(handler: (parentChannel: string, results: ICompletionResult[]) => void): void;
  cancelGrace(workerId: string): void;
}