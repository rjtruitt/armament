/**
 * Exhaustive TDD-RED test suite for .arma scripting engine.
 * IRC-style automation scripts for the armament CLI.
 * Orchestrate multi-agent workflows, configure providers, react to events.
 * Think BitchX/ircII scripts but for AI agents.
 *
 * All tests RED — implementation does not exist yet.
 * Implementation target: ../scripting/ArmaScript.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ArmaScript, ScriptContext, ScriptEvent } from '../scripting/ArmaScript.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMockContext(): ScriptContext {
  return {
    spawn: vi.fn().mockResolvedValue('agent-id-123'),
    kill: vi.fn().mockResolvedValue(undefined),
    msg: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined),
    setConfig: vi.fn(),
    getConfig: vi.fn().mockReturnValue(undefined),
    getAgents: vi.fn().mockReturnValue([]),
    findAgent: vi.fn().mockReturnValue(null),
    notify: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
  };
}

describe('ArmaScript Engine', () => {
  let ctx: ScriptContext;
  let engine: ArmaScript;

  beforeEach(() => {
    ctx = createMockContext();
    engine = new ArmaScript(ctx);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PARSING BASICS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('parsing basics', () => {
    it('parses empty script without error', () => {
      const ast = engine.parse('');
      expect(ast).toBeDefined();
      expect(ast.commands).toHaveLength(0);
    });

    it('parses script with only whitespace', () => {
      const ast = engine.parse('   \n\n   \n');
      expect(ast.commands).toHaveLength(0);
    });

    it('parses comments (lines starting with #)', () => {
      const ast = engine.parse('# this is a comment\n# another comment');
      expect(ast.commands).toHaveLength(0);
    });

    it('parses a single command /theme ice', () => {
      const ast = engine.parse('/theme ice');
      expect(ast.commands).toHaveLength(1);
      expect(ast.commands[0].command).toBe('theme');
      expect(ast.commands[0].args).toEqual(['ice']);
    });

    it('parses multiple commands', () => {
      const script = `/theme ice\n/spawn worker-1\n/log "started"`;
      const ast = engine.parse(script);
      expect(ast.commands).toHaveLength(3);
    });

    it('parses commands with quoted arguments', () => {
      const ast = engine.parse('/topic lead "You are an architect"');
      expect(ast.commands[0].command).toBe('topic');
      expect(ast.commands[0].args).toEqual(['lead', 'You are an architect']);
    });

    it('parses commands with single-quoted arguments', () => {
      const ast = engine.parse("/msg worker 'hello world'");
      expect(ast.commands[0].args).toEqual(['worker', 'hello world']);
    });

    it('ignores blank lines between commands', () => {
      const script = `/theme ice\n\n\n/log "done"`;
      const ast = engine.parse(script);
      expect(ast.commands).toHaveLength(2);
    });

    it('trims whitespace from lines', () => {
      const ast = engine.parse('   /theme ice   ');
      expect(ast.commands[0].command).toBe('theme');
      expect(ast.commands[0].args).toEqual(['ice']);
    });

    it('errors on invalid command (unknown /command)', () => {
      expect(() => engine.parse('/notarealcommand foo')).toThrow();
    });

    it('parses inline comments after commands', () => {
      const ast = engine.parse('/theme ice # set to ice theme');
      expect(ast.commands[0].command).toBe('theme');
      expect(ast.commands[0].args).toEqual(['ice']);
    });

    it('returns AST with command nodes', () => {
      const ast = engine.parse('/spawn worker-1 --provider bedrock');
      expect(ast.commands[0]).toHaveProperty('command');
      expect(ast.commands[0]).toHaveProperty('args');
      expect(ast.commands[0]).toHaveProperty('lineNumber');
    });

    it('each node has correct lineNumber', () => {
      const script = `# header\n/theme ice\n\n/log "hello"`;
      const ast = engine.parse(script);
      expect(ast.commands[0].lineNumber).toBe(2);
      expect(ast.commands[1].lineNumber).toBe(4);
    });

    it('preserves argument order', () => {
      const ast = engine.parse('/spawn lead --provider bedrock --model claude-4');
      expect(ast.commands[0].args).toEqual(['lead', '--provider', 'bedrock', '--model', 'claude-4']);
    });

    it('handles escaped quotes inside quoted strings', () => {
      const ast = engine.parse('/msg worker "say \\"hello\\""');
      expect(ast.commands[0].args[1]).toBe('say "hello"');
    });

    it('parses multiline quoted strings with backslash continuation', () => {
      const script = '/log "this is a \\\nlong message"';
      const ast = engine.parse(script);
      expect(ast.commands[0].args[0]).toBe('this is a long message');
    });

    it('errors on unclosed quote', () => {
      expect(() => engine.parse('/msg worker "unclosed')).toThrow();
    });

    it('returns metadata from leading comment block', () => {
      const script = `# Deploy workflow\n# Spawns agents and chains results\n/spawn lead`;
      const ast = engine.parse(script);
      expect(ast.metadata?.description).toBe('Deploy workflow\nSpawns agents and chains results');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. COMMAND EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('command execution', () => {
    it('/theme <name> calls context.setConfig("theme", name)', async () => {
      await engine.run('/theme ice');
      expect(ctx.setConfig).toHaveBeenCalledWith('theme', 'ice');
    });

    it('/spawn <name> --provider <p> --model <m> calls context.spawn', async () => {
      await engine.run('/spawn worker-1 --provider bedrock --model claude-4');
      expect(ctx.spawn).toHaveBeenCalledWith('worker-1', {
        provider: 'bedrock',
        model: 'claude-4',
      });
    });

    it('/spawn <name> with no flags calls spawn with defaults', async () => {
      await engine.run('/spawn helper');
      expect(ctx.spawn).toHaveBeenCalledWith('helper', {});
    });

    it('/spawn <name> --prompt "text" passes prompt option', async () => {
      await engine.run('/spawn lead --prompt "You are the architect"');
      expect(ctx.spawn).toHaveBeenCalledWith('lead', {
        prompt: 'You are the architect',
      });
    });

    it('/kill <name> calls context.kill', async () => {
      await engine.run('/kill worker-1');
      expect(ctx.kill).toHaveBeenCalledWith('worker-1');
    });

    it('/msg <target> <message> calls context.msg with correct args', async () => {
      await engine.run('/msg worker-1 "please summarize results"');
      expect(ctx.msg).toHaveBeenCalledWith('worker-1', 'please summarize results');
    });

    it('/msg with unquoted single word message', async () => {
      await engine.run('/msg worker-1 hello');
      expect(ctx.msg).toHaveBeenCalledWith('worker-1', 'hello');
    });

    it('/broadcast <message> calls context.broadcast', async () => {
      await engine.run('/broadcast "shutdown in 5 seconds"');
      expect(ctx.broadcast).toHaveBeenCalledWith('shutdown in 5 seconds');
    });

    it('/set <key> <value> calls context.setConfig', async () => {
      await engine.run('/set max_tokens 4096');
      expect(ctx.setConfig).toHaveBeenCalledWith('max_tokens', '4096');
    });

    it('/notify <channel> <message> calls context.notify', async () => {
      await engine.run('/notify #alerts "budget exceeded"');
      expect(ctx.notify).toHaveBeenCalledWith('#alerts', 'budget exceeded');
    });

    it('/log <message> calls context.log', async () => {
      await engine.run('/log "starting deployment"');
      expect(ctx.log).toHaveBeenCalledWith('starting deployment');
    });

    it('/sleep <ms> pauses execution for N milliseconds', async () => {
      const start = Date.now();
      await engine.run('/sleep 50');
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('/topic <agent> <prompt> sets agent system prompt via msg', async () => {
      await engine.run('/topic lead "You are a code reviewer"');
      expect(ctx.msg).toHaveBeenCalledWith('lead', '/topic You are a code reviewer');
    });

    it('commands execute in sequential order', async () => {
      const order: string[] = [];
      (ctx.log as ReturnType<typeof vi.fn>).mockImplementation((msg: string) => {
        order.push(msg);
      });
      await engine.run('/log "first"\n/log "second"\n/log "third"');
      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('execution stops on error by default', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('spawn failed'));
      await expect(engine.run('/spawn bad\n/log "after"')).rejects.toThrow('spawn failed');
      expect(ctx.log).not.toHaveBeenCalled();
    });

    it('run(scriptText) returns Promise that resolves when done', async () => {
      const result = engine.run('/log "done"');
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(ctx.log).toHaveBeenCalledWith('done');
    });

    it('run() rejects if a command fails and no error handler', async () => {
      (ctx.kill as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no such agent'));
      await expect(engine.run('/kill nonexistent')).rejects.toThrow('no such agent');
    });

    it('/spawn returns agent id accessible as $result', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockResolvedValue('agent-abc');
      await engine.run('/spawn lead\n/log $result');
      expect(ctx.log).toHaveBeenCalledWith('agent-abc');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. VARIABLES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('variables', () => {
    it('/set $name "worker-1" stores variable', async () => {
      await engine.run('/set $name "worker-1"\n/log $name');
      expect(ctx.log).toHaveBeenCalledWith('worker-1');
    });

    it('variable substitution in command arguments', async () => {
      await engine.run('/set $target "worker-1"\n/msg $target "hello"');
      expect(ctx.msg).toHaveBeenCalledWith('worker-1', 'hello');
    });

    it('built-in variable $time contains current timestamp', async () => {
      await engine.run('/log $time');
      const loggedValue = (ctx.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(Number(loggedValue)).toBeGreaterThan(0);
    });

    it('built-in variable $user contains session user', async () => {
      (ctx.getConfig as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'user') return 'rtruitt';
        return undefined;
      });
      await engine.run('/log $user');
      expect(ctx.log).toHaveBeenCalledWith('rtruitt');
    });

    it('built-in variable $session contains session id', async () => {
      await engine.run('/log $session');
      const loggedValue = (ctx.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(loggedValue).toBeTruthy();
      expect(typeof loggedValue).toBe('string');
    });

    it('$result holds last command return value', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockResolvedValue('new-agent-id');
      await engine.run('/spawn lead\n/log $result');
      expect(ctx.log).toHaveBeenCalledWith('new-agent-id');
    });

    it('$error holds last error message after catch', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('rate limited'));
      await engine.run('/try\n/spawn bad\n/catch\n/log $error\n/endtry');
      expect(ctx.log).toHaveBeenCalledWith('rate limited');
    });

    it('$agent.name dot-notation access on structured vars', async () => {
      (ctx.getAgents as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'lead', provider: 'bedrock', status: 'idle' },
      ]);
      await engine.run('/set $agent (agents 0)\n/log $agent.name');
      expect(ctx.log).toHaveBeenCalledWith('lead');
    });

    it('variables persist across commands in same script', async () => {
      await engine.run('/set $x "hello"\n/set $y "world"\n/log "$x $y"');
      expect(ctx.log).toHaveBeenCalledWith('hello world');
    });

    it('undefined variable resolves to empty string', async () => {
      await engine.run('/log $undefined_var');
      expect(ctx.log).toHaveBeenCalledWith('');
    });

    it('variable interpolation inside quoted string', async () => {
      await engine.run('/set $name "world"\n/log "hello $name"');
      expect(ctx.log).toHaveBeenCalledWith('hello world');
    });

    it('escaped dollar sign does not interpolate', async () => {
      await engine.run('/log "costs \\$5"');
      expect(ctx.log).toHaveBeenCalledWith('costs $5');
    });

    it('/unset $name clears a variable', async () => {
      await engine.run('/set $x "value"\n/unset $x\n/log $x');
      expect(ctx.log).toHaveBeenCalledWith('');
    });

    it('/set $count 5 — numeric values stored correctly', async () => {
      await engine.run('/set $count 5\n/log $count');
      expect(ctx.log).toHaveBeenCalledWith('5');
    });

    it('arithmetic: /set $x ($count + 1) evaluates to 6', async () => {
      await engine.run('/set $count 5\n/set $x ($count + 1)\n/log $x');
      expect(ctx.log).toHaveBeenCalledWith('6');
    });

    it('arithmetic: subtraction', async () => {
      await engine.run('/set $a 10\n/set $b ($a - 3)\n/log $b');
      expect(ctx.log).toHaveBeenCalledWith('7');
    });

    it('arithmetic: multiplication', async () => {
      await engine.run('/set $a 4\n/set $b ($a * 3)\n/log $b');
      expect(ctx.log).toHaveBeenCalledWith('12');
    });

    it('multiple variable substitutions in one command', async () => {
      await engine.run('/set $host "agent-1"\n/set $action "deploy"\n/log "$host: $action"');
      expect(ctx.log).toHaveBeenCalledWith('agent-1: deploy');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CONDITIONALS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('conditionals', () => {
    it('/if ... /endif basic block executes when true', async () => {
      await engine.run('/set $x 1\n/if $x\n/log "yes"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('yes');
    });

    it('/if ... /endif block skipped when false', async () => {
      await engine.run('/set $x 0\n/if $x\n/log "yes"\n/endif');
      expect(ctx.log).not.toHaveBeenCalled();
    });

    it('/if ... /else ... /endif executes else when false', async () => {
      await engine.run('/set $x 0\n/if $x\n/log "yes"\n/else\n/log "no"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('no');
    });

    it('/if ... /elif ... /else ... /endif chains', async () => {
      const script = `/set $x 2
/if $x == 1
/log "one"
/elif $x == 2
/log "two"
/else
/log "other"
/endif`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('two');
    });

    it('condition: variable truthiness (non-empty is true)', async () => {
      await engine.run('/set $found "yes"\n/if $found\n/log "found"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('found');
    });

    it('condition: empty string is falsy', async () => {
      await engine.run('/set $found ""\n/if $found\n/log "found"\n/endif');
      expect(ctx.log).not.toHaveBeenCalled();
    });

    it('condition: equality /if $status == "idle"', async () => {
      await engine.run('/set $status "idle"\n/if $status == "idle"\n/log "ready"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('ready');
    });

    it('condition: inequality /if $count != 0', async () => {
      await engine.run('/set $count 5\n/if $count != 0\n/log "has items"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('has items');
    });

    it('condition: numeric greater than', async () => {
      await engine.run('/set $budget 10\n/if $budget > 5\n/log "over budget"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('over budget');
    });

    it('condition: numeric less than', async () => {
      await engine.run('/set $budget 3\n/if $budget < 5\n/log "under budget"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('under budget');
    });

    it('condition: distributed keyword checks config', async () => {
      (ctx.getConfig as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'distributed') return true;
        return undefined;
      });
      await engine.run('/if distributed\n/log "distributed mode"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('distributed mode');
    });

    it('condition: has_provider checks provider registry', async () => {
      (ctx.getConfig as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'providers') return ['bedrock', 'openai'];
        return undefined;
      });
      await engine.run('/if has_provider bedrock\n/log "bedrock available"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('bedrock available');
    });

    it('condition: agent_exists checks if agent is alive', async () => {
      (ctx.getAgents as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'worker-1', provider: 'bedrock', status: 'running' },
      ]);
      await engine.run('/if agent_exists worker-1\n/log "alive"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('alive');
    });

    it('nested if blocks work correctly', async () => {
      const script = `/set $a 1
/set $b 1
/if $a
/if $b
/log "both"
/endif
/endif`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('both');
    });

    it('commands inside if only execute when condition true', async () => {
      await engine.run('/set $go 0\n/if $go\n/spawn worker\n/endif');
      expect(ctx.spawn).not.toHaveBeenCalled();
    });

    it('parse error on unmatched /endif', () => {
      expect(() => engine.parse('/endif')).toThrow();
    });

    it('parse error on /else without /if', () => {
      expect(() => engine.parse('/else\n/log "oops"\n/endif')).toThrow();
    });

    it('parse error on /if without /endif', () => {
      expect(() => engine.parse('/if $x\n/log "no end"')).toThrow();
    });

    it('condition: >= comparison', async () => {
      await engine.run('/set $n 5\n/if $n >= 5\n/log "pass"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('pass');
    });

    it('condition: <= comparison', async () => {
      await engine.run('/set $n 3\n/if $n <= 5\n/log "pass"\n/endif');
      expect(ctx.log).toHaveBeenCalledWith('pass');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('event handlers', () => {
    it('/on <event> ... /endon registers handler', async () => {
      await engine.run('/on agent:complete\n/log "done"\n/endon');
      const handlers = engine.getEventHandlers('agent:complete');
      expect(handlers).toHaveLength(1);
    });

    it('/on agent:complete fires when agent finishes', async () => {
      await engine.run('/on agent:complete\n/log "agent done"\n/endon');
      await engine.emit({ type: 'agent:complete', data: { name: 'worker-1' } });
      expect(ctx.log).toHaveBeenCalledWith('agent done');
    });

    it('/on agent:error fires on agent error', async () => {
      await engine.run('/on agent:error\n/log "error occurred"\n/endon');
      await engine.emit({ type: 'agent:error', data: { name: 'worker-1', error: 'timeout' } });
      expect(ctx.log).toHaveBeenCalledWith('error occurred');
    });

    it('/on budget:threshold fires at cost limit', async () => {
      await engine.run('/on budget:threshold\n/broadcast "budget limit"\n/endon');
      await engine.emit({ type: 'budget:threshold', data: { amount: 50.0 } });
      expect(ctx.broadcast).toHaveBeenCalledWith('budget limit');
    });

    it('/on message:<channel> fires on incoming message', async () => {
      await engine.run('/on message:#general\n/log "got message"\n/endon');
      await engine.emit({ type: 'message:#general', data: { from: 'user', text: 'hello' } });
      expect(ctx.log).toHaveBeenCalledWith('got message');
    });

    it('event handler receives $event variable with event data', async () => {
      await engine.run('/on agent:complete\n/log $event.name\n/endon');
      await engine.emit({ type: 'agent:complete', data: { name: 'worker-1' } });
      expect(ctx.log).toHaveBeenCalledWith('worker-1');
    });

    it('multiple handlers for same event all fire', async () => {
      await engine.run('/on agent:complete\n/log "handler1"\n/endon\n/on agent:complete\n/log "handler2"\n/endon');
      await engine.emit({ type: 'agent:complete', data: {} });
      expect(ctx.log).toHaveBeenCalledTimes(2);
      expect(ctx.log).toHaveBeenCalledWith('handler1');
      expect(ctx.log).toHaveBeenCalledWith('handler2');
    });

    it('/off <event> unregisters all handlers for event', async () => {
      await engine.run('/on agent:complete\n/log "done"\n/endon\n/off agent:complete');
      await engine.emit({ type: 'agent:complete', data: {} });
      expect(ctx.log).not.toHaveBeenCalled();
    });

    it('handlers survive across the script lifetime', async () => {
      await engine.run('/on agent:complete\n/log "done"\n/endon');
      // emit multiple times
      await engine.emit({ type: 'agent:complete', data: {} });
      await engine.emit({ type: 'agent:complete', data: {} });
      expect(ctx.log).toHaveBeenCalledTimes(2);
    });

    it('handler can spawn agents and send messages', async () => {
      await engine.run('/on agent:complete\n/spawn follow-up\n/msg follow-up "continue"\n/endon');
      await engine.emit({ type: 'agent:complete', data: { name: 'lead' } });
      expect(ctx.spawn).toHaveBeenCalledWith('follow-up', {});
      expect(ctx.msg).toHaveBeenCalledWith('follow-up', 'continue');
    });

    it('/on timer:5000 registers a recurring timer handler', async () => {
      vi.useFakeTimers();
      await engine.run('/on timer:100\n/log "tick"\n/endon');
      vi.advanceTimersByTime(350);
      expect(ctx.log).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('/once <event> fires only once then auto-unregisters', async () => {
      await engine.run('/once agent:complete\n/log "once"\n/endon');
      await engine.emit({ type: 'agent:complete', data: {} });
      await engine.emit({ type: 'agent:complete', data: {} });
      expect(ctx.log).toHaveBeenCalledTimes(1);
    });

    it('parse error on /endon without /on', () => {
      expect(() => engine.parse('/endon')).toThrow();
    });

    it('parse error on /on without /endon', () => {
      expect(() => engine.parse('/on agent:complete\n/log "x"')).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. LOOPS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('loops', () => {
    it('/foreach $agent in agents iterates all agents', async () => {
      (ctx.getAgents as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'a1', provider: 'bedrock', status: 'idle' },
        { name: 'a2', provider: 'openai', status: 'idle' },
      ]);
      await engine.run('/foreach $agent in agents\n/log $agent.name\n/endfor');
      expect(ctx.log).toHaveBeenCalledTimes(2);
      expect(ctx.log).toHaveBeenCalledWith('a1');
      expect(ctx.log).toHaveBeenCalledWith('a2');
    });

    it('/foreach $provider in providers iterates configured providers', async () => {
      (ctx.getConfig as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'providers') return ['bedrock', 'openai', 'vertex'];
        return undefined;
      });
      await engine.run('/foreach $p in providers\n/log $p\n/endfor');
      expect(ctx.log).toHaveBeenCalledTimes(3);
    });

    it('/repeat 3 ... /endrepeat runs N times', async () => {
      await engine.run('/repeat 3\n/log "hi"\n/endrepeat');
      expect(ctx.log).toHaveBeenCalledTimes(3);
    });

    it('/while $condition ... /endwhile loop', async () => {
      const script = `/set $i 0
/while $i < 3
/log "iter"
/set $i ($i + 1)
/endwhile`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledTimes(3);
    });

    it('loop body executes correct number of times', async () => {
      await engine.run('/repeat 5\n/log "x"\n/endrepeat');
      expect(ctx.log).toHaveBeenCalledTimes(5);
    });

    it('/break exits loop early', async () => {
      const script = `/set $i 0
/repeat 10
/set $i ($i + 1)
/if $i == 3
/break
/endif
/log "iter"
/endrepeat`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledTimes(2);
    });

    it('/continue skips to next iteration', async () => {
      const script = `/set $i 0
/repeat 5
/set $i ($i + 1)
/if $i == 3
/continue
/endif
/log $i
/endrepeat`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledTimes(4);
      expect(ctx.log).not.toHaveBeenCalledWith('3');
    });

    it('nested loops work', async () => {
      const script = `/repeat 2
/repeat 3
/log "inner"
/endrepeat
/endrepeat`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledTimes(6);
    });

    it('infinite loop protection (max iterations configurable)', async () => {
      engine.setMaxIterations(100);
      const script = `/while 1\n/log "forever"\n/endwhile`;
      await expect(engine.run(script)).rejects.toThrow(/max iterations/i);
      expect(ctx.log).toHaveBeenCalledTimes(100);
    });

    it('loop variable accessible inside body', async () => {
      (ctx.getAgents as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'a1', provider: 'bedrock', status: 'idle' },
      ]);
      await engine.run('/foreach $a in agents\n/msg $a.name "hello"\n/endfor');
      expect(ctx.msg).toHaveBeenCalledWith('a1', 'hello');
    });

    it('parse error on /endfor without /foreach', () => {
      expect(() => engine.parse('/endfor')).toThrow();
    });

    it('parse error on /foreach without /endfor', () => {
      expect(() => engine.parse('/foreach $x in agents\n/log $x')).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. FUNCTIONS / MACROS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('functions and macros', () => {
    it('/define ... /enddefine creates a macro', async () => {
      await engine.run('/define deploy-agents\n/log "deploying"\n/enddefine');
      const macros = engine.getMacros();
      expect(macros).toContain('deploy-agents');
    });

    it('/call <macro> executes the macro', async () => {
      await engine.run('/define greet\n/log "hello"\n/enddefine\n/call greet');
      expect(ctx.log).toHaveBeenCalledWith('hello');
    });

    it('/call <macro> arg1 arg2 passes arguments', async () => {
      await engine.run('/define say\n/log $1\n/enddefine\n/call say "world"');
      expect(ctx.log).toHaveBeenCalledWith('world');
    });

    it('arguments accessible as $1, $2, $args', async () => {
      const script = `/define info
/log $1
/log $2
/enddefine
/call info "first" "second"`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('first');
      expect(ctx.log).toHaveBeenCalledWith('second');
    });

    it('macros can call other macros', async () => {
      const script = `/define inner
/log "inside"
/enddefine
/define outer
/call inner
/enddefine
/call outer`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('inside');
    });

    it('recursion depth limited (max 10)', async () => {
      const script = `/define recurse
/call recurse
/enddefine
/call recurse`;
      await expect(engine.run(script)).rejects.toThrow(/recursion|depth/i);
    });

    it('/define with duplicate name overwrites', async () => {
      const script = `/define greet
/log "v1"
/enddefine
/define greet
/log "v2"
/enddefine
/call greet`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('v2');
    });

    it('macro variables are scoped (do not leak)', async () => {
      const script = `/set $x "outer"
/define inner
/set $x "inner"
/enddefine
/call inner
/log $x`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('outer');
    });

    it('parse error on /enddefine without /define', () => {
      expect(() => engine.parse('/enddefine')).toThrow();
    });

    it('parse error on /define without /enddefine', () => {
      expect(() => engine.parse('/define foo\n/log "x"')).toThrow();
    });

    it('$args contains all arguments as array-like', async () => {
      const script = `/define count
/log $args.length
/enddefine
/call count "a" "b" "c"`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('3');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('error handling', () => {
    it('/try ... /catch ... /endtry catches errors', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
      await engine.run('/try\n/spawn bad\n/catch\n/log "caught"\n/endtry');
      expect(ctx.log).toHaveBeenCalledWith('caught');
    });

    it('error in try block jumps to catch', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('oops'));
      await engine.run('/try\n/spawn bad\n/log "after spawn"\n/catch\n/log "caught"\n/endtry');
      expect(ctx.log).not.toHaveBeenCalledWith('after spawn');
      expect(ctx.log).toHaveBeenCalledWith('caught');
    });

    it('$error available in catch block with error message', async () => {
      (ctx.kill as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'));
      await engine.run('/try\n/kill ghost\n/catch\n/log $error\n/endtry');
      expect(ctx.log).toHaveBeenCalledWith('not found');
    });

    it('/onerror continue skips failed commands and continues', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
      await engine.run('/onerror continue\n/spawn bad\n/log "still going"');
      expect(ctx.log).toHaveBeenCalledWith('still going');
    });

    it('/onerror stop halts on error (default behavior)', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
      await expect(engine.run('/onerror stop\n/spawn bad\n/log "after"')).rejects.toThrow();
      expect(ctx.log).not.toHaveBeenCalled();
    });

    it('/onerror handler <macro> calls macro on error', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
      const script = `/define handle-err
/log "handled"
/enddefine
/onerror handler handle-err
/spawn bad
/log "continues"`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('handled');
      expect(ctx.log).toHaveBeenCalledWith('continues');
    });

    it('uncaught error rejects the run() promise', async () => {
      (ctx.broadcast as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
      await expect(engine.run('/broadcast "x"')).rejects.toThrow('network');
    });

    it('/assert <condition> "message" fails with message if false', async () => {
      await expect(engine.run('/set $x 0\n/assert $x "x must be truthy"')).rejects.toThrow(
        'x must be truthy',
      );
    });

    it('/assert passes silently when condition is true', async () => {
      await engine.run('/set $x 1\n/assert $x "should not fail"');
      // no error thrown
    });

    it('/timeout 5000 sets command timeout', async () => {
      vi.useFakeTimers();
      const handler = () => {};
      process.on('unhandledRejection', handler);
      (ctx.spawn as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000)),
      );
      const promise = engine.run('/timeout 5000\n/spawn slow');
      await vi.advanceTimersByTimeAsync(6000);
      await expect(promise).rejects.toThrow(/timeout/i);
      await vi.advanceTimersByTimeAsync(10000);
      vi.useRealTimers();
      process.off('unhandledRejection', handler);
    });

    it('parse error on /catch without /try', () => {
      expect(() => engine.parse('/catch\n/log "x"\n/endtry')).toThrow();
    });

    it('parse error on /try without /endtry', () => {
      expect(() => engine.parse('/try\n/spawn x\n/catch\n/log "x"')).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. SCRIPT LOADING & INCLUDES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('script loading and includes', () => {
    it('/include "other.arma" loads and inlines another script', async () => {
      engine.setFileLoader(async (path: string) => {
        if (path === 'other.arma') return '/log "from included"';
        throw new Error('not found');
      });
      await engine.run('/include "other.arma"');
      expect(ctx.log).toHaveBeenCalledWith('from included');
    });

    it('/include with non-existent file fails gracefully', async () => {
      engine.setFileLoader(async () => {
        throw new Error('file not found');
      });
      await expect(engine.run('/include "missing.arma"')).rejects.toThrow(/file not found/i);
    });

    it('circular includes detected and error', async () => {
      engine.setFileLoader(async (path: string) => {
        if (path === 'a.arma') return '/include "b.arma"';
        if (path === 'b.arma') return '/include "a.arma"';
        throw new Error('not found');
      });
      await expect(engine.run('/include "a.arma"')).rejects.toThrow(/circular/i);
    });

    it('parse(text) returns structured AST', () => {
      const ast = engine.parse('/log "hello"\n/theme ice');
      expect(ast).toHaveProperty('commands');
      expect(ast.commands).toHaveLength(2);
      expect(ast.commands[0]).toHaveProperty('command');
      expect(ast.commands[0]).toHaveProperty('args');
      expect(ast.commands[0]).toHaveProperty('lineNumber');
    });

    it('validate(text) returns errors without executing', () => {
      const errors = engine.validate('/if $x\n/log "oops"');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/endif/i);
      expect(ctx.log).not.toHaveBeenCalled();
    });

    it('validate(text) returns empty array for valid script', () => {
      const errors = engine.validate('/log "hello"\n/theme ice');
      expect(errors).toHaveLength(0);
    });

    it('getCommands() returns list of available script commands', () => {
      const commands = engine.getCommands();
      expect(commands).toContain('theme');
      expect(commands).toContain('spawn');
      expect(commands).toContain('kill');
      expect(commands).toContain('msg');
      expect(commands).toContain('broadcast');
      expect(commands).toContain('set');
      expect(commands).toContain('log');
      expect(commands).toContain('if');
      expect(commands).toContain('foreach');
      expect(commands).toContain('define');
      expect(commands).toContain('try');
      expect(commands).toContain('include');
    });

    it('script metadata parsed from first comment block', () => {
      const ast = engine.parse('# My automation script\n# Version 2.0\n/log "start"');
      expect(ast.metadata?.description).toContain('My automation script');
    });

    it('nested includes work correctly', async () => {
      engine.setFileLoader(async (path: string) => {
        if (path === 'a.arma') return '/include "b.arma"\n/log "from a"';
        if (path === 'b.arma') return '/log "from b"';
        throw new Error('not found');
      });
      await engine.run('/include "a.arma"');
      expect(ctx.log).toHaveBeenCalledWith('from b');
      expect(ctx.log).toHaveBeenCalledWith('from a');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. INTEGRATION SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('integration scenarios', () => {
    it('multi-agent spawn with different providers', async () => {
      const script = `/spawn lead --provider bedrock --model claude-4
/spawn worker-1 --provider openai --model gpt-5
/spawn worker-2 --provider vertex --model gemini-3`;
      await engine.run(script);
      expect(ctx.spawn).toHaveBeenCalledTimes(3);
      expect(ctx.spawn).toHaveBeenCalledWith('lead', { provider: 'bedrock', model: 'claude-4' });
      expect(ctx.spawn).toHaveBeenCalledWith('worker-1', { provider: 'openai', model: 'gpt-5' });
      expect(ctx.spawn).toHaveBeenCalledWith('worker-2', { provider: 'vertex', model: 'gemini-3' });
    });

    it('event-driven pipeline (agent A done triggers agent B)', async () => {
      const script = `/spawn agent-a --provider bedrock
/on agent:complete
/if $event.name == "agent-a"
/spawn agent-b --provider openai
/endif
/endon`;
      await engine.run(script);
      await engine.emit({ type: 'agent:complete', data: { name: 'agent-a' } });
      expect(ctx.spawn).toHaveBeenCalledWith('agent-b', { provider: 'openai' });
    });

    it('conditional provider selection based on availability', async () => {
      (ctx.getConfig as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'providers') return ['openai'];
        return undefined;
      });
      const script = `/if has_provider bedrock
/spawn worker --provider bedrock
/else
/spawn worker --provider openai
/endif`;
      await engine.run(script);
      expect(ctx.spawn).toHaveBeenCalledWith('worker', { provider: 'openai' });
    });

    it('rate limit avoidance (check count before spawning)', async () => {
      (ctx.getAgents as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'a1', provider: 'bedrock', status: 'running' },
        { name: 'a2', provider: 'bedrock', status: 'running' },
        { name: 'a3', provider: 'bedrock', status: 'running' },
      ]);
      const script = `/set $count 3
/if $count >= 3
/log "rate limit: too many agents"
/else
/spawn another --provider bedrock
/endif`;
      await engine.run(script);
      expect(ctx.log).toHaveBeenCalledWith('rate limit: too many agents');
      expect(ctx.spawn).not.toHaveBeenCalled();
    });

    it('budget monitoring with threshold notification', async () => {
      const script = `/on budget:threshold
/broadcast "Budget threshold reached, shutting down workers"
/foreach $agent in agents
/kill $agent.name
/endfor
/endon`;
      (ctx.getAgents as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'w1', provider: 'bedrock', status: 'running' },
        { name: 'w2', provider: 'openai', status: 'running' },
      ]);
      await engine.run(script);
      await engine.emit({ type: 'budget:threshold', data: { amount: 100 } });
      expect(ctx.broadcast).toHaveBeenCalledWith('Budget threshold reached, shutting down workers');
      expect(ctx.kill).toHaveBeenCalledWith('w1');
      expect(ctx.kill).toHaveBeenCalledWith('w2');
    });

    it('theme and UI config scripting', async () => {
      const script = `/theme ice
/set sidebar_width 40
/set show_tokens true
/set layout "split"`;
      await engine.run(script);
      expect(ctx.setConfig).toHaveBeenCalledWith('theme', 'ice');
      expect(ctx.setConfig).toHaveBeenCalledWith('sidebar_width', '40');
      expect(ctx.setConfig).toHaveBeenCalledWith('show_tokens', 'true');
      expect(ctx.setConfig).toHaveBeenCalledWith('layout', 'split');
    });

    it('distributed broadcast scenario', async () => {
      const script = `/if distributed
/broadcast "entering distributed mode"
/spawn coordinator --provider bedrock --model claude-4
/repeat 3
/spawn worker --provider openai
/endrepeat
/else
/spawn solo --provider bedrock
/endif`;
      (ctx.getConfig as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'distributed') return true;
        return undefined;
      });
      await engine.run(script);
      expect(ctx.broadcast).toHaveBeenCalledWith('entering distributed mode');
      expect(ctx.spawn).toHaveBeenCalledWith('coordinator', { provider: 'bedrock', model: 'claude-4' });
      // 3 workers spawned
      expect(ctx.spawn).toHaveBeenCalledTimes(4); // 1 coordinator + 3 workers
    });

    it('error recovery with retry', async () => {
      let attempts = 0;
      (ctx.spawn as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return 'success-id';
      });
      const script = `/define retry-spawn
/set $attempts 0
/set $success 0
/while $success == 0
/set $attempts ($attempts + 1)
/if $attempts > 5
/break
/endif
/try
/spawn worker
/set $success 1
/catch
/sleep 10
/endtry
/endwhile
/enddefine
/call retry-spawn`;
      await engine.run(script);
      expect(ctx.spawn).toHaveBeenCalledTimes(3);
    });

    it('complete deploy-review workflow (spawn lead, workers, chain results)', async () => {
      (ctx.spawn as ReturnType<typeof vi.fn>).mockResolvedValue('agent-id');
      const script = `# Deploy-review workflow
# Spawns a lead architect and workers, chains results
/spawn lead --provider bedrock --model claude-4 --prompt "You are a code reviewer"
/spawn worker-1 --provider openai --model gpt-5 --prompt "Implement feature X"
/spawn worker-2 --provider vertex --model gemini-3 --prompt "Write tests for feature X"
/on agent:complete
/if $event.name == "worker-1"
/msg lead "worker-1 finished, review their output"
/endif
/if $event.name == "worker-2"
/msg lead "worker-2 finished, review their tests"
/endif
/endon`;
      await engine.run(script);
      expect(ctx.spawn).toHaveBeenCalledTimes(3);
      // simulate worker-1 completing
      await engine.emit({ type: 'agent:complete', data: { name: 'worker-1' } });
      expect(ctx.msg).toHaveBeenCalledWith('lead', 'worker-1 finished, review their output');
    });

    it('script that queries providers and picks cheapest for task', async () => {
      (ctx.getConfig as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'providers') return ['bedrock', 'openai', 'vertex'];
        if (key === 'provider:bedrock:cost') return '0.03';
        if (key === 'provider:openai:cost') return '0.06';
        if (key === 'provider:vertex:cost') return '0.02';
        return undefined;
      });
      const script = `/set $cheapest ""
/set $min_cost 999
/foreach $p in providers
/set $cost (config "provider:$p:cost")
/if $cost < $min_cost
/set $min_cost $cost
/set $cheapest $p
/endif
/endfor
/spawn worker --provider $cheapest`;
      await engine.run(script);
      expect(ctx.spawn).toHaveBeenCalledWith('worker', { provider: 'vertex' });
    });
  });
});
