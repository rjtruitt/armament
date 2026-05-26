/**
 * TDD-RED tests for AgentInputPrompt — renders agent questions/approval requests
 * in open-right bordered blocks with selectable options.
 *
 * Covers:
 * 1. Multiple-choice questions from agents (expiry strategy, etc.)
 * 2. File write approval (before/after diff view, editable)
 * 3. New file creation approval
 * 4. Keyboard navigation (↑↓ select, Enter confirm, Ctrl+Z defer, /skip)
 * 5. Open-right border style matching demo
 * 6. Auto-approve mode bypass
 */

import { describe, it, expect } from 'vitest';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

import {
  createAgentInputPrompt,
  type PromptQuestion,
  type FileApproval,
  type PromptState,
  type PromptAction,
} from '../tui/AgentInputPrompt.js';

describe('AgentInputPrompt — Multiple choice questions', () => {
  it('renders prompt title with open-right border', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const question: PromptQuestion = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      title: 'agent-1 needs input',
      body: 'The refresh token rotation can use one of these strategies.\nWhich approach fits your security requirements?',
      options: [
        { label: 'Sliding window (extend on each use, 7-day max)', value: 'sliding' },
        { label: 'Absolute expiry (force re-auth after 24h)', value: 'absolute' },
        { label: 'Hybrid (slide for 24h, then hard cut at 7d)', value: 'hybrid' },
        { label: '[other — type custom response]', value: 'other' },
      ],
    };
    const lines = prompt.render(question);
    const topLine = stripAnsi(lines[0]);
    // Open-right: ┌─ agent-1 needs input ────── (no ┐)
    expect(topLine).toMatch(/┌─/);
    expect(topLine).toContain('agent-1 needs input');
    expect(topLine).not.toContain('┐');
  });

  it('renders body text with left border only', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const question: PromptQuestion = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      title: 'input needed',
      body: 'Which approach?',
      options: [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
      ],
    };
    const lines = prompt.render(question);
    // Body lines should start with │
    const bodyLines = lines.filter(l => {
      const plain = stripAnsi(l);
      return plain.includes('Which approach');
    });
    expect(bodyLines.length).toBeGreaterThan(0);
    expect(stripAnsi(bodyLines[0])).toMatch(/│/);
  });

  it('renders numbered options with selection indicator', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const question: PromptQuestion = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      title: 'input',
      body: 'Pick one',
      options: [
        { label: 'Sliding window', value: 'sliding' },
        { label: 'Absolute expiry', value: 'absolute' },
        { label: 'Hybrid', value: 'hybrid' },
      ],
    };
    const lines = prompt.render(question);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    // Should have numbered options
    expect(text).toContain('1.');
    expect(text).toContain('Sliding window');
    expect(text).toContain('2.');
    expect(text).toContain('Absolute expiry');
    expect(text).toContain('3.');
    expect(text).toContain('Hybrid');
  });

  it('shows selection cursor (›) on the selected option', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const question: PromptQuestion = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      title: 'input',
      body: 'Pick',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      selectedIndex: 0,
    };
    const lines = prompt.render(question);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    // First option should have › indicator
    expect(text).toContain('›');
    // It should be on the first option line
    const optionLines = lines.filter(l => stripAnsi(l).match(/\d\./));
    expect(stripAnsi(optionLines[0])).toContain('›');
  });

  it('renders bottom border as └── (short, open right)', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const question: PromptQuestion = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      title: 'input',
      body: 'Pick',
      options: [{ label: 'A', value: 'a' }],
    };
    const lines = prompt.render(question);
    const lastLine = stripAnsi(lines[lines.length - 1]);
    expect(lastLine).toMatch(/└─/);
    expect(lastLine).not.toContain('┘');
  });

  it('renders footer hint bar with navigation keys', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const question: PromptQuestion = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      title: 'input',
      body: 'Pick',
      options: [{ label: 'A', value: 'a' }],
    };
    const lines = prompt.render(question);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    // Should show navigation hints
    expect(text).toContain('navigate');
    expect(text).toContain('enter');
    expect(text).toContain('select');
  });

  it('handles keyboard navigation — down moves selection', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const state: PromptState = { selectedIndex: 0, optionCount: 3 };
    const result = prompt.handleKey('down', state);
    expect(result.selectedIndex).toBe(1);
  });

  it('handles keyboard navigation — up moves selection', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const state: PromptState = { selectedIndex: 2, optionCount: 3 };
    const result = prompt.handleKey('up', state);
    expect(result.selectedIndex).toBe(1);
  });

  it('handles keyboard navigation — wraps at bounds', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const stateTop: PromptState = { selectedIndex: 0, optionCount: 3 };
    const resultTop = prompt.handleKey('up', stateTop);
    expect(resultTop.selectedIndex).toBe(2); // wrap to bottom

    const stateBot: PromptState = { selectedIndex: 2, optionCount: 3 };
    const resultBot = prompt.handleKey('down', stateBot);
    expect(resultBot.selectedIndex).toBe(0); // wrap to top
  });

  it('handles enter — returns accept action with selected value', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const state: PromptState = { selectedIndex: 1, optionCount: 3 };
    const result = prompt.handleKey('enter', state);
    expect(result.action).toBe('accept');
    expect(result.selectedIndex).toBe(1);
  });

  it('handles ctrl+z — returns defer action', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const state: PromptState = { selectedIndex: 0, optionCount: 3 };
    const result = prompt.handleKey('ctrl+z', state);
    expect(result.action).toBe('defer');
  });

  it('handles /skip — returns skip action', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const state: PromptState = { selectedIndex: 0, optionCount: 3 };
    const result = prompt.handleKey('/skip', state);
    expect(result.action).toBe('skip');
  });
});

