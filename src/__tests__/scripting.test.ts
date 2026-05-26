/**
 * Exhaustive TDD test suite for Armament scripting engine.
 * IRC-client style custom scripting: aliases, triggers, bindings, timers, scripts.
 * Like LiCe, BitchX, ircII scripting — but for AI agent terminal.
 * All tests RED.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScriptEngine, createHookSystem } from '../core/ScriptEngine.js';

describe('Armament Script Engine', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // ALIAS SYSTEM (like /alias in IRC clients)
  // ─────────────────────────────────────────────────────────────────────────

  describe('aliases', () => {
    it('should register a simple alias', () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'q', pattern: '/q', expansion: '/quit' });
      expect(engine.getAliases()).toHaveLength(1);
    });

    it('should expand a simple alias', async () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'q', pattern: '/q', expansion: '/quit' });
      const result = await engine.executeAlias('q', []);
      expect(result).toBe('/quit');
    });

    it('should expand alias with arguments ($1, $2, $*)', async () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'sm', pattern: '/sm', expansion: '/spawn $1 --model $2' });
      const result = await engine.executeAlias('sm', ['coder', 'sonnet']);
      expect(result).toBe('/spawn coder --model sonnet');
    });

    it('should expand $* to all arguments', async () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'say', pattern: '/say', expansion: '/msg current $*' });
      const result = await engine.executeAlias('say', ['hello', 'world']);
      expect(result).toBe('/msg current hello world');
    });

    it('should support function-based aliases', async () => {
      const engine = createScriptEngine();
      const fn = vi.fn(async (args) => `/spawn ${args[0]} --model sonnet`);
      engine.addAlias({ name: 'sc', pattern: '/sc', expansion: fn });
      const result = await engine.executeAlias('sc', ['reviewer']);
      expect(result).toBe('/spawn reviewer --model sonnet');
    });

    it('should pass context to function aliases', async () => {
      const engine = createScriptEngine();
      const fn = vi.fn(async (args, ctx) => {
        return `/msg ${ctx.agent} ${args.join(' ')}`;
      });
      engine.addAlias({ name: 'tell', pattern: '/tell', expansion: fn });
      await engine.executeAlias('tell', ['do something']);
      expect(fn).toHaveBeenCalledWith(
        ['do something'],
        expect.objectContaining({ agent: expect.any(String) })
      );
    });

    it('should remove an alias', () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'q', pattern: '/q', expansion: '/quit' });
      engine.removeAlias('q');
      expect(engine.getAliases()).toHaveLength(0);
    });

    it('should override existing alias with same name', () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'q', pattern: '/q', expansion: '/quit' });
      engine.addAlias({ name: 'q', pattern: '/q', expansion: '/exit' });
      expect(engine.getAliases()).toHaveLength(1);
    });

    it('should chain aliases (alias expanding to another alias)', async () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'bye', pattern: '/bye', expansion: '/saybye' });
      engine.addAlias({ name: 'saybye', pattern: '/saybye', expansion: '/msg all goodbye && /quit' });
      const result = await engine.executeAlias('bye', []);
      expect(result).toContain('/quit');
    });

    it('should prevent infinite alias recursion', async () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'a', pattern: '/a', expansion: '/b' });
      engine.addAlias({ name: 'b', pattern: '/b', expansion: '/a' });
      await expect(engine.executeAlias('a', [])).rejects.toThrow(/recursion|depth/i);
    });

    it('should support multi-command aliases (&&)', async () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'reset', pattern: '/reset', expansion: '/clear && /spawn fresh' });
      const result = await engine.executeAlias('reset', []);
      expect(result).toContain('&&');
    });

    it('should list all aliases with /alias command', () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'q', pattern: '/q', expansion: '/quit', description: 'Quick quit' });
      engine.addAlias({ name: 'sc', pattern: '/sc', expansion: '/list', description: 'Show channels' });
      const list = engine.getAliases();
      expect(list[0].name).toBe('q');
      expect(list[1].name).toBe('sc');
    });

    it('should support conditional aliases with $if', async () => {
      const engine = createScriptEngine();
      engine.addAlias({
        name: 'smart',
        pattern: '/smart',
        expansion: '$if($1 == code) /model sonnet $else /model haiku',
      });
      const result = await engine.executeAlias('smart', ['code']);
      expect(result).toContain('sonnet');
    });

    it('should support variable interpolation in aliases', async () => {
      const engine = createScriptEngine();
      engine.setVariable('default_model', 'claude-sonnet');
      engine.addAlias({ name: 'new', pattern: '/new', expansion: '/spawn $1 --model ${default_model}' });
      const result = await engine.executeAlias('new', ['worker']);
      expect(result).toContain('claude-sonnet');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER SYSTEM (like /on in IRC clients)
  // ─────────────────────────────────────────────────────────────────────────

  describe('triggers', () => {
    it('should register a trigger', () => {
      const engine = createScriptEngine();
      engine.addTrigger({
        name: 'error-alert',
        pattern: /error|exception/i,
        action: '/msg admin error detected',
        source: 'agent',
        enabled: true,
      });
      expect(engine.getTriggers()).toHaveLength(1);
    });

    it('should fire trigger on pattern match', async () => {
      const engine = createScriptEngine();
      const action = vi.fn();
      engine.addTrigger({
        name: 'test',
        pattern: /hello/,
        action,
        source: 'any',
        enabled: true,
      });
      await engine.checkTriggers('hello world', { message: 'hello world', channel: 'main', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      expect(action).toHaveBeenCalled();
    });

    it('should not fire trigger when pattern does not match', async () => {
      const engine = createScriptEngine();
      const action = vi.fn();
      engine.addTrigger({
        name: 'test',
        pattern: /hello/,
        action,
        source: 'any',
        enabled: true,
      });
      await engine.checkTriggers('goodbye', { message: 'goodbye', channel: 'main', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      expect(action).not.toHaveBeenCalled();
    });

    it('should not fire disabled triggers', async () => {
      const engine = createScriptEngine();
      const action = vi.fn();
      engine.addTrigger({
        name: 'test',
        pattern: /hello/,
        action,
        source: 'any',
        enabled: false,
      });
      await engine.checkTriggers('hello', { message: 'hello', channel: 'main', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      expect(action).not.toHaveBeenCalled();
    });

    it('should pass match groups to trigger action', async () => {
      const engine = createScriptEngine();
      const action = vi.fn();
      engine.addTrigger({
        name: 'capture',
        pattern: /file: (.+\.ts)/,
        action,
        source: 'any',
        enabled: true,
      });
      await engine.checkTriggers('created file: index.ts', { message: 'created file: index.ts', channel: 'main', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      expect(action).toHaveBeenCalledWith(
        expect.arrayContaining(['index.ts']),
        expect.anything()
      );
    });

    it('should filter triggers by source', async () => {
      const engine = createScriptEngine();
      const agentAction = vi.fn();
      const toolAction = vi.fn();
      engine.addTrigger({ name: 'a', pattern: /test/, action: agentAction, source: 'agent', enabled: true });
      engine.addTrigger({ name: 'b', pattern: /test/, action: toolAction, source: 'tool', enabled: true });
      await engine.checkTriggers('test', { message: 'test', channel: 'main', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      expect(agentAction).toHaveBeenCalled();
      expect(toolAction).not.toHaveBeenCalled();
    });

    it('should support one-shot triggers (fire once then disable)', async () => {
      const engine = createScriptEngine();
      const action = vi.fn();
      engine.addTrigger({ name: 'once', pattern: /ready/, action, source: 'any', enabled: true, once: true });
      await engine.checkTriggers('ready', { message: 'ready', channel: 'main', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      await engine.checkTriggers('ready', { message: 'ready', channel: 'main', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('should filter triggers by channel', async () => {
      const engine = createScriptEngine();
      const action = vi.fn();
      engine.addTrigger({ name: 'chan', pattern: /test/, action, source: 'any', channel: 'coder', enabled: true });
      await engine.checkTriggers('test', { message: 'test', channel: 'reviewer', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      expect(action).not.toHaveBeenCalled();
    });

    it('should support string action (executed as command)', async () => {
      const engine = createScriptEngine();
      const exec = vi.fn();
      engine.addTrigger({ name: 'auto', pattern: /done/, action: '/clear', source: 'any', enabled: true });
      await engine.checkTriggers('task done', { message: 'task done', channel: 'main', agent: 'default', role: 'assistant', match: null, exec });
      expect(exec).toHaveBeenCalledWith('/clear');
    });

    it('should remove a trigger', () => {
      const engine = createScriptEngine();
      engine.addTrigger({ name: 'test', pattern: /x/, action: vi.fn(), source: 'any', enabled: true });
      engine.removeTrigger('test');
      expect(engine.getTriggers()).toHaveLength(0);
    });

    it('should fire multiple matching triggers in order', async () => {
      const order: number[] = [];
      const engine = createScriptEngine();
      engine.addTrigger({ name: 'first', pattern: /test/, action: () => { order.push(1); return Promise.resolve(); }, source: 'any', enabled: true });
      engine.addTrigger({ name: 'second', pattern: /test/, action: () => { order.push(2); return Promise.resolve(); }, source: 'any', enabled: true });
      await engine.checkTriggers('test', { message: 'test', channel: 'main', agent: 'default', role: 'assistant', match: null, exec: vi.fn() });
      expect(order).toEqual([1, 2]);
    });

    it('should support regex string patterns', () => {
      const engine = createScriptEngine();
      engine.addTrigger({ name: 'str', pattern: 'error.*fatal', action: vi.fn(), source: 'any', enabled: true });
      expect(engine.getTriggers()[0].pattern).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // KEY BINDINGS (like /bind in IRC clients)
  // ─────────────────────────────────────────────────────────────────────────

  describe('key bindings', () => {
    it('should register a key binding', () => {
      const engine = createScriptEngine();
      engine.addBinding({ key: 'ctrl+n', action: '/spawn new-agent', description: 'New agent' });
      expect(engine.getBindings()).toHaveLength(1);
    });

    it('should register Alt+number for channel switching', () => {
      const engine = createScriptEngine();
      for (let i = 1; i <= 9; i++) {
        engine.addBinding({ key: `alt+${i}`, action: `/switch ${i}` });
      }
      expect(engine.getBindings()).toHaveLength(9);
    });

    it('should support function-based bindings', () => {
      const engine = createScriptEngine();
      const fn = vi.fn();
      engine.addBinding({ key: 'ctrl+k', action: fn, description: 'Kill agent' });
      expect(engine.getBindings()[0].action).toBe(fn);
    });

    it('should remove a binding', () => {
      const engine = createScriptEngine();
      engine.addBinding({ key: 'ctrl+n', action: '/spawn' });
      engine.removeBinding('ctrl+n');
      expect(engine.getBindings()).toHaveLength(0);
    });

    it('should override existing binding for same key', () => {
      const engine = createScriptEngine();
      engine.addBinding({ key: 'ctrl+n', action: '/spawn old' });
      engine.addBinding({ key: 'ctrl+n', action: '/spawn new' });
      expect(engine.getBindings()).toHaveLength(1);
      expect(engine.getBindings()[0].action).toBe('/spawn new');
    });

    it('should support mode-specific bindings', () => {
      const engine = createScriptEngine();
      engine.addBinding({ key: 'tab', action: '/complete', mode: 'insert' });
      engine.addBinding({ key: 'tab', action: '/switch next', mode: 'normal' });
      expect(engine.getBindings()).toHaveLength(2);
    });

    it('should list all bindings', () => {
      const engine = createScriptEngine();
      engine.addBinding({ key: 'ctrl+n', action: '/spawn', description: 'New agent' });
      engine.addBinding({ key: 'ctrl+k', action: '/kill', description: 'Kill agent' });
      const bindings = engine.getBindings();
      expect(bindings[0].key).toBe('ctrl+n');
      expect(bindings[1].key).toBe('ctrl+k');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TIMER SYSTEM (like /timer in IRC clients)
  // ─────────────────────────────────────────────────────────────────────────

  describe('timers', () => {
    it('should register a timer', () => {
      const engine = createScriptEngine();
      engine.addTimer({ name: 'heartbeat', intervalMs: 5000, action: '/status', repeat: true, enabled: true });
      expect(engine.getTimers()).toHaveLength(1);
    });

    it('should remove a timer', () => {
      const engine = createScriptEngine();
      engine.addTimer({ name: 'heartbeat', intervalMs: 5000, action: '/status', repeat: true, enabled: true });
      engine.removeTimer('heartbeat');
      expect(engine.getTimers()).toHaveLength(0);
    });

    it('should support one-shot timers', () => {
      const engine = createScriptEngine();
      engine.addTimer({ name: 'delay', intervalMs: 1000, action: '/clear', repeat: false, enabled: true });
      expect(engine.getTimers()[0].repeat).toBe(false);
    });

    it('should support function-based timer actions', () => {
      const engine = createScriptEngine();
      const fn = vi.fn();
      engine.addTimer({ name: 'poll', intervalMs: 10000, action: fn, repeat: true, enabled: true });
      expect(engine.getTimers()[0].action).toBe(fn);
    });

    it('should disable a timer', () => {
      const engine = createScriptEngine();
      engine.addTimer({ name: 't', intervalMs: 1000, action: '/noop', repeat: true, enabled: true });
      const timer = engine.getTimers()[0];
      timer.enabled = false;
      expect(timer.enabled).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SCRIPT LOADING (like /load in IRC clients)
  // ─────────────────────────────────────────────────────────────────────────

  describe('script loading', () => {
    it('should load a script from file', async () => {
      const engine = createScriptEngine();
      await engine.load('/path/to/script.arma');
      expect(engine.getLoadedScripts()).toHaveLength(1);
    });

    it('should track script metadata', async () => {
      const engine = createScriptEngine();
      await engine.load('/path/to/script.arma');
      const script = engine.getLoadedScripts()[0];
      expect(script.name).toBeDefined();
      expect(script.path).toBe('/path/to/script.arma');
      expect(script.loadedAt).toBeGreaterThan(0);
    });

    it('should load inline script code', () => {
      const engine = createScriptEngine();
      engine.loadInline('alias q /quit');
      expect(engine.getAliases().length).toBeGreaterThan(0);
    });

    it('should unload a script and remove its aliases/triggers', async () => {
      const engine = createScriptEngine();
      await engine.load('/path/to/script.arma');
      engine.unload('script');
      expect(engine.getLoadedScripts()).toHaveLength(0);
    });

    it('should autoload scripts from config', async () => {
      const engine = createScriptEngine({ autoload: ['~/.armament/scripts/default.arma'] });
      await engine.initialize();
      expect(engine.getLoadedScripts().length).toBeGreaterThan(0);
    });

    it('should report script load errors without crashing', async () => {
      const engine = createScriptEngine();
      await expect(engine.load('/nonexistent/file.arma')).resolves.not.toThrow();
      expect(engine.getLoadErrors()).toHaveLength(1);
    });

    it('should support script versioning', async () => {
      const engine = createScriptEngine();
      await engine.load('/path/to/v2-script.arma');
      expect(engine.getLoadedScripts()[0].version).toBeDefined();
    });

    it('should list aliases/triggers defined by each script', async () => {
      const engine = createScriptEngine();
      await engine.load('/path/to/script.arma');
      const script = engine.getLoadedScripts()[0];
      expect(script.aliases).toBeDefined();
      expect(script.triggers).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // VARIABLES (like /set in IRC clients)
  // ─────────────────────────────────────────────────────────────────────────

  describe('variables', () => {
    it('should set a variable', () => {
      const engine = createScriptEngine();
      engine.setVariable('model', 'sonnet');
      expect(engine.getVariable('model')).toBe('sonnet');
    });

    it('should get all variables', () => {
      const engine = createScriptEngine();
      engine.setVariable('a', 1);
      engine.setVariable('b', 2);
      expect(Object.keys(engine.getVariables())).toHaveLength(2);
    });

    it('should return undefined for unset variables', () => {
      const engine = createScriptEngine();
      expect(engine.getVariable('nope')).toBeUndefined();
    });

    it('should interpolate variables in alias expansions', async () => {
      const engine = createScriptEngine();
      engine.setVariable('fav_model', 'opus');
      engine.addAlias({ name: 'fav', pattern: '/fav', expansion: '/model ${fav_model}' });
      const result = await engine.executeAlias('fav', []);
      expect(result).toContain('opus');
    });

    it('should support built-in variables ($channel, $agent, $model, $turn)', () => {
      const engine = createScriptEngine();
      expect(engine.getVariable('$channel')).toBeDefined();
      expect(engine.getVariable('$agent')).toBeDefined();
    });

    it('should support numeric variables', () => {
      const engine = createScriptEngine();
      engine.setVariable('count', 42);
      expect(engine.getVariable('count')).toBe(42);
    });

    it('should support array variables', () => {
      const engine = createScriptEngine();
      engine.setVariable('models', ['sonnet', 'opus', 'haiku']);
      expect(engine.getVariable('models')).toHaveLength(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // HOOK SYSTEM (like pre/post events in LiCe)
  // ─────────────────────────────────────────────────────────────────────────

  describe('hook system', () => {
    it('should register a hook', () => {
      const hooks = createHookSystem();
      hooks.register({
        name: 'log-messages',
        point: 'post:message',
        priority: 10,
        handler: async () => ({ aborted: false, modified: {} }),
      });
      expect(hooks.getAll()).toHaveLength(1);
    });

    it('should execute hooks at specified point', async () => {
      const hooks = createHookSystem();
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'test', point: 'pre:message', priority: 10, handler });
      await hooks.execute('pre:message', { point: 'pre:message', data: { text: 'hi' } });
      expect(handler).toHaveBeenCalled();
    });

    it('should execute hooks in priority order', async () => {
      const order: number[] = [];
      const hooks = createHookSystem();
      hooks.register({ name: 'low', point: 'pre:send', priority: 100, handler: async () => { order.push(100); return { aborted: false, modified: {} }; } });
      hooks.register({ name: 'high', point: 'pre:send', priority: 1, handler: async () => { order.push(1); return { aborted: false, modified: {} }; } });
      await hooks.execute('pre:send', { point: 'pre:send', data: {} });
      expect(order).toEqual([1, 100]);
    });

    it('should allow hooks to abort execution', async () => {
      const hooks = createHookSystem();
      hooks.register({
        name: 'blocker',
        point: 'pre:tool',
        priority: 1,
        handler: async (ctx) => { ctx.abort(); return { aborted: true, modified: {} }; },
      });
      const result = await hooks.execute('pre:tool', { point: 'pre:tool', data: { tool: 'rm' } });
      expect(result.aborted).toBe(true);
    });

    it('should allow hooks to modify data', async () => {
      const hooks = createHookSystem();
      hooks.register({
        name: 'modifier',
        point: 'pre:message',
        priority: 1,
        handler: async (ctx) => { ctx.modify('text', 'modified'); return { aborted: false, modified: { text: 'modified' } }; },
      });
      const result = await hooks.execute('pre:message', { point: 'pre:message', data: { text: 'original' } });
      expect(result.modified.text).toBe('modified');
    });

    it('should unregister a hook', () => {
      const hooks = createHookSystem();
      hooks.register({ name: 'test', point: 'pre:send', priority: 1, handler: async () => ({ aborted: false, modified: {} }) });
      hooks.unregister('test');
      expect(hooks.getAll()).toHaveLength(0);
    });

    it('should get hooks by point', () => {
      const hooks = createHookSystem();
      hooks.register({ name: 'a', point: 'pre:send', priority: 1, handler: async () => ({ aborted: false, modified: {} }) });
      hooks.register({ name: 'b', point: 'post:receive', priority: 1, handler: async () => ({ aborted: false, modified: {} }) });
      expect(hooks.getByPoint('pre:send')).toHaveLength(1);
    });

    it('should enable/disable hooks', () => {
      const hooks = createHookSystem();
      hooks.register({ name: 'test', point: 'pre:send', priority: 1, handler: async () => ({ aborted: false, modified: {} }) });
      hooks.disable('test');
      expect(hooks.isEnabled('test')).toBe(false);
      hooks.enable('test');
      expect(hooks.isEnabled('test')).toBe(true);
    });

    it('should not execute disabled hooks', async () => {
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      const hooks = createHookSystem();
      hooks.register({ name: 'test', point: 'pre:send', priority: 1, handler });
      hooks.disable('test');
      await hooks.execute('pre:send', { point: 'pre:send', data: {} });
      expect(handler).not.toHaveBeenCalled();
    });

    it('should support git hooks (on commit, push, branch, conflict)', async () => {
      const hooks = createHookSystem();
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'git-notify', point: 'git:commit', priority: 1, handler });
      await hooks.execute('git:commit', { point: 'git:commit', data: { hash: 'abc123' } });
      expect(handler).toHaveBeenCalled();
    });

    it('should support agent lifecycle hooks', async () => {
      const hooks = createHookSystem();
      const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
      hooks.register({ name: 'spawn-log', point: 'on:spawn', priority: 1, handler });
      await hooks.execute('on:spawn', { point: 'on:spawn', data: { agent: 'coder' } });
      expect(handler).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EVAL SYSTEM (like /eval in IRC clients)
  // ─────────────────────────────────────────────────────────────────────────

  describe('eval', () => {
    it('should evaluate simple expressions', () => {
      const engine = createScriptEngine();
      expect(engine.eval('2 + 2')).toBe(4);
    });

    it('should access variables in eval', () => {
      const engine = createScriptEngine();
      engine.setVariable('x', 10);
      expect(engine.eval('x * 2')).toBe(20);
    });

    it('should be sandboxed (no access to process/require)', () => {
      const engine = createScriptEngine({ sandboxed: true });
      expect(() => engine.eval('process.exit()')).toThrow();
    });

    it('should timeout on long-running eval', () => {
      const engine = createScriptEngine({ maxExecutionMs: 100 });
      expect(() => engine.eval('while(true){}')).toThrow(/timeout/i);
    });

    it('should not allow file system access when disabled', () => {
      const engine = createScriptEngine({ allowFileSystem: false });
      expect(() => engine.eval('require("fs")')).toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BUILT-IN SCRIPT COMMANDS (for the REPL)
  // ─────────────────────────────────────────────────────────────────────────

  describe('script REPL commands', () => {
    it('should handle /alias to define new alias', () => {
      const engine = createScriptEngine();
      engine.loadInline('/alias q /quit');
      expect(engine.getAliases().find(a => a.name === 'q')).toBeDefined();
    });

    it('should handle /unalias to remove alias', () => {
      const engine = createScriptEngine();
      engine.addAlias({ name: 'q', pattern: '/q', expansion: '/quit' });
      engine.loadInline('/unalias q');
      expect(engine.getAliases()).toHaveLength(0);
    });

    it('should handle /trigger to define trigger', () => {
      const engine = createScriptEngine();
      engine.loadInline('/trigger error-watch /error/ /msg admin problem');
      expect(engine.getTriggers()).toHaveLength(1);
    });

    it('should handle /untrigger to remove trigger', () => {
      const engine = createScriptEngine();
      engine.addTrigger({ name: 'test', pattern: /x/, action: vi.fn(), source: 'any', enabled: true });
      engine.loadInline('/untrigger test');
      expect(engine.getTriggers()).toHaveLength(0);
    });

    it('should handle /bind to define key binding', () => {
      const engine = createScriptEngine();
      engine.loadInline('/bind ctrl+n /spawn new');
      expect(engine.getBindings()).toHaveLength(1);
    });

    it('should handle /unbind to remove key binding', () => {
      const engine = createScriptEngine();
      engine.addBinding({ key: 'ctrl+n', action: '/spawn' });
      engine.loadInline('/unbind ctrl+n');
      expect(engine.getBindings()).toHaveLength(0);
    });

    it('should handle /timer to define timer', () => {
      const engine = createScriptEngine();
      engine.loadInline('/timer heartbeat 5000 /status');
      expect(engine.getTimers()).toHaveLength(1);
    });

    it('should handle /untimer to remove timer', () => {
      const engine = createScriptEngine();
      engine.addTimer({ name: 'test', intervalMs: 1000, action: '/noop', repeat: true, enabled: true });
      engine.loadInline('/untimer test');
      expect(engine.getTimers()).toHaveLength(0);
    });

    it('should handle /load to load script file', async () => {
      const engine = createScriptEngine();
      await engine.load('/scripts/init.arma');
      expect(engine.getLoadedScripts()).toHaveLength(1);
    });

    it('should handle /unload to unload script', async () => {
      const engine = createScriptEngine();
      await engine.load('/scripts/init.arma');
      engine.unload('init');
      expect(engine.getLoadedScripts()).toHaveLength(0);
    });

    it('should handle /scripts to list loaded scripts', () => {
      const engine = createScriptEngine();
      const scripts = engine.getLoadedScripts();
      expect(scripts).toBeDefined();
    });

    it('should handle /eval to run inline expression', () => {
      const engine = createScriptEngine();
      const result = engine.eval('1 + 1');
      expect(result).toBe(2);
    });

    it('should handle /set to set variable', () => {
      const engine = createScriptEngine();
      engine.loadInline('/set myvar hello');
      expect(engine.getVariable('myvar')).toBe('hello');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SCRIPT CONFIG & SECURITY
  // ─────────────────────────────────────────────────────────────────────────

  describe('script security', () => {
    it('should sandbox scripts by default', () => {
      const engine = createScriptEngine();
      expect(engine.isSandboxed()).toBe(true);
    });

    it('should restrict file system access when sandboxed', () => {
      const engine = createScriptEngine({ sandboxed: true, allowFileSystem: false });
      expect(() => engine.eval('require("fs").readFileSync("/etc/passwd")')).toThrow();
    });

    it('should restrict network access when sandboxed', () => {
      const engine = createScriptEngine({ sandboxed: true, allowNetwork: false });
      expect(() => engine.eval('fetch("http://evil.com")')).toThrow();
    });

    it('should restrict exec access when sandboxed', () => {
      const engine = createScriptEngine({ sandboxed: true, allowExec: false });
      expect(() => engine.eval('require("child_process").exec("rm -rf /")')).toThrow();
    });

    it('should enforce max execution time', () => {
      const engine = createScriptEngine({ maxExecutionMs: 50 });
      expect(() => engine.eval('while(true){}')).toThrow(/timeout/i);
    });

    it('should allow file system when explicitly enabled', () => {
      const engine = createScriptEngine({ sandboxed: false, allowFileSystem: true });
      expect(() => engine.eval('readFile("/tmp/test")')).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW/PANEL SCRIPTING API
  // ─────────────────────────────────────────────────────────────────────────

  describe('view/panel scripting', () => {

    describe('view mode aliases', () => {
      it('should alias /feed to switch to feed mode', async () => {
        const engine = createScriptEngine();
        engine.addAlias({ name: 'feed', pattern: '/feed', expansion: '/view feed' });
        const result = await engine.executeAlias('feed', []);
        expect(result).toBe('/view feed');
      });

      it('should alias /focus to focus on specific agent', async () => {
        const engine = createScriptEngine();
        engine.addAlias({ name: 'f', pattern: '/f', expansion: '/focus $1' });
        const result = await engine.executeAlias('f', ['coder']);
        expect(result).toBe('/focus coder');
      });

      it('should alias /split to enable split view', async () => {
        const engine = createScriptEngine();
        engine.addAlias({ name: 'sp', pattern: '/sp', expansion: '/view split $1 $2' });
        const result = await engine.executeAlias('sp', ['coder', 'reviewer']);
        expect(result).toBe('/view split coder reviewer');
      });

      it('should alias /sidebar to toggle sidebar visibility', async () => {
        const engine = createScriptEngine();
        engine.addAlias({ name: 'sb', pattern: '/sb', expansion: '/sidebar toggle' });
        const result = await engine.executeAlias('sb', []);
        expect(result).toBe('/sidebar toggle');
      });

      it('should alias /pin to pin current message', async () => {
        const engine = createScriptEngine();
        engine.addAlias({ name: 'p', pattern: '/p', expansion: '/pin $1' });
        const result = await engine.executeAlias('p', ['3']);
        expect(result).toBe('/pin 3');
      });
    });

    describe('mute/watch scripting', () => {
      it('should set mute via script command', () => {
        const engine = createScriptEngine();
        engine.loadInline('/mute reviewer --output --notifications');
        expect(engine.getViewState).toBeDefined();
      });

      it('should unmute via script command', () => {
        const engine = createScriptEngine();
        engine.loadInline('/unmute reviewer');
        expect(engine.getViewState).toBeDefined();
      });

      it('should watch agent via script', () => {
        const engine = createScriptEngine();
        engine.loadInline('/watch coder');
        expect(engine.getWatching).toBeDefined();
      });

      it('should unwatch agent via script', () => {
        const engine = createScriptEngine();
        engine.loadInline('/unwatch coder');
        expect(engine.getWatching).toBeDefined();
      });

      it('should mute all except one agent via alias', async () => {
        const engine = createScriptEngine();
        engine.addAlias({
          name: 'solo',
          pattern: '/solo',
          expansion: '/mute-all && /unmute $1',
        });
        const result = await engine.executeAlias('solo', ['coder']);
        expect(result).toContain('/unmute coder');
      });

      it('should support mute-with-exceptions pattern', async () => {
        const engine = createScriptEngine();
        engine.addAlias({
          name: 'hush',
          pattern: '/hush',
          expansion: '/mute $1 --allow-errors --allow-mentions',
        });
        const result = await engine.executeAlias('hush', ['noisy-bot']);
        expect(result).toContain('--allow-errors');
      });
    });

    describe('agent state triggers', () => {
      it('should fire trigger when agent status changes to done', async () => {
        const engine = createScriptEngine();
        const action = vi.fn();
        engine.addTrigger({
          name: 'done-notify',
          pattern: /status:done/,
          action,
          source: 'system',
          enabled: true,
        });
        await engine.checkTriggers('agent coder status:done', {
          message: 'agent coder status:done',
          channel: 'system',
          agent: 'coder',
          role: 'system',
          match: null,
          exec: vi.fn(),
        });
        expect(action).toHaveBeenCalled();
      });

      it('should fire trigger when agent encounters error', async () => {
        const engine = createScriptEngine();
        const action = vi.fn();
        engine.addTrigger({
          name: 'error-flash',
          pattern: /status:error/,
          action,
          source: 'system',
          enabled: true,
        });
        await engine.checkTriggers('agent coder status:error', {
          message: 'agent coder status:error',
          channel: 'system',
          agent: 'coder',
          role: 'system',
          match: null,
          exec: vi.fn(),
        });
        expect(action).toHaveBeenCalled();
      });

      it('should fire trigger when agent starts streaming', async () => {
        const engine = createScriptEngine();
        const exec = vi.fn();
        engine.addTrigger({
          name: 'stream-focus',
          pattern: /status:streaming/,
          action: '/focus $agent',
          source: 'system',
          enabled: true,
        });
        await engine.checkTriggers('agent coder status:streaming', {
          message: 'agent coder status:streaming',
          channel: 'system',
          agent: 'coder',
          role: 'system',
          match: null,
          exec,
        });
        // action should be a command string expanding $agent
        expect(exec).toHaveBeenCalledWith('/focus coder');
      });

      it('should auto-focus agent when trigger fires focus command', async () => {
        const engine = createScriptEngine();
        const exec = vi.fn();
        engine.addTrigger({
          name: 'auto-focus',
          pattern: /status:streaming/,
          action: '/focus coder',
          source: 'system',
          enabled: true,
        });
        await engine.checkTriggers('agent coder status:streaming', {
          message: 'agent coder status:streaming',
          channel: 'system',
          agent: 'coder',
          role: 'system',
          match: null,
          exec,
        });
        expect(exec).toHaveBeenCalledWith('/focus coder');
      });

      it('should trigger notification on agent completion when priority is high', async () => {
        const engine = createScriptEngine();
        const exec = vi.fn();
        engine.addTrigger({
          name: 'high-priority-done',
          pattern: /priority:high.*status:done/,
          action: '/notify "High-priority agent completed"',
          source: 'system',
          enabled: true,
        });
        await engine.checkTriggers('agent coder priority:high status:done', {
          message: 'agent coder priority:high status:done',
          channel: 'system',
          agent: 'coder',
          role: 'system',
          match: null,
          exec,
        });
        expect(exec).toHaveBeenCalledWith(expect.stringContaining('/notify'));
      });

      it('should trigger group collapse when all agents in group are done', async () => {
        const engine = createScriptEngine();
        const exec = vi.fn();
        engine.addTrigger({
          name: 'group-collapse',
          pattern: /group:(\w+) all-done/,
          action: '/group collapse $1',
          source: 'system',
          enabled: true,
        });
        await engine.checkTriggers('group:build-team all-done', {
          message: 'group:build-team all-done',
          channel: 'system',
          agent: 'system',
          role: 'system',
          match: null,
          exec,
        });
        expect(exec).toHaveBeenCalledWith(expect.stringContaining('/group collapse'));
      });
    });

    describe('view management via scripting API', () => {
      it('should expose setViewMode() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.setViewMode).toBeDefined();
      });

      it('should expose setFocus() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.setFocus).toBeDefined();
      });

      it('should expose clearFocus() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.clearFocus).toBeDefined();
      });

      it('should expose muteAgent() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.muteAgent).toBeDefined();
      });

      it('should expose unmuteAgent() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.unmuteAgent).toBeDefined();
      });

      it('should expose watchAgent() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.watchAgent).toBeDefined();
      });

      it('should expose unwatchAgent() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.unwatchAgent).toBeDefined();
      });

      it('should expose pinMessage() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.pinMessage).toBeDefined();
      });

      it('should expose unpinMessage() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.unpinMessage).toBeDefined();
      });

      it('should expose setSidebarPosition() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.setSidebarPosition).toBeDefined();
      });

      it('should expose setSidebarWidth() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.setSidebarWidth).toBeDefined();
      });

      it('should expose getAgentStatus() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.getAgentStatus).toBeDefined();
      });

      it('should expose getAgentList() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.getAgentList).toBeDefined();
      });

      it('should expose setFilter() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.setFilter).toBeDefined();
      });

      it('should expose clearFilter() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.clearFilter).toBeDefined();
      });

      it('should expose scrollTo() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.scrollTo).toBeDefined();
      });

      it('should expose setPriority() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.setPriority).toBeDefined();
      });

      it('should expose createGroup() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.createGroup).toBeDefined();
      });

      it('should expose collapseGroup() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.collapseGroup).toBeDefined();
      });

      it('should expose expandGroup() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.expandGroup).toBeDefined();
      });

      it('should expose notify() in script context', () => {
        const engine = createScriptEngine();
        expect(engine.api?.notify).toBeDefined();
      });
    });

    describe('view event hooks', () => {
      it('should fire hook on view mode change', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'view-change', point: 'view:mode-change', priority: 1, handler });
        await hooks.execute('view:mode-change', { point: 'view:mode-change', data: { from: 'feed', to: 'focus' } });
        expect(handler).toHaveBeenCalled();
      });

      it('should fire hook on focus change', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'focus-change', point: 'view:focus-change', priority: 1, handler });
        await hooks.execute('view:focus-change', { point: 'view:focus-change', data: { agentId: 'coder' } });
        expect(handler).toHaveBeenCalled();
      });

      it('should fire hook on mute/unmute', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'mute-change', point: 'view:mute-change', priority: 1, handler });
        await hooks.execute('view:mute-change', { point: 'view:mute-change', data: { agentId: 'reviewer', muted: true } });
        expect(handler).toHaveBeenCalled();
      });

      it('should fire hook on sidebar toggle', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'sidebar-toggle', point: 'view:sidebar-toggle', priority: 1, handler });
        await hooks.execute('view:sidebar-toggle', { point: 'view:sidebar-toggle', data: { visible: false } });
        expect(handler).toHaveBeenCalled();
      });

      it('should fire hook on agent select in sidebar', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'sidebar-select', point: 'view:sidebar-select', priority: 1, handler });
        await hooks.execute('view:sidebar-select', { point: 'view:sidebar-select', data: { index: 2, agentId: 'tester' } });
        expect(handler).toHaveBeenCalled();
      });

      it('should fire hook on notification displayed', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'notification', point: 'view:notification', priority: 1, handler });
        await hooks.execute('view:notification', { point: 'view:notification', data: { text: 'Agent done', level: 'info' } });
        expect(handler).toHaveBeenCalled();
      });

      it('should allow hook to suppress notification', async () => {
        const hooks = createHookSystem();
        hooks.register({
          name: 'quiet-mode',
          point: 'view:notification',
          priority: 1,
          handler: async (ctx) => { ctx.abort(); return { aborted: true, modified: {} }; },
        });
        const result = await hooks.execute('view:notification', { point: 'view:notification', data: { text: 'spam' } });
        expect(result.aborted).toBe(true);
      });

      it('should fire hook on layout change', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'layout-change', point: 'view:layout-change', priority: 1, handler });
        await hooks.execute('view:layout-change', { point: 'view:layout-change', data: { sidebarWidth: 30, sidebarPosition: 'left' } });
        expect(handler).toHaveBeenCalled();
      });

      it('should fire hook on priority change', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'priority-change', point: 'view:priority-change', priority: 1, handler });
        await hooks.execute('view:priority-change', { point: 'view:priority-change', data: { agentId: 'coder', level: 'high' } });
        expect(handler).toHaveBeenCalled();
      });

      it('should fire hook on group change', async () => {
        const hooks = createHookSystem();
        const handler = vi.fn(async () => ({ aborted: false, modified: {} }));
        hooks.register({ name: 'group-change', point: 'view:group-change', priority: 1, handler });
        await hooks.execute('view:group-change', { point: 'view:group-change', data: { groupId: 'build', action: 'collapse' } });
        expect(handler).toHaveBeenCalled();
      });
    });

    describe('composite view scripts', () => {
      it('should support "dashboard" script that sets up monitoring layout', async () => {
        const engine = createScriptEngine();
        engine.addAlias({
          name: 'dashboard',
          pattern: '/dashboard',
          expansion: '/view feed && /sidebar show && /sidebar position right && /sidebar width 40',
        });
        const result = await engine.executeAlias('dashboard', []);
        expect(result).toContain('/sidebar show');
        expect(result).toContain('/sidebar width 40');
      });

      it('should support "zen" script that hides all chrome', async () => {
        const engine = createScriptEngine();
        engine.addAlias({
          name: 'zen',
          pattern: '/zen',
          expansion: '/sidebar hide && /statusbar hide && /focus $1',
        });
        const result = await engine.executeAlias('zen', ['coder']);
        expect(result).toContain('/sidebar hide');
        expect(result).toContain('/focus coder');
      });

      it('should support "review" script that sets up code review layout', async () => {
        const engine = createScriptEngine();
        engine.addAlias({
          name: 'review',
          pattern: '/review',
          expansion: '/view split coder reviewer && /watch coder && /watch reviewer && /mute-all-except coder reviewer',
        });
        const result = await engine.executeAlias('review', []);
        expect(result).toContain('/view split');
        expect(result).toContain('/watch coder');
      });

      it('should support timer-based status rotation in sidebar', () => {
        const engine = createScriptEngine();
        engine.addTimer({
          name: 'rotate-focus',
          intervalMs: 30000,
          action: '/focus next',
          repeat: true,
          enabled: true,
        });
        expect(engine.getTimers()[0].name).toBe('rotate-focus');
      });

      it('should support trigger that auto-pins error messages', async () => {
        const engine = createScriptEngine();
        const exec = vi.fn();
        engine.addTrigger({
          name: 'auto-pin-errors',
          pattern: /\[error\]/i,
          action: '/pin last',
          source: 'agent',
          enabled: true,
        });
        await engine.checkTriggers('[ERROR] something failed', {
          message: '[ERROR] something failed',
          channel: 'coder',
          agent: 'coder',
          role: 'assistant',
          match: null,
          exec,
        });
        expect(exec).toHaveBeenCalledWith('/pin last');
      });

      it('should support trigger that auto-watches newly spawned agents', async () => {
        const engine = createScriptEngine();
        const exec = vi.fn();
        engine.addTrigger({
          name: 'auto-watch-spawn',
          pattern: /spawned agent: (\w+)/,
          action: '/watch $1',
          source: 'system',
          enabled: true,
        });
        await engine.checkTriggers('spawned agent: researcher', {
          message: 'spawned agent: researcher',
          channel: 'system',
          agent: 'system',
          role: 'system',
          match: null,
          exec,
        });
        expect(exec).toHaveBeenCalledWith(expect.stringContaining('/watch'));
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PRESET SCRIPTS (like LiCe scripts that come with the client)
  // ─────────────────────────────────────────────────────────────────────────

  describe('preset scripts', () => {
    it('should include default channel navigation bindings', () => {
      const engine = createScriptEngine({ presets: ['navigation'] });
      const bindings = engine.getBindings();
      expect(bindings.find(b => b.key === 'alt+1')).toBeDefined();
    });

    it('should include default agent management aliases', () => {
      const engine = createScriptEngine({ presets: ['agents'] });
      const aliases = engine.getAliases();
      expect(aliases.find(a => a.name === 'sc')).toBeDefined(); // show channels
    });

    it('should include default auto-format triggers', () => {
      const engine = createScriptEngine({ presets: ['formatting'] });
      const triggers = engine.getTriggers();
      expect(triggers.length).toBeGreaterThan(0);
    });

    it('should include cost tracking timers', () => {
      const engine = createScriptEngine({ presets: ['monitoring'] });
      const timers = engine.getTimers();
      expect(timers.find(t => t.name === 'cost-check')).toBeDefined();
    });

    it('should include git integration hooks', () => {
      const engine = createScriptEngine({ presets: ['git'] });
      const hooks = engine.getHooks();
      expect(hooks.find(h => h.point === 'git:commit')).toBeDefined();
    });
  });
});

