/** Interface for BackgroundTask.
 * @property {string} id - Description of id.
 * @property {string} task - Description of task.
 * @property {string} status - Description of status.
 * @property {any} result - Description of result.
 */
export interface BackgroundTask {
  id: string;
  task: string;
  status: string;
  result?: any;
}

/** Class representing BackgroundTasks. */
export class BackgroundTasks {
  private tasks: Map<string, BackgroundTask> = new Map();
  private _taskCounter = 0;

  /**
   * Gets the task counter.
   */
  get taskCounter(): number {
    return this._taskCounter;
  }

  /**
   * Next id.
   */
  nextId(): string {
    return `task-${++this._taskCounter}-${Date.now()}`;
  }

  /**
   * Increment counter.
   */
  incrementCounter(): number {
    return ++this._taskCounter;
  }

  /**
   * Run in background.
   */
  async runInBackground(task: string): Promise<string> {
    const id = this.nextId();
    this.tasks.set(id, {
      id,
      task,
      status: 'complete',
      result: `Completed: ${task}`,
    });
    return id;
  }

  /**
   * Cancel task.
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Background task "${taskId}" not found`);
    }
    task.status = 'cancelled';
  }

  /**
   * Gets the all.
   */
  getAll(): BackgroundTask[] {
    return [...this.tasks.values()];
  }

  /**
   * Gets the status.
   */
  getStatus(taskId: string): string {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Background task "${taskId}" not found`);
    }
    return task.status;
  }

  /**
   * Gets the result.
   */
  getResult(taskId: string): any {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Background task "${taskId}" not found`);
    }
    return task.result;
  }
}
