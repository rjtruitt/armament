/**
 * TDD-RED tests for ChatRenderer — IRC-style chat display matching armament-demo.html.
 *
 * The chat area renders:
 * 1. Channel/agent context headers (── #agent-1 (codegen) ── sonnet-4 ── task: auth-refactor ──)
 * 2. IRC-style messages with timestamps: "14:22:45 <you> some text"
 * 3. System messages: "<system> spawning agent-1 (codegen) for task: auth-refactor"
 * 4. Tool call blocks with open-right borders
 * 5. Agent text output (streaming response)
 * 6. Switching indicators ("── switching to #agent-1 ──")
 */

import { describe, it, expect } from 'vitest';

// Helpers
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// The module under test
import {
  createIrcChatRenderer,
  type ChatMessage,
  type ToolCallBlock,
  type AgentContextHeader,
  type SwitchingIndicator,
  type ChatLine,
} from '../tui/ChatRenderer.js';

describe('ChatRenderer — IRC-style messages', () => {
  it('renders user message with timestamp and sender in header bar', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const msg: ChatMessage = {
      type: 'user',
      sender: 'you',
      content: 'refactor the auth middleware to add refresh token rotation',
      timestamp: new Date('2025-01-15T14:22:45'),
    };
    const lines = renderer.renderMessage(msg);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const joined = lines.map(stripAnsi).join('\n');
    expect(joined).toContain('14:22:45');
    expect(joined).toContain('you');
    expect(joined).toContain('refactor the auth middleware');
  });

  it('renders agent message in boxed format with name', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const msg: ChatMessage = {
      type: 'agent',
      sender: 'agent-1',
      content: 'All session tests pass. Need your input on expiry strategy.',
      timestamp: new Date('2025-01-15T14:22:57'),
    };
    const lines = renderer.renderMessage(msg);
    const joined = lines.map(stripAnsi).join('\n');
    expect(joined).toContain('14:22:57');
    expect(joined).toContain('agent-1');
    expect(joined).toContain('All session tests pass');
  });

  it('renders system message with <system> tag', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const msg: ChatMessage = {
      type: 'system',
      sender: 'system',
      content: 'spawning agent-1 (codegen) for task: auth-refactor',
      timestamp: new Date('2025-01-15T14:22:46'),
    };
    const lines = renderer.renderMessage(msg);
    const plain = stripAnsi(lines[0]);
    expect(plain).toContain('<system>');
    expect(plain).toContain('spawning agent-1');
  });

  it('wraps long messages to fit within width', () => {
    const renderer = createIrcChatRenderer({ width: 60, noColor: true });
    const longText = 'a'.repeat(100);
    const msg: ChatMessage = {
      type: 'user',
      sender: 'you',
      content: longText,
      timestamp: new Date('2025-01-15T14:22:45'),
    };
    const lines = renderer.renderMessage(msg);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(60);
    }
  });

  it('applies gradient colors to user header in color mode', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: false, theme: 'ice' });
    const msg: ChatMessage = {
      type: 'user',
      sender: 'you',
      content: 'hello',
      timestamp: new Date('2025-01-15T14:22:45'),
    };
    const lines = renderer.renderMessage(msg);
    // User header line (index 1, since 0 is empty) should contain ANSI color codes
    expect(lines[1]).toContain('\x1b[');
    const plain = stripAnsi(lines[1]);
    expect(plain).toContain('you');
  });

  it('uses different colors for different message types', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: false, theme: 'red' });
    const userMsg: ChatMessage = { type: 'user', sender: 'you', content: 'hi', timestamp: new Date() };
    const agentMsg: ChatMessage = { type: 'agent', sender: 'agent-1', content: 'hi', timestamp: new Date() };
    const sysMsg: ChatMessage = { type: 'system', sender: 'system', content: 'hi', timestamp: new Date() };

    const userLines = renderer.renderMessage(userMsg);
    const agentLines = renderer.renderMessage(agentMsg);
    const sysLines = renderer.renderMessage(sysMsg);

    // All should have different color patterns (they won't be identical strings)
    // Index 1 is the header line (index 0 is a blank separator line)
    expect(userLines[1]).not.toEqual(agentLines[1]);
    expect(agentLines[1]).not.toEqual(sysLines[1]);
  });

  it('renders timestamp in dim/grey color', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: false, theme: 'red' });
    const msg: ChatMessage = {
      type: 'user',
      sender: 'you',
      content: 'test',
      timestamp: new Date('2025-01-15T09:05:03'),
    };
    const lines = renderer.renderMessage(msg);
    const joined = lines.map(stripAnsi).join('\n');
    // Should have zero-padded time
    expect(joined).toContain('09:05:03');
  });
});

