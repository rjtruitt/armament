import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { ArmamentApp } from '../app/ArmamentApp.js';
import { UserConfig } from '../config/UserConfig.js';

// Isolate all tests from real UserConfig state on disk — never write test state
beforeAll(() => {
  const uc = UserConfig.instance();
  uc.setNoPersist(true);
  uc.set('providers', []);
  uc.set('defaultModel', '');
  uc.set('defaultProvider', '');
});

// ── Mock fs write — prevent tests from writing to real filesystem ──────────
vi.mock('node:fs', async () => {
  const actual: any = await vi.importActual('node:fs');
  return { ...actual, writeFileSync: vi.fn() };
});

// ── Mock readline ────────────────────────────────────────────────────────────
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => {
    const handlers: Record<string, Array<(...args: any[]) => void>> = {};
    return {
      prompt: vi.fn(),
      close: vi.fn(() => {
        const closeHandlers = handlers['close'] || [];
        for (const h of closeHandlers) h();
      }),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      off: vi.fn(),
      write: vi.fn(),
      setPrompt: vi.fn(),
    };
  }),
}));

// ══════════════════════════════════════════════════════════════════════════════
// 1. INITIALIZATION & LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Initialization & Lifecycle', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should instantiate with default config', () => {
    const cfg = repl.getConfig();
    expect(cfg.agentName).toBe('armament');
    expect(cfg.theme).toBe('acid');
    expect(cfg.showThinking).toBe(true);
    expect(cfg.showToolCalls).toBe(true);
    expect(cfg.compact).toBe(false);
    expect(cfg.verbose).toBe(false);
    expect(cfg.streaming).toBe(true);
    expect(cfg.maxTurns).toBe(Infinity);
    expect(cfg.maxRetries).toBe(3);
    expect(cfg.noColor).toBe(false);
    expect(cfg.outputFormat).toBe('text');
    expect(cfg.promptCaching).toBe(false);
    expect(cfg.autoSave).toBe(false);
    expect(cfg.hotReload).toBe(false);
  });

  it('should accept partial config overrides', () => {
    const custom = new ArmamentApp({ agentName: 'bitchx', theme: 'midnight', maxTurns: 50 });
    const cfg = custom.getConfig();
    expect(cfg.agentName).toBe('bitchx');
    expect(cfg.theme).toBe('midnight');
    expect(cfg.maxTurns).toBe(50);
  });

  it('should set modelConfig defaults', () => {
    const cfg = repl.getConfig();
    expect(cfg.modelConfig.temperature).toBe(0.7);
    expect(cfg.modelConfig.maxTokens).toBe(16384);
    expect(cfg.modelConfig.topP).toBe(1.0);
    expect(cfg.modelConfig.stop).toEqual([]);
  });

  it('should allow overriding modelConfig', () => {
    const custom = new ArmamentApp({ modelConfig: { temperature: 0.2, maxTokens: 8192, topP: 0.9, stop: ['END'] } });
    expect(custom.getConfig().modelConfig.temperature).toBe(0.2);
    expect(custom.getConfig().modelConfig.maxTokens).toBe(8192);
    expect(custom.getConfig().modelConfig.stop).toEqual(['END']);
  });

  it('should not be running before start()', () => {
    expect(repl.isRunning()).toBe(false);
  });

  it('should be running after start()', async () => {
    await repl.start();
    expect(repl.isRunning()).toBe(true);
  });

  it('should not be running after stop()', async () => {
    await repl.start();
    repl.stop();
    expect(repl.isRunning()).toBe(false);
  });

  it('should not throw when handleInput is called after stop (readline closed)', async () => {
    await repl.start();
    repl.handleCommand('/quit');
    await expect(repl.handleInput('/help')).resolves.not.toThrow();
  });

  it('should set providers from config', () => {
    const custom = new ArmamentApp({ providers: [{ name: 'anthropic', apiKey: 'test' } as any] });
    expect(custom.getConfig().providers).toHaveLength(1);
    expect(custom.getConfig().providers[0].name).toBe('anthropic');
  });

  it('should set fallback chain from config', () => {
    const custom = new ArmamentApp({ fallbackChain: ['anthropic', 'openai', 'bedrock'] });
    expect(custom.getFallbackChain()).toEqual(['anthropic', 'openai', 'bedrock']);
  });

  it('should default fallback chain to empty array', () => {
    expect(repl.getFallbackChain()).toEqual([]);
  });

  it('should set configPath when provided', () => {
    const custom = new ArmamentApp({ configPath: '/home/user/.armament.toml' });
    expect(custom.getConfig().configPath).toBe('/home/user/.armament.toml');
  });

  it('should set tool permissions from config', () => {
    const custom = new ArmamentApp({ toolPermissions: { bash: 'allow', write: 'deny' } });
    expect(custom.getToolPermission('bash')).toBe('allow');
    expect(custom.getToolPermission('write')).toBe('deny');
  });

  it('should return "ask" for unconfigured tool permissions', () => {
    expect(repl.getToolPermission('unknown_tool')).toBe('ask');
  });

  it('should handle start being called multiple times', async () => {
    await repl.start();
    await repl.start();
    expect(repl.isRunning()).toBe(true);
  });

  it('should set system prompt via config', () => {
    const custom = new ArmamentApp({ systemPrompt: 'You are a hacking AI.' });
    expect(custom.getConfig().systemPrompt).toBe('You are a hacking AI.');
  });

  it('should set maxBudget when provided', () => {
    const custom = new ArmamentApp({ maxBudget: 5.0 });
    expect(custom.getConfig().maxBudget).toBe(5.0);
  });

  it('should have interrupt flag false initially', () => {
    expect(repl.wasInterrupted()).toBe(false);
  });

  it('should set interrupt flag on interrupt()', () => {
    repl.interrupt();
    expect(repl.wasInterrupted()).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. IRC-STYLE CHANNEL COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - IRC Channel Commands', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  // ── /join ──────────────────────────────────────────────────────────────
  describe('/join', () => {
    it('should create a new channel when joining a name that does not exist', () => {
      repl.joinChannel('code-review');
      expect(repl.listChannels()).toContain('code-review');
    });

    it('should switch to existing channel if already joined', () => {
      repl.joinChannel('general');
      repl.joinChannel('debug');
      repl.joinChannel('general');
      // Should be back on general, verify via active channel
      const output = repl.handleCommandWithOutput('/join general');
      expect(output).toContain('general');
    });

    it('should dispatch /join via handleCommand', () => {
      const result = repl.handleCommand('/join research');
      expect(result).toBe(true);
    });

    it('should reject empty channel name', () => {
      expect(() => repl.joinChannel('')).toThrow();
    });

    it('should reject channel names with spaces', () => {
      expect(() => repl.joinChannel('my channel')).toThrow();
    });

    it('should allow hyphenated channel names', () => {
      repl.joinChannel('code-gen');
      expect(repl.listChannels()).toContain('code-gen');
    });

    it('should allow underscored channel names', () => {
      repl.joinChannel('code_gen');
      expect(repl.listChannels()).toContain('code_gen');
    });
  });

  // ── /part ──────────────────────────────────────────────────────────────
  describe('/part', () => {
    it('should close the current channel when no name given', () => {
      repl.joinChannel('temp');
      repl.partChannel('temp');
      expect(repl.listChannels()).not.toContain('temp');
    });

    it('should close a named channel', () => {
      repl.joinChannel('alpha');
      repl.joinChannel('beta');
      repl.partChannel('alpha');
      expect(repl.listChannels()).not.toContain('alpha');
    });

    it('should throw when parting non-existent channel', () => {
      expect(() => repl.partChannel('ghost')).toThrow();
    });

    it('should switch to another channel after parting current', () => {
      repl.joinChannel('first');
      repl.joinChannel('second');
      repl.switchChannel('second');
      repl.partChannel('second');
      // Should fall back to first or default
      expect(repl.listChannels()).toContain('first');
    });
  });

  // ── /spawn ─────────────────────────────────────────────────────────────
  describe('/spawn', () => {
    it('should spawn a new agent with default options', async () => {
      const agent = await repl.spawnAgent('coder');
      expect(agent).toBeDefined();
      expect(agent.name).toBe('coder');
    });

    it('should spawn agent with specific model', async () => {
      const agent = await repl.spawnAgent('analyst', { model: 'claude-opus-4-0-20250514' });
      expect(agent.model).toBe('claude-opus-4-0-20250514');
    });

    it('should spawn agent with specific provider', async () => {
      const agent = await repl.spawnAgent('writer', { provider: 'bedrock' });
      expect(agent.provider).toBe('bedrock');
    });

    it('should spawn agent with both model and provider', async () => {
      const agent = await repl.spawnAgent('planner', { model: 'gpt-4o', provider: 'openai' });
      expect(agent.model).toBe('gpt-4o');
      expect(agent.provider).toBe('openai');
    });

    it('should reject duplicate agent names', async () => {
      await repl.spawnAgent('unique');
      await expect(repl.spawnAgent('unique')).rejects.toThrow();
    });

    it('should reject empty agent name', async () => {
      await expect(repl.spawnAgent('')).rejects.toThrow();
    });

    it('should auto-create a channel for spawned agent', async () => {
      await repl.spawnAgent('helper');
      expect(repl.listChannels()).toContain('helper');
    });

    it('should set agent status to running after spawn', async () => {
      const agent = await repl.spawnAgent('runner');
      expect(agent.status).toBe('running');
    });

    it('should spawn agent with system prompt option', async () => {
      const agent = await repl.spawnAgent('focused', { systemPrompt: 'Only write tests' });
      expect(agent.systemPrompt).toBe('Only write tests');
    });
  });

  // ── /kill ──────────────────────────────────────────────────────────────
  describe('/kill', () => {
    it('should kill a running agent by name', async () => {
      await repl.spawnAgent('doomed');
      repl.killAgent('doomed');
      expect(repl.listChannels()).not.toContain('doomed');
    });

    it('should throw when killing non-existent agent', () => {
      expect(() => repl.killAgent('phantom')).toThrow();
    });

    it('should cleanup resources on kill', async () => {
      await repl.spawnAgent('temporary');
      repl.killAgent('temporary');
      const info = repl.whoIs('temporary');
      expect(info).toContain('not found');
    });

    it('should handle killing already-dead agent gracefully', async () => {
      await repl.spawnAgent('fragile');
      repl.killAgent('fragile');
      expect(() => repl.killAgent('fragile')).toThrow();
    });
  });

  // ── /list ──────────────────────────────────────────────────────────────
  describe('/list', () => {
    it('should return string listing of all channels', () => {
      const output = repl.listChannels();
      expect(typeof output).toBe('string');
    });

    it('should include channel names in listing', async () => {
      await repl.spawnAgent('alpha');
      await repl.spawnAgent('beta');
      const listing = repl.listChannels();
      expect(listing).toContain('alpha');
      expect(listing).toContain('beta');
    });

    it('should indicate active channel', async () => {
      await repl.spawnAgent('active-one');
      repl.switchChannel('active-one');
      const listing = repl.listChannels();
      expect(listing).toMatch(/\*|active|>|active-one/);
    });

    it('should show status for each channel', async () => {
      await repl.spawnAgent('healthy');
      const listing = repl.listChannels();
      expect(listing).toMatch(/running|idle|active/i);
    });
  });

  // ── /switch ────────────────────────────────────────────────────────────
  describe('/switch', () => {
    it('should switch to channel by name', async () => {
      await repl.spawnAgent('chan1');
      await repl.spawnAgent('chan2');
      repl.switchChannel('chan1');
      const listing = repl.listChannels();
      expect(listing).toContain('chan1');
    });

    it('should switch to channel by index', async () => {
      await repl.spawnAgent('first');
      await repl.spawnAgent('second');
      repl.switchChannel(1);
      // Should be on second channel
      expect(repl.listChannels()).toBeDefined();
    });

    it('should throw when switching to non-existent channel', () => {
      expect(() => repl.switchChannel('nope')).toThrow();
    });

    it('should throw when switching to out-of-bounds index', () => {
      expect(() => repl.switchChannel(999)).toThrow();
    });

    it('should throw on negative index', () => {
      expect(() => repl.switchChannel(-1)).toThrow();
    });
  });

  // ── /msg ───────────────────────────────────────────────────────────────
  describe('/msg', () => {
    it('should send message to a specific agent', async () => {
      await repl.spawnAgent('target');
      await expect(repl.msgAgent('target', 'hello')).resolves.not.toThrow();
    });

    it('should throw when messaging non-existent agent', async () => {
      await expect(repl.msgAgent('ghost', 'hey')).rejects.toThrow();
    });

    it('should handle empty message gracefully', async () => {
      await repl.spawnAgent('receiver');
      await expect(repl.msgAgent('receiver', '')).rejects.toThrow();
    });

    it('should deliver multi-line messages', async () => {
      await repl.spawnAgent('reader');
      await expect(repl.msgAgent('reader', 'line1\nline2\nline3')).resolves.not.toThrow();
    });
  });

  // ── /whois ─────────────────────────────────────────────────────────────
  describe('/whois', () => {
    it('should return agent info string', async () => {
      await repl.spawnAgent('info-target');
      const info = repl.whoIs('info-target');
      expect(typeof info).toBe('string');
    });

    it('should include model information', async () => {
      await repl.spawnAgent('modeled', { model: 'claude-sonnet-4-20250514' });
      const info = repl.whoIs('modeled');
      expect(info).toContain('claude-sonnet-4-20250514');
    });

    it('should include provider information', async () => {
      await repl.spawnAgent('provided', { provider: 'anthropic' });
      const info = repl.whoIs('provided');
      expect(info).toContain('anthropic');
    });

    it('should report "not found" for non-existent agent', () => {
      const info = repl.whoIs('nobody');
      expect(info).toContain('not found');
    });

    it('should include token usage info', async () => {
      await repl.spawnAgent('chatty');
      const info = repl.whoIs('chatty');
      expect(info).toMatch(/token|usage/i);
    });

    it('should include cost information', async () => {
      await repl.spawnAgent('expensive');
      const info = repl.whoIs('expensive');
      expect(info).toMatch(/cost|\$/i);
    });

    it('should include turn count', async () => {
      await repl.spawnAgent('turner');
      const info = repl.whoIs('turner');
      expect(info).toMatch(/turn|message/i);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. STANDARD SLASH COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Standard Slash Commands', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should handle /help command', () => {
    const output = repl.handleCommandWithOutput('/help');
    expect(output).toContain('help');
  });

  it('should handle /quit command', () => {
    expect(repl.handleCommand('/quit')).toBe(true);
  });

  it('should handle /exit command', () => {
    expect(repl.handleCommand('/exit')).toBe(true);
  });

  it('should handle /q as alias for quit', () => {
    expect(repl.handleCommand('/q')).toBe(true);
  });

  it('should handle /clear command', () => {
    expect(repl.handleCommand('/clear')).toBe(true);
  });

  it('should handle /status command', () => {
    const output = repl.handleCommandWithOutput('/status');
    expect(output).toBeDefined();
  });

  it('should handle /tools command', () => {
    const output = repl.handleCommandWithOutput('/tools');
    expect(output).toBeDefined();
  });

  it('should handle /model command to show current model', () => {
    const output = repl.handleCommandWithOutput('/model');
    expect(output).toBeDefined();
  });

  it('should handle /model <name> to switch model', () => {
    expect(repl.handleCommand('/model claude-opus-4-0-20250514')).toBe(true);
  });

  it('should handle /cost command', () => {
    const output = repl.handleCommandWithOutput('/cost');
    expect(output).toMatch(/cost|\$|0/i);
  });

  it('should handle /context command', () => {
    const output = repl.handleCommandWithOutput('/context');
    expect(output).toBeDefined();
  });

  it('should handle /history command', () => {
    const output = repl.handleCommandWithOutput('/history');
    expect(output).toBeDefined();
  });

  it('should handle /undo command', () => {
    expect(repl.handleCommand('/undo')).toBe(true);
  });

  it('should handle /save command', () => {
    expect(repl.handleCommand('/save')).toBe(true);
  });

  it('should handle /load command', () => {
    expect(repl.handleCommand('/load')).toBe(true);
  });

  it('should handle /compact command', () => {
    expect(repl.handleCommand('/compact')).toBe(true);
  });

  it('should handle /thinking toggle', () => {
    expect(repl.handleCommand('/thinking')).toBe(true);
  });

  it('should handle /verbose toggle', () => {
    expect(repl.handleCommand('/verbose')).toBe(true);
  });

  it('should handle /permissions command', () => {
    const output = repl.handleCommandWithOutput('/permissions');
    expect(output).toBeDefined();
  });

  it('should handle /mcp command', () => {
    const output = repl.handleCommandWithOutput('/mcp');
    expect(output).toBeDefined();
  });

  it('should handle /theme command to show current theme', () => {
    const output = repl.handleCommandWithOutput('/theme');
    expect(output).toContain('acid');
  });

  it('should handle /theme <name> to switch theme', () => {
    expect(repl.handleCommand('/theme midnight')).toBe(true);
  });

  it('should handle /config command', () => {
    const output = repl.handleCommandWithOutput('/config');
    expect(output).toBeDefined();
  });

  it('should handle /set key=value command', () => {
    expect(repl.handleCommand('/set temperature=0.5')).toBe(true);
  });

  it('should handle /auth command', () => {
    const output = repl.handleCommandWithOutput('/auth');
    expect(output).toBeDefined();
  });

  it('should handle /health command', () => {
    const output = repl.handleCommandWithOutput('/health');
    expect(output).toBeDefined();
  });

  it('should handle /stats command', () => {
    const output = repl.handleCommandWithOutput('/stats');
    expect(output).toBeDefined();
  });

  it('should handle /providers command', () => {
    const output = repl.handleCommandWithOutput('/providers');
    expect(output).toBeDefined();
  });

  it('should handle /fallback command', () => {
    const output = repl.handleCommandWithOutput('/fallback');
    expect(output).toBeDefined();
  });

  it('should handle /provider command', () => {
    const output = repl.handleCommandWithOutput('/provider');
    expect(output).toBeDefined();
  });

  it('should return false for unknown commands', () => {
    expect(repl.handleCommand('/nonexistent')).toBe(false);
  });

  it('should handle /nick to rename current channel', () => {
    repl.joinChannel('old-name');
    expect(repl.handleCommand('/nick new-name')).toBe(true);
  });

  it('should handle /topic to set system prompt', () => {
    repl.joinChannel('chan');
    expect(repl.handleCommand('/topic You are a coding assistant')).toBe(true);
  });

  it('should handle /who command', () => {
    const output = repl.handleCommandWithOutput('/who');
    expect(output).toBeDefined();
  });

  it('should handle /away command to pause agent', () => {
    expect(repl.handleCommand('/away')).toBe(true);
  });

  it('should handle /back command to resume agent', () => {
    expect(repl.handleCommand('/back')).toBe(true);
  });
});

// Streaming, Thinking, and Tool Display tests deferred until UX stabilizes

// ══════════════════════════════════════════════════════════════════════════════
// 7. MULTI-TURN CONVERSATION
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Multi-Turn Conversation', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should track turn count', async () => {
    await repl.handleUserMessage('first');
    expect(repl.getTurnCount()).toBe(1);
  });

  it('should increment turn count on each message', async () => {
    await repl.handleUserMessage('one');
    await repl.handleUserMessage('two');
    await repl.handleUserMessage('three');
    expect(repl.getTurnCount()).toBe(3);
  });

  it('should maintain message history', async () => {
    await repl.handleUserMessage('hello');
    const history = repl.getMessageHistory();
    expect(history.length).toBeGreaterThan(0);
  });

  it('should get last user message', async () => {
    await repl.handleUserMessage('remember me');
    expect(repl.getLastUserMessage()).toBe('remember me');
  });

  it('should get last response metadata', async () => {
    await repl.handleUserMessage('respond');
    const meta = repl.getLastResponseMetadata();
    expect(meta).toBeDefined();
  });

  it('should enforce maxTurns limit', async () => {
    const limited = new ArmamentApp({ maxTurns: 2 });
    await limited.handleUserMessage('one');
    await limited.handleUserMessage('two');
    await expect(limited.handleUserMessage('three')).rejects.toThrow(/max.*turn/i);
  });

  it('should support /undo to remove last turn', async () => {
    await repl.handleUserMessage('undo me');
    repl.handleCommand('/undo');
    expect(repl.getTurnCount()).toBe(0);
  });

  it('should include system prompt in message history', () => {
    const withPrompt = new ArmamentApp({ systemPrompt: 'Be helpful' });
    const history = withPrompt.getMessageHistory();
    expect(history[0]?.role).toBe('system');
  });

  it('should support context building', () => {
    const context = repl.buildContext();
    expect(typeof context).toBe('string');
  });

  it('should handle empty conversation gracefully', () => {
    expect(repl.getTurnCount()).toBe(0);
    expect(repl.getLastUserMessage()).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. INTERRUPT HANDLING
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Interrupt Handling', () => {
  let repl: ArmamentApp;

  beforeEach(async () => {
    repl = new ArmamentApp();
    await repl.start();
  });

  afterEach(() => {
    repl.stop();
  });

  it('should cancel current operation on first Ctrl+C', () => {
    repl.setProcessing(true);
    repl.interrupt();
    expect(repl.wasInterrupted()).toBe(true);
  });

  it('should exit on double Ctrl+C when not processing', () => {
    repl.interrupt();
    repl.interrupt();
    expect(repl.isRunning()).toBe(false);
  });

  it('should reset interrupt flag after handling', async () => {
    repl.interrupt();
    await repl.handleInput('new message');
    expect(repl.wasInterrupted()).toBe(false);
  });

  it('should emit interrupt event', () => {
    const handler = vi.fn();
    repl.on('interrupt', handler);
    repl.interrupt();
    expect(handler).toHaveBeenCalled();
  });

  it('should not process input while interrupted', async () => {
    repl.interrupt();
    const result = await repl.handleUserMessage('ignored');
    expect(result).toBeUndefined();
  });

  it('should cancel streaming on interrupt', async () => {
    const promise = repl.handleUserMessage('long response');
    repl.interrupt();
    await promise;
    expect(repl.wasInterrupted()).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. INPUT HANDLING
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Input Handling', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  // ── History ────────────────────────────────────────────────────────────
  it('should add entries to input history', () => {
    repl.addToHistory('first command');
    repl.addToHistory('second command');
    expect(repl.getHistoryEntry(0)).toBe('second command');
  });

  it('should retrieve history by offset', () => {
    repl.addToHistory('old');
    repl.addToHistory('new');
    expect(repl.getHistoryEntry(1)).toBe('old');
  });

  it('should return undefined for out-of-bounds history', () => {
    expect(repl.getHistoryEntry(100)).toBeUndefined();
  });

  it('should not add empty strings to history', () => {
    repl.addToHistory('');
    expect(repl.getHistoryEntry(0)).toBeUndefined();
  });

  it('should not add duplicate consecutive entries', () => {
    repl.addToHistory('same');
    repl.addToHistory('same');
    expect(repl.getHistoryEntry(1)).toBeUndefined();
  });

  // ── Completions ────────────────────────────────────────────────────────
  it('should provide completions for slash commands', () => {
    const completions = repl.getCompletions('/he');
    expect(completions).toContain('/help');
  });

  it('should provide completions for /join with channel names', () => {
    repl.joinChannel('existing');
    const completions = repl.getCompletions('/join ex');
    expect(completions).toContain('existing');
  });

  it('should provide completions for /switch with channel names', () => {
    repl.joinChannel('target');
    const completions = repl.getCompletions('/switch tar');
    expect(completions).toContain('target');
  });

  it('should return empty completions for no match', () => {
    const completions = repl.getCompletions('/zzzzz');
    expect(completions).toEqual([]);
  });

  it('should complete /model with available models', () => {
    const completions = repl.getCompletions('/model cl');
    expect(completions.length).toBeGreaterThanOrEqual(0);
  });

  // ── Current Input ──────────────────────────────────────────────────────
  it('should get current input', () => {
    expect(repl.getCurrentInput()).toBe('');
  });

  it('should set current input', () => {
    repl.setInput('hello world');
    expect(repl.getCurrentInput()).toBe('hello world');
  });

  it('should append to current input', () => {
    repl.setInput('hello');
    repl.appendInput(' world');
    expect(repl.getCurrentInput()).toBe('hello world');
  });

  it('should handle multi-line paste input', () => {
    repl.setInput('line1\nline2\nline3');
    expect(repl.getCurrentInput()).toContain('\n');
  });

  // ── Empty Input ────────────────────────────────────────────────────────
  it('should ignore empty input', async () => {
    await repl.handleInput('');
    expect(repl.getTurnCount()).toBe(0);
  });

  it('should ignore whitespace-only input', async () => {
    await repl.handleInput('   \t  ');
    expect(repl.getTurnCount()).toBe(0);
  });

  // ── Command Detection ──────────────────────────────────────────────────
  it('should detect commands starting with /', async () => {
    // Commands starting with / should be dispatched (not sent as user messages)
    const msgSpy = vi.spyOn(repl, 'handleUserMessage');
    await repl.handleInput('/help');
    expect(msgSpy).not.toHaveBeenCalled();
  });

  it('should treat non-slash input as user message', async () => {
    const spy = vi.spyOn(repl, 'handleUserMessage');
    await repl.handleInput('hello');
    expect(spy).toHaveBeenCalledWith('hello', expect.any(String));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. STATUS LINE
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Status Line', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should render status line as string', () => {
    const status = repl.renderStatusLine();
    expect(typeof status).toBe('string');
  });

  it('should include model name in status line', () => {
    const status = repl.renderStatusLine();
    expect(status).toMatch(/model|claude|gpt/i);
  });

  it('should include token count in status line', () => {
    const status = repl.renderStatusLine();
    expect(status).toMatch(/token|tok/i);
  });

  it('should include cost in status line', () => {
    const status = repl.renderStatusLine();
    expect(status).toMatch(/\$|cost/i);
  });

  it('should include mode in status line', () => {
    const status = repl.renderStatusLine();
    expect(status).toMatch(/mode|normal|agent/i);
  });

  it('should update after each turn', async () => {
    const before = repl.renderStatusLine();
    await repl.handleUserMessage('hello');
    const after = repl.renderStatusLine();
    expect(after).not.toBe(before);
  });

  it('should get usage stats', () => {
    const usage = repl.getUsage();
    expect(usage).toHaveProperty('inputTokens');
    expect(usage).toHaveProperty('outputTokens');
  });

  it('should get context usage', () => {
    const ctx = repl.getContextUsage();
    expect(ctx).toHaveProperty('percentage');
  });

  it('should get stats with avg latency', () => {
    const stats = repl.getStats();
    expect(stats).toHaveProperty('avgLatencyMs');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. WELCOME/GOODBYE DISPLAY
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Welcome/Goodbye Display', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should render banner as string', () => {
    const banner = repl.renderBanner();
    expect(typeof banner).toBe('string');
  });

  it('should render banner with ANSI art', () => {
    const banner = repl.renderBanner();
    expect(banner.length).toBeGreaterThan(20);
  });

  it('should render mini banner as string', () => {
    const mini = repl.renderMiniBanner();
    expect(typeof mini).toBe('string');
  });

  it('should render mini banner shorter than full banner', () => {
    const full = repl.renderBanner();
    const mini = repl.renderMiniBanner();
    expect(mini.length).toBeLessThan(full.length);
  });

  it('should include agent name in banner', () => {
    const banner = repl.renderBanner();
    expect(banner.toLowerCase()).toContain('armament');
  });

  it('should include version info in banner', () => {
    const banner = repl.renderBanner();
    expect(banner).toMatch(/v?\d+\.\d+/);
  });

  it('should apply gradient to banner text', () => {
    const gradient = repl.applyGradient('ARMAMENT');
    expect(gradient).not.toBe('ARMAMENT');
    expect(gradient.length).toBeGreaterThan('ARMAMENT'.length);
  });

  it('should render separator at given width', () => {
    const sep = repl.renderSeparator(80);
    expect(sep.length).toBeGreaterThanOrEqual(80);
  });

  it('should render separator with different widths', () => {
    const narrow = repl.renderSeparator(40);
    const wide = repl.renderSeparator(120);
    expect(wide.length).toBeGreaterThan(narrow.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. RENDERING METHODS
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Rendering', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should format prompt string', () => {
    const prompt = repl.formatPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should include channel name in prompt', () => {
    repl.joinChannel('test-chan');
    repl.switchChannel('test-chan');
    const prompt = repl.formatPrompt();
    expect(prompt).toContain('test-chan');
  });

  it('should render markdown to formatted string', () => {
    const result = repl.renderMarkdown('# Hello\n\nWorld');
    expect(typeof result).toBe('string');
    expect(result).toContain('Hello');
  });

  it('should render markdown code blocks', () => {
    const result = repl.renderMarkdown('```js\nconsole.log("hi")\n```');
    expect(result).toContain('console.log');
  });

  it('should render diff with added/removed lines', () => {
    const diff = '+added line\n-removed line\n unchanged';
    const result = repl.renderDiff(diff);
    expect(result).toContain('added');
    expect(result).toContain('removed');
  });

  it('should render error messages', () => {
    const err = new Error('Something failed');
    const result = repl.renderError(err);
    expect(result).toContain('Something failed');
  });

  it('should render progress bar', () => {
    const bar = repl.renderProgressBar(50, 100);
    expect(typeof bar).toBe('string');
    expect(bar.length).toBeGreaterThan(0);
  });

  it('should render progress bar at 0%', () => {
    const bar = repl.renderProgressBar(0, 100);
    expect(bar).toBeDefined();
  });

  it('should render progress bar at 100%', () => {
    const bar = repl.renderProgressBar(100, 100);
    expect(bar).toBeDefined();
  });

  it('should render box around content', () => {
    const box = repl.renderBox('Hello World');
    expect(box).toContain('Hello World');
    expect(box.length).toBeGreaterThan('Hello World'.length);
  });

  it('should render file tree', () => {
    const entries = [
      { name: 'src', type: 'dir' },
      { name: 'index.ts', type: 'file' },
    ];
    const tree = repl.renderFileTree(entries);
    expect(tree).toContain('src');
    expect(tree).toContain('index.ts');
  });

  it('should render file path with optional line number', () => {
    const result = repl.renderFilePath('/src/main.ts', 42);
    expect(result).toContain('/src/main.ts');
    expect(result).toContain('42');
  });

  it('should render file path without line number', () => {
    const result = repl.renderFilePath('/src/main.ts');
    expect(result).toContain('/src/main.ts');
  });

  it('should render commit info', () => {
    const commit = { hash: 'abc1234', message: 'fix bug', author: 'dev' };
    const result = repl.renderCommit(commit);
    expect(result).toContain('abc1234');
    expect(result).toContain('fix bug');
  });

  it('should render status with type and message', () => {
    const result = repl.renderStatus('success', 'Operation complete');
    expect(result).toContain('Operation complete');
  });

  it('should render status types: success, error, warning, info', () => {
    expect(repl.renderStatus('success', 'ok')).toBeDefined();
    expect(repl.renderStatus('error', 'fail')).toBeDefined();
    expect(repl.renderStatus('warning', 'careful')).toBeDefined();
    expect(repl.renderStatus('info', 'note')).toBeDefined();
  });

  it('should detect image content', () => {
    const imageContent = { type: 'image', data: 'base64...' };
    expect(repl.isImageContent(imageContent)).toBe(true);
  });

  it('should not detect non-image as image', () => {
    const textContent = { type: 'text', data: 'hello' };
    expect(repl.isImageContent(textContent)).toBe(false);
  });

  it('should render image content', () => {
    const img = { type: 'image', data: 'base64data', mimeType: 'image/png' };
    const result = repl.renderImage(img);
    expect(typeof result).toBe('string');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. SESSION PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Session Persistence', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should export session as serializable object', () => {
    const exported = repl.exportSession();
    expect(exported).toBeDefined();
    expect(typeof exported).toBe('object');
  });

  it('should export session with message history', async () => {
    await repl.handleUserMessage('test');
    const exported = repl.exportSession();
    expect(exported.messages).toBeDefined();
  });

  it('should export session with config', () => {
    const exported = repl.exportSession();
    expect(exported.config).toBeDefined();
  });

  it('should import session and restore state', () => {
    const data = { messages: [], config: { agentName: 'restored' }, channels: [] };
    repl.importSession(data);
    expect(repl.getConfig().agentName).toBe('restored');
  });

  it('should handle /save command triggering export', () => {
    expect(repl.handleCommand('/save')).toBe(true);
  });

  it('should handle /load command triggering import', () => {
    expect(repl.handleCommand('/load')).toBe(true);
  });

  it('should include channel state in export', async () => {
    await repl.spawnAgent('persist-me');
    const exported = repl.exportSession();
    expect(exported.channels).toContain('persist-me');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. MEMORY SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Memory', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should add memory entries', () => {
    repl.addMemory('fact', 'User prefers dark themes');
    const memories = repl.getMemories('fact');
    expect(memories).toContainEqual(expect.objectContaining({ content: 'User prefers dark themes' }));
  });

  it('should get all memories without type filter', () => {
    repl.addMemory('fact', 'one');
    repl.addMemory('preference', 'two');
    const all = repl.getMemories();
    expect(all.length).toBe(2);
  });

  it('should filter memories by type', () => {
    repl.addMemory('fact', 'a fact');
    repl.addMemory('preference', 'a preference');
    const facts = repl.getMemories('fact');
    expect(facts.length).toBe(1);
    expect(facts[0].content).toBe('a fact');
  });

  it('should get persisted memories as string', () => {
    repl.addMemory('fact', 'persisted item');
    const persisted = repl.getPersistedMemories();
    expect(typeof persisted).toBe('string');
    expect(persisted).toContain('persisted item');
  });

  it('should build context including memories', () => {
    repl.addMemory('context', 'important context');
    const ctx = repl.buildContext();
    expect(ctx).toContain('important context');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. MCP INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - MCP Integration', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should connect to MCP server', async () => {
    await expect(repl.connectMcp('github', { command: 'gh-mcp' })).resolves.not.toThrow();
  });

  it('should disconnect from MCP server', async () => {
    await repl.connectMcp('github', { command: 'gh-mcp' });
    await expect(repl.disconnectMcp('github')).resolves.not.toThrow();
  });

  it('should list connected MCP servers', async () => {
    await repl.connectMcp('server1', {});
    const servers = repl.getMcpServers();
    expect(servers).toContain('server1');
  });

  it('should get tools for an MCP server', async () => {
    await repl.connectMcp('tools-server', {});
    const tools = repl.getMcpTools('tools-server');
    expect(Array.isArray(tools)).toBe(true);
  });

  it('should get MCP server status', async () => {
    await repl.connectMcp('status-server', {});
    const status = repl.getMcpStatus('status-server');
    expect(status).toMatch(/connected|running|ready/i);
  });

  it('should resolve silently when disconnecting non-existent server', async () => {
    await expect(repl.disconnectMcp('ghost')).resolves.toBeUndefined();
  });

  it('should return empty tools for non-existent server', () => {
    const tools = repl.getMcpTools('nope');
    expect(tools).toEqual([]);
  });

  it('should get configured MCP servers from config', () => {
    const servers = repl.getConfiguredMcpServers();
    expect(Array.isArray(servers)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 16. BACKGROUND TASKS
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Background Tasks', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should run a task in background and return ID', async () => {
    const taskId = await repl.runInBackground('long computation');
    expect(typeof taskId).toBe('string');
    expect(taskId.length).toBeGreaterThan(0);
  });

  it('should list background tasks', async () => {
    await repl.runInBackground('task1');
    const tasks = repl.getBackgroundTasks();
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('should get background task status', async () => {
    const id = await repl.runInBackground('check me');
    const status = repl.getBackgroundTaskStatus(id);
    expect(status).toMatch(/running|pending|complete/i);
  });

  it('should get background task result when complete', async () => {
    const id = await repl.runInBackground('quick task');
    const result = repl.getBackgroundTaskResult(id);
    expect(result).toBeDefined();
  });

  it('should cancel a background task', async () => {
    const id = await repl.runInBackground('cancel me');
    repl.cancelBackgroundTask(id);
    const status = repl.getBackgroundTaskStatus(id);
    expect(status).toMatch(/cancel/i);
  });

  it('should throw when canceling non-existent task', () => {
    expect(() => repl.cancelBackgroundTask('fake-id')).toThrow();
  });

  it('should throw when getting status of non-existent task', () => {
    expect(() => repl.getBackgroundTaskStatus('fake-id')).toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 17. PROVIDER & MODEL MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Provider & Model Management', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should get current model name', () => {
    const model = repl.getCurrentModel();
    expect(typeof model).toBe('string');
  });

  it('should get current model ID', () => {
    const id = repl.getCurrentModelId();
    expect(typeof id).toBe('string');
  });

  it('should get active provider', () => {
    const provider = repl.getActiveProvider();
    expect(typeof provider).toBe('string');
  });

  it('should get configured providers list', () => {
    const providers = repl.getConfiguredProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it('should get default provider', () => {
    const def = repl.getDefaultProvider();
    expect(typeof def).toBe('string');
  });

  it('should get LLM provider instance', () => {
    const llm = repl.getLLMProvider();
    expect(llm).toBeDefined();
  });

  it('should estimate tokens for text', () => {
    const count = repl.estimateTokens('Hello world, this is a test.');
    expect(count).toBeGreaterThan(0);
  });

  it('should estimate more tokens for longer text', () => {
    const short = repl.estimateTokens('Hi');
    const long = repl.estimateTokens('This is a much longer string with many more words and tokens.');
    expect(long).toBeGreaterThan(short);
  });

  it('should get AWS profile if configured', () => {
    const profile = repl.getAwsProfile();
    // May be undefined or a string
    expect(profile === undefined || typeof profile === 'string').toBe(true);
  });

  it('should get AWS region if configured', () => {
    const region = repl.getAwsRegion();
    expect(region === undefined || typeof region === 'string').toBe(true);
  });

  it('should get auth method', () => {
    const method = repl.getAuthMethod();
    expect(method === undefined || typeof method === 'string').toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 18. FLIGHT CONTROLLER
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Provider Pool', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should not have provider by default (empty pool)', () => {
    expect(repl.hasProvider()).toBe(false);
  });

  it('should expose provider pool via getProviderPool()', () => {
    const pool = repl.getProviderPool();
    expect(pool).toBeDefined();
    expect(pool.size).toBe(0);
  });

  it('should stop cleanly when no provider is set', () => {
    expect(() => repl.stop()).not.toThrow();
  });

  it('should handle null/empty provider pool gracefully on stop', async () => {
    await repl.start();
    expect(() => repl.stop()).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 19. AGENT LOOP INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Agent Loop', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should get current mode', () => {
    const mode = repl.getMode();
    expect(typeof mode).toBe('string');
  });

  it('should get plan steps', () => {
    const plan = repl.getPlan();
    expect(plan).toHaveProperty('steps');
    expect(Array.isArray(plan.steps)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 20. AUTHENTICATION
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Authentication', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should check if token is valid', () => {
    const valid = repl.hasValidToken();
    expect(typeof valid).toBe('boolean');
  });

  it('should authenticate and return result', async () => {
    const result = await repl.authenticate();
    expect(result).toBeDefined();
  });

  it('should handle auth failure gracefully', async () => {
    // Simulate expired token scenario
    repl.simulateTokenExpiring();
    expect(repl.hasValidToken()).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 21. CONFIGURATION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Configuration', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should get theme name', () => {
    expect(repl.getThemeName()).toBe('acid');
  });

  it('should get enabled tools', () => {
    const tools = repl.getEnabledTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('should check for unsaved config changes', () => {
    const unsaved = repl.hasUnsavedConfigChanges();
    expect(typeof unsaved).toBe('boolean');
  });

  it('should simulate config changes', () => {
    repl.simulateConfigChange({ theme: 'midnight' });
    expect(repl.hasUnsavedConfigChanges()).toBe(true);
  });

  it('should get model config', () => {
    const mc = repl.getModelConfig();
    expect(mc).toHaveProperty('temperature');
    expect(mc).toHaveProperty('maxTokens');
  });

  it('should get config source path', () => {
    const custom = new ArmamentApp({ configPath: '/etc/armament.toml' });
    expect(custom.getConfigSource()).toBe('/etc/armament.toml');
  });

  it('should return undefined config source when not set', () => {
    expect(repl.getConfigSource()).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 22. NON-INTERACTIVE MODE
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Non-Interactive Mode', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should run in non-interactive mode and return output', async () => {
    const output = await repl.runNonInteractive();
    expect(typeof output).toBe('string');
  });

  it('should not start readline in non-interactive mode', async () => {
    await repl.runNonInteractive();
    expect(repl.isRunning()).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 23. SETUP WIZARD
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Setup Wizard', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should run setup wizard without throwing', async () => {
    await expect(repl.runSetupWizard()).resolves.not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 24. CONTEXT SIMULATION
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Context Simulation', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should simulate context usage percentage', () => {
    repl.simulateContextUsage(75);
    const usage = repl.getContextUsage();
    expect(usage.percentage).toBe(75);
  });

  it('should simulate 0% context usage', () => {
    repl.simulateContextUsage(0);
    const usage = repl.getContextUsage();
    expect(usage.percentage).toBe(0);
  });

  it('should simulate 100% context usage', () => {
    repl.simulateContextUsage(100);
    const usage = repl.getContextUsage();
    expect(usage.percentage).toBe(100);
  });

  it('should trigger compaction warning at high context usage', () => {
    const handler = vi.fn();
    repl.on('context:warning', handler);
    repl.simulateContextUsage(90);
    expect(handler).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 25. OUTPUT STREAM
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Output Stream', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should set processing state', () => {
    repl.setProcessing(true);
    // Processing state should be true internally
    expect(repl.getConfig()).toBeDefined();
  });

  it('should clear processing state', () => {
    repl.setProcessing(true);
    repl.setProcessing(false);
    expect(repl.getConfig()).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 26. COMMAND ROUTING INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Command Routing', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should route /join to joinChannel', () => {
    const spy = vi.spyOn(repl, 'joinChannel');
    repl.handleCommand('/join test-channel');
    expect(spy).toHaveBeenCalledWith('test-channel');
  });

  it('should route /part to leaveChannel', () => {
    repl.joinChannel('leaving');
    const spy = vi.spyOn(repl, 'leaveChannel');
    repl.handleCommand('/part leaving');
    expect(spy).toHaveBeenCalledWith('leaving');
  });

  it('should route /spawn to spawn a subworker with a prompt', () => {
    const spy = vi.spyOn(repl, 'spawnAgent');
    repl.handleCommand('/spawn prodready');
    expect(spy).not.toHaveBeenCalled();
  });

  it('should route /kill to killAgent', async () => {
    await repl.spawnAgent('victim');
    const spy = vi.spyOn(repl, 'killAgent');
    repl.handleCommand('/kill victim');
    expect(spy).toHaveBeenCalledWith('victim');
  });

  it('should route /switch to switchChannel', () => {
    repl.joinChannel('target');
    const spy = vi.spyOn(repl, 'switchChannel');
    repl.handleCommand('/switch target');
    expect(spy).toHaveBeenCalledWith('target');
  });

  it('should route /list to listChannels', () => {
    const spy = vi.spyOn(repl, 'listChannels');
    repl.handleCommand('/list');
    expect(spy).toHaveBeenCalled();
  });

  it('should route /msg to msgAgent', () => {
    const spy = vi.spyOn(repl, 'msgAgent');
    repl.handleCommand('/msg coder hello there');
    expect(spy).toHaveBeenCalledWith('coder', 'hello there');
  });

  it('should route /whois to whoIs', () => {
    const spy = vi.spyOn(repl, 'whoIs');
    repl.handleCommand('/whois coder');
    expect(spy).toHaveBeenCalledWith('coder');
  });

  it('should list available prompts when no name given', () => {
    const result = repl.handleCommand('/spawn');
    expect(result).toBe(true);
  });

  it('should handle /switch with numeric index', () => {
    repl.joinChannel('a');
    repl.joinChannel('b');
    const spy = vi.spyOn(repl, 'switchChannel');
    repl.handleCommand('/switch 1');
    expect(spy).toHaveBeenCalledWith(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 27. EDGE CASES & ERROR HANDLING
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Edge Cases', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp();
  });

  it('should handle very long input gracefully', async () => {
    const longInput = 'a'.repeat(100000);
    await expect(repl.handleInput(longInput)).resolves.not.toThrow();
  });

  it('should handle unicode input', async () => {
    await expect(repl.handleInput('こんにちは世界 🌍')).resolves.not.toThrow();
  });

  it('should handle special characters in channel names', () => {
    expect(() => repl.joinChannel('chan@#$')).toThrow();
  });

  it('should handle extremely long channel names', () => {
    const longName = 'a'.repeat(256);
    expect(() => repl.joinChannel(longName)).toThrow();
  });

  it('should handle rapid sequential commands', async () => {
    for (let i = 0; i < 100; i++) {
      repl.handleCommand(`/join chan-${i}`);
    }
    const listing = repl.listChannels();
    expect(listing).toContain('chan-99');
  });

  it('should handle concurrent message sends', async () => {
    await repl.spawnAgent('concurrent');
    const promises = Array.from({ length: 10 }, (_, i) =>
      repl.msgAgent('concurrent', `message ${i}`)
    );
    await expect(Promise.all(promises)).resolves.not.toThrow();
  });

  it('should handle null/undefined gracefully in renderMarkdown', () => {
    expect(() => repl.renderMarkdown('')).not.toThrow();
  });

  it('should handle empty diff rendering', () => {
    expect(() => repl.renderDiff('')).not.toThrow();
  });

  it('should handle error without message', () => {
    const err = new Error();
    const result = repl.renderError(err);
    expect(typeof result).toBe('string');
  });

  it('should handle progress bar with zero total', () => {
    expect(() => repl.renderProgressBar(0, 0)).not.toThrow();
  });

  it('should handle negative progress values', () => {
    expect(() => repl.renderProgressBar(-1, 100)).not.toThrow();
  });

  it('should handle progress exceeding total', () => {
    expect(() => repl.renderProgressBar(200, 100)).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 28. THEME HANDLING
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Theme Handling', () => {
  it('should default to acid theme', () => {
    const repl = new ArmamentApp();
    expect(repl.getThemeName()).toBe('acid');
  });

  it('should accept midnight theme', () => {
    const repl = new ArmamentApp({ theme: 'midnight' });
    expect(repl.getThemeName()).toBe('midnight');
  });

  it('should accept bitchx theme', () => {
    const repl = new ArmamentApp({ theme: 'bitchx' });
    expect(repl.getThemeName()).toBe('bitchx');
  });

  it('should accept lice theme', () => {
    const repl = new ArmamentApp({ theme: 'lice' });
    expect(repl.getThemeName()).toBe('lice');
  });

  it('should accept irssi theme', () => {
    const repl = new ArmamentApp({ theme: 'irssi' });
    expect(repl.getThemeName()).toBe('irssi');
  });

  it('should apply gradient with theme colors', () => {
    const repl = new ArmamentApp({ theme: 'acid' });
    const gradient = repl.applyGradient('test text');
    expect(gradient).not.toBe('test text');
  });

  it('should respect noColor flag', () => {
    const repl = new ArmamentApp({ noColor: true });
    const gradient = repl.applyGradient('plain text');
    expect(gradient).toBe('plain text');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 29. OUTPUT FORMAT MODES
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Output Formats', () => {
  it('should support text output format', () => {
    const repl = new ArmamentApp({ outputFormat: 'text' });
    expect(repl.getConfig().outputFormat).toBe('text');
  });

  it('should support json output format', () => {
    const repl = new ArmamentApp({ outputFormat: 'json' });
    expect(repl.getConfig().outputFormat).toBe('json');
  });

  it('should support stream-json output format', () => {
    const repl = new ArmamentApp({ outputFormat: 'stream-json' });
    expect(repl.getConfig().outputFormat).toBe('stream-json');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 30. RATE LIMITING CONFIG
// ══════════════════════════════════════════════════════════════════════════════

describe('ArmamentApp - Rate Limiting', () => {
  it('should accept rate limit config', () => {
    const repl = new ArmamentApp({ rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000 } });
    expect(repl.getConfig().rateLimits?.requestsPerMinute).toBe(60);
    expect(repl.getConfig().rateLimits?.tokensPerMinute).toBe(100000);
  });

  it('should support adaptive rate limiting', () => {
    const repl = new ArmamentApp({ rateLimits: { adaptive: true, initialRate: 10, minRate: 1, maxRate: 100 } });
    expect(repl.getConfig().rateLimits?.adaptive).toBe(true);
  });

  it('should support per-model rate limits', () => {
    const repl = new ArmamentApp({
      rateLimits: { perModel: { 'claude-opus-4-0-20250514': { requestsPerMinute: 10 } } },
    });
    expect(repl.getConfig().rateLimits?.perModel?.['claude-opus-4-0-20250514']?.requestsPerMinute).toBe(10);
  });
});
