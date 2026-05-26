/** Structured task tracking tools with status, ownership, and dependency blocking. */

import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';

/**
 * TaskStatus type definition.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

/** A work item with status, ownership, and dependency links. */
export interface TrackedTask {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  activeForm?: string;
  owner?: string;
  blocks: string[];
  blockedBy: string[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** In-memory store for tracked tasks with dependency graph support. */
export class TaskStore {
  private tasks: Map<string, TrackedTask> = new Map();
  private counter = 0;

  /**
   * Create.
   */
  create(subject: string, description: string, opts?: { activeForm?: string; owner?: string; metadata?: Record<string, unknown> }): TrackedTask {
    const id = `task-${++this.counter}`;
    const task: TrackedTask = {
      id,
      subject,
      description,
      status: 'pending',
      activeForm: opts?.activeForm,
      owner: opts?.owner,
      blocks: [],
      blockedBy: [],
      metadata: opts?.metadata ?? {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(id, task);
    return task;
  }

  /**
   * Get.
   */
  get(id: string): TrackedTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Update.
   */
  update(id: string, updates: Partial<Pick<TrackedTask, 'status' | 'subject' | 'description' | 'activeForm' | 'owner'>> & { metadata?: Record<string, unknown>; addBlocks?: string[]; addBlockedBy?: string[] }): TrackedTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    if (updates.status) task.status = updates.status;
    if (updates.subject) task.subject = updates.subject;
    if (updates.description) task.description = updates.description;
    if (updates.activeForm !== undefined) task.activeForm = updates.activeForm;
    if (updates.owner !== undefined) task.owner = updates.owner;
    if (updates.metadata) {
      for (const [k, v] of Object.entries(updates.metadata)) {
        if (v === null) delete task.metadata[k];
        else task.metadata[k] = v;
      }
    }
    if (updates.addBlocks) {
      for (const b of updates.addBlocks) {
        if (!task.blocks.includes(b)) task.blocks.push(b);
        const blocked = this.tasks.get(b);
        if (blocked && !blocked.blockedBy.includes(id)) blocked.blockedBy.push(id);
      }
    }
    if (updates.addBlockedBy) {
      for (const b of updates.addBlockedBy) {
        if (!task.blockedBy.includes(b)) task.blockedBy.push(b);
        const blocker = this.tasks.get(b);
        if (blocker && !blocker.blocks.includes(id)) blocker.blocks.push(id);
      }
    }
    task.updatedAt = Date.now();
    return task;
  }

  /**
   * List.
   */
  list(): TrackedTask[] {
    return [...this.tasks.values()].filter(t => t.status !== 'deleted');
  }

  /**
   * Checks whether blocked.
   */
  isBlocked(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    return task.blockedBy.some(bId => {
      const blocker = this.tasks.get(bId);
      return blocker && blocker.status !== 'completed' && blocker.status !== 'deleted';
    });
  }
}

/** Tool for creating a new tracked task. */
export class TaskCreateTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'task_create';
  /**
   * description property.
   */
  readonly description = `Create a structured task to track work. Returns the task ID for future updates.

Usage: {"subject": "Refactor auth middleware", "description": "Extract token validation into shared module"}
With spinner text: {"subject": "Run test suite", "description": "Run all unit tests", "active_form": "Running tests"}

Tasks start as "pending". Update to "in_progress" when you begin, "completed" when done.
Use for multi-step work you want to track, or when coordinating with other agents.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    subject: z.string().describe('Brief title (imperative form, e.g. "Fix auth bug")'),
    description: z.string().describe('What needs to be done'),
    active_form: z.string().optional().describe('Present continuous form shown during progress (e.g. "Running tests")'),
    owner: z.string().optional().describe('Who owns this task (agent name or channel)'),
    metadata: z.record(z.unknown()).optional().describe('Arbitrary metadata to attach'),
  });

  constructor(private store: TaskStore) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { subject, description, active_form, owner, metadata } = args as { subject: string; description: string; active_form?: string; owner?: string; metadata?: Record<string, unknown> };
    if (!subject || !description) {
      return { success: false, error: { message: 'subject and description are required', code: 'INVALID_ARGS' } };
    }
    const task = this.store.create(subject, description, { activeForm: active_form, owner, metadata });
    return { success: true, data: `Created task ${task.id}: "${task.subject}" (status: pending)` };
  }
}

/** Tool for updating a task's status, details, or dependencies. */
export class TaskUpdateTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'task_update';
  /**
   * description property.
   */
  readonly description = `Update a task's status, details, or dependencies.

Usage (start work): {"task_id": "task-1", "status": "in_progress"}
Usage (complete): {"task_id": "task-1", "status": "completed"}
Usage (add dependency): {"task_id": "task-2", "add_blocked_by": ["task-1"]}

Status flow: pending → in_progress → completed (or deleted)
- Mark "in_progress" BEFORE beginning work
- Only mark "completed" when fully done (tests pass, no errors)
- Use "add_blocked_by" to say "this task can't start until those tasks finish"
- Use "add_blocks" to say "these tasks can't start until this one finishes"`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    task_id: z.string().describe('Task ID to update'),
    status: z.enum(['pending', 'in_progress', 'completed', 'deleted']).optional().describe('New status'),
    subject: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    active_form: z.string().optional().describe('Spinner text update'),
    owner: z.string().optional().describe('New owner'),
    metadata: z.record(z.unknown()).optional().describe('Metadata keys to merge (null to delete key)'),
    add_blocks: z.array(z.string()).optional().describe('Task IDs that cannot start until this one completes'),
    add_blocked_by: z.array(z.string()).optional().describe('Task IDs that must complete before this one starts'),
  });

  constructor(private store: TaskStore) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { task_id, status, subject, description, active_form, owner, metadata, add_blocks, add_blocked_by } = args as { task_id: string; status?: TaskStatus; subject?: string; description?: string; active_form?: string; owner?: string; metadata?: Record<string, unknown>; add_blocks?: string[]; add_blocked_by?: string[] };
    if (!task_id) {
      return { success: false, error: { message: 'task_id is required', code: 'INVALID_ARGS' } };
    }
    const task = this.store.update(task_id, {
      status, subject, description, activeForm: active_form, owner, metadata,
      addBlocks: add_blocks, addBlockedBy: add_blocked_by,
    });
    if (!task) {
      return { success: false, error: { message: `Task not found: ${task_id}`, code: 'NOT_FOUND' } };
    }
    const blocked = this.store.isBlocked(task_id);
    return { success: true, data: `Updated ${task_id}: status=${task.status}${blocked ? ' (BLOCKED — waiting on dependencies)' : ''}` };
  }
}

/** Tool for retrieving full details of a single task. */
export class TaskGetTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'task_get';
  /**
   * description property.
   */
  readonly description = `Get full details of a specific task by ID.

Usage: {"task_id": "task-1"}

Returns subject, description, status, blocks, blockedBy, metadata, timestamps.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    task_id: z.string().describe('Task ID to retrieve'),
  });