describe('ChatRenderer — Agent context headers', () => {
  it('renders agent context header with dash separators', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const header: AgentContextHeader = {
      agentName: '#agent-1',
      role: 'codegen',
      model: 'sonnet-4',
      task: 'auth-refactor',
    };
    const lines = renderer.renderContextHeader(header);
    expect(lines.length).toBe(1);
    const plain = stripAnsi(lines[0]);
    expect(plain).toContain('#agent-1');
    expect(plain).toContain('codegen');
    expect(plain).toContain('sonnet-4');
    expect(plain).toContain('auth-refactor');
    expect(plain).toContain('──');
  });

  it('renders minimal header with just agent name', () => {
    const renderer = createIrcChatRenderer({ width: 80, noColor: true });
    const header: AgentContextHeader = {
      agentName: '#control',
    };
    const lines = renderer.renderContextHeader(header);
    const plain = stripAnsi(lines[0]);
    expect(plain).toContain('#control');
    expect(plain).toContain('──');
  });

  it('renders switching indicator', () => {
    const renderer = createIrcChatRenderer({ width: 80, noColor: true });
    const sw: SwitchingIndicator = { target: '#agent-1' };
    const lines = renderer.renderSwitchingIndicator(sw);
    const plain = stripAnsi(lines[0]);
    expect(plain).toContain('switching to #agent-1');
    expect(plain).toContain('──');
  });
});

describe('ChatRenderer — Tool call blocks (open-right borders)', () => {
  it('renders tool call with open-right border style', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const tool: ToolCallBlock = {
      name: 'Read',
      description: 'src/auth/middleware.ts',
      status: 'success',
      result: '142 lines',
      latencyMs: 320,
    };
    const lines = renderer.renderToolCall(tool);
    expect(lines.length).toBeGreaterThanOrEqual(3);

    const topLine = stripAnsi(lines[0]);
    // Open-right: ┌─ Read — src/auth/middleware.ts ──
    expect(topLine).toMatch(/^[\s]*┌─/);
    expect(topLine).toContain('Read');
    expect(topLine).toContain('src/auth/middleware.ts');
    // Should NOT have ┐ (open right)
    expect(topLine).not.toContain('┐');

    // Middle line(s): │ content
    const midLine = stripAnsi(lines[1]);
    expect(midLine).toMatch(/^[\s]*│/);

    // Bottom line: └─ (short, open right)
    const botLine = stripAnsi(lines[lines.length - 1]);
    expect(botLine).toMatch(/^[\s]*└─/);
    expect(botLine).not.toContain('┘');
  });

  it('renders tool call result with status icon and metrics', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const tool: ToolCallBlock = {
      name: 'Read',
      description: 'src/auth/middleware.ts',
      status: 'success',
      result: '142 lines',
      latencyMs: 320,
    };
    const lines = renderer.renderToolCall(tool);
    const content = lines.map(l => stripAnsi(l)).join('\n');
    expect(content).toContain('✓');
    expect(content).toContain('142 lines');
    expect(content).toContain('320ms');
  });

  it('renders failed tool call with error icon', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const tool: ToolCallBlock = {
      name: 'Bash',
      description: 'npm test -- --grep "session"',
      status: 'error',
      result: 'exit code 1',
      latencyMs: 4200,
    };
    const lines = renderer.renderToolCall(tool);
    const content = lines.map(l => stripAnsi(l)).join('\n');
    expect(content).toContain('✗');
    expect(content).toContain('exit code 1');
  });

  it('renders successful tool call with pass count', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const tool: ToolCallBlock = {
      name: 'Bash',
      description: 'npm test -- --grep "session"',
      status: 'success',
      result: '12 passed',
      latencyMs: 4200,
    };
    const lines = renderer.renderToolCall(tool);
    const content = lines.map(l => stripAnsi(l)).join('\n');
    expect(content).toContain('✓');
    expect(content).toContain('12 passed');
    expect(content).toContain('4.2s');
  });

  it('renders Edit tool call with line range', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const tool: ToolCallBlock = {
      name: 'Edit',
      description: 'src/auth/middleware.ts:47-62',
      status: 'success',
      result: '+18 -3',
      latencyMs: 210,
    };
    const lines = renderer.renderToolCall(tool);
    const content = lines.map(l => stripAnsi(l)).join('\n');
    expect(content).toContain('Edit');
    expect(content).toContain('src/auth/middleware.ts:47-62');
    expect(content).toContain('+18 -3');
    expect(content).toContain('210ms');
  });

  it('formats latency as seconds when >= 1000ms', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const tool: ToolCallBlock = {
      name: 'Bash',
      description: 'npm test',
      status: 'success',
      result: 'passed',
      latencyMs: 4200,
    };
    const lines = renderer.renderToolCall(tool);
    const content = lines.map(l => stripAnsi(l)).join('\n');
    expect(content).toContain('4.2s');
  });

  it('formats latency as ms when < 1000ms', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const tool: ToolCallBlock = {
      name: 'Read',
      description: 'file.ts',
      status: 'success',
      result: '50 lines',
      latencyMs: 320,
    };
    const lines = renderer.renderToolCall(tool);
    const content = lines.map(l => stripAnsi(l)).join('\n');
    expect(content).toContain('320ms');
    expect(content).not.toContain('0.3s');
  });

  it('applies theme accent color to tool borders in color mode', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: false, theme: 'ice' });
    const tool: ToolCallBlock = {
      name: 'Read',
      description: 'file.ts',
      status: 'success',
      result: 'ok',
      latencyMs: 100,
    };
    const lines = renderer.renderToolCall(tool);
    // Should have ANSI codes
    expect(lines[0]).toContain('\x1b[');
  });
});

