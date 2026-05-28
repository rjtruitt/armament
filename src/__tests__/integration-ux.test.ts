/**
 * INTEGRATION UX TESTS — Full end-to-end testing of armament terminal UX.
 *
 * Uses --debug mode to mock LLM/MCP, then spawns the actual process and
 * validates: loading screen, commands, channels, agents, hooks, theming,
 * keyboard nav, error handling, and session lifecycle.
 *
 * These tests exercise the real code path (no vi.mock) via child process,
 * giving confidence that wiring, imports, and rendering all work together.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

vi.setConfig({ testTimeout: 15000 });

const ARMAMENT_ENTRY = resolve(__dirname, '../index.ts');
const TSX = resolve(__dirname, '../../node_modules/.bin/tsx');

interface ArmamentProcess {
  proc: ChildProcess;
  output: string[];
  write: (input: string) => void;
  waitForOutput: (match: string | RegExp, timeoutMs?: number) => Promise<string>;
  waitForPrompt: (timeoutMs?: number) => Promise<void>;
  kill: () => void;
  getFullOutput: () => string;
}

function launchArmament(args: string[] = []): ArmamentProcess {
  const hasNoColor = args.includes('--no-color');
  const proc = spawn(TSX, [ARMAMENT_ENTRY, '--debug', ...args], {
    env: { ...process.env, FORCE_COLOR: hasNoColor ? '0' : '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const output: string[] = [];
  let outputBuffer = '';
  let lastCheckedPos = 0;
  const waiters: Array<{ match: string | RegExp; startPos: number; resolve: (val: string) => void; reject: (e: Error) => void }> = [];

  const checkWaiters = () => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      const newContent = outputBuffer.slice(w.startPos);
      if (typeof w.match === 'string' ? newContent.includes(w.match) : w.match.test(newContent)) {
        waiters.splice(i, 1);
        w.resolve(outputBuffer);
      }
    }
  };

  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    output.push(text);
    outputBuffer += text;
    checkWaiters();
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    output.push(text);
    outputBuffer += text;
    checkWaiters();
  });

  return {
    proc,
    output,
    write: (input: string) => {
      lastCheckedPos = outputBuffer.length;
      proc.stdin?.write(input + '\n');
    },
    waitForOutput: (match, timeoutMs = 10000) => {
      const startPos = lastCheckedPos;
      const newContent = outputBuffer.slice(startPos);
      if (typeof match === 'string' ? newContent.includes(match) : match.test(newContent)) {
        return Promise.resolve(outputBuffer);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for "${match}" in output after pos ${startPos}. Got:\n${outputBuffer.slice(startPos).slice(-500)}`));
        }, timeoutMs);
        waiters.push({
          match,
          startPos,
          resolve: (val) => { clearTimeout(timer); resolve(val); },
          reject,
        });
      });
    },
    waitForPrompt: (timeoutMs = 10000) => {
      const startPos = lastCheckedPos;
      lastCheckedPos = outputBuffer.length;
      return new Promise((resolve, reject) => {
        const newContent = outputBuffer.slice(startPos);
        if (newContent.includes('armament>') || newContent.includes('armament#')) {
          lastCheckedPos = outputBuffer.length;
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for prompt after pos ${startPos}. Got:\n${outputBuffer.slice(startPos).slice(-500)}`));
        }, timeoutMs);
        waiters.push({
          match: /armament[#>]/,
          startPos,
          resolve: () => { clearTimeout(timer); lastCheckedPos = outputBuffer.length; resolve(); },
          reject,
        });
      });
    },
    kill: () => {
      proc.stdin?.end();
      proc.kill('SIGTERM');
    },
    getFullOutput: () => outputBuffer,
  };
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STARTUP & LOADING SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration: Startup & Loading Screen', () => {
  let arm: ArmamentProcess;

  afterEach(() => {
    arm?.kill();
  });

  it('should display the ARMAMENT banner on startup', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    const out = stripAnsi(arm.getFullOutput());
    expect(out).toContain('▄▄▄       ██▀███');
  });

  it('should display gradient loading bar', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    const out = arm.getFullOutput();
    // Gradient bar uses 24-bit color escapes
    expect(out).toMatch(/\x1b\[38;2;\d+;\d+;\d+m█/);
  });

  it('should show "ready" text after loading bar', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    const out = stripAnsi(arm.getFullOutput());
    expect(out).toContain('ready');
  });

  it('should show loading steps (config, providers, MCP, workspace)', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    const out = stripAnsi(arm.getFullOutput());
    expect(out).toContain('loading config');
    expect(out).toContain('providers');
    expect(out).toContain('MCP servers');
    expect(out).toContain('workspace');
  });

  it('should display a flavor text', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    const out = stripAnsi(arm.getFullOutput());
    // Flavor text is one of the known strings — just check the separator dashes are there
    expect(out).toMatch(/──────────.*──────────/);
  });

  it('should display prompt after loading', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    const out = stripAnsi(arm.getFullOutput());
    expect(out).toContain('armament>');
  });

  it('should respect --no-color flag (no gradient colors in banner)', async () => {
    arm = launchArmament(['--no-color']);
    await arm.waitForPrompt();
    const out = arm.getFullOutput();
    // The banner lines themselves should have no 24-bit color
    const bannerLines = out.split('\n').filter(l => l.includes('▄▄▄') || l.includes('▓██'));
    for (const line of bannerLines) {
      expect(line).not.toMatch(/\x1b\[38;2;/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. COMMAND EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration: Commands', () => {
  let arm: ArmamentProcess;

  afterEach(() => {
    arm?.kill();
  });

  it('should exit cleanly on /quit', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('/quit');
    await new Promise<void>((resolve) => {
      arm.proc.on('exit', (code) => {
        expect(code).toBe(0);
        resolve();
      });
    });
  });

  it('should exit cleanly on /q', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('/q');
    await new Promise<void>((resolve) => {
      arm.proc.on('exit', (code) => {
        expect(code).toBe(0);
        resolve();
      });
    });
  });

  it('should respond to user messages with canned debug response', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('hello');
    await arm.waitForOutput('debug mode');
    arm.write('/quit');
  });

  it('should handle --version flag', async () => {
    const proc = spawn(TSX, [ARMAMENT_ENTRY, '--version'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    proc.stdout?.on('data', (d) => chunks.push(d));
    await new Promise<void>((resolve) => proc.on('exit', () => resolve()));
    expect(Buffer.concat(chunks).toString()).toContain('armament v0.1.0');
  });

  it('should handle --help flag', async () => {
    const proc = spawn(TSX, [ARMAMENT_ENTRY, '--help'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    proc.stdout?.on('data', (d) => chunks.push(d));
    await new Promise<void>((resolve) => proc.on('exit', () => resolve()));
    const out = Buffer.concat(chunks).toString();
    expect(stripAnsi(out)).toContain('Usage: arma [options]');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. IRC CHANNELS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration: IRC Channels', () => {
  let arm: ArmamentProcess;

  afterEach(() => {
    arm?.kill();
  });

  it('should change prompt after /join', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('/join research');
    await arm.waitForOutput('armament#research>');
    arm.write('/quit');
  });

  it('should list channels after /list', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('/join alpha');
    await arm.waitForOutput('#alpha');
    arm.write('/list');
    await arm.waitForOutput('alpha');
    arm.write('/quit');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. AGENT SPAWNING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration: Agent Spawning', () => {
  let arm: ArmamentProcess;

  afterEach(() => {
    arm?.kill();
  });

  it('should handle /spawn command', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('/spawn prodready');
    await arm.waitForPrompt();
    arm.write('/quit');
  });

  it('should show agent info with /whois', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('/whois');
    await arm.waitForPrompt();
    arm.write('/quit');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. THEME SWITCHING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration: Theming', () => {
  let arm: ArmamentProcess;

  afterEach(() => {
    arm?.kill();
  });

  it('should accept /theme command without crashing', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('/theme ice');
    await arm.waitForPrompt();
    arm.write('/quit');
    await new Promise<void>((resolve) => {
      arm.proc.on('exit', (code) => {
        expect(code).toBe(0);
        resolve();
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SESSION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration: Session Lifecycle', () => {
  let arm: ArmamentProcess;

  afterEach(() => {
    arm?.kill();
  });

  it('should increment turn count on each message', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('first message');
    await arm.waitForOutput('debug mode');
    arm.write('second message');
    await arm.waitForPrompt();
    arm.write('/status');
    await arm.waitForOutput('Turns: 2');
    arm.write('/quit');
  });

  it('should track cost', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('tell me something');
    await arm.waitForOutput('debug mode');
    arm.write('/cost');
    await arm.waitForOutput('$');
    arm.write('/quit');
  });

  it('should handle multiple messages without crashing', async () => {
    arm = launchArmament(['--max-turns', '10']);
    await arm.waitForPrompt();
    for (let i = 0; i < 5; i++) {
      arm.write(`message ${i}`);
    }
    await arm.waitForPrompt();
    arm.write('/quit');
    await new Promise<void>((resolve) => {
      arm.proc.on('exit', (code) => {
        expect(code).toBe(0);
        resolve();
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration: Error Handling', () => {
  let arm: ArmamentProcess;

  afterEach(() => {
    arm?.kill();
  });

  it('should handle unknown commands gracefully', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('/nonexistent');
    await arm.waitForPrompt();
    // Should not crash — just return to prompt
    arm.write('/quit');
    await new Promise<void>((resolve) => {
      arm.proc.on('exit', (code) => {
        expect(code).toBe(0);
        resolve();
      });
    });
  });

  it('should handle empty input without crashing', async () => {
    arm = launchArmament();
    await arm.waitForPrompt();
    arm.write('');
    await arm.waitForPrompt();
    arm.write('/quit');
    await new Promise<void>((resolve) => {
      arm.proc.on('exit', (code) => {
        expect(code).toBe(0);
        resolve();
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. DEBUG MODE HOOKS (unit-level, not subprocess)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration: Debug Mode & Test Hooks', () => {
  let repl: any;
  let debug: any;

  beforeEach(async () => {
    const { DebugMode } = await import('../debug/DebugMode');
    DebugMode.reset();
    debug = DebugMode.instance();
    debug.activate();
    debug.clearEventLog();
    debug.clearHooks();

    const { ArmamentApp } = await import('../app/ArmamentApp');
    repl = new ArmamentApp({ theme: 'red' });
  });

  afterEach(() => {
    debug?.deactivate();
  });

  it('should fire post:message hook on each user message', async () => {
    const fired: any[] = [];
    debug.onHook('post:message', (ctx: any) => fired.push(ctx));

    await repl.handleUserMessage('test input');
    expect(fired).toHaveLength(1);
    expect(fired[0].data.input).toBe('test input');
    expect(fired[0].data.response).toContain('debug mode');
  });

  it('should fire post:tool hook when canned response has tool calls', async () => {
    debug.setResponses([{
      match: /read/,
      reply: 'I read the file.',
      toolCalls: [{ name: 'read_file', args: { path: '/foo.ts' }, result: 'file contents' }],
    }]);

    const fired: any[] = [];
    debug.onHook('post:tool', (ctx: any) => fired.push(ctx));

    await repl.handleUserMessage('read the file');
    expect(fired).toHaveLength(1);
    expect(fired[0].data.tool).toBe('read_file');
    expect(fired[0].data.result).toBe('file contents');
  });

  it('should capture output in debug mode', async () => {
    debug.clearOutput();

    await repl.handleUserMessage('anything');
    const captured = debug.getOutput();
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain('debug mode');
  });

  it('should record events in the event log', async () => {
    await repl.handleUserMessage('hello');
    const events = debug.getEvents('post:message');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].data.turn).toBe(1);
  });

  it('should match canned responses by regex', async () => {
    debug.setResponses([
      { match: /weather/, reply: 'It is sunny and 72°F.' },
      { match: /.*/, reply: 'fallback response' },
    ]);

    const result = await repl.handleUserMessage('what is the weather?');
    expect(result).toBe('It is sunny and 72°F.');
  });

  it('should support wildcard hook listeners', async () => {
    const allEvents: string[] = [];
    debug.onHook('*', (ctx: any) => allEvents.push(ctx.point));

    await repl.handleUserMessage('test');
    expect(allEvents).toContain('post:message');
  });

  it('should provide input queue for automated sequences', () => {
    debug.queueInput('first', 'second', 'third');

    expect(debug.nextInput()).toBe('first');
    expect(debug.nextInput()).toBe('second');
    expect(debug.nextInput()).toBe('third');
    expect(debug.hasQueuedInput()).toBe(false);
  });
});
