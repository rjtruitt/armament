/**
 * IteratioSidecar — spawns the iteratio-go sidecar binary and communicates
 * via JSON-line protocol over stdin/stdout.
 *
 * The Go sidecar is a persistent process that manages conversation state
 * internally. TS sends user input + config, Go streams back the full agent
 * loop (text, thinking, tool calls, tool results, done/error).
 *
 * Binary: godev/iteratio-go/sidecar (built from cmd/sidecar/)
 * Build:  cd ~/Documents/AiLegoPieces/godev/iteratio-go && go build -o sidecar ./cmd/sidecar/
 *
 * Protocol (one JSON object per line, newline-delimited):
 *
 *   stdin  → {"type":"message","text":"user input","tools":["bash","read_file"],"provider":"openai","model":"gpt-4o"}
 *   stdin  → {"type":"interrupt"}   (sent on Ctrl+C)
 *   stdout ← {"type":"text","text":"I'll help with that"}
 *   stdout ← {"type":"thinking","text":"Let me think..."}
 *   stdout ← {"type":"tool_call","id":"tc-1","name":"bash","args":{"command":"ls"}}
 *   stdout ← {"type":"tool_result","id":"tc-1","content":"file1.go\nfile2.go","toolName":"bash"}
 *   stdout ← {"type":"done","usage":{"inputTokens":500,"outputTokens":200}}
 *   stdout ← {"type":"error","error":"rate limit exceeded"}
 */

import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { EventEmitter } from 'node:events';

const GO_BINARY = resolve(
  process.env.HOME!,
  'Documents/AiLegoPieces/godev/iteratio-go/sidecar',
);

// ── Wire types ──────────────────────────────────────────────────────────

export interface SidecarChunk {
  type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error';
  text?: string;
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  content?: string;
  toolName?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  error?: string;
}

export interface SidecarSendRequest {
  type: 'message';
  text: string;
  tools: string[];
  provider: string;
  model: string;
  /** Working directory for tool execution (bash, read_file, etc.) */
  cwd?: string;
  /** System message injected at turn start (notes.md, stickies, armadebug) */
  system?: string;
}

// ── Sidecar manager ─────────────────────────────────────────────────────

export class IteratioSidecar extends EventEmitter {
  private proc: ChildProcess | null = null;
  private rl: ReturnType<typeof createInterface> | null = null;
  private _ready = false;
  private _pendingResolve: ((value: boolean) => void) | null = null;
  private _binaryPath: string;

  constructor(binaryPath?: string) {
    super();
    this._binaryPath = binaryPath ?? process.env.ITERATIO_SIDECAR_BIN ?? GO_BINARY;
  }

  get ready(): boolean { return this._ready; }

  /** Spawn the Go sidecar process. Returns true on success, false if binary missing. */
  async start(): Promise<boolean> {
    if (this._ready) return true;
    return new Promise((resolve) => {
      try {
        this.proc = spawn(this._binaryPath, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        resolve(false);
        return;
      }

      this.proc.on('error', (err) => {
        console.error('[iteratio-sidecar] spawn error:', err.message);
        this.proc = null;
        this._ready = false;
        if (this._pendingResolve) { this._pendingResolve(false); this._pendingResolve = null; }
        resolve(false);
      });

      this.proc.on('exit', (code) => {
        if (code !== 0) console.error('[iteratio-sidecar] exited with code', code);
        this._ready = false;
        this.proc = null;
        this.emit('exit', code);
      });

      this.proc.stderr?.on('data', (d: Buffer) => {
        console.error('[iteratio-sidecar] stderr:', d.toString().trim());
      });

      this.rl = createInterface({ input: this.proc.stdout! });
      this.rl.on('line', (line: string) => {
        try {
          const chunk: SidecarChunk = JSON.parse(line);
          this.emit('chunk', chunk);
        } catch {
          console.error('[iteratio-sidecar] unparseable stdout:', line.slice(0, 200));
        }
      });

      // Give it a moment to start up, then mark ready
      setTimeout(() => {
        if (this.proc?.exitCode === null) {
          this._ready = true;
          resolve(true);
        } else {
          resolve(false);
        }
      }, 300);
    });
  }

  /** Send a user message + config to the sidecar. */
  send(req: SidecarSendRequest): void {
    if (!this.proc || !this._ready) {
      this.emit('chunk', { type: 'error', error: 'iteratio sidecar not running' });
      return;
    }
    this.proc.stdin!.write(JSON.stringify(req) + '\n');
  }

  /** Send an interrupt signal to the sidecar. */
  interrupt(): void {
    if (!this.proc || !this._ready) return;
    this.proc.stdin!.write(JSON.stringify({ type: 'interrupt' }) + '\n');
  }

  /** Kill the sidecar process. */
  stop(): void {
    this._ready = false;
    this.rl?.close();
    this.rl = null;
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill();
      this.proc = null;
    }
  }
}
