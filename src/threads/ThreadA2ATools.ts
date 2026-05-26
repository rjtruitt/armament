/**
 * A2A tools for use inside a channel thread.
 * Instead of spawning in-process workers, these request the coordinator
 * to spawn sub-worker threads.
 */

import type { ITool, ToolResult } from 'iteratio';
import { z } from 'zod';

/** Interface for ThreadA2ACallbacks.
 * @property {string} name - Description of name.
 * @property {string} task - Description of task.
 * @property {string} model - Description of model.
 * @property {string} systemPrompt - Description of systemPrompt.
 */
export interface ThreadA2ACallbacks {
  sendSubworkerRequest: (config: {
    name: string;
    task: string;
    model?: string;
    systemPrompt?: string;
  }) => Promise<string>;
  awaitSubworker: (workerId: string, timeoutMs: number) => Promise<string>;
}

/** Create a2 a tools for thread.
 * @param {ThreadA2ACallbacks} callbacks - Description of callbacks.
 */
export function createA2AToolsForThread(callbacks: ThreadA2ACallbacks): ITool[] {
  return [
    new SpawnWorkerThreadTool(callbacks),
    new AwaitWorkerThreadTool(callbacks),
    new GetWorkersThreadTool(),
  ];
}

class SpawnWorkerThreadTool implements ITool {
  readonly name = 'spawn_worker';
  readonly description = `Spawn a worker agent in a separate thread to handle a sub-task. Returns the workerId immediately.

Usage: {"name": "research", "task": "Find all usages of deprecated API calls in ./src"}

The worker runs autonomously in the background. You will be notified when it completes.
DO NOT call await_worker unless you absolutely need the result before continuing — prefer to keep working.

Rules for "name": short kebab-case, max 15 chars (e.g. "scanner", "test-writer").`;
  readonly schema = z.object({
    name: z.string().describe('Short kebab-case name for the worker (e.g., "research", "test-writer")'),
    task: z.string().describe('Full task description — be specific about what to do and what format to return results in'),
    model: z.string().optional().describe('Model override (defaults to same as parent)'),
    systemPrompt: z.string().optional().describe('Custom system prompt for specialized behavior'),
  });

  private callbacks: ThreadA2ACallbacks;
  constructor(callbacks: ThreadA2ACallbacks) { this.callbacks = callbacks; }

  async execute(args: z.infer<typeof this.schema>): Promise<ToolResult> {
    try {
      const workerId = await this.callbacks.sendSubworkerRequest({
        name: args.name,
        task: args.task,
        model: args.model,
        systemPrompt: args.systemPrompt,
      });
      return { success: true, data: { workerId, status: 'spawned' } };
    } catch (err: any) {
      return { success: false, error: { message: err.message, code: 'SPAWN_ERROR' } };
    }
  }
}

class AwaitWorkerThreadTool implements ITool {
  readonly name = 'await_worker';
  readonly description = `Wait for a specific worker to finish and get its result. BLOCKS until the worker completes or times out.

Usage: {"workerId": "worker-research-1716300000000"}
With timeout: {"workerId": "worker-research-1716300000000", "timeoutMs": 60000}

WARNING: This blocks your execution until the worker finishes. Only use when you CANNOT proceed without the result.
Default timeout is 5 minutes (300000ms). If the worker takes longer, this returns a timeout error.

Prefer NOT using this — workers auto-notify on completion.`;
  readonly schema = z.object({
    workerId: z.string().describe('The workerId returned by spawn_worker'),
    timeoutMs: z.number().optional().describe('Max milliseconds to wait. Default: 300000 (5 min). Set lower for quick tasks.'),
  });

  private callbacks: ThreadA2ACallbacks;
  constructor(callbacks: ThreadA2ACallbacks) { this.callbacks = callbacks; }

  async execute(args: z.infer<typeof this.schema>): Promise<ToolResult> {
    try {
      const response = await this.callbacks.awaitSubworker(args.workerId, args.timeoutMs ?? 300_000);
      return { success: true, data: { workerId: args.workerId, response } };
    } catch (err: any) {
      const code = err.message === 'timeout' ? 'TIMEOUT' : 'WORKER_ERROR';
      return { success: false, error: { message: err.message, code } };
    }
  }
}

class GetWorkersThreadTool implements ITool {
  readonly name = 'get_workers';
  readonly description = `List all workers you have spawned and their current status. No arguments needed.

Usage: {}

Returns each worker's ID, name, and status (running/complete/error/cancelled). Use to check if workers are done before deciding next steps. Zero cost — reads local state only.`;
  readonly schema = z.object({});

  async execute(): Promise<ToolResult> {
    return { success: true, data: { workers: [] } };
  }
}