describe('ChatRenderer — renderChatLines (full timeline)', () => {
  it('renders a sequence of mixed lines in order', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true });
    const timeline: ChatLine[] = [
      { kind: 'header', data: { agentName: '#control' } },
      { kind: 'message', data: { type: 'user', sender: 'you', content: 'refactor auth', timestamp: new Date('2025-01-15T14:22:45') } },
      { kind: 'message', data: { type: 'system', sender: 'system', content: 'spawning agent-1', timestamp: new Date('2025-01-15T14:22:46') } },
      { kind: 'switch', data: { target: '#agent-1' } },
      { kind: 'header', data: { agentName: '#agent-1', role: 'codegen', model: 'sonnet-4', task: 'auth-refactor' } },
      { kind: 'message', data: { type: 'agent', sender: 'agent-1', content: 'Reading the auth middleware...', timestamp: new Date('2025-01-15T14:22:47') } },
      { kind: 'tool', data: { name: 'Read', description: 'src/auth/middleware.ts', status: 'success', result: '142 lines', latencyMs: 320 } },
      { kind: 'message', data: { type: 'agent', sender: 'agent-1', content: 'Adding rotation logic to validateSession.', timestamp: new Date('2025-01-15T14:22:49') } },
      { kind: 'tool', data: { name: 'Edit', description: 'src/auth/middleware.ts:47-62', status: 'success', result: '+18 -3', latencyMs: 210 } },
    ];
    const output = renderer.renderChatLines(timeline);
    expect(output.length).toBeGreaterThan(10);

    const fullText = output.map(l => stripAnsi(l)).join('\n');
    expect(fullText).toContain('#control');
    expect(fullText).toContain('you');
    expect(fullText).toContain('refactor auth');
    expect(fullText).toContain('spawning agent-1');
    expect(fullText).toContain('switching to #agent-1');
    expect(fullText).toContain('sonnet-4');
    expect(fullText).toContain('Read');
    expect(fullText).toContain('142 lines');
    expect(fullText).toContain('Edit');
  });

  it('returns flat array of strings (one per terminal row)', () => {
    const renderer = createIrcChatRenderer({ width: 80, noColor: true });
    const timeline: ChatLine[] = [
      { kind: 'message', data: { type: 'user', sender: 'you', content: 'hi', timestamp: new Date() } },
    ];
    const output = renderer.renderChatLines(timeline);
    expect(Array.isArray(output)).toBe(true);
    for (const line of output) {
      expect(typeof line).toBe('string');
      expect(line).not.toContain('\n');
    }
  });
});

describe('ChatRenderer — tool call indentation within agent context', () => {
  it('indents tool blocks by 4 spaces within agent context', () => {
    const renderer = createIrcChatRenderer({ width: 100, noColor: true, indent: 4 });
    const tool: ToolCallBlock = {
      name: 'Read',
      description: 'file.ts',
      status: 'success',
      result: '50 lines',
      latencyMs: 100,
    };
    const lines = renderer.renderToolCall(tool);
    for (const line of lines) {
      const plain = stripAnsi(line);
      if (plain.trim().length > 0) {
        expect(plain).toMatch(/^[\s]{4}/);
      }
    }
  });
});