describe('AgentInputPrompt — File write approval', () => {
  it('renders file approval prompt with before/after sections', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/auth/middleware.ts',
      operation: 'edit',
      before: 'const token = getToken(req);\nvalidateToken(token);',
      after: 'const token = getToken(req);\nconst refreshed = await rotateToken(token);\nvalidateToken(refreshed);',
      linesChanged: { added: 2, removed: 0 },
    };
    const lines = prompt.renderFileApproval(approval);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    expect(text).toContain('src/auth/middleware.ts');
    expect(text).toContain('edit');
  });

  it('shows diff with - lines for removed and + lines for added', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/config.ts',
      operation: 'edit',
      before: 'const timeout = 5000;',
      after: 'const timeout = 10000;',
      linesChanged: { added: 1, removed: 1 },
    };
    const lines = prompt.renderFileApproval(approval);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    expect(text).toContain('-');
    expect(text).toContain('const timeout = 5000');
    expect(text).toContain('+');
    expect(text).toContain('const timeout = 10000');
  });

  it('shows create operation for new files', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/auth/tokenRotation.ts',
      operation: 'create',
      before: null,
      after: 'export function rotateToken(token: string): string {\n  return refreshToken(token);\n}',
      linesChanged: { added: 3, removed: 0 },
    };
    const lines = prompt.renderFileApproval(approval);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    expect(text).toContain('create');
    expect(text).toContain('src/auth/tokenRotation.ts');
    expect(text).toContain('rotateToken');
  });

  it('uses open-right border style for file approval block', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'edit',
      before: 'old',
      after: 'new',
      linesChanged: { added: 1, removed: 1 },
    };
    const lines = prompt.renderFileApproval(approval);
    const topLine = stripAnsi(lines[0]);
    expect(topLine).toMatch(/┌─/);
    expect(topLine).not.toContain('┐');
    const botLine = stripAnsi(lines[lines.length - 1]);
    expect(botLine).toMatch(/└─/);
    expect(botLine).not.toContain('┘');
  });

  it('renders action buttons: [accept] [edit] [reject]', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'edit',
      before: 'old',
      after: 'new',
      linesChanged: { added: 1, removed: 1 },
    };
    const lines = prompt.renderFileApproval(approval);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    expect(text).toMatch(/accept/i);
    expect(text).toMatch(/edit/i);
    expect(text).toMatch(/reject/i);
  });

  it('handles accept action for file approval', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const state: PromptState = { selectedIndex: 0, optionCount: 3, mode: 'file-approval' };
    const result = prompt.handleKey('enter', state);
    expect(result.action).toBe('accept');
  });

  it('handles edit action — returns edit mode flag', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const state: PromptState = { selectedIndex: 1, optionCount: 3, mode: 'file-approval' };
    const result = prompt.handleKey('enter', state);
    expect(result.action).toBe('edit');
  });

  it('handles reject action for file approval', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const state: PromptState = { selectedIndex: 2, optionCount: 3, mode: 'file-approval' };
    const result = prompt.handleKey('enter', state);
    expect(result.action).toBe('reject');
  });

  it('shows line count summary (+N -M)', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'edit',
      before: 'a\nb\nc',
      after: 'a\nb\nc\nd\ne',
      linesChanged: { added: 2, removed: 0 },
    };
    const lines = prompt.renderFileApproval(approval);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    expect(text).toContain('+2');
  });
});

