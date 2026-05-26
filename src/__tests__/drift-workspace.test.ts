/**
 * Tests for file-based drift snapshot system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockDriftManager } from '../debug/MockDriftManager.js';
import { DriftStatusTool, DriftSnapshotTool, DriftSnapshotListTool, DriftRollbackTool, DriftPruneTool } from '../drift/DriftTools.js';

describe('DriftSnapshotTool', () => {
  let manager: MockDriftManager;
  let tool: DriftSnapshotTool;
  const channel = '#test';

  beforeEach(() => {
    manager = new MockDriftManager();
    tool = new DriftSnapshotTool(manager, channel);
  });

  it('creates a snapshot with path and reason', async () => {
    const result = await tool.execute({ path: '/tmp/test.txt', reason: 'testing' }, {} as any);
    expect(result.success).toBe(true);
    expect((result.data as any).path).toBe('/tmp/test.txt');
    expect((result.data as any).reason).toBe('testing');
    expect((result.data as any).id).toBeTruthy();
  });

  it('rejects missing path', async () => {
    const result = await tool.execute({ reason: 'testing' }, {} as any);
    expect(result.success).toBe(false);
  });

  it('rejects missing reason', async () => {
    const result = await tool.execute({ path: '/tmp/test.txt' }, {} as any);
    expect(result.success).toBe(false);
  });

  it('multiple snapshots accumulate', async () => {
    await tool.execute({ path: '/tmp/a.txt', reason: 'first' }, {} as any);
    await tool.execute({ path: '/tmp/b.txt', reason: 'second' }, {} as any);
    const listTool = new DriftSnapshotListTool(manager, channel);
    const listResult = await listTool.execute({}, {} as any);
    expect(listResult.success).toBe(true);
    expect((listResult.data as any[]).length).toBe(2);
  });
});

describe('DriftSnapshotListTool', () => {
  let manager: MockDriftManager;
  let tool: DriftSnapshotListTool;
  const channel = '#test';

  beforeEach(() => {
    manager = new MockDriftManager();
    tool = new DriftSnapshotListTool(manager, channel);
  });

  it('returns empty list when no snapshots', async () => {
    const result = await tool.execute({}, {} as any);
    expect(result.success).toBe(true);
    expect((result.data as any[])).toEqual([]);
  });

  it('filters by path when specified', async () => {
    const snapTool = new DriftSnapshotTool(manager, channel);
    await snapTool.execute({ path: '/tmp/a.txt', reason: 'first' }, {} as any);
    await snapTool.execute({ path: '/tmp/b.txt', reason: 'second' }, {} as any);

    const filtered = await tool.execute({ path: '/tmp/a.txt' }, {} as any);
    expect((filtered.data as any[]).length).toBe(1);
    expect((filtered.data as any[])[0].path).toBe('/tmp/a.txt');
  });
});

describe('DriftRollbackTool', () => {
  let manager: MockDriftManager;
  let tool: DriftRollbackTool;
  const channel = '#test';

  beforeEach(() => {
    manager = new MockDriftManager();
    tool = new DriftRollbackTool(manager, channel);
  });

  it('returns success for valid rollback', async () => {
    const snapTool = new DriftSnapshotTool(manager, channel);
    const snap = await snapTool.execute({ path: '/tmp/test.txt', reason: 'test' }, {} as any);
    const id = (snap.data as any).id;

    const result = await tool.execute({ id }, {} as any);
    expect(result.success).toBe(true);
  });

  it('fails for unknown id', async () => {
    const result = await tool.execute({ id: 's_999' }, {} as any);
    expect(result.success).toBe(false);
  });

  it('rejects missing id', async () => {
    const result = await tool.execute({}, {} as any);
    expect(result.success).toBe(false);
  });
});

describe('DriftStatusTool', () => {
  let manager: MockDriftManager;
  let tool: DriftStatusTool;
  const channel = '#test';

  beforeEach(() => {
    manager = new MockDriftManager();
    tool = new DriftStatusTool(manager, channel);
  });

  it('shows empty status when no snapshots', async () => {
    const result = await tool.execute({}, {} as any);
    expect(result.success).toBe(true);
    expect((result.data as any).snapshotsCount).toBe(0);
  });

  it('shows status after snapshot', async () => {
    const snapTool = new DriftSnapshotTool(manager, channel);
    await snapTool.execute({ path: '/tmp/test.txt', reason: 'test' }, {} as any);

    const result = await tool.execute({}, {} as any);
    expect(result.success).toBe(true);
    expect((result.data as any).snapshotsCount).toBe(1);
  });

  it('filters by path', async () => {
    const snapTool = new DriftSnapshotTool(manager, channel);
    await snapTool.execute({ path: '/tmp/a.txt', reason: 'first' }, {} as any);
    await snapTool.execute({ path: '/tmp/b.txt', reason: 'second' }, {} as any);

    const result = await tool.execute({ path: '/tmp/a.txt' }, {} as any);
    expect(result.success).toBe(true);
    expect((result.data as any).snapshots).toBe(1);
  });
});

describe('DriftPruneTool', () => {
  let manager: MockDriftManager;
  let tool: DriftPruneTool;
  const channel = '#test';

  beforeEach(() => {
    manager = new MockDriftManager();
    tool = new DriftPruneTool(manager, channel);
  });

  it('prunes by age', async () => {
    const snapTool = new DriftSnapshotTool(manager, channel);
    await snapTool.execute({ path: '/tmp/a.txt', reason: 'old' }, {} as any);
    const result = await tool.execute({ days: 0 }, {} as any);
    expect(result.success).toBe(true);
    expect((result.data as string)).toContain('Pruned');
  });

  it('handles no-op prune', async () => {
    const result = await tool.execute({ staleOnly: true }, {} as any);
    expect(result.success).toBe(true);
    expect((result.data as string)).toContain('Pruned 0');
  });

  it('rejects invalid args gracefully', async () => {
    const result = await tool.execute({}, {} as any);
    expect(result.success).toBe(true);
  });
});
