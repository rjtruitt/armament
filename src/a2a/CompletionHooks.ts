/** A named hook that fires on worker completion. */
export interface CompletionHook {
  name: string;
  run(workerId: string, result: string, parentChannel: string): Promise<void>;
}
/** Runs registered completion hooks in order, catching individual failures. */
export class CompletionHookRunner {
  private _hooks: CompletionHook[] = [];
  /**
   * Register.
   */
  register(hook: CompletionHook): void {
    this._hooks.push(hook);
  }
  /**
   * Run all.
   */
  async runAll(workerId: string, result: string, parentChannel: string): Promise<void> {
    for (const hook of this._hooks) {
      try {
        await hook.run(workerId, result, parentChannel);
      } catch {
        // Hook failures shouldn't block completion
      }
    }
  }
  /**
   * Gets the hooks.
   */
  getHooks(): CompletionHook[] {
    return [...this._hooks];
  }
}
/** Sends a summary notification to the parent channel when a worker completes. */
export class NotifyParentHook implements CompletionHook {
  /**
   * name property.
   */
  readonly name = 'notify-parent';
  private _notify: (parentChannel: string, message: string) => void;
  constructor(notify: (parentChannel: string, message: string) => void) {
    this._notify = notify;
  }
  /**
   * Run.
   */
  async run(workerId: string, result: string, parentChannel: string): Promise<void> {
    const summary = result.length > 200 ? result.slice(0, 200) + '...' : result;
    this._notify(parentChannel, `✓ Worker ${workerId} complete: ${summary}`);
  }
}
/** Runs tests in the worker's worktree on completion and notifies the parent. */
export class RunTestsHook implements CompletionHook {
  /**
   * name property.
   */
  readonly name = 'run-tests';
  private _testRunner: (cwd: string) => Promise<{ passed: boolean; output: string }>;
  private _getCwd: (workerId: string) => string | undefined;
  private _notify: (parentChannel: string, message: string) => void;
  constructor(
    testRunner: (cwd: string) => Promise<{ passed: boolean; output: string }>,
    getCwd: (workerId: string) => string | undefined,
    notify: (parentChannel: string, message: string) => void
  ) {
    this._testRunner = testRunner;
    this._getCwd = getCwd;
    this._notify = notify;
  }
  /**
   * Run.
   */
  async run(workerId: string, _result: string, parentChannel: string): Promise<void> {
    const cwd = this._getCwd(workerId);
    if (!cwd) return;
    const testResult = await this._testRunner(cwd);
    const icon = testResult.passed ? '✓' : '✗';
    this._notify(parentChannel, `${icon} Tests for ${workerId}: ${testResult.passed ? 'PASSED' : 'FAILED'}`);
  }
}