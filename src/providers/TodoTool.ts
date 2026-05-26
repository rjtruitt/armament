import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';

/**
 * TodoStatus type definition.
 */
export type TodoStatus = 'pending' | 'in-progress' | 'done';

/** Single todo item with id, content, and completion status. */
export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

/** In-memory store for todo items with change-notification support. */
export class TodoStore {
  private items: TodoItem[] = [];
  private onUpdate?: (rendered: string) => void;

  constructor(onUpdate?: (rendered: string) => void) {
    this.onUpdate = onUpdate;
  }

  /**
   * Sets the on update.
   */
  setOnUpdate(fn: (rendered: string) => void): void {
    this.onUpdate = fn;
  }

  /**
   * Gets the items.
   */
  getItems(): TodoItem[] {
    return [...this.items];
  }

  /**
   * Sets the items.
   */
  setItems(items: TodoItem[]): void {
    this.items = items;
    this.onUpdate?.(this.render());
  }

  /**
   * Render.
   */
  render(): string {
    if (this.items.length === 0) return '';
    const total = this.items.length;
    const done = this.items.filter(i => i.status === 'done').length;

    const lines: string[] = [];
    for (const item of this.items) {
      const icon = item.status === 'done' ? '✓' : item.status === 'in-progress' ? '›' : '·';
      lines.push(`  ${icon} ${item.content}`);
    }
    lines.push(`  ${done}/${total} done`);

    return lines.join('\n');
  }
}

/** Tool that lets agents maintain a visual todo list shown to the user. */
export class TodoWriteTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'todo_write';
  /**
   * description property.
   */
  readonly description = `Write or update a todo list to track your work progress. Each call REPLACES the entire list.

Usage — set initial todos:
{"todos": [
  {"id": "1", "content": "Read the codebase structure", "status": "done"},
  {"id": "2", "content": "Fix the ScreenBuffer performance", "status": "in-progress"},
  {"id": "3", "content": "Add unit tests", "status": "pending"},
  {"id": "4", "content": "Update documentation", "status": "pending"}
]}

Usage — mark progress (include ALL items, not just changed ones):
{"todos": [
  {"id": "1", "content": "Read the codebase structure", "status": "done"},
  {"id": "2", "content": "Fix the ScreenBuffer performance", "status": "done"},
  {"id": "3", "content": "Add unit tests", "status": "in-progress"},
  {"id": "4", "content": "Update documentation", "status": "pending"}
]}

Status values:
- "pending" — not started yet
- "in-progress" — currently working on this
- "done" — completed

IMPORTANT: This tool REPLACES the entire todo list each time. Always include all items.
Mark each task "done" as soon as you finish it — don't batch updates.
Use this at the start of multi-step work to show your plan, then update as you go.
The rendered todo is shown to the user as a visual progress tracker.`;

  /**
   * schema property.
   */
  readonly schema = z.object({
    todos: z.array(z.object({
      id: z.string().describe('Unique ID for this item (use simple numbers: "1", "2", etc.)'),
      content: z.string().describe('What needs to be done (concise, imperative form)'),
      status: z.enum(['pending', 'in-progress', 'done']).describe('Current status'),
    })).describe('The complete todo list (replaces previous list)'),
  });

  constructor(private store: TodoStore) {}

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { todos } = args as { todos: TodoItem[] };
    if (!todos || !Array.isArray(todos)) {
      return { success: false, error: { message: 'todos array is required', code: 'INVALID_ARGS' } };
    }
    this.store.setItems(todos);
    const total = todos.length;
    const done = todos.filter(t => t.status === 'done').length;
    const inProgress = todos.filter(t => t.status === 'in-progress').length;
    return { success: true, data: `Todo list updated: ${done}/${total} done, ${inProgress} in progress` };
  }
}

/** Factory that creates a TodoStore + TodoWriteTool pair. */
export function createTodoTool(onUpdate?: (rendered: string) => void): { store: TodoStore; tool: ITool } {
  const store = new TodoStore(onUpdate);
  return { store, tool: new TodoWriteTool(store) };
}
