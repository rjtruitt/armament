/**
 * INPUT HANDLER TEST SUITE — Terminal input management: command parsing,
 * tab completion, history navigation, multi-line input, paste detection,
 * @ mention syntax, and undo/redo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputHandler } from '../core/InputHandler';

function createInputHandler(ctx: any = {}) {
  return new InputHandler({
    commands: ctx.commands ?? ['/help', '/model', '/quit', '/clear', '/history'],
    agents: ctx.agents ?? ['agent-1', 'agent-2'],
    models: ctx.models ?? ['sonnet', 'opus', 'haiku'],
    providers: ctx.providers ?? ['anthropic', 'openai'],
    variables: ctx.variables ?? ['$SESSION_ID', '$AGENT_NAME'],
    history: ctx.history ?? [],
    aliases: ctx.aliases ?? {},
    ...ctx,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. INPUT STATE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Input State', () => {
  it('starts empty with cursor at 0', () => {
    const ih = createInputHandler();
    const state = ih.getState();
    expect(state.text).toBe('');
    expect(state.cursorPosition).toBe(0);
  });

  it('setText replaces current text', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    expect(ih.getState().text).toBe('hello');
    expect(ih.getState().cursorPosition).toBe(5);
  });

  it('insertChar adds at cursor position', () => {
    const ih = createInputHandler();
    ih.insertChar('a');
    ih.insertChar('b');
    ih.insertChar('c');
    expect(ih.getState().text).toBe('abc');
  });

  it('insertChar moves cursor forward', () => {
    const ih = createInputHandler();
    ih.insertChar('x');
    expect(ih.getState().cursorPosition).toBe(1);
    ih.insertChar('y');
    expect(ih.getState().cursorPosition).toBe(2);
  });

  it('deleteChar backward removes before cursor', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.deleteChar('backward');
    expect(ih.getState().text).toBe('hell');
    expect(ih.getState().cursorPosition).toBe(4);
  });

  it('deleteChar forward removes after cursor', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.moveCursor('home');
    ih.deleteChar('forward');
    expect(ih.getState().text).toBe('ello');
    expect(ih.getState().cursorPosition).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CURSOR MOVEMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cursor Movement', () => {
  it('left moves cursor one position left', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.moveCursor('left');
    expect(ih.getState().cursorPosition).toBe(4);
  });

  it('right moves cursor one position right', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.moveCursor('home');
    ih.moveCursor('right');
    expect(ih.getState().cursorPosition).toBe(1);
  });

  it('home moves cursor to start', () => {
    const ih = createInputHandler();
    ih.setText('hello world');
    ih.moveCursor('home');
    expect(ih.getState().cursorPosition).toBe(0);
  });

  it('end moves cursor to end', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.moveCursor('home');
    ih.moveCursor('end');
    expect(ih.getState().cursorPosition).toBe(5);
  });

  it('word-left jumps to previous word boundary', () => {
    const ih = createInputHandler();
    ih.setText('hello world foo');
    // cursor at end (15)
    ih.moveCursor('word-left');
    expect(ih.getState().cursorPosition).toBe(12); // before 'foo'
  });

  it('word-right jumps to next word boundary', () => {
    const ih = createInputHandler();
    ih.setText('hello world');
    ih.moveCursor('home');
    ih.moveCursor('word-right');
    expect(ih.getState().cursorPosition).toBe(5); // end of 'hello'
  });

  it('left at position 0 is no-op', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.moveCursor('home');
    ih.moveCursor('left');
    expect(ih.getState().cursorPosition).toBe(0);
  });

  it('right at end is no-op', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.moveCursor('right');
    expect(ih.getState().cursorPosition).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SUBMISSION ROUTING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Submission Routing', () => {
  it('/command routes to CommandHandler', async () => {
    const onCommand = vi.fn();
    const ih = createInputHandler({ onCommand });
    ih.setText('/help');
    await ih.submit();
    expect(onCommand).toHaveBeenCalledWith('/help');
  });

  it('plain text routes as user message to active agent', async () => {
    const onMessage = vi.fn();
    const ih = createInputHandler({ onMessage });
    ih.setText('explain this code');
    await ih.submit();
    expect(onMessage).toHaveBeenCalledWith('explain this code', undefined);
  });

  it('@model syntax routes with per-turn model override', async () => {
    const onMessage = vi.fn();
    const ih = createInputHandler({ onMessage });
    ih.setText('@opus explain this code');
    await ih.submit();
    expect(onMessage).toHaveBeenCalledWith('explain this code', { type: 'model', name: 'opus' });
  });

  it('alias-prefixed input expanded before routing', async () => {
    const onCommand = vi.fn();
    const ih = createInputHandler({
      onCommand,
      aliases: { 'h': '/help' },
    });
    ih.setText('h');
    await ih.submit();
    expect(onCommand).toHaveBeenCalledWith('/help');
  });

  it('submit clears input after processing', async () => {
    const ih = createInputHandler({ onMessage: vi.fn() });
    ih.setText('hello');
    await ih.submit();
    expect(ih.getState().text).toBe('');
  });

  it('submit adds to history', async () => {
    const ih = createInputHandler({ onMessage: vi.fn() });
    ih.setText('first message');
    await ih.submit();
    expect(ih.getHistory()).toContain('first message');
  });

  it('empty submit is no-op', async () => {
    const onMessage = vi.fn();
    const onCommand = vi.fn();
    const ih = createInputHandler({ onMessage, onCommand });
    ih.setText('');
    await ih.submit();
    expect(onMessage).not.toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

describe('History', () => {
  it('historyUp recalls previous entry', () => {
    const ih = createInputHandler({ history: ['first', 'second', 'third'] });
    ih.historyUp();
    expect(ih.getState().text).toBe('third');
  });

  it('historyDown goes to next entry', () => {
    const ih = createInputHandler({ history: ['first', 'second', 'third'] });
    ih.historyUp(); // third
    ih.historyUp(); // second
    ih.historyDown(); // third
    expect(ih.getState().text).toBe('third');
  });

  it('historyDown at end restores original input', () => {
    const ih = createInputHandler({ history: ['first', 'second'] });
    ih.setText('current typing');
    ih.historyUp(); // second
    ih.historyDown(); // restore
    expect(ih.getState().text).toBe('current typing');
  });

  it('searchHistory finds matching entries (Ctrl+R)', () => {
    const ih = createInputHandler({ history: ['/model opus', 'hello', '/model sonnet', 'world'] });
    const results = ih.searchHistory('model');
    expect(results).toContain('/model opus');
    expect(results).toContain('/model sonnet');
    expect(results).not.toContain('hello');
  });

  it('getHistory returns full history array', () => {
    const ih = createInputHandler({ history: ['a', 'b', 'c'] });
    expect(ih.getHistory()).toEqual(['a', 'b', 'c']);
  });

  it('history preserves order (oldest first)', async () => {
    const ih = createInputHandler({ onMessage: vi.fn() });
    ih.setText('alpha');
    await ih.submit();
    ih.setText('beta');
    await ih.submit();
    const history = ih.getHistory();
    expect(history[0]).toBe('alpha');
    expect(history[1]).toBe('beta');
  });

  it('history deduplicates consecutive identical entries', async () => {
    const ih = createInputHandler({ onMessage: vi.fn() });
    ih.setText('same');
    await ih.submit();
    ih.setText('same');
    await ih.submit();
    const history = ih.getHistory();
    expect(history.filter(h => h === 'same')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. TAB COMPLETION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tab Completion', () => {
  it('/hel completes to /help', () => {
    const ih = createInputHandler();
    ih.setText('/hel');
    const completions = ih.getCompletions();
    expect(completions.some(c => c.text === '/help')).toBe(true);
  });

  it('/mod completes to /model', () => {
    const ih = createInputHandler();
    ih.setText('/mod');
    const completions = ih.getCompletions();
    expect(completions.some(c => c.text === '/model')).toBe(true);
  });

  it('@age completes to @agent-1, @agent-2', () => {
    const ih = createInputHandler();
    ih.setText('@age');
    const completions = ih.getCompletions();
    expect(completions.some(c => c.text === '@agent-1')).toBe(true);
    expect(completions.some(c => c.text === '@agent-2')).toBe(true);
  });

  it('@son completes to @sonnet (model alias)', () => {
    const ih = createInputHandler();
    ih.setText('@son');
    const completions = ih.getCompletions();
    expect(completions.some(c => c.text === '@sonnet')).toBe(true);
  });

  it('$va completes to $variable names', () => {
    const ih = createInputHandler({ variables: ['$VAR_ONE', '$VAR_TWO'] });
    ih.setText('$VA');
    const completions = ih.getCompletions();
    expect(completions.some(c => c.text === '$VAR_ONE')).toBe(true);
    expect(completions.some(c => c.text === '$VAR_TWO')).toBe(true);
  });

  it('acceptCompletion replaces partial text', () => {
    const ih = createInputHandler();
    ih.setText('/hel');
    const completions = ih.getCompletions();
    const idx = completions.findIndex(c => c.text === '/help');
    ih.acceptCompletion(idx);
    expect(ih.getState().text).toBe('/help');
  });

  it('cycleCompletion next/prev cycles through matches', () => {
    const ih = createInputHandler({ commands: ['/help', '/history', '/hooks'] });
    ih.setText('/h');
    ih.cycleCompletion('next');
    const text1 = ih.getState().text;
    ih.cycleCompletion('next');
    const text2 = ih.getState().text;
    expect(text1).not.toBe(text2);
    ih.cycleCompletion('prev');
    expect(ih.getState().text).toBe(text1);
  });

  it('completions include type (command, agent, model, variable)', () => {
    const ih = createInputHandler();
    ih.setText('/hel');
    const completions = ih.getCompletions();
    expect(completions[0].type).toBe('command');
  });

  it('no completions for plain text without prefix', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    const completions = ih.getCompletions();
    expect(completions).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MULTI-LINE INPUT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Multi-Line Input', () => {
  it('enterMultiLine switches to multi-line mode', () => {
    const ih = createInputHandler();
    ih.enterMultiLine();
    expect(ih.getState().isMultiLine).toBe(true);
  });

  it('exitMultiLine returns to single-line mode', () => {
    const ih = createInputHandler();
    ih.enterMultiLine();
    ih.exitMultiLine();
    expect(ih.getState().isMultiLine).toBe(false);
  });

  it('state.isMultiLine starts as false', () => {
    const ih = createInputHandler();
    expect(ih.getState().isMultiLine).toBe(false);
  });

  it('triple backtick triggers multi-line mode', () => {
    const ih = createInputHandler();
    ih.insertChar('`');
    ih.insertChar('`');
    ih.insertChar('`');
    expect(ih.getState().isMultiLine).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PASTE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Paste Detection', () => {
  it('single-line paste inserts inline', () => {
    const ih = createInputHandler();
    ih.handlePaste('hello world');
    expect(ih.getState().text).toBe('hello world');
    expect(ih.getState().isMultiLine).toBe(false);
  });

  it('multi-line paste switches to multi-line mode', () => {
    const ih = createInputHandler();
    ih.handlePaste('line1\nline2\nline3');
    expect(ih.getState().text).toBe('line1\nline2\nline3');
    expect(ih.getState().isMultiLine).toBe(true);
  });

  it('pasted text sanitized (strip control chars except newlines)', () => {
    const ih = createInputHandler();
    ih.handlePaste('hello\x07world');
    expect(ih.getState().text).toBe('helloworld');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. @ MENTION SYNTAX
// ═══════════════════════════════════════════════════════════════════════════════

describe('@ Mention Syntax', () => {
  it('@agent-1 parses as agent mention', () => {
    const ih = createInputHandler();
    ih.setText('@agent-1 do something');
    const mention = ih.parseMention();
    expect(mention).toEqual({ type: 'agent', name: 'agent-1' });
  });

  it('@sonnet parses as model mention (per-turn override)', () => {
    const ih = createInputHandler();
    ih.setText('@sonnet explain this');
    const mention = ih.parseMention();
    expect(mention).toEqual({ type: 'model', name: 'sonnet' });
  });

  it('@anthropic parses as provider mention', () => {
    const ih = createInputHandler();
    ih.setText('@anthropic route to this provider');
    const mention = ih.parseMention();
    expect(mention).toEqual({ type: 'provider', name: 'anthropic' });
  });

  it('no @ prefix returns null', () => {
    const ih = createInputHandler();
    ih.setText('plain text without mention');
    const mention = ih.parseMention();
    expect(mention).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. UNDO/REDO
// ═══════════════════════════════════════════════════════════════════════════════

describe('Undo/Redo', () => {
  it('undo reverts last text change', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.setText('world');
    ih.undo();
    expect(ih.getState().text).toBe('hello');
  });

  it('redo re-applies undone change', () => {
    const ih = createInputHandler();
    ih.setText('hello');
    ih.setText('world');
    ih.undo();
    ih.redo();
    expect(ih.getState().text).toBe('world');
  });

  it('multiple undos walk back through history', () => {
    const ih = createInputHandler();
    ih.setText('one');
    ih.setText('two');
    ih.setText('three');
    ih.undo();
    ih.undo();
    expect(ih.getState().text).toBe('one');
  });

  it('redo after new input clears redo stack', () => {
    const ih = createInputHandler();
    ih.setText('one');
    ih.setText('two');
    ih.undo(); // back to 'one'
    ih.setText('three'); // new branch
    ih.redo(); // should be no-op since redo stack was cleared
    expect(ih.getState().text).toBe('three');
  });
});
