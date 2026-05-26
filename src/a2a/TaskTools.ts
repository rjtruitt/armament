import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';
import type { TaskRuntime } from './TaskRuntime.js';

/** Tool that spawns a background worker agent for a sub-task. */
export class SpawnWorkerTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'spawn_worker';
  /**
   * description property.
   */
  readonly description = `Spawn a new worker agent to handle a sub-task autonomously. Returns the worker's ID immediately.

Usage: {"name": "scanner", "task": "Scan all .ts files in ./src for security issues and report findings"}

The worker runs in the background. You will receive its result as an automatic message when it finishes.
DO NOT call await_worker after this — just keep working. The result comes to you automatically.

Rules for "name":
- Short kebab-case, max 15 chars, no spaces
- Examples: "scanner", "code-review", "test-runner"

Optional:
- "model": override which model the worker uses
- "systemPrompt": custom system prompt for specialized behavior`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    name: z.string().describe('Short kebab-case name, max 15 chars, no spaces (e.g. "greeter", "scanner")'),
    task: z.string().describe('The full task description/prompt for the worker. Be specific about what you want and what format to return results in.'),
    model: z.string().optional().describe('Model override (defaults to first available)'),
    systemPrompt: z.string().optional().describe('Custom system prompt for the worker'),
  });

  constructor(private runtime: TaskRuntime) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { name, task, model, systemPrompt } = args as {
      name: string;
      task: string;
      model?: string;
      systemPrompt?: string;
    };

    if (!name || !task) {
      return { success: false, error: { message: 'name and task are required', code: 'INVALID_ARGS' } };
    }

    const result = await this.runtime.spawnWorker(name, task, model, systemPrompt);
    if (!result.success) {
      return { success: false, error: { message: result.error!, code: 'SPAWN_FAILED' } };
    }

    return { success: true, data: `Worker spawned: ${result.workerId}. You will be notified on completion. Continue with other work now.` };
  }
}

/** Tool that subscribes to a worker's completion notification. */
export class AwaitWorkerTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'await_worker';
  /**
   * description property.
   */
  readonly description = `Subscribe to a worker's completion notification. Returns IMMEDIATELY — does NOT block.

Usage: {"workerId": "worker-scanner-1716300000000"}

After calling this, the worker's result will be injected into your conversation as a message when it finishes.
You do NOT need to call this after spawn_worker — spawn already auto-subscribes you.
Only use this if you want to subscribe to a worker you didn't spawn yourself.

This tool returns instantly. Keep working on other tasks while you wait.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    workerId: z.string().describe('The worker ID to subscribe to (e.g. "worker-scanner-1716300000000")'),
  });

  constructor(private runtime: TaskRuntime) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { workerId } = args as { workerId: string };

    if (!workerId) {
      return { success: false, error: { message: 'workerId is required', code: 'INVALID_ARGS' } };
    }

    const subscribed = this.runtime.subscribeCompletion(workerId);
    if (!subscribed) {
      return { success: false, error: { message: `Worker not found: ${workerId}`, code: 'NOT_FOUND' } };
    }

    return { success: true, data: `Subscribed to ${workerId} completion. The result will be delivered as a message when it finishes. Continue with other work now.` };
  }
}

/** Tool that returns current status of all spawned workers. */
export class GetWorkersTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'get_workers';
  /**
   * description property.
   */
  readonly description = `Get the current status of all spawned workers. No arguments needed.

Usage: {}

Returns a summary of all workers: their IDs, names, status (running/complete/error/cancelled), and how long they've been running. Use this to check progress before deciding next steps.

Costs zero LLM tokens — just reads local runtime state.`;
  /**
   * schema property.
   */
  readonly schema = z.object({});

  constructor(private runtime: TaskRuntime) {}

  /**
   * Execute.
   */
  async execute(_args: unknown, _context: ToolContext): Promise<ToolResult> {
    const summary = this.runtime.getWorkersSummary();
    return { success: true, data: summary || 'No active workers.' };
  }
}

/** Tool that sends a follow-up message to a running worker. */
export class SendWorkerMessageTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'send_worker_message';
  /**
   * description property.
   */
  readonly description = `Send a follow-up message to a running worker and get its response. Use for corrections, additional instructions, or asking for status.

Usage: {"workerId": "worker-scanner-1716300000000", "message": "Also check for SQL injection vulnerabilities"}

The worker will process your message and respond. This call waits for the worker's reply before returning.
Only works on workers that are still running (status: "thinking" or "tool_use" or "idle").`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    workerId: z.string().describe('The worker ID to message'),
    message: z.string().describe('The message to send to the worker'),
  });

  constructor(private runtime: TaskRuntime) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { workerId, message } = args as { workerId: string; message: string };

    if (!workerId || !message) {
      return { success: false, error: { message: 'workerId and message are required', code: 'INVALID_ARGS' } };
    }

    try {
      const response = await this.runtime.sendWorkerMessage(workerId, message);
      return { success: true, data: { workerId, response } };
    } catch (err: any) {
      return { success: false, error: { message: err.message, code: 'SEND_FAILED' } };
    }
  }
}

/** Tool that cancels a running worker immediately. */
export class CancelWorkerTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'cancel_worker';
  /**
   * description property.
   */
  readonly description = `Cancel a running worker immediately. Use when a worker is stuck, looping, or no longer needed.

Usage: {"workerId": "worker-scanner-1716300000000"}
With reason: {"workerId": "worker-scanner-1716300000000", "reason": "Taking too long, will try different approach"}

The worker is terminated and removed. This cannot be undone — spawn a new worker if you need to retry.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    workerId: z.string().describe('Worker ID to cancel'),
    reason: z.string().optional().describe('Why you are cancelling (shown in logs)'),
  });

  constructor(private runtime: TaskRuntime) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { workerId, reason } = args as { workerId: string; reason?: string };

    if (!workerId) {
      return { success: false, error: { message: 'workerId is required', code: 'INVALID_ARGS' } };
    }

    this.runtime.cancelWorker(workerId, reason);
    return { success: true, data: `Worker ${workerId} cancelled.` };
  }
}
