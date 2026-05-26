/**
 * Tests for TaskTrackingTools: task_create, task_update, task_get, task_list
 */

import { describe, it, expect } from 'vitest';
import {
  TaskStore,
  TaskCreateTool,
  TaskUpdateTool,
  TaskGetTool,
  TaskListTool,
  createTaskTrackingTools,
} from '../providers/TaskTrackingTools.js';

const ctx = { turnNumber: 1, state: {}, metadata: {} };

describe('TaskStore', () => {
  it('creates tasks with incremental IDs', () => {
    const store = new TaskStore();
    const t1 = store.create('Task A', 'Do thing A');
    const t2 = store.create('Task B', 'Do thing B');
    expect(t1.id).toBe('task-1');
    expect(t2.id).toBe('task-2');
  });

  it('creates tasks with pending status', () => {
    const store = new TaskStore();
    const t = store.create('Test', 'desc');
    expect(t.status).toBe('pending');
  });

  it('stores owner and metadata', () => {
    const store = new TaskStore();
    const t = store.create('Test', 'desc', { owner: 'agent-1', metadata: { priority: 'high' } });
    expect(t.owner).toBe('agent-1');
    expect(t.metadata.priority).toBe('high');
  });

  it('retrieves task by ID', () => {
    const store = new TaskStore();
    const t = store.create('Test', 'desc');
    expect(store.get(t.id)).toBe(t);
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('updates task status', () => {
    const store = new TaskStore();
    const t = store.create('Test', 'desc');
    store.update(t.id, { status: 'in_progress' });
    expect(store.get(t.id)!.status).toBe('in_progress');
  });

  it('updates subject and description', () => {
    const store = new TaskStore();
    const t = store.create('Old', 'old desc');
    store.update(t.id, { subject: 'New', description: 'new desc' });
    expect(store.get(t.id)!.subject).toBe('New');
    expect(store.get(t.id)!.description).toBe('new desc');
  });

  it('merges metadata (null deletes key)', () => {
    const store = new TaskStore();
    const t = store.create('Test', 'desc', { metadata: { a: 1, b: 2 } });
    store.update(t.id, { metadata: { b: null, c: 3 } });
    const updated = store.get(t.id)!;
    expect(updated.metadata.a).toBe(1);
    expect(updated.metadata.b).toBeUndefined();
    expect(updated.metadata.c).toBe(3);
  });

  it('adds blocking dependencies', () => {
    const store = new TaskStore();
    const t1 = store.create('Blocker', 'must finish first');
    const t2 = store.create('Blocked', 'waits on blocker');
    store.update(t2.id, { addBlockedBy: [t1.id] });
    expect(store.get(t2.id)!.blockedBy).toContain(t1.id);
    expect(store.get(t1.id)!.blocks).toContain(t2.id);
  });

  it('isBlocked returns true when blocker is not completed', () => {
    const store = new TaskStore();
    const t1 = store.create('Blocker', 'desc');
    const t2 = store.create('Blocked', 'desc');
    store.update(t2.id, { addBlockedBy: [t1.id] });
    expect(store.isBlocked(t2.id)).toBe(true);
  });

  it('isBlocked returns false when blocker is completed', () => {
    const store = new TaskStore();
    const t1 = store.create('Blocker', 'desc');
    const t2 = store.create('Blocked', 'desc');
    store.update(t2.id, { addBlockedBy: [t1.id] });
    store.update(t1.id, { status: 'completed' });
    expect(store.isBlocked(t2.id)).toBe(false);
  });

  it('list excludes deleted tasks', () => {
    const store = new TaskStore();
    store.create('Keep', 'desc');
    const t2 = store.create('Delete me', 'desc');
    store.update(t2.id, { status: 'deleted' });
    const list = store.list();
    expect(list.length).toBe(1);
    expect(list[0].subject).toBe('Keep');
  });
});

describe('TaskCreateTool', () => {
  it('creates a task and returns its ID', async () => {
    const store = new TaskStore();
    const tool = new TaskCreateTool(store);
    const result = await tool.execute({ subject: 'Fix bug', description: 'Fix the login bug' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('task-1');
    expect(result.data).toContain('Fix bug');
  });

  it('fails without subject', async () => {
    const store = new TaskStore();
    const tool = new TaskCreateTool(store);
    const result = await tool.execute({ description: 'desc' }, ctx);
    expect(result.success).toBe(false);
  });

  it('fails without description', async () => {
    const store = new TaskStore();
    const tool = new TaskCreateTool(store);
    const result = await tool.execute({ subject: 'Test' }, ctx);
    expect(result.success).toBe(false);
  });
});

describe('TaskUpdateTool', () => {
  it('updates status to in_progress', async () => {
    const store = new TaskStore();
    store.create('Test', 'desc');
    const tool = new TaskUpdateTool(store);
    const result = await tool.execute({ task_id: 'task-1', status: 'in_progress' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('in_progress');
  });

  it('shows BLOCKED when task has unfinished dependencies', async () => {
    const store = new TaskStore();
    store.create('Blocker', 'desc');
    store.create('Blocked', 'desc');
    store.update('task-2', { addBlockedBy: ['task-1'] });
    const tool = new TaskUpdateTool(store);
    const result = await tool.execute({ task_id: 'task-2', status: 'in_progress' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('BLOCKED');
  });

  it('fails for nonexistent task', async () => {
    const store = new TaskStore();
    const tool = new TaskUpdateTool(store);
    const result = await tool.execute({ task_id: 'task-999', status: 'completed' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });
});

describe('TaskGetTool', () => {
  it('returns full task details', async () => {
    const store = new TaskStore();
    store.create('Auth refactor', 'Refactor auth middleware', { owner: 'agent-1' });
    const tool = new TaskGetTool(store);
    const result = await tool.execute({ task_id: 'task-1' }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('Auth refactor');
    expect(data).toContain('pending');
    expect(data).toContain('agent-1');
  });

  it('fails for nonexistent task', async () => {
    const store = new TaskStore();
    const tool = new TaskGetTool(store);
    const result = await tool.execute({ task_id: 'task-999' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });
});

describe('TaskListTool', () => {
  it('returns all non-deleted tasks', async () => {
    const store = new TaskStore();
    store.create('Task A', 'desc A');
    store.create('Task B', 'desc B');
    const tool = new TaskListTool(store);
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('Task A');
    expect(data).toContain('Task B');
  });

  it('returns "No tasks" when empty', async () => {
    const store = new TaskStore();
    const tool = new TaskListTool(store);
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toBe('No tasks.');
  });
});

describe('createTaskTrackingTools', () => {
  it('returns store and 4 tools', () => {
    const { store, tools } = createTaskTrackingTools();
    expect(store).toBeInstanceOf(TaskStore);
    expect(tools.length).toBe(4);
    const names = tools.map(t => t.name);
    expect(names).toContain('task_create');
    expect(names).toContain('task_update');
    expect(names).toContain('task_get');
    expect(names).toContain('task_list');
  });

  it('shares the same store across tools', () => {
    const { store, tools } = createTaskTrackingTools();
    const createTool = tools.find(t => t.name === 'task_create')!;
    const listTool = tools.find(t => t.name === 'task_list')!;

    createTool.execute({ subject: 'Shared', description: 'test' }, ctx);
    return listTool.execute({}, ctx).then(result => {
      expect((result.data as string)).toContain('Shared');
    });
  });
});
