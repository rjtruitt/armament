/**
 * DEBUG MODE TEST SUITE — Ensures the debug infrastructure itself works
 * correctly so tests that depend on it can trust the mocks.
 *
 * Tests: singleton lifecycle, canned responses, MCP mocks, test hooks,
 * event log, input queue, output capture, and provider simulation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DebugMode } from '../debug/DebugMode';

describe('DebugMode — Singleton & Lifecycle', () => {
  beforeEach(() => {
    DebugMode.reset();
  });

  it('should return the same instance on repeated calls', () => {
    const a = DebugMode.instance();
    const b = DebugMode.instance();
    expect(a).toBe(b);
  });

  it('should start inactive by default', () => {
    const debug = DebugMode.instance();
    expect(debug.isActive()).toBe(false);
  });

  it('should activate and deactivate', () => {
    const debug = DebugMode.instance();
    debug.activate();
    expect(debug.isActive()).toBe(true);
    debug.deactivate();
    expect(debug.isActive()).toBe(false);
  });

  it('should reset to a fresh instance', () => {
    const a = DebugMode.instance();
    a.activate();
    a.queueInput('foo');
    DebugMode.reset();
    const b = DebugMode.instance();
    expect(b.isActive()).toBe(false);
    expect(b.hasQueuedInput()).toBe(false);
    expect(a).not.toBe(b);
  });
});

describe('DebugMode — Canned Responses', () => {
  let debug: DebugMode;

  beforeEach(() => {
    DebugMode.reset();
    debug = DebugMode.instance();
  });

  it('should match string patterns', () => {
    debug.setResponses([
      { match: 'hello', reply: 'hi there' },
      { match: /./, reply: 'fallback' },
    ]);
    expect(debug.getResponse('hello world').reply).toBe('hi there');
  });

  it('should match regex patterns', () => {
    debug.setResponses([
      { match: /^weather/i, reply: 'sunny' },
      { match: /./, reply: 'fallback' },
    ]);
    expect(debug.getResponse('Weather today?').reply).toBe('sunny');
    expect(debug.getResponse('not weather').reply).toBe('fallback');
  });

  it('should fall back to last response if nothing matches', () => {
    debug.setResponses([
      { match: 'xyz', reply: 'specific' },
      { match: /./, reply: 'catch-all' },
    ]);
    expect(debug.getResponse('something else').reply).toBe('catch-all');
  });

  it('should add responses to the front (highest priority)', () => {
    debug.setResponses([{ match: /./, reply: 'base' }]);
    debug.addResponse({ match: 'urgent', reply: 'priority response' });
    expect(debug.getResponse('urgent').reply).toBe('priority response');
  });

  it('should include thinking text in response', () => {
    debug.setResponses([{
      match: /./,
      reply: 'answer',
      thinking: 'I am pondering deeply',
    }]);
    const resp = debug.getResponse('question');
    expect(resp.thinking).toBe('I am pondering deeply');
  });

  it('should include tool calls in response', () => {
    debug.setResponses([{
      match: /read/,
      reply: 'done',
      toolCalls: [{ name: 'read_file', args: { path: '/foo' }, result: 'content' }],
    }]);
    const resp = debug.getResponse('read it');
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls![0].name).toBe('read_file');
  });

  it('should include token counts', () => {
    debug.setResponses([{
      match: /./,
      reply: 'ok',
      tokens: { input: 50, output: 20 },
    }]);
    const resp = debug.getResponse('hi');
    expect(resp.tokens).toEqual({ input: 50, output: 20 });
  });

  it('should clear and restore defaults', () => {
    debug.setResponses([{ match: /x/, reply: 'custom' }]);
    debug.clearResponses();
    const resp = debug.getResponse('anything');
    expect(resp.reply).toContain('debug mode');
  });
});

describe('DebugMode — MCP Server Mocks', () => {
  let debug: DebugMode;

  beforeEach(() => {
    DebugMode.reset();
    debug = DebugMode.instance();
  });

  it('should provide default MCP servers', () => {
    const servers = debug.getMcpServers();
    expect(servers.length).toBeGreaterThan(0);
    expect(servers.find(s => s.name === 'filesystem')).toBeDefined();
    expect(servers.find(s => s.name === 'github')).toBeDefined();
  });

  it('should get a specific server by name', () => {
    const fs = debug.getMcpServer('filesystem');
    expect(fs).toBeDefined();
    expect(fs!.status).toBe('connected');
    expect(fs!.tools.length).toBeGreaterThan(0);
  });

  it('should return undefined for unknown server', () => {
    expect(debug.getMcpServer('nonexistent')).toBeUndefined();
  });

  it('should execute a tool on a mock server', () => {
    const result = debug.executeMcpTool('filesystem', 'read_file', { path: '/test.ts' });
    expect(result).toContain('/test.ts');
  });

  it('should return error for tool on disconnected server', () => {
    debug.setMcpServers([{
      name: 'broken',
      tools: [{ name: 'ping', description: 'ping', handler: () => 'pong' }],
      status: 'crashed',
    }]);
    const result = debug.executeMcpTool('broken', 'ping', {});
    expect(result).toContain('crashed');
  });

  it('should return error for unknown tool', () => {
    const result = debug.executeMcpTool('filesystem', 'nonexistent_tool', {});
    expect(result).toContain('not found');
  });

  it('should allow overriding servers', () => {
    debug.setMcpServers([{
      name: 'custom',
      tools: [{ name: 'custom_tool', description: 'mine', handler: () => 'my result' }],
      status: 'connected',
    }]);
    expect(debug.getMcpServers()).toHaveLength(1);
    expect(debug.executeMcpTool('custom', 'custom_tool', {})).toBe('my result');
  });
});

describe('DebugMode — Provider Simulation', () => {
  let debug: DebugMode;

  beforeEach(() => {
    DebugMode.reset();
    debug = DebugMode.instance();
  });

  it('should provide default providers', () => {
    expect(debug.getProviders()).toContain('anthropic');
    expect(debug.getProviders()).toContain('openai');
  });

  it('should simulate auth failure', () => {
    expect(debug.shouldFailAuth()).toBe(false);
    debug.setFailAuth(true);
    expect(debug.shouldFailAuth()).toBe(true);
  });
});

describe('DebugMode — Test Hooks', () => {
  let debug: DebugMode;

  beforeEach(() => {
    DebugMode.reset();
    debug = DebugMode.instance();
  });

  it('should register and fire a named hook', () => {
    const fired: any[] = [];
    debug.onHook('post:message', (ctx) => fired.push(ctx));
    debug.fireHook('post:message', { content: 'hello' });
    expect(fired).toHaveLength(1);
    expect(fired[0].data.content).toBe('hello');
  });

  it('should fire wildcard hooks on any event', () => {
    const events: string[] = [];
    debug.onHook('*', (ctx) => events.push(ctx.point));
    debug.fireHook('post:message', {});
    debug.fireHook('post:tool', {});
    debug.fireHook('session:end', {});
    expect(events).toEqual(['post:message', 'post:tool', 'session:end']);
  });

  it('should support multiple handlers on the same hook', () => {
    let count = 0;
    debug.onHook('post:message', () => count++);
    debug.onHook('post:message', () => count++);
    debug.fireHook('post:message', {});
    expect(count).toBe(2);
  });

  it('should clear all hooks', () => {
    const fired: any[] = [];
    debug.onHook('post:message', (ctx) => fired.push(ctx));
    debug.clearHooks();
    debug.fireHook('post:message', {});
    expect(fired).toHaveLength(0);
  });

  it('should include timestamp in hook context', () => {
    let ts = 0;
    debug.onHook('test', (ctx) => { ts = ctx.timestamp; });
    const before = Date.now();
    debug.fireHook('test', {});
    expect(ts).toBeGreaterThanOrEqual(before);
  });
});

describe('DebugMode — Event Log', () => {
  let debug: DebugMode;

  beforeEach(() => {
    DebugMode.reset();
    debug = DebugMode.instance();
  });

  it('should record all fired events', () => {
    debug.fireHook('a', { x: 1 });
    debug.fireHook('b', { y: 2 });
    debug.fireHook('a', { x: 3 });
    expect(debug.getEventLog()).toHaveLength(3);
  });

  it('should filter events by point', () => {
    debug.fireHook('post:message', { n: 1 });
    debug.fireHook('post:tool', { n: 2 });
    debug.fireHook('post:message', { n: 3 });
    const msgs = debug.getEvents('post:message');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].data.n).toBe(1);
    expect(msgs[1].data.n).toBe(3);
  });

  it('should return all events when no filter', () => {
    debug.fireHook('a', {});
    debug.fireHook('b', {});
    expect(debug.getEvents()).toHaveLength(2);
  });

  it('should clear the event log', () => {
    debug.fireHook('a', {});
    debug.clearEventLog();
    expect(debug.getEventLog()).toHaveLength(0);
  });
});

describe('DebugMode — Input Queue', () => {
  let debug: DebugMode;

  beforeEach(() => {
    DebugMode.reset();
    debug = DebugMode.instance();
  });

  it('should queue and dequeue inputs in order', () => {
    debug.queueInput('first', 'second', 'third');
    expect(debug.nextInput()).toBe('first');
    expect(debug.nextInput()).toBe('second');
    expect(debug.nextInput()).toBe('third');
  });

  it('should return undefined when queue is empty', () => {
    expect(debug.nextInput()).toBeUndefined();
  });

  it('should report whether queue has items', () => {
    expect(debug.hasQueuedInput()).toBe(false);
    debug.queueInput('x');
    expect(debug.hasQueuedInput()).toBe(true);
    debug.nextInput();
    expect(debug.hasQueuedInput()).toBe(false);
  });

  it('should clear the queue', () => {
    debug.queueInput('a', 'b', 'c');
    debug.clearInputQueue();
    expect(debug.hasQueuedInput()).toBe(false);
  });
});

describe('DebugMode — Output Capture', () => {
  let debug: DebugMode;

  beforeEach(() => {
    DebugMode.reset();
    debug = DebugMode.instance();
  });

  it('should capture output lines', () => {
    debug.captureOutput('line 1');
    debug.captureOutput('line 2');
    expect(debug.getOutput()).toEqual(['line 1', 'line 2']);
  });

  it('should join output into text', () => {
    debug.captureOutput('hello');
    debug.captureOutput('world');
    expect(debug.getOutputText()).toBe('hello\nworld');
  });

  it('should clear output', () => {
    debug.captureOutput('stuff');
    debug.clearOutput();
    expect(debug.getOutput()).toEqual([]);
  });
});

describe('DebugMode — Config', () => {
  let debug: DebugMode;

  beforeEach(() => {
    DebugMode.reset();
    debug = DebugMode.instance();
  });

  it('should return full config', () => {
    const cfg = debug.getConfig();
    expect(cfg.responses).toBeDefined();
    expect(cfg.mcpServers).toBeDefined();
    expect(cfg.providers).toBeDefined();
  });

  it('should allow partial config updates', () => {
    debug.setConfig({ theme: 'ice', simulateLatency: 100 });
    expect(debug.getTheme()).toBe('ice');
    expect(debug.getConfig().simulateLatency).toBe(100);
  });

  it('should return workspace', () => {
    expect(debug.getWorkspace()).toBe(process.cwd());
  });
});