describe('AgentInputPrompt — Auto-approve mode', () => {
  it('in auto-approve mode, skips rendering and returns accept immediately', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true, autoApprove: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'edit',
      before: 'old',
      after: 'new',
      linesChanged: { added: 1, removed: 1 },
    };
    const result = prompt.checkAutoApprove(approval);
    expect(result).toBe(true);
  });

  it('auto-approve respects file path allowlist', () => {
    const prompt = createAgentInputPrompt({
      width: 80,
      noColor: true,
      autoApprove: true,
      autoApprovePaths: ['src/**'],
    });
    const srcApproval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'edit',
      before: 'old',
      after: 'new',
      linesChanged: { added: 1, removed: 1 },
    };
    const configApproval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: '.env',
      operation: 'edit',
      before: 'old',
      after: 'new',
      linesChanged: { added: 1, removed: 1 },
    };
    expect(prompt.checkAutoApprove(srcApproval)).toBe(true);
    expect(prompt.checkAutoApprove(configApproval)).toBe(false);
  });

  it('auto-approve never approves .env or credential files', () => {
    const prompt = createAgentInputPrompt({
      width: 80,
      noColor: true,
      autoApprove: true,
      autoApprovePaths: ['**'],
    });
    const envFile: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: '.env',
      operation: 'edit',
      before: 'old',
      after: 'new',
      linesChanged: { added: 1, removed: 1 },
    };
    const credFile: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'credentials.json',
      operation: 'edit',
      before: 'old',
      after: 'new',
      linesChanged: { added: 1, removed: 1 },
    };
    expect(prompt.checkAutoApprove(envFile)).toBe(false);
    expect(prompt.checkAutoApprove(credFile)).toBe(false);
  });
});

describe('AgentInputPrompt — Editable after content', () => {
  it('enters edit mode and returns modified content', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'edit',
      before: 'const x = 1;',
      after: 'const x = 2;',
      linesChanged: { added: 1, removed: 1 },
    };
    // Enter edit mode
    const editState = prompt.enterEditMode(approval);
    expect(editState.editable).toBe(true);
    expect(editState.content).toBe('const x = 2;');
    expect(editState.cursorLine).toBe(0);
    expect(editState.cursorCol).toBe(0);
  });

  it('renders editable content with cursor line highlighted', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'create',
      before: null,
      after: 'line 1\nline 2\nline 3',
      linesChanged: { added: 3, removed: 0 },
    };
    const editState = prompt.enterEditMode(approval);
    const lines = prompt.renderEditMode(editState);
    const text = lines.map(l => stripAnsi(l)).join('\n');
    expect(text).toContain('line 1');
    expect(text).toContain('line 2');
    expect(text).toContain('line 3');
  });

  it('handles basic edit operations (insert char, delete, newline)', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'edit',
      before: 'old',
      after: 'hello',
      linesChanged: { added: 1, removed: 1 },
    };
    let editState = prompt.enterEditMode(approval);
    // Move to end and type
    editState = prompt.editKey('end', editState);
    editState = prompt.editKey('!', editState);
    expect(editState.content).toBe('hello!');
  });

  it('returns final edited content on accept', () => {
    const prompt = createAgentInputPrompt({ width: 100, noColor: true });
    const approval: FileApproval = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      filePath: 'src/test.ts',
      operation: 'edit',
      before: 'old',
      after: 'new content here',
      linesChanged: { added: 1, removed: 1 },
    };
    let editState = prompt.enterEditMode(approval);
    // Simulate accepting
    const result = prompt.acceptEdit(editState);
    expect(result.content).toBe('new content here');
    expect(result.filePath).toBe('src/test.ts');
    expect(result.action).toBe('accept-edited');
  });
});

describe('AgentInputPrompt — /prompts queue', () => {
  it('queues prompts when multiple arrive simultaneously', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const q1: PromptQuestion = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      title: 'Question 1',
      body: 'First?',
      options: [{ label: 'Yes', value: 'yes' }],
    };
    const q2: PromptQuestion = {
      agentId: 'agent-2',
      agentName: 'agent-2',
      title: 'Question 2',
      body: 'Second?',
      options: [{ label: 'No', value: 'no' }],
    };
    prompt.enqueue(q1);
    prompt.enqueue(q2);
    expect(prompt.getQueueLength()).toBe(2);
    expect(prompt.peek()?.title).toBe('Question 1');
  });

  it('dequeues after answering current prompt', () => {
    const prompt = createAgentInputPrompt({ width: 80, noColor: true });
    const q1: PromptQuestion = {
      agentId: 'agent-1',
      agentName: 'agent-1',
      title: 'Q1',
      body: 'First',
      options: [{ label: 'A', value: 'a' }],
    };
    const q2: PromptQuestion = {
      agentId: 'agent-2',
      agentName: 'agent-2',
      title: 'Q2',
      body: 'Second',
      options: [{ label: 'B', value: 'b' }],
    };
    prompt.enqueue(q1);
    prompt.enqueue(q2);
    prompt.dequeue();
    expect(prompt.getQueueLength()).toBe(1);
    expect(prompt.peek()?.title).toBe('Q2');
  });
});