  constructor(private store: TaskStore) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { task_id } = args as { task_id: string };
    if (!task_id) {
      return { success: false, error: { message: 'task_id is required', code: 'INVALID_ARGS' } };
    }
    const task = this.store.get(task_id);
    if (!task) {
      return { success: false, error: { message: `Task not found: ${task_id}`, code: 'NOT_FOUND' } };
    }
    const lines = [
      `[${task.id}] ${task.subject}`,
      `  status: ${task.status}${this.store.isBlocked(task_id) ? ' (BLOCKED)' : ''}`,
      `  description: ${task.description}`,
    ];
    if (task.owner) lines.push(`  owner: ${task.owner}`);
    if (task.activeForm) lines.push(`  active: ${task.activeForm}`);
    if (task.blocks.length > 0) lines.push(`  blocks: ${task.blocks.join(', ')}`);
    if (task.blockedBy.length > 0) lines.push(`  blocked_by: ${task.blockedBy.join(', ')}`);
    if (Object.keys(task.metadata).length > 0) lines.push(`  metadata: ${JSON.stringify(task.metadata)}`);
    return { success: true, data: lines.join('\n') };
  }
}

/** Tool for listing all non-deleted tasks in the session. */
export class TaskListTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'task_list';
  /**
   * description property.
   */
  readonly description = `List all tasks in the current session. No arguments needed.

Usage: {}

Returns a summary of every non-deleted task: ID, subject, status, owner, dependencies.
Use to check overall progress or find task IDs for updates.`;
  /**
   * schema property.
   */
  readonly schema = z.object({});

  constructor(private store: TaskStore) {}

  /**
   * Execute.
   */
  async execute(_args: unknown, _context: ToolContext): Promise<ToolResult> {
    const tasks = this.store.list();
    if (tasks.length === 0) {
      return { success: true, data: 'No tasks.' };
    }
    const lines = tasks.map(t => {
      const blocked = this.store.isBlocked(t.id) ? ' [BLOCKED]' : '';
      const owner = t.owner ? ` (${t.owner})` : '';
      return `${t.id}: [${t.status}${blocked}] ${t.subject}${owner}`;
    });
    return { success: true, data: lines.join('\n') };
  }
}

/** Creates a TaskStore and the four task-tracking tools that operate on it. */
export function createTaskTrackingTools(store?: TaskStore): { store: TaskStore; tools: ITool[] } {
  const s = store ?? new TaskStore();
  return {
    store: s,
    tools: [
      new TaskCreateTool(s),
      new TaskUpdateTool(s),
      new TaskGetTool(s),
      new TaskListTool(s),
    ],
  };
}
