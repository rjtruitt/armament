/** Worker-facing tools for reporting back to parent/orchestrator. */

import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';

/** Tool that marks a worker's task as finished and sends results to the parent orchestrator. */
export class CompleteWorkerTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'complete_worker';
  /**
   * description property.
   */
  readonly description = `Mark your task as finished and send results to the parent orchestrator. You MUST call this when done.

Usage (success): {"status": "success", "summary": "Found 3 XSS vulnerabilities in auth module. Details written to ./reports/xss.md"}
Usage (failure): {"status": "failed", "summary": "Could not access the target directory — permission denied on /etc/shadow"}

This is the ONLY way to signal you are done. If you don't call this, the parent thinks you're still working.
Call with status="failed" if you hit an unrecoverable error — don't loop forever.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    status: z.enum(['success', 'failed']).describe('"success" if task completed, "failed" if you hit an unrecoverable error'),
    summary: z.string().describe('What you did, what you found, and where results are (if any). Be specific — this is all the parent sees.'),
  });

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { status, summary } = args as { status: string; summary: string };
    return { success: true, data: { status, summary, _terminal: true } };
  }
}

/** Tool that sends progress updates from a worker to the parent orchestrator without finishing. */
export class ReportProgressTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'report_progress';
  /**
   * description property.
   */
  readonly description = `Send a progress update to the parent without finishing. Use at natural breakpoints so the parent knows you're alive.

Usage: {"progress": "Scanned 47 of 120 files, found 2 issues so far"}
With percent: {"progress": "Halfway through dependency analysis", "percent": 50}

This does NOT complete your work — keep going after reporting. The parent sees your update in real-time.
Call every few tool iterations so you don't look stuck.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    progress: z.string().describe('Brief status update (1-2 sentences). What have you done, what is next.'),
    percent: z.number().optional().describe('Estimated completion percentage 0-100. Omit if hard to estimate.'),
    status: z.enum(['in_progress', 'complete', 'failed']).optional().describe('Set to "complete" or "failed" to finish the worker (equivalent to complete_worker).'),
  });

  private onProgress?: (workerId: string, progress: string, percent?: number) => void;
  private workerId: string;

  constructor(workerId: string, onProgress?: (workerId: string, progress: string, percent?: number) => void) {
    this.workerId = workerId;
    this.onProgress = onProgress;
  }

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { progress, percent, status } = args as { progress: string; percent?: number; status?: string };
    this.onProgress?.(this.workerId, progress, percent);
    if (status === 'complete' || status === 'failed') {
      return { success: true, data: { status, summary: progress, _terminal: true } };
    }
    return { success: true, data: 'Progress reported.' };
  }
}

/** Tool that allows a worker to ask the parent orchestrator a question when blocked or uncertain. */
export class AskParentTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'ask_parent';
  /**
   * description property.
   */
  readonly description = `Ask the parent orchestrator a question when you are blocked or need a decision. Does NOT complete your work.

Usage: {"question": "The config file has two formats — should I use JSON or YAML?"}

Use when:
- You need clarification on ambiguous instructions
- You need permission before a destructive action
- You're stuck and need guidance

The parent's answer will be injected into your conversation. Continue working after you receive it.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    question: z.string().describe('Your question for the parent orchestrator. Be specific about what you need to know.'),
  });

  private onAsk?: (workerId: string, question: string) => void;
  private workerId: string;

  constructor(workerId: string, onAsk?: (workerId: string, question: string) => void) {
    this.workerId = workerId;
    this.onAsk = onAsk;
  }

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { question } = args as { question: string };
    this.onAsk?.(this.workerId, question);
    return { success: true, data: 'Question sent to parent. Continue working or wait for response.' };
  }
}

/** Worker system prompt.
 * @param {string} name - Description of name.
 */
export const WORKER_SYSTEM_PROMPT = (name: string) => `You are a worker agent named "${name}". Execute the assigned task directly using your tools.

RULES:
- Execute work immediately. No preamble, no narration.
- Call report_progress at natural breakpoints to show you are alive.
- When done, you MUST call complete_worker with your results. This is the ONLY way to finish.
- If blocked, call ask_parent for guidance.
- If you hit a fatal error, call complete_worker with status="failed".
- Do NOT loop endlessly. Complete your task and report.`;
