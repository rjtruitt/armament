/**
 * GoEngineAdapter — spawns the iteratio-engine Go sidecar and communicates
 * via JSON-line protocol over stdin/stdout.
 *
 * Usage:
 *   npx tsx src/app/GoEngineAdapter.ts
 *
 * Protocol (one JSON object per line, newline-delimited):
 *   stdin  → {"messages": [...], "provider": "openai", "model": "gpt-4o"}
 *   stdout ← {"type":"text","text":"Hello "}
 *   stdout ← {"type":"text","text":"world!"}
 *   stdout ← {"type":"done","usage":{...}}
 *   stdout ← {"type":"error","error":"..."}  (on failure)
 */

import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const GO_BINARY = resolve(
  process.env.HOME!,
  'Documents/AiLegoPieces/godev/iteratio-go/engine',
);

interface StreamChunk {
  type: 'text' | 'thinking' | 'done' | 'error';
  text?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  error?: string;
}

interface SendRequest {
  messages: Array<{ role: string; content: string }>;
  provider: string;
  model: string;
}

export class GoEngineAdapter {
  private proc: ChildProcess | null = null;

  /** Spawn the Go sidecar, returning true on success. */
  async start(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.proc = spawn(GO_BINARY, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.proc.on('error', (err) => {
          console.error('[go-engine] spawn error:', err.message);
          this.proc = null;
          resolve(false);
        });

        this.proc.on('exit', (code) => {
          if (code !== 0) {
            console.error('[go-engine] exited with code', code);
          }
          this.proc = null;
        });

        // Give it a tick to exit if config is bad
        setTimeout(() => {
          if (this.proc?.exitCode === null) {
            resolve(true);
          } else {
            resolve(false);
          }
        }, 500);
      } catch (err) {
        console.error('[go-engine] spawn threw:', err);
        resolve(false);
      }
    });
  }

  /** Send a request and collect all chunks. Returns the full response text. */
  async send(req: SendRequest): Promise<{ text: string; error?: string; usage?: StreamChunk['usage'] }> {
    if (!this.proc || this.proc.exitCode !== null) {
      return { text: '', error: 'Go engine not running' };
    }

    return new Promise((resolve) => {
      const chunks: StreamChunk[] = [];
      const rl = createInterface({ input: this.proc!.stdout! });

      rl.on('line', (line: string) => {
        try {
          const chunk: StreamChunk = JSON.parse(line);
          chunks.push(chunk);
          if (chunk.type === 'done' || chunk.type === 'error') {
            rl.close();
          }
        } catch {
          console.error('[go-engine] unparseable stdout line:', line.slice(0, 200));
        }
      });

      rl.on('close', () => {
        const text = chunks
          .filter((c) => c.type === 'text' || c.type === 'thinking')
          .map((c) => c.text ?? '')
          .join('');
        const errorChunk = chunks.find((c) => c.type === 'error');
        const doneChunk = chunks.find((c) => c.type === 'done');
        resolve({
          text,
          error: errorChunk?.error,
          usage: doneChunk?.usage,
        });
      });

      this.proc!.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  /** Shut down the sidecar. */
  stop(): void {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill();
      this.proc = null;
    }
  }
}

// ── Self-test ───────────────────────────────────────────────────────────────

async function main() {
  const engine = new GoEngineAdapter();
  console.log('Starting Go engine...');
  const started = await engine.start();

  if (!started) {
    console.log('❌ Go engine failed to start (binary missing or config error). This is expected if you haven\'t built it yet.');
    console.log('   Build with: cd ~/Documents/AiLegoPieces/godev/iteratio-engine && go build -o iteratio-engine .');
    process.exit(1);
  }

  console.log('✓ Go engine started, sending test message...');
  const result = await engine.send({
    messages: [{ role: 'user', content: 'Say "hello from Go" and nothing else.' }],
    provider: 'openai',
    model: 'gpt-4o',
  });

  if (result.error) {
    console.log('❌ Error:', result.error);
  } else {
    console.log('✓ Response:', result.text);
    console.log('  Usage:', JSON.stringify(result.usage));
  }

  engine.stop();
  console.log('Done.');
}

// Allow running directly: npx tsx src/app/GoEngineAdapter.ts
if (process.argv[1]?.endsWith('GoEngineAdapter.ts') || process.argv[1]?.endsWith('GoEngineAdapter.js')) {
  main().catch(console.error);
}
