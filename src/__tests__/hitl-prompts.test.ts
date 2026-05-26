/**
 * TDD test suite for Human-in-the-Loop (HITL) prompt system.
 * Handles agent questions, confirmations, choices, and freeform input
 * rendered in the IRC-style terminal with ANSI chrome.
 * All tests RED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPromptSystem, createControlChannel, makeRequest } from '../core/PromptSystem';

describe('HITL Prompt System', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIRM PROMPTS (yes/no)
  // ─────────────────────────────────────────────────────────────────────────

  describe('confirm prompts', () => {
    it('should display yes/no prompt from agent', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', title: 'Proceed with deployment?' });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toContain('Proceed with deployment?');
    });

    it('should show agent name in prompt header', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', agentName: 'Deployer' });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toContain('Deployer');
    });

    it('should show [Y/n] indicator for default-yes', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', defaultValue: true });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toMatch(/\[Y\/n\]/i);
    });

    it('should show [y/N] indicator for default-no', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', defaultValue: false });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toMatch(/\[y\/N\]/i);
    });

    it('should accept "y" as true', () => {
      const prompt = createPromptSystem();
      const response = prompt.handleInput('y', makeRequest({ type: 'confirm' }));
      expect(response.value).toBe(true);
    });

    it('should accept "yes" as true', () => {
      const prompt = createPromptSystem();
      const response = prompt.handleInput('yes', makeRequest({ type: 'confirm' }));
      expect(response.value).toBe(true);
    });

    it('should accept "n" as false', () => {
      const prompt = createPromptSystem();
      const response = prompt.handleInput('n', makeRequest({ type: 'confirm' }));
      expect(response.value).toBe(false);
    });

    it('should accept empty input as default value', () => {
      const prompt = createPromptSystem();
      const response = prompt.handleInput('', makeRequest({ type: 'confirm', defaultValue: true }));
      expect(response.value).toBe(true);
    });

    it('should reject invalid input for confirm', () => {
      const prompt = createPromptSystem();
      const response = prompt.handleInput('maybe', makeRequest({ type: 'confirm' }));
      expect(response.value).toBeNull();
    });

    it('should render with box border', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm' });
      const rendered = prompt.render(request, 80, 24);
      const output = rendered.join('\n');
      expect(output).toMatch(/[┌┐└┘│─╭╮╰╯]/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SELECT PROMPTS (pick one from numbered list)
  // ─────────────────────────────────────────────────────────────────────────

  describe('select prompts', () => {
    it('should display numbered choices', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [
          { key: 1, label: 'Option A' },
          { key: 2, label: 'Option B' },
          { key: 3, label: 'Option C' },
        ],
      });
      const rendered = prompt.render(request, 80, 24);
      const output = rendered.join('\n');
      expect(output).toContain('1');
      expect(output).toContain('Option A');
      expect(output).toContain('2');
      expect(output).toContain('Option B');
      expect(output).toContain('3');
      expect(output).toContain('Option C');
    });

    it('should highlight currently selected choice', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'A' }, { key: 2, label: 'B' }],
      });
      const rendered = prompt.renderWithState(request, { selectedIndex: 1 }, 80, 24);
      const output = rendered.join('\n');
      expect(output).toContain('\x1b[7m'); // inverse for highlight
    });

    it('should accept number input to select', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'A' }, { key: 2, label: 'B' }],
      });
      const response = prompt.handleInput('2', request);
      expect(response.value).toBe(2);
    });

    it('should show choice descriptions when present', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'Sonnet', description: 'Fast and capable' }],
      });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toContain('Fast and capable');
    });

    it('should show disabled choices grayed out', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'Opus', disabled: true }],
      });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toContain('\x1b['); // styled for disabled
    });

    it('should not accept disabled choice selection', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [
          { key: 1, label: 'A', disabled: true },
          { key: 2, label: 'B' },
        ],
      });
      const response = prompt.handleInput('1', request);
      expect(response.value).toBeNull();
    });

    it('should scroll long choice lists', () => {
      const choices = Array.from({ length: 30 }, (_, i) => ({ key: i + 1, label: `Choice ${i + 1}` }));
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select', choices });
      const rendered = prompt.render(request, 80, 10);
      const output = rendered.join('\n');
      expect(output).toContain('▼'); // scroll indicator
    });

    it('should navigate with arrow keys', () => {
      const prompt = createPromptSystem();
      const state = { selectedIndex: 0 };
      prompt.handleKey('down', state);
      expect(state.selectedIndex).toBe(1);
      prompt.handleKey('up', state);
      expect(state.selectedIndex).toBe(0);
    });

    it('should wrap around at list boundaries', () => {
      const prompt = createPromptSystem();
      const state = { selectedIndex: 0, totalChoices: 3 };
      prompt.handleKey('up', state);
      expect(state.selectedIndex).toBe(2);
    });

    it('should accept Enter to confirm current selection', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'A' }, { key: 2, label: 'B' }],
      });
      const response = prompt.handleConfirm(request, { selectedIndex: 1 });
      expect(response.value).toBe(2);
    });

    it('should show default indicator on pre-selected choice', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'A' }, { key: 2, label: 'B', default: true }],
      });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toMatch(/default|→|►/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MULTI-SELECT PROMPTS (pick many from list)
  // ─────────────────────────────────────────────────────────────────────────

  describe('multi-select prompts', () => {
    it('should show checkboxes next to choices', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'multi-select',
        choices: [{ key: 1, label: 'A' }, { key: 2, label: 'B' }],
      });
      const rendered = prompt.render(request, 80, 24);
      const output = rendered.join('\n');
      expect(output).toMatch(/[☐☑\[\]◻◼○●]/);
    });

    it('should toggle selection with space', () => {
      const prompt = createPromptSystem();
      const state = { selectedIndices: [], cursorIndex: 0 };
      prompt.handleKey('space', state);
      expect(state.selectedIndices).toContain(0);
    });

    it('should untoggle with second space', () => {
      const prompt = createPromptSystem();
      const state = { selectedIndices: [0], cursorIndex: 0 };
      prompt.handleKey('space', state);
      expect(state.selectedIndices).not.toContain(0);
    });

    it('should show count of selected items', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'multi-select',
        choices: [{ key: 1, label: 'A' }, { key: 2, label: 'B' }, { key: 3, label: 'C' }],
      });
      const rendered = prompt.renderWithState(request, { selectedIndices: [0, 2] }, 80, 24);
      expect(rendered.join('\n')).toContain('2');
    });

    it('should return array of selected values', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'multi-select',
        choices: [{ key: 1, label: 'A' }, { key: 2, label: 'B' }, { key: 3, label: 'C' }],
      });
      const response = prompt.handleConfirm(request, { selectedIndices: [0, 2] });
      expect(response.value).toEqual([1, 3]);
    });

    it('should support "select all" shortcut', () => {
      const prompt = createPromptSystem();
      const state = { selectedIndices: [], totalChoices: 5 };
      prompt.handleKey('ctrl+a', state);
      expect(state.selectedIndices).toHaveLength(5);
    });

    it('should support "select none" shortcut', () => {
      const prompt = createPromptSystem();
      const state = { selectedIndices: [0, 1, 2], totalChoices: 3 };
      prompt.handleKey('ctrl+d', state);
      expect(state.selectedIndices).toHaveLength(0);
    });

    it('should require at least one selection when required=true', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'multi-select', required: true, choices: [{ key: 1, label: 'A' }] });
      const response = prompt.handleConfirm(request, { selectedIndices: [] });
      expect(response.value).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEXT INPUT PROMPTS (freeform)
  // ─────────────────────────────────────────────────────────────────────────

  describe('text input prompts', () => {
    it('should show input box with cursor', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text', title: 'Enter branch name:' });
      const rendered = prompt.render(request, 80, 24);
      const output = rendered.join('\n');
      expect(output).toContain('Enter branch name:');
      expect(output).toMatch(/[▌█_│|]/); // cursor indicator
    });

    it('should show placeholder text when empty', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text', placeholder: 'feat/my-feature' });
      const rendered = prompt.renderWithState(request, { currentInput: '' }, 80, 24);
      expect(rendered.join('\n')).toContain('feat/my-feature');
    });

    it('should accept freeform text submission', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text' });
      const response = prompt.handleInput('my custom branch', request);
      expect(response.value).toBe('my custom branch');
    });

    it('should enforce maxLength', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text', maxLength: 10 });
      const response = prompt.handleInput('this is way too long', request);
      expect(response.value).toBeNull();
    });

    it('should run custom validator', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'text',
        validator: (input: string) => input.startsWith('feat/') ? null : 'Must start with feat/',
      });
      const response = prompt.handleInput('bug/fix', request);
      expect(response.value).toBeNull();
    });

    it('should show validation error message', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'text',
        validator: () => 'Invalid input',
      });
      const rendered = prompt.renderWithState(request, { error: 'Invalid input' }, 80, 24);
      expect(rendered.join('\n')).toContain('Invalid input');
    });

    it('should show character count when maxLength set', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text', maxLength: 50 });
      const rendered = prompt.renderWithState(request, { currentInput: 'hello' }, 80, 24);
      expect(rendered.join('\n')).toContain('5/50');
    });

    it('should accept empty input when required=false', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text', required: false });
      const response = prompt.handleInput('', request);
      expect(response.value).toBe('');
      expect(response.cancelled).toBe(false);
    });

    it('should reject empty input when required=true', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text', required: true });
      const response = prompt.handleInput('', request);
      expect(response.value).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SELECT-OR-TEXT PROMPTS (numbered choices + "Other" freeform)
  // ─────────────────────────────────────────────────────────────────────────

  describe('select-or-text prompts', () => {
    it('should show numbered choices with "Other" option', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select-or-text',
        choices: [
          { key: 1, label: 'Sonnet' },
          { key: 2, label: 'Opus' },
          { key: 3, label: 'Haiku' },
        ],
      });
      const rendered = prompt.render(request, 80, 24);
      const output = rendered.join('\n');
      expect(output).toContain('Sonnet');
      expect(output).toContain('Opus');
      expect(output).toContain('Haiku');
      expect(output).toMatch(/other|custom/i);
    });

    it('should accept number to pick from list', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select-or-text',
        choices: [{ key: 1, label: 'Sonnet' }, { key: 2, label: 'Opus' }],
      });
      const response = prompt.handleInput('1', request);
      expect(response.value).toBe(1);
    });

    it('should accept freeform text as "other"', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select-or-text',
        choices: [{ key: 1, label: 'Sonnet' }, { key: 2, label: 'Opus' }],
      });
      const response = prompt.handleInput('gpt-4o', request);
      expect(response.value).toBe('gpt-4o');
    });

    it('should switch to text mode when "other" selected', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select-or-text',
        choices: [{ key: 1, label: 'A' }, { key: 2, label: 'B' }],
      });
      const state = { isTextMode: false, selectedIndex: 2 }; // "other" is last
      prompt.handleKey('enter', state);
      expect(state.isTextMode).toBe(true);
    });

    it('should show text input box when in text mode', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select-or-text', choices: [{ key: 1, label: 'A' }] });
      const rendered = prompt.renderWithState(request, { isTextMode: true, textInput: '' }, 80, 24);
      const output = rendered.join('\n');
      expect(output).toMatch(/[▌█_│|]/); // cursor in text input
    });

    it('should escape text mode with Escape key', () => {
      const prompt = createPromptSystem();
      const state = { isTextMode: true };
      prompt.handleKey('escape', state);
      expect(state.isTextMode).toBe(false);
    });

    it('should show placeholder in text box', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select-or-text',
        placeholder: 'Type model name...',
        choices: [{ key: 1, label: 'A' }],
      });
      const rendered = prompt.renderWithState(request, { isTextMode: true, textInput: '' }, 80, 24);
      expect(rendered.join('\n')).toContain('Type model name...');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INFO-THEN-ACT PROMPTS (wall of text + choices at bottom)
  // ─────────────────────────────────────────────────────────────────────────

  describe('info-then-act prompts', () => {
    it('should show body text in scrollable area', () => {
      const body = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10';
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'info-then-act', body, choices: [{ key: 1, label: 'OK' }] });
      const rendered = prompt.render(request, 80, 10);
      const output = rendered.join('\n');
      expect(output).toContain('Line 1');
    });

    it('should show scroll indicators when body overflows', () => {
      const body = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join('\n');
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'info-then-act', body, choices: [{ key: 1, label: 'OK' }] });
      const rendered = prompt.render(request, 80, 10);
      expect(rendered.join('\n')).toContain('▼');
    });

    it('should scroll body with up/down keys', () => {
      const prompt = createPromptSystem();
      const state = { scrollPosition: 0 };
      prompt.handleKey('down', state);
      expect(state.scrollPosition).toBeGreaterThan(0);
    });

    it('should scroll body with page up/down', () => {
      const prompt = createPromptSystem();
      const state = { scrollPosition: 0, pageSize: 10 };
      prompt.handleKey('pagedown', state);
      expect(state.scrollPosition).toBe(10);
    });

    it('should show choices pinned at bottom of viewport', () => {
      const body = Array.from({ length: 50 }, (_, i) => `Line ${i}`).join('\n');
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'info-then-act',
        body,
        choices: [{ key: 1, label: 'Approve' }, { key: 2, label: 'Reject' }],
      });
      const rendered = prompt.render(request, 80, 20);
      const lastLines = rendered.slice(-5).join('\n');
      expect(lastLines).toContain('Approve');
      expect(lastLines).toContain('Reject');
    });

    it('should show separator between body and choices', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'info-then-act',
        body: 'Some info',
        choices: [{ key: 1, label: 'OK' }],
      });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toMatch(/[─━═╌┄]/);
    });

    it('should accept Tab to switch focus from body to choices', () => {
      const prompt = createPromptSystem();
      const state = { focusArea: 'body' as 'body' | 'choices' };
      prompt.handleKey('tab', state);
      expect(state.focusArea).toBe('choices');
    });

    it('should render markdown-ish body content (bold, code blocks)', () => {
      const body = '**Important:** Run `npm test` before proceeding.\n\n```\nnpm run build\nnpm test\n```';
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'info-then-act', body, choices: [{ key: 1, label: 'OK' }] });
      const rendered = prompt.render(request, 80, 24);
      const output = rendered.join('\n');
      expect(output).toContain('\x1b[1m'); // bold
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TIMEOUT & CANCELLATION
  // ─────────────────────────────────────────────────────────────────────────

  describe('timeout and cancellation', () => {
    it('should show countdown when timeout set', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', timeout: 30000 });
      const rendered = prompt.renderWithState(request, { remainingMs: 25000 }, 80, 24);
      expect(rendered.join('\n')).toMatch(/25|0:25/);
    });

    it('should auto-respond with default on timeout', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', timeout: 100, defaultValue: true });
      const response = prompt.handleTimeout(request);
      expect(response.value).toBe(true);
      expect(response.timedOut).toBe(true);
    });

    it('should cancel prompt on Ctrl+C', () => {
      const prompt = createPromptSystem();
      const response = prompt.handleCancel(makeRequest({ type: 'select' }));
      expect(response.cancelled).toBe(true);
      expect(response.value).toBeNull();
    });

    it('should cancel prompt on Escape (for non-required)', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select', required: false });
      const state = {};
      prompt.handleKey('escape', state);
      expect(state).toHaveProperty('cancelled');
    });

    it('should not allow Escape cancel when required=true', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select', required: true });
      const state = { cancelled: false };
      prompt.handleKey('escape', state);
      expect(state.cancelled).toBe(false);
    });

    it('should show timeout bar animation', () => {
      const prompt = createPromptSystem();
      const bar = prompt.renderTimeoutBar(30000, 15000, 40);
      expect(bar).toContain('█');
      expect(bar).toContain('░');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RENDERING & THEMING
  // ─────────────────────────────────────────────────────────────────────────

  describe('prompt rendering', () => {
    it('should render within given width constraints', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select', choices: [{ key: 1, label: 'A' }] });
      const rendered = prompt.render(request, 60, 24);
      rendered.forEach(line => {
        expect(stripAnsi(line).length).toBeLessThanOrEqual(60);
      });
    });

    it('should render within given height constraints', () => {
      const prompt = createPromptSystem();
      const choices = Array.from({ length: 50 }, (_, i) => ({ key: i, label: `C${i}` }));
      const request = makeRequest({ type: 'select', choices });
      const rendered = prompt.render(request, 80, 15);
      expect(rendered.length).toBeLessThanOrEqual(15);
    });

    it('should use box-drawing characters for border', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', title: 'Test' });
      const rendered = prompt.render(request, 80, 24);
      const output = rendered.join('\n');
      expect(output).toMatch(/[┌┐└┘│─╭╮╰╯]/);
    });

    it('should colorize title differently from body', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'info-then-act', title: 'Review', body: 'details' });
      const rendered = prompt.render(request, 80, 24);
      const output = rendered.join('\n');
      expect(output).toContain('\x1b[1m'); // bold for title
    });

    it('should dim disabled choices', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'Disabled', disabled: true }],
      });
      const rendered = prompt.render(request, 80, 24);
      expect(rendered.join('\n')).toContain('\x1b[');
    });

    it('should show choice previews in side panel when available', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'Sonnet', preview: 'Fast, good for coding' }],
      });
      const rendered = prompt.renderWithState(request, { selectedIndex: 0, showPreview: true }, 120, 24);
      expect(rendered.join('\n')).toContain('Fast, good for coding');
    });

    it('should wrap long text gracefully', () => {
      const longTitle = 'A'.repeat(100);
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', title: longTitle });
      const rendered = prompt.render(request, 40, 24);
      rendered.forEach(line => {
        expect(stripAnsi(line).length).toBeLessThanOrEqual(40);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INTEGRATION WITH CHAT PANE
  // ─────────────────────────────────────────────────────────────────────────

  describe('chat pane integration', () => {
    it('should display prompt inline in chat output', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', title: 'Continue?' });
      const chatLine = prompt.renderAsChatLine(request);
      expect(chatLine).toContain('Continue?');
    });

    it('should show agent name as sender of prompt', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select', agentName: 'Coder' });
      const chatLine = prompt.renderAsChatLine(request);
      expect(chatLine).toContain('Coder');
    });

    it('should mark prompt as active in chat', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select' });
      expect(prompt.isActive(request.id)).toBe(true);
    });

    it('should mark prompt as resolved after response', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm' });
      prompt.handleInput('y', request);
      expect(prompt.isActive(request.id)).toBe(false);
    });

    it('should show response summary in chat after answering', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({
        type: 'select',
        choices: [{ key: 1, label: 'Sonnet' }, { key: 2, label: 'Opus' }],
      });
      const response = prompt.handleInput('2', request);
      const summary = prompt.renderResponseSummary(request, response);
      expect(summary).toContain('Opus');
    });

    it('should show cancelled prompt as dimmed in chat', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select' });
      const response = prompt.handleCancel(request);
      const summary = prompt.renderResponseSummary(request, response);
      expect(summary).toContain('\x1b['); // styled
    });

    it('should show timed-out prompt indicator', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm', timeout: 1000 });
      const response = prompt.handleTimeout(request);
      const summary = prompt.renderResponseSummary(request, response);
      expect(summary).toMatch(/timeout|expired/i);
    });

    it('should steal focus from chat input when prompt active', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text' });
      expect(prompt.shouldCaptureFocus(request)).toBe(true);
    });

    it('should return focus to chat input after prompt resolved', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'text' });
      prompt.handleInput('answer', request);
      expect(prompt.shouldCaptureFocus(request)).toBe(false);
    });

    it('should defer prompt back to queue on Ctrl+Z', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select', choices: [{ key: 1, label: 'A' }] });
      prompt.enqueue(request);
      prompt.defer();
      expect(prompt.shouldCaptureFocus(request)).toBe(false);
    });

    it('should dim prompt box when deferred', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'select' });
      const rendered = prompt.renderDeferred(request, 80, 24);
      expect(rendered.join('\n')).toContain('\x1b[');
    });

    it('should restore prompt focus with Ctrl+Z again (toggle)', () => {
      const prompt = createPromptSystem();
      prompt.defer();
      prompt.recall();
      expect(prompt.isFocusCaptured()).toBe(true);
    });

    it('should allow /commands while prompt is deferred', () => {
      const prompt = createPromptSystem();
      prompt.defer();
      expect(prompt.shouldCaptureFocus(makeRequest({ type: 'confirm' }))).toBe(false);
    });

    it('should show deferred indicator in status bar', () => {
      const prompt = createPromptSystem();
      prompt.defer();
      const segment = prompt.renderStatusBarSegment();
      expect(segment).toMatch(/deferred|paused|⏸/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PROMPT HISTORY
  // ─────────────────────────────────────────────────────────────────────────

  describe('prompt history', () => {
    it('should track all prompts and responses', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm' });
      prompt.handleInput('y', request);
      expect(prompt.getHistory()).toHaveLength(1);
    });

    it('should include duration in history entry', () => {
      const prompt = createPromptSystem();
      const request = makeRequest({ type: 'confirm' });
      prompt.handleInput('y', request);
      const entry = prompt.getHistory()[0];
      expect(entry.duration).toBeGreaterThanOrEqual(0);
    });

    it('should retrieve history by agent', () => {
      const prompt = createPromptSystem();
      prompt.handleInput('y', makeRequest({ type: 'confirm', agentId: 'coder' }));
      prompt.handleInput('n', makeRequest({ type: 'confirm', agentId: 'reviewer' }));
      expect(prompt.getHistoryByAgent('coder')).toHaveLength(1);
    });

    it('should show prompt history with /prompts command', () => {
      const prompt = createPromptSystem();
      prompt.handleInput('y', makeRequest({ type: 'confirm' }));
      const output = prompt.renderHistory();
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // QUEUING & MULTI-AGENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('prompt queuing', () => {
    it('should queue prompts when one is already active', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select' }));
      expect(prompt.getQueueLength()).toBe(2);
    });

    it('should show next prompt after current is resolved', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select', choices: [{ key: 1, label: 'A' }] }));
      prompt.handleInput('y', prompt.getActivePrompt()!);
      expect(prompt.getActivePrompt()!.id).toBe('p2');
    });

    it('should show queue count indicator', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select' }));
      prompt.enqueue(makeRequest({ id: 'p3', type: 'text' }));
      const indicator = prompt.renderQueueIndicator();
      expect(indicator).toContain('3');
    });

    it('should prioritize prompts from focused agent', () => {
      const prompt = createPromptSystem({ focusedAgent: 'coder' });
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'reviewer' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm', agentId: 'coder' }));
      expect(prompt.getActivePrompt()!.id).toBe('p2');
    });

    it('should skip prompts from muted agents', () => {
      const prompt = createPromptSystem({ mutedAgents: ['spammer'] });
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'spammer' }));
      expect(prompt.getActivePrompt()).toBeUndefined();
    });

    it('should show queued prompt notifications in sidebar', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'coder', agentName: 'Coder' }));
      const notification = prompt.renderSidebarNotification('coder');
      expect(notification).toContain('?'); // question pending indicator
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // QUEUE MANAGEMENT (/prompts, /skip, /answer all)
  // ─────────────────────────────────────────────────────────────────────────

  describe('queue management', () => {
    it('should list full queue with /prompts', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentName: 'Coder' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select', agentName: 'Reviewer' }));
      prompt.enqueue(makeRequest({ id: 'p3', type: 'text', agentName: 'Tester' }));
      const rendered = prompt.renderQueueList();
      expect(rendered.join('\n')).toContain('Coder');
      expect(rendered.join('\n')).toContain('Reviewer');
      expect(rendered.join('\n')).toContain('Tester');
    });

    it('should show prompt type in queue list', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentName: 'Coder' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select', agentName: 'Reviewer' }));
      const rendered = prompt.renderQueueList();
      const output = rendered.join('\n');
      expect(output).toMatch(/confirm|y\/n/i);
      expect(output).toMatch(/select|choice/i);
    });

    it('should show waiting duration per queued prompt', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentName: 'Coder' }));
      const rendered = prompt.renderQueueList();
      expect(rendered.join('\n')).toMatch(/\d+s|waiting/i);
    });

    it('should skip current prompt with /skip', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select', choices: [{ key: 1, label: 'A' }] }));
      prompt.skip();
      expect(prompt.getActivePrompt()?.id).toBe('p2');
    });

    it('should mark skipped prompt as cancelled', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      const response = prompt.skip();
      expect(response.cancelled).toBe(true);
    });

    it('should skip all prompts with /skip all', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select' }));
      prompt.enqueue(makeRequest({ id: 'p3', type: 'text' }));
      prompt.skipAll();
      expect(prompt.getQueueLength()).toBe(0);
    });

    it('should blanket-answer all confirms with /answer all y', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p3', type: 'select' })); // not a confirm
      const results = prompt.answerAll('y');
      expect(results.answered).toBe(2);
      expect(results.skipped).toBe(1);
    });

    it('should not blanket-answer non-confirm prompts', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'select', choices: [{ key: 1, label: 'A' }] }));
      const results = prompt.answerAll('y');
      expect(results.answered).toBe(0);
      expect(prompt.getQueueLength()).toBe(1);
    });

    it('should order queue by priority then timestamp', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'low-priority' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm', agentId: 'high-priority' }));
      // with priority config set for high-priority agent
      const queue = prompt.getQueue();
      expect(queue[0].agentId).toBe('high-priority');
    });

    it('should bump focused agent prompts to front', () => {
      const prompt = createPromptSystem({ focusedAgent: 'coder' });
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'reviewer' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm', agentId: 'coder' }));
      expect(prompt.getActivePrompt()?.agentId).toBe('coder');
    });

    it('should auto-timeout queued prompts that exceed their timeout', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', timeout: 100 }));
      // simulate time passing
      prompt.tick(200);
      const history = prompt.getHistory();
      expect(history[0]?.response.timedOut).toBe(true);
    });

    it('should notify agent when their prompt is skipped', () => {
      const prompt = createPromptSystem();
      const onSkip = vi.fn();
      prompt.onPromptSkipped(onSkip);
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'coder' }));
      prompt.skip();
      expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'coder' }));
    });

    it('should show "no pending prompts" when queue empty', () => {
      const prompt = createPromptSystem();
      const rendered = prompt.renderQueueList();
      expect(rendered.join('\n')).toMatch(/no pending|empty/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PROMPT QUEUE VIEW (full-screen triage mode)
  // ─────────────────────────────────────────────────────────────────────────

  describe('prompt queue view', () => {
    it('should render queue as navigable table', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentName: 'Coder', title: 'Deploy?' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select', agentName: 'Tester', title: 'Which env?' }));
      const rendered = prompt.renderQueueView(80, 24);
      const output = rendered.join('\n');
      expect(output).toContain('Coder');
      expect(output).toContain('Tester');
    });

    it('should show column headers (agent, type, question, wait, action)', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      const rendered = prompt.renderQueueView(80, 24);
      const output = rendered.join('\n');
      expect(output).toMatch(/agent/i);
      expect(output).toMatch(/type/i);
    });

    it('should highlight currently selected row', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select' }));
      const rendered = prompt.renderQueueView(80, 24, { cursorRow: 1 });
      expect(rendered.join('\n')).toContain('\x1b[7m'); // inverse
    });

    it('should show preview panel for selected prompt', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({
        id: 'p1',
        type: 'select',
        title: 'Which model?',
        choices: [{ key: 1, label: 'Sonnet' }, { key: 2, label: 'Opus' }],
      }));
      const rendered = prompt.renderQueueView(80, 24, { cursorRow: 0, showPreview: true });
      const output = rendered.join('\n');
      expect(output).toContain('Which model?');
      expect(output).toContain('Sonnet');
    });

    it('should show wait duration for each queued prompt', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      const rendered = prompt.renderQueueView(80, 24);
      expect(rendered.join('\n')).toMatch(/\d+s/);
    });

    it('should show quick-action hint per prompt type', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      const rendered = prompt.renderQueueView(80, 24);
      expect(rendered.join('\n')).toMatch(/\[Y\].*\[n\]|Y\/n/i);
    });

    it('should navigate rows with up/down', () => {
      const prompt = createPromptSystem();
      const state = { cursorRow: 0, totalRows: 5 };
      prompt.handleKey('down', state);
      expect(state.cursorRow).toBe(1);
    });

    it('should answer selected prompt on Enter', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', title: 'Go?' }));
      const entered = prompt.enterPromptFromQueue(0);
      expect(entered.id).toBe('p1');
    });

    it('should approve all confirms with "A" key', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p3', type: 'select' }));
      const result = prompt.batchAnswer('approve-confirms');
      expect(result.answered).toBe(2);
      expect(result.skipped).toBe(1);
    });

    it('should reject all confirms with "R" key', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm' }));
      const result = prompt.batchAnswer('reject-confirms');
      expect(result.answered).toBe(2);
    });

    it('should skip selected prompt with "S" key', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select' }));
      prompt.skip('p1');
      expect(prompt.getQueue().find((p: any) => p.id === 'p1')).toBeUndefined();
    });

    it('should dismiss all with "X" key', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select' }));
      prompt.skipAll();
      expect(prompt.getQueueLength()).toBe(0);
    });

    it('should return to chat view on Escape', () => {
      const prompt = createPromptSystem();
      const state = { viewMode: 'queue' as string };
      prompt.handleKey('escape', state);
      expect(state.viewMode).toBe('chat');
    });

    it('should show keybinding help bar at bottom', () => {
      const prompt = createPromptSystem();
      const rendered = prompt.renderQueueView(80, 24);
      const lastLines = rendered.slice(-2).join('\n');
      expect(lastLines).toMatch(/Enter|Esc|skip/i);
    });

    it('should show total count in view title', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p3', type: 'text' }));
      const rendered = prompt.renderQueueView(80, 24);
      expect(rendered.join('\n')).toContain('3');
    });

    it('should group prompts by agent when many queued', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'coder' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm', agentId: 'coder' }));
      prompt.enqueue(makeRequest({ id: 'p3', type: 'select', agentId: 'tester' }));
      const rendered = prompt.renderQueueView(80, 24, { groupByAgent: true });
      const output = rendered.join('\n');
      expect(output).toMatch(/coder.*\(2\)/i);
    });

    it('should filter queue view by agent', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'coder' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select', agentId: 'tester' }));
      const rendered = prompt.renderQueueView(80, 24, { filterAgent: 'coder' });
      const output = rendered.join('\n');
      expect(output).toContain('coder');
      expect(output).not.toContain('tester');
    });

    it('should filter queue view by type', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
      prompt.enqueue(makeRequest({ id: 'p2', type: 'select' }));
      prompt.enqueue(makeRequest({ id: 'p3', type: 'text' }));
      const rendered = prompt.renderQueueView(80, 24, { filterType: 'confirm' });
      const output = rendered.join('\n');
      expect(output).toMatch(/confirm/i);
    });

    it('should show agent status indicator in queue rows', () => {
      const prompt = createPromptSystem();
      prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentId: 'coder' }));
      const rendered = prompt.renderQueueView(80, 24);
      expect(rendered.join('\n')).toMatch(/[●○◉⊙]/); // status dot
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONTEXT-AWARE DISPLAY (agent channel vs master channel)
  // ─────────────────────────────────────────────────────────────────────────

  describe('context-aware prompt display', () => {

    describe('in agent channel (inline popup)', () => {
      it('should render prompt inline when in the asking agents channel', () => {
        const prompt = createPromptSystem({ currentChannel: 'coder' });
        const request = makeRequest({ type: 'confirm', agentId: 'coder', title: 'Continue?' });
        const mode = prompt.getDisplayMode(request);
        expect(mode).toBe('inline');
      });

      it('should immediately capture focus for inline prompts', () => {
        const prompt = createPromptSystem({ currentChannel: 'coder' });
        const request = makeRequest({ type: 'select', agentId: 'coder' });
        expect(prompt.shouldCaptureFocus(request)).toBe(true);
      });

      it('should render as full popup box inline in chat', () => {
        const prompt = createPromptSystem({ currentChannel: 'coder' });
        const request = makeRequest({
          type: 'select',
          agentId: 'coder',
          choices: [{ key: 1, label: 'Option A' }],
        });
        const rendered = prompt.renderInline(request, 80);
        const output = rendered.join('\n');
        expect(output).toMatch(/[┌┐└┘│─╭╮╰╯]/);
        expect(output).toContain('Option A');
      });

      it('should not show prompts from other agents inline', () => {
        const prompt = createPromptSystem({ currentChannel: 'coder' });
        const request = makeRequest({ type: 'confirm', agentId: 'reviewer' });
        const mode = prompt.getDisplayMode(request);
        expect(mode).not.toBe('inline');
      });
    });

    describe('in master/control channel (notification + triage)', () => {
      it('should render prompt as notification line in control channel', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        const request = makeRequest({ type: 'confirm', agentId: 'coder', agentName: 'Coder', title: 'Deploy?' });
        const mode = prompt.getDisplayMode(request);
        expect(mode).toBe('notification');
      });

      it('should prefix notification with [hitl]', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        const request = makeRequest({ type: 'confirm', agentId: 'coder', agentName: 'Coder', title: 'Deploy?' });
        const line = prompt.renderNotificationLine(request);
        expect(line).toMatch(/\[hitl\]/i);
      });

      it('should show agent name in notification', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        const request = makeRequest({ type: 'confirm', agentName: 'Coder', title: 'Deploy?' });
        const line = prompt.renderNotificationLine(request);
        expect(line).toContain('Coder');
      });

      it('should show prompt type in notification', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        const request = makeRequest({ type: 'select', agentName: 'Coder', title: 'Which model?' });
        const line = prompt.renderNotificationLine(request);
        expect(line).toMatch(/select|choice/i);
      });

      it('should show wait duration in notification', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        const request = makeRequest({ type: 'confirm', agentName: 'Coder', title: 'Go?' });
        const line = prompt.renderNotificationLine(request, { waitingMs: 8000 });
        expect(line).toMatch(/8s/);
      });

      it('should render pinned pending summary bar', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentName: 'Coder', title: 'Deploy?' }));
        prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm', agentName: 'Reviewer', title: 'Approve?' }));
        const bar = prompt.renderPendingSummaryBar(80);
        expect(bar).toContain('2');
        expect(bar).toContain('Coder');
        expect(bar).toContain('Reviewer');
      });

      it('should show numbered shortcuts in summary bar', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentName: 'Coder' }));
        prompt.enqueue(makeRequest({ id: 'p2', type: 'select', agentName: 'Tester' }));
        const bar = prompt.renderPendingSummaryBar(80);
        expect(bar).toContain('[1]');
        expect(bar).toContain('[2]');
      });

      it('should quick-answer by number+value shorthand (e.g. "1y")', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm', agentName: 'Coder' }));
        prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm', agentName: 'Reviewer' }));
        const response = prompt.quickAnswer('1y');
        expect(response.requestId).toBe('p1');
        expect(response.value).toBe(true);
      });

      it('should quick-answer "2n" as reject for prompt #2', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        prompt.enqueue(makeRequest({ id: 'p1', type: 'confirm' }));
        prompt.enqueue(makeRequest({ id: 'p2', type: 'confirm' }));
        const response = prompt.quickAnswer('2n');
        expect(response.requestId).toBe('p2');
        expect(response.value).toBe(false);
      });

      it('should jump into prompt by number alone (no value)', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        prompt.enqueue(makeRequest({ id: 'p1', type: 'select', choices: [{ key: 1, label: 'A' }] }));
        const result = prompt.focusPrompt(1);
        expect(result.id).toBe('p1');
        expect(result.mode).toBe('inline');
      });

      it('should not capture focus in control channel (prompts stay as notifications)', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        const request = makeRequest({ type: 'confirm', agentId: 'coder' });
        expect(prompt.shouldCaptureFocus(request)).toBe(false);
      });

      it('should capture focus if user explicitly enters a prompt (number key)', () => {
        const prompt = createPromptSystem({ currentChannel: 'control' });
        prompt.enqueue(makeRequest({ id: 'p1', type: 'select', agentId: 'coder' }));
        prompt.focusPrompt(1);
        expect(prompt.isFocusCaptured()).toBe(true);
      });
    });

    describe('master channel overview content', () => {
      it('should show system events (spawn, kill, connect)', () => {
        const control = createControlChannel();
        control.addEvent({ type: 'spawn', agent: 'coder', timestamp: Date.now() });
        const rendered = control.renderFeed(80, 20);
        expect(rendered.join('\n')).toMatch(/spawn|started/i);
      });

      it('should show agent status changes', () => {
        const control = createControlChannel();
        control.addEvent({ type: 'status-change', agent: 'coder', from: 'thinking', to: 'streaming', timestamp: Date.now() });
        const rendered = control.renderFeed(80, 20);
        expect(rendered.join('\n')).toMatch(/streaming/i);
      });

      it('should show git events', () => {
        const control = createControlChannel();
        control.addEvent({ type: 'git:commit', agent: 'coder', hash: 'abc123', message: 'feat: auth', timestamp: Date.now() });
        const rendered = control.renderFeed(80, 20);
        expect(rendered.join('\n')).toContain('abc123');
      });

      it('should show cost milestones', () => {
        const control = createControlChannel();
        control.addEvent({ type: 'cost-milestone', amount: 1.00, timestamp: Date.now() });
        const rendered = control.renderFeed(80, 20);
        expect(rendered.join('\n')).toContain('$1.00');
      });

      it('should show error events prominently', () => {
        const control = createControlChannel();
        control.addEvent({ type: 'error', agent: 'builder', message: 'rate limited', timestamp: Date.now() });
        const rendered = control.renderFeed(80, 20);
        const output = rendered.join('\n');
        expect(output).toContain('\x1b['); // has ANSI styling for errors
        expect(output).toContain('rate limited');
      });

      it('should show HITL prompt notifications in feed', () => {
        const control = createControlChannel();
        control.addEvent({ type: 'hitl', agent: 'coder', title: 'Deploy?', promptType: 'confirm', timestamp: Date.now() });
        const rendered = control.renderFeed(80, 20);
        expect(rendered.join('\n')).toMatch(/\[hitl\].*Deploy\?/i);
      });

      it('should show aggregate stats summary at top', () => {
        const control = createControlChannel();
        control.setStats({ agents: 4, tokens: 45000, cost: 0.23, uptime: 300000 });
        const rendered = control.renderHeader(80);
        expect(rendered.join('\n')).toContain('4');
        expect(rendered.join('\n')).toContain('$0.23');
      });

      it('should show agent mini-status list', () => {
        const control = createControlChannel();
        control.setAgents([
          { id: 'coder', name: 'Coder', status: 'streaming' },
          { id: 'reviewer', name: 'Reviewer', status: 'idle' },
          { id: 'tester', name: 'Tester', status: 'done' },
        ]);
        const rendered = control.renderAgentSummary(80);
        const output = rendered.join('\n');
        expect(output).toContain('Coder');
        expect(output).toContain('streaming');
      });

      it('should filter feed by event type', () => {
        const control = createControlChannel();
        control.addEvent({ type: 'spawn', agent: 'coder', timestamp: Date.now() });
        control.addEvent({ type: 'error', agent: 'builder', message: 'fail', timestamp: Date.now() });
        const rendered = control.renderFeed(80, 20, { filterType: 'error' });
        const output = rendered.join('\n');
        expect(output).toContain('fail');
        expect(output).not.toMatch(/spawn/i);
      });
    });
  });
});

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
