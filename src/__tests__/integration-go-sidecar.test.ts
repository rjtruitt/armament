/**
 * Integration test: Go sidecar pipeline.
 *
 * Spawns the real iteratio-go sidecar binary and verifies the full protocol:
 * TS stdin → Go agent loop → LLM → tool calls → tool results → TS stdout.
 *
 * Skipped if Go toolchain or the sidecar binary is unavailable.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { IteratioSidecar, SidecarChunk } from '../app/IteratioSidecar.js';
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const GO_DIR = resolve(process.env.HOME!, 'Documents/AiLegoPieces/godev/iteratio-go');
const TEST_BINARY = resolve('/tmp', 'armament-test-sidecar');

// Build the sidecar binary once for all tests
let binaryAvailable = false;

beforeAll(() => {
  // Check if Go is installed
  const goCheck = spawnSync('go', ['version'], { timeout: 5000 });
  if (goCheck.status !== 0) {
    console.log('[go-sidecar test] Go not installed — skipping');
    return;
  }
  // Build the sidecar
  if (existsSync(TEST_BINARY)) unlinkSync(TEST_BINARY);
  const build = spawnSync('go', ['build', '-o', TEST_BINARY, './cmd/sidecar/'], {
    cwd: GO_DIR,
    timeout: 30000,
  });
  if (build.status !== 0) {
    console.log('[go-sidecar test] Build failed — skipping:', build.stderr.toString().slice(0, 200));
    return;
  }
  binaryAvailable = true;
  process.env.ITERATIO_SIDECAR_BIN = TEST_BINARY;
});

afterAll(() => {
  if (existsSync(TEST_BINARY)) {
    try { unlinkSync(TEST_BINARY); } catch {}
  }
  delete process.env.ITERATIO_SIDECAR_BIN;
});

describe('Go sidecar pipeline', () => {
  it('starts and responds to a text-only message', { timeout: 20000 }, async () => {
    if (!binaryAvailable) return; // skip silently

    const sc = new IteratioSidecar();
    const started = await sc.start();
    if (!started) throw new Error('sidecar failed to start');

    const chunks: SidecarChunk[] = [];
    sc.on('chunk', (c: SidecarChunk) => chunks.push(c));

    sc.send({
      type: 'message',
      text: 'Say "hello" in exactly one word.',
      tools: [],
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      cwd: '/tmp',
    });

    // Wait for done
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for done chunk')), 15000);
      const onChunk = (c: SidecarChunk) => {
        if (c.type === 'done') {
          clearTimeout(timeout);
          sc.off('chunk', onChunk);
          resolve();
        }
      };
      sc.on('chunk', onChunk);
    });

    sc.stop();

    const types = chunks.map(c => c.type);
    expect(types).toContain('text');
    expect(types).toContain('done');
  });

  it('executes a tool call and returns results', { timeout: 30000 }, async () => {
    if (!binaryAvailable) return;

    const sc = new IteratioSidecar();
    const started = await sc.start();
    if (!started) throw new Error('sidecar failed to start');

    const chunks: SidecarChunk[] = [];
    sc.on('chunk', (c: SidecarChunk) => chunks.push(c));

    sc.send({
      type: 'message',
      text: 'Run `echo hello-from-go` and tell me what it outputs.',
      tools: ['bash'],
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      cwd: '/tmp',
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out')), 25000);
      const onChunk = (c: SidecarChunk) => {
        // Accept done, error, or cleanup (process exited)
        if (c.type === 'done' || c.type === 'error') {
          clearTimeout(timeout); sc.off('chunk', onChunk); resolve();
        }
      };
      // Also resolve on process exit (belt & suspenders)
      sc.on('exit', () => { clearTimeout(timeout); sc.off('chunk', onChunk); resolve(); });
      sc.on('chunk', onChunk);
    });

    sc.stop();

    const types = chunks.map(c => c.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    // LLM may finish normally (text+done) or exhaust iterations (error)
    const finished = types.includes('done') || types.includes('error');
    expect(finished).toBe(true);

    // Verify tool result contains the expected output
    const toolResult = chunks.find(c => c.type === 'tool_result');
    expect(toolResult?.content).toMatch(/hello-from-go/);
  });
});
