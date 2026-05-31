#!/usr/bin/env node
/**
 * Mock sidecar for testing the IteratioSidecar TS adapter.
 * Speaks the same JSON-line protocol so TS integration tests don't need the Go binary.
 *
 * Usage: ITERATIO_SIDECAR_BIN=path/to/this/file npm test
 */
const rl = require('readline').createInterface({ input: process.stdin });
let turn = 0;

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === 'interrupt') {
      process.exit(0);
    }
    if (msg.type === 'message') {
      turn++;
      // Simulate a full agent turn
      const prefix = `[go-mock turn ${turn}] `;
      console.log(JSON.stringify({ type: 'text', text: prefix + 'Processing: ' + (msg.text?.slice(0, 40) ?? '') }));
      console.log(JSON.stringify({ type: 'thinking', text: 'Let me think about this...' }));
      console.log(JSON.stringify({
        type: 'tool_call', id: 'tc-mock-1', name: 'bash',
        args: { command: 'echo hello from mock' },
      }));
      console.log(JSON.stringify({
        type: 'tool_result', id: 'tc-mock-1',
        content: 'hello from mock\n', toolName: 'bash',
      }));
      console.log(JSON.stringify({ type: 'text', text: prefix + 'All done!' }));
      console.log(JSON.stringify({
        type: 'done',
        usage: { inputTokens: 10 * turn, outputTokens: 20 * turn, totalTokens: 30 * turn, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }));
    }
  } catch (e) {
    console.error('mock-sidecar parse error:', e.message);
  }
});
