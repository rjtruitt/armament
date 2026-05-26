/**
 * Tests for BuiltinTools: bash, read_file, edit_file, write_file, append_file, grep, web_fetch, list_files
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BashTool,
  ReadFileTool,
  EditFileTool,
  WriteFileTool,
  AppendFileTool,
  GrepTool,
  ListFilesTool,
  getDefaultTools,
} from '../providers/BuiltinTools.js';

const ctx = { turnNumber: 1, state: {}, metadata: {} };

describe('BashTool', () => {
  const tool = new BashTool();

  it('has correct name', () => {
    expect(tool.name).toBe('bash');
  });

  it('executes a simple command', async () => {
    const result = await tool.execute({ command: 'echo hello' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toBe('hello');
  });

  it('returns error for missing command', async () => {
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGS');
  });

  it('blocks destructive commands', async () => {
    const result = await tool.execute({ command: 'rm -rf /' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BLOCKED');
  });

  it('respects custom timeout', async () => {
    const result = await tool.execute({ command: 'sleep 5', timeout: 500 }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('timed out');
  });

  it('supports run_in_background', async () => {
    const result = await tool.execute({ command: 'echo bg', run_in_background: true }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('pid');
  });

  it('returns combined stdout and stderr', async () => {
    const result = await tool.execute({ command: 'echo out; echo err >&2' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('out');
    expect(result.data).toContain('err');
  });

  it('caps timeout at 600000ms', async () => {
    // Should not throw — just clamps internally
    const result = await tool.execute({ command: 'echo ok', timeout: 999999 }, ctx);
    expect(result.success).toBe(true);
  });
});

describe('ReadFileTool', () => {
  const tool = new ReadFileTool();
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `read-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'sample.txt');
    writeFileSync(testFile, 'line one\nline two\nline three\nline four\nline five\n');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('has correct name', () => {
    expect(tool.name).toBe('read_file');
  });

  it('reads a file with line numbers', async () => {
    const result = await tool.execute({ path: testFile }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('1\tline one');
    expect(data).toContain('2\tline two');
    expect(data).toContain('5\tline five');
  });

  it('supports offset (1-based)', async () => {
    const result = await tool.execute({ path: testFile, offset: 3 }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('3\tline three');
    expect(data).not.toContain('1\tline one');
  });

  it('supports limit', async () => {
    const result = await tool.execute({ path: testFile, offset: 1, limit: 2 }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('1\tline one');
    expect(data).toContain('2\tline two');
    expect(data).not.toContain('3\t');
  });

  it('returns NOT_FOUND for missing file', async () => {
    const result = await tool.execute({ path: '/nonexistent/file.txt' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('returns error for missing path arg', async () => {
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGS');
  });
});

describe('EditFileTool', () => {
  const tool = new EditFileTool();
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `edit-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'target.ts');
    writeFileSync(testFile, 'const x = 1;\nconst y = 2;\nconst z = 3;\n');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('has correct name', () => {
    expect(tool.name).toBe('edit_file');
  });

  it('replaces a unique string', async () => {
    const result = await tool.execute({
      path: testFile,
      old_string: 'const x = 1;',
      new_string: 'const x = 99;',
      reason: 'test',
    }, ctx);
    expect(result.success).toBe(true);
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain('const x = 99;');
    expect(content).not.toContain('const x = 1;');
  });

  it('fails if old_string not found', async () => {
    const result = await tool.execute({
      path: testFile,
      old_string: 'does not exist',
      new_string: 'replacement',
      reason: 'test',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('fails if old_string is not unique (without replace_all)', async () => {
    writeFileSync(testFile, 'foo bar\nfoo bar\nfoo bar\n');
    const result = await tool.execute({
      path: testFile,
      old_string: 'foo bar',
      new_string: 'baz',
      reason: 'test',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_UNIQUE');
  });

  it('succeeds with replace_all for non-unique strings', async () => {
    writeFileSync(testFile, 'foo bar\nfoo bar\nfoo bar\n');
    const result = await tool.execute({
      path: testFile,
      old_string: 'foo bar',
      new_string: 'baz',
      replace_all: true,
      reason: 'test',
    }, ctx);
    expect(result.success).toBe(true);
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(testFile, 'utf-8');
    expect(content).toBe('baz\nbaz\nbaz\n');
  });

  it('fails if old_string equals new_string', async () => {
    const result = await tool.execute({
      path: testFile,
      old_string: 'const x = 1;',
      new_string: 'const x = 1;',
      reason: 'test',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_CHANGE');
  });

  it('fails for nonexistent file', async () => {
    const result = await tool.execute({
      path: '/tmp/nonexistent-edit-file.ts',
      old_string: 'x',
      new_string: 'y',
      reason: 'test',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('can delete text by replacing with empty string', async () => {
    const result = await tool.execute({
      path: testFile,
      old_string: 'const y = 2;\n',
      new_string: '',
      reason: 'test',
    }, ctx);
    expect(result.success).toBe(true);
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(testFile, 'utf-8');
    expect(content).toBe('const x = 1;\nconst z = 3;\n');
  });
});

describe('WriteFileTool', () => {
  const tool = new WriteFileTool();
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `write-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('has correct name', () => {
    expect(tool.name).toBe('write_file');
  });

  it('creates a new file', async () => {
    const path = join(testDir, 'new.txt');
    const result = await tool.execute({ path, content: 'hello world', reason: 'test' }, ctx);
    expect(result.success).toBe(true);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(path, 'utf-8')).toBe('hello world');
  });

  it('creates parent directories', async () => {
    const path = join(testDir, 'deep', 'nested', 'file.txt');
    const result = await tool.execute({ path, content: 'nested', reason: 'test' }, ctx);
    expect(result.success).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it('overwrites existing file', async () => {
    const path = join(testDir, 'existing.txt');
    writeFileSync(path, 'old content');
    const result = await tool.execute({ path, content: 'new content', reason: 'test' }, ctx);
    expect(result.success).toBe(true);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(path, 'utf-8')).toBe('new content');
  });

  it('returns error for missing path', async () => {
    const result = await tool.execute({ content: 'x', reason: 'test' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGS');
  });

  it('returns error for missing content', async () => {
    const result = await tool.execute({ path: join(testDir, 'x.txt'), reason: 'test' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGS');
  });

  it('reports bytes and lines written', async () => {
    const path = join(testDir, 'stats.txt');
    const result = await tool.execute({ path, content: 'line1\nline2\nline3', reason: 'test' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('3 lines');
  });
});

describe('AppendFileTool', () => {
  const tool = new AppendFileTool();
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `append-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'log.txt');
    writeFileSync(testFile, 'first line\n');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('has correct name', () => {
    expect(tool.name).toBe('append_file');
  });

  it('appends content to existing file', async () => {
    const result = await tool.execute({ path: testFile, content: 'second line\n', reason: 'test' }, ctx);
    expect(result.success).toBe(true);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(testFile, 'utf-8')).toBe('first line\nsecond line\n');
  });

  it('fails for nonexistent file', async () => {
    const result = await tool.execute({ path: '/tmp/no-such-append-file.txt', content: 'x', reason: 'test' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('reports bytes appended', async () => {
    const result = await tool.execute({ path: testFile, content: 'more', reason: 'test' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('4 bytes');
  });
});

describe('GrepTool', () => {
  const tool = new GrepTool();
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `grep-test-${Date.now()}`);
    mkdirSync(join(testDir, 'sub'), { recursive: true });
    writeFileSync(join(testDir, 'a.ts'), 'export function hello() {}\nexport function world() {}\n');
    writeFileSync(join(testDir, 'b.ts'), 'import { hello } from "./a";\n');
    writeFileSync(join(testDir, 'sub', 'c.py'), '# python file\ndef hello(): pass\n');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('has correct name', () => {
    expect(tool.name).toBe('grep');
  });

  it('finds matches across files', async () => {
    const result = await tool.execute({ pattern: 'hello', path: testDir }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('a.ts');
    expect(data).toContain('hello');
  });

  it('filters by include glob', async () => {
    const result = await tool.execute({ pattern: 'hello', path: testDir, include: '*.ts' }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('a.ts');
    expect(data).not.toContain('c.py');
  });

  it('reports no matches gracefully', async () => {
    const result = await tool.execute({ pattern: 'zzz_nonexistent_zzz', path: testDir }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain('No matches');
  });

  it('returns structured file:line:content output', async () => {
    const result = await tool.execute({ pattern: 'function hello', path: testDir }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toMatch(/a\.ts:\d+:.*function hello/);
  });

  it('returns error for missing pattern', async () => {
    const result = await tool.execute({ path: testDir }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGS');
  });
});

describe('ListFilesTool', () => {
  const tool = new ListFilesTool();
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `list-test-${Date.now()}`);
    mkdirSync(join(testDir, 'sub'), { recursive: true });
    writeFileSync(join(testDir, 'root.ts'), '');
    writeFileSync(join(testDir, 'sub', 'nested.ts'), '');
    writeFileSync(join(testDir, 'sub', 'data.json'), '');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('has correct name', () => {
    expect(tool.name).toBe('list_files');
  });

  it('lists files non-recursively (depth 1)', async () => {
    const result = await tool.execute({ path: testDir }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('root.ts');
  });

  it('lists files recursively', async () => {
    const result = await tool.execute({ path: testDir, recursive: true }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('root.ts');
    expect(data).toContain('nested.ts');
  });

  it('filters by pattern', async () => {
    const result = await tool.execute({ path: testDir, recursive: true, pattern: '*.json' }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('data.json');
    expect(data).not.toContain('root.ts');
  });

  it('reports count of files found', async () => {
    const result = await tool.execute({ path: testDir, recursive: true }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toMatch(/\d+ files?/);
  });
});

describe('getDefaultTools', () => {
  it('returns all expected tools', () => {
    const tools = getDefaultTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('bash');
    expect(names).toContain('read_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('write_file');
    expect(names).toContain('append_file');
    expect(names).toContain('grep');
    expect(names).toContain('web_fetch');
    expect(names).toContain('list_files');
    expect(tools.length).toBe(8);
  });
});
