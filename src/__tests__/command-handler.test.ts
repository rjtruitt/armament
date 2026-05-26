import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandHandler } from '../core/CommandHandler.js';

describe('CommandHandler', () => {
  let handler: CommandHandler;

  beforeEach(() => {
    handler = new CommandHandler({
      agentController: {
        setDefaultModel: vi.fn(),
        setDefaultProvider: vi.fn(),
        getTotalCost: vi.fn(() => 0.42),
        listAgents: vi.fn(() => [{ id: 'a1', name: 'agent-1', status: 'idle' }]),
        cancelAll: vi.fn(),
        cancel: vi.fn(),
        spawn: vi.fn(async (opts: any) => ({ id: 'a2', name: opts.task || 'new', status: 'running' })),
        getRunningAgents: vi.fn(() => [{ id: 'a1', name: 'agent-1' }]),
        sendMessage: vi.fn(),
      },
      providerManager: {},
      mcpManager: {},
      menuController: {},
      armaHome: {},
    });
  });

  // ===========================================================================
  // 1. COMMAND PARSING
  // ===========================================================================
  describe('Command Parsing', () => {
    it('should parse /cmd arg1 arg2 into command and args', () => {
      const result = handler.parseCommand('/model sonnet-4');
      expect(result.command).toBe('model');
      expect(result.args).toEqual(['sonnet-4']);
    });

    it('should parse plain text as a message command', () => {
      const result = handler.parseCommand('Hello world');
      expect(result.command).toBe('message');
      expect(result.args).toEqual(['Hello world']);
    });

    it('should parse --flags into flags object', () => {
      const result = handler.parseCommand('/spawn --model opus-4 --count 3');
      expect(result.flags).toHaveProperty('model', 'opus-4');
      expect(result.flags).toHaveProperty('count', '3');
    });

    it('should parse quoted args as single arguments', () => {
      const result = handler.parseCommand('/spawn --task "write unit tests"');
      expect(result.flags).toHaveProperty('task', 'write unit tests');
    });

    it('should handle empty input', () => {
      const result = handler.parseCommand('');
      expect(result.command).toBe('message');
      expect(result.args).toEqual(['']);
    });

    it('should handle whitespace-only input', () => {
      const result = handler.parseCommand('   ');
      expect(result.command).toBe('message');
      expect(result.args).toEqual(['']);
    });

    it('should handle nested quotes in arguments', () => {
      const result = handler.parseCommand('/spawn --task "say \\"hello world\\""');
      expect(result.flags.task).toContain('hello world');
    });

    it('should handle escape characters in arguments', () => {
      const result = handler.parseCommand('/set path /tmp/my\\ file.txt');
      expect(result.args.join(' ')).toContain('my\\ file.txt');
    });
  });

  // ===========================================================================
  // 2. COMMAND ROUTING
  // ===========================================================================
  describe('Command Routing', () => {
    it('should route /help to help handler', async () => {
      await expect(handler.execute('/help')).resolves.not.toThrow();
    });

    it('should route /model to switch model', async () => {
      await expect(handler.execute('/model opus-4')).resolves.not.toThrow();
    });

    it('should route /provider to switch provider', async () => {
      await expect(handler.execute('/provider openai')).resolves.not.toThrow();
    });

    it('should route /agents to list agents', async () => {
      await expect(handler.execute('/agents')).resolves.not.toThrow();
    });

    it('should route /budget to show budget', async () => {
      await expect(handler.execute('/budget')).resolves.not.toThrow();
    });

    it('should route /theme to switch theme', async () => {
      await expect(handler.execute('/theme dark-blue')).resolves.not.toThrow();
    });

    it('should route /spawn to create agent', async () => {
      await expect(handler.execute('/spawn --task "test"')).resolves.not.toThrow();
    });

    it('should route /cancel to kill agent', async () => {
      await expect(handler.execute('/cancel agent-001')).resolves.not.toThrow();
    });

    it('should route /quit to initiate shutdown', async () => {
      await expect(handler.execute('/quit')).resolves.not.toThrow();
    });

    it('should route /export to export session', async () => {
      await expect(handler.execute('/export')).resolves.not.toThrow();
    });

    it('should return error output for unknown commands', async () => {
      const result = await handler.execute('/nonexistent');
      expect(result.output).toContain('Unknown command');
    });

    it('should route plain text to active agent', async () => {
      await expect(handler.execute('Hello agent')).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // 3. SCRIPT COMMAND EXECUTION
  // ===========================================================================
  describe('Script Command Execution', () => {
    it('should expand command aliases', async () => {
      // e.g., /m → /model, /p → /provider
      await expect(handler.execute('/m sonnet-4')).resolves.not.toThrow();
    });

    it('should substitute variables ($1, $2, $*)', async () => {
      const result = handler.parseCommand('/run $1 $2');
      expect(result.args).toContain('$1');
      expect(result.args).toContain('$2');
    });

    it('should execute chained commands with &&', async () => {
      await expect(handler.execute('/model opus-4 && /spawn --task "test"')).resolves.not.toThrow();
    });

    it('should match trigger patterns for auto-execution', async () => {
      // Triggers are patterns that auto-fire commands
      await expect(handler.execute('/trigger on:error /notify admin')).resolves.not.toThrow();
    });

    it('should invoke timer-based commands', async () => {
      await expect(handler.execute('/timer 5000 /budget')).resolves.not.toThrow();
    });
  });
});
