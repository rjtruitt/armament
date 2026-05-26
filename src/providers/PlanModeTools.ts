/** Tools for entering/exiting a planning state before implementation. */

import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';

/** Callbacks fired when agents enter or exit plan mode. */
export interface PlanModeCallbacks {
  onEnterPlan?: (agentId: string) => void;
  onExitPlan?: (agentId: string, plan: string) => void;
}

/** Tool that transitions an agent into exploration/planning mode. */
export class EnterPlanModeTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'enter_plan_mode';
  /**
   * description property.
   */
  readonly description = `Transition into planning mode. Use before implementing complex changes to explore the codebase, understand patterns, and design your approach.

Usage: {}

While in plan mode you can:
- Read files, grep, search — understand the codebase
- Think about architecture and trade-offs
- Draft a plan for the user to review

When your plan is ready, call exit_plan_mode with the plan text.

Use plan mode when:
- Multiple valid approaches exist and you need to pick one
- Changes span multiple files
- Architecture decisions are needed
- Requirements are unclear and need exploration

Do NOT use for:
- Single-line fixes or typos
- User gave very specific instructions already
- Pure research questions (just answer directly)`;
  /**
   * schema property.
   */
  readonly schema = z.object({});

  private callbacks?: PlanModeCallbacks;

  constructor(callbacks?: PlanModeCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Execute.
   */
  async execute(_args: unknown, context: ToolContext): Promise<ToolResult> {
    const agentId = (context.metadata?.agentId as string) ?? 'unknown';
    this.callbacks?.onEnterPlan?.(agentId);
    return { success: true, data: 'Entered plan mode. Explore the codebase, then call exit_plan_mode with your plan when ready.' };
  }
}

/** Tool that submits a completed plan for user approval. */
export class ExitPlanModeTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'exit_plan_mode';
  /**
   * description property.
   */
  readonly description = `Signal that planning is complete. Present your plan for user review before implementing.

Usage: {"plan": "## Plan\\n1. Extract validation into shared/validate.ts\\n2. Update auth middleware to import from shared\\n3. Add unit tests for validation logic"}

The plan text is shown to the user for approval. Keep it concise — bullet points or numbered steps.
After calling this, wait for user approval before making changes.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    plan: z.string().describe('Your implementation plan (markdown). Shown to user for approval.'),
  });

  private callbacks?: PlanModeCallbacks;

  constructor(callbacks?: PlanModeCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Execute.
   */
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const { plan } = args as { plan: string };
    if (!plan) {
      return { success: false, error: { message: 'plan is required. Write your plan text before calling exit_plan_mode.', code: 'INVALID_ARGS' } };
    }
    const agentId = (context.metadata?.agentId as string) ?? 'unknown';
    this.callbacks?.onExitPlan?.(agentId, plan);
    return { success: true, data: 'Plan submitted for review. Wait for user approval before implementing.' };
  }
}

/** Creates the enter_plan_mode and exit_plan_mode tool pair. */
export function createPlanModeTools(callbacks?: PlanModeCallbacks): ITool[] {
  return [
    new EnterPlanModeTool(callbacks),
    new ExitPlanModeTool(callbacks),
  ];
}
