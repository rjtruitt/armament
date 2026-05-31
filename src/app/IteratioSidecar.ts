/**
 * IteratioSidecar — spawns the iteratio-go sidecar binary and communicates
 * via JSON-line protocol over stdin/stdout.
 *
 * Binary: godev/iteratio-go/sidecar (built from cmd/sidecar/)
 * Build:  cd godev/iteratio-go && go build -o sidecar ./cmd/sidecar/
 *
 * Protocol (one JSON object per line, newline-delimited):
 *   stdin  → {"messages": [...], "provider": "openai", "model": "gpt-4o"}
 *   stdout ← {"type":"text","text":"Hello "}
 *   stdout ← {"type":"done","usage":{...}}
 *   stdout ← {"type":"error","error":"..."}  (on failure)
 */

import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const GO_BINARY = resolve(
  process.env.HOME!,
  'Documents/AiLegoPieces/godev/iteratio-go/sidecar',
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

export class IteratioSidecar {
  private proc: ChildProcess | null = null;

  async start(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.proc = spawn(GO_BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        this.proc.on('error', (err) => {
          console.error('[iteratio-sidecar] spawn error:', err.message);
          this.proc = null;
          resolve(false);
        });
        this.proc.on('exit', (code) => {
          if (code !== 0) console.error('[iteratio-sidecar] exited with code', code);
          this.proc = null;
        });
        setTimeout(() => resolve(this.proc?.exitCode === null), 500);
      } catch (err) {
        console.error('[iteratio-sidecar] spawn threw:', err);
        resolve(false);
      }
    });
  }

  async send(req: SendRequest): Promise<{ text: string; error?: string; usage?: StreamChunk['usage'] }> {
    if (!this.proc || this.proc.exitCode !== null) {
      return { text: '', error: 'iteratio sidecar not running' };
    }
    return new Promise((resolve) => {
      const chunks: StreamChunk[] = [];
      const rl = createInterface({ input: this.proc!.stdout! });
      rl.on('line', (line: string) => {
        try {
          const chunk: StreamChunk = JSON.parse(line);
          chunks.push(chunk);
          if (chunk.type === 'done' || chunk.type === 'error') rl.close();
        } catch {
          console.error('[iteratio-sidecar] unparseable stdout:', line.slice(0, 200));
        }
      });
      rl.on('close', () => {
        const text = chunks.filter((c) => c.type === 'text' || c.type === 'thinking').map((c) => c.text ?? '').join('');
        const errorChunk = chunks.find((c) => c.type === 'error');
        const doneChunk = chunks.find((c) => c.type === 'done');
        resolve({ text, error: errorChunk?.error, usage: doneChunk?.usage });
      });
      this.proc!.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  stop(): void {
    if (this.proc) { this.proc.stdin?.end(); this.proc.kill(); this.proc = null; }
  }
}

// Self-test: npx tsx src/app/IteratioSidecar.ts
async function main() {
  const sc = new IteratioSidecar();
  console.log('Starting iteratio sidecar...');
  if (!await sc.start()) {
    console.log('Failed (binary missing or config error).');
    console.log('  Build: cd ~/Documents/AiLegoPieces/godev/iteratio-go && go build -o sidecar ./cmd/sidecar/');
    process.exit(1);
  }
  console.log('Sending test...');
  const r = await sc.send({ messages: [{ role: 'user', content: 'Say "hello from iteratio" and nothing else.' }], provider: 'openai', model: 'gpt-4o' });
  console.log(r.error ? `Error: ${r.error}` : `Response: ${r.text}`);
  if (r.usage) console.log('Usage:', JSON.stringify(r.usage));
  sc.stop();
}
if (process.argv[1]?.endsWith('IteratioSidecar.ts') || process.argv[1]?.endsWith('IteratioSidecar.js')) main().catch(console.error);
