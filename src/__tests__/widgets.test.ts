import { describe, it, expect } from 'vitest';
import { TextInput } from '../tui/widgets/TextInput.js';
import { ChoiceSelector } from '../tui/widgets/ChoiceSelector.js';
import { Toggle } from '../tui/widgets/Toggle.js';
import { NumberInput } from '../tui/widgets/NumberInput.js';

describe('TextInput', () => {
  it('starts with initial value', () => {
    const input = new TextInput({ value: 'hello' });
    expect(input.value).toBe('hello');
  });

  it('starts inactive', () => {
    const input = new TextInput();
    expect(input.isActive).toBe(false);
  });

  it('activate sets active and cursor at end', () => {
    const input = new TextInput({ value: 'test' });
    input.activate();
    expect(input.isActive).toBe(true);
    expect(input.cursor).toBe(4);
  });

  it('activate with value override', () => {
    const input = new TextInput({ value: 'old' });
    input.activate('new');
    expect(input.value).toBe('new');
    expect(input.cursor).toBe(3);
  });

  it('typing appends at cursor', () => {
    const input = new TextInput();
    input.activate('');
    input.handleKey('h');
    input.handleKey('i');
    expect(input.value).toBe('hi');
    expect(input.cursor).toBe(2);
  });

  it('typing inserts at cursor position', () => {
    const input = new TextInput({ value: 'hllo' });
    input.activate();
    input.handleKey('left');
    input.handleKey('left');
    input.handleKey('left');
    input.handleKey('e');
    expect(input.value).toBe('hello');
    expect(input.cursor).toBe(2);
  });

  it('backspace removes character before cursor', () => {
    const input = new TextInput({ value: 'hello' });
    input.activate();
    input.handleKey('backspace');
    expect(input.value).toBe('hell');
    expect(input.cursor).toBe(4);
  });

  it('backspace at position 0 does nothing', () => {
    const input = new TextInput({ value: 'hi' });
    input.activate();
    input.handleKey('home');
    input.handleKey('backspace');
    expect(input.value).toBe('hi');
    expect(input.cursor).toBe(0);
  });

  it('delete removes character at cursor', () => {
    const input = new TextInput({ value: 'hello' });
    input.activate();
    input.handleKey('home');
    input.handleKey('delete');
    expect(input.value).toBe('ello');
  });

  it('left moves cursor left', () => {
    const input = new TextInput({ value: 'abc' });
    input.activate();
    expect(input.cursor).toBe(3);
    input.handleKey('left');
    expect(input.cursor).toBe(2);
  });

  it('right moves cursor right', () => {
    const input = new TextInput({ value: 'abc' });
    input.activate();
    input.handleKey('home');
    input.handleKey('right');
    expect(input.cursor).toBe(1);
  });

  it('left at 0 stays at 0', () => {
    const input = new TextInput({ value: 'a' });
    input.activate();
    input.handleKey('home');
    input.handleKey('left');
    expect(input.cursor).toBe(0);
  });

  it('right at end stays at end', () => {
    const input = new TextInput({ value: 'ab' });
    input.activate();
    input.handleKey('right');
    expect(input.cursor).toBe(2);
  });

  it('home moves to start', () => {
    const input = new TextInput({ value: 'hello' });
    input.activate();
    input.handleKey('home');
    expect(input.cursor).toBe(0);
  });

  it('end moves to end', () => {
    const input = new TextInput({ value: 'hello' });
    input.activate();
    input.handleKey('home');
    input.handleKey('end');
    expect(input.cursor).toBe(5);
  });

  it('ctrl+u clears to start', () => {
    const input = new TextInput({ value: 'hello world' });
    input.activate();
    input.handleKey('left');
    input.handleKey('left');
    input.handleKey('left');
    input.handleKey('left');
    input.handleKey('left');
    input.handleKey('ctrl+u');
    expect(input.value).toBe('world');
    expect(input.cursor).toBe(0);
  });

  it('ctrl+k clears to end', () => {
    const input = new TextInput({ value: 'hello world' });
    input.activate();
    input.handleKey('home');
    input.handleKey('right');
    input.handleKey('right');
    input.handleKey('right');
    input.handleKey('right');
    input.handleKey('right');
    input.handleKey('ctrl+k');
    expect(input.value).toBe('hello');
  });

  it('deactivate returns value and changed status', () => {
    const input = new TextInput({ value: 'orig' });
    input.activate();
    input.handleKey('!');
    const result = input.deactivate();
    expect(result.value).toBe('orig!');
    expect(result.changed).toBe(true);
    expect(input.isActive).toBe(false);
  });

  it('deactivate reports no change if unchanged', () => {
    const input = new TextInput({ value: 'same' });
    input.activate();
    const result = input.deactivate();
    expect(result.changed).toBe(false);
  });

  it('cancel restores original value', () => {
    const input = new TextInput({ value: 'original' });
    input.activate();
    input.handleKey('backspace');
    input.handleKey('backspace');
    expect(input.value).toBe('origin');
    const restored = input.cancel();
    expect(restored).toBe('original');
    expect(input.value).toBe('original');
    expect(input.isActive).toBe(false);
  });

  it('respects maxLength', () => {
    const input = new TextInput({ value: '', maxLength: 5 });
    input.activate();
    for (const c of 'abcdefgh') input.handleKey(c);
    expect(input.value).toBe('abcde');
  });

  it('paste inserts text at cursor', () => {
    const input = new TextInput({ value: 'hd' });
    input.activate();
    input.handleKey('left');
    input.paste('ello worl');
    expect(input.value).toBe('hello world');
  });

  it('ignores keys when inactive', () => {
    const input = new TextInput({ value: 'test' });
    const handled = input.handleKey('a');
    expect(handled).toBe(false);
    expect(input.value).toBe('test');
  });

  it('handles all printable ASCII', () => {
    const input = new TextInput();
    input.activate('');
    const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`0123456789';
    for (const c of chars) input.handleKey(c);
    expect(input.value).toBe(chars);
  });

  it('render shows cursor when active', () => {
    const input = new TextInput({ value: 'hi' });
    input.activate();
    const result = input.render([255, 100, 100]);
    expect(result.text).toContain('▌');
  });

  it('render shows no cursor when inactive', () => {
    const input = new TextInput({ value: 'hi' });
    const result = input.render([255, 100, 100]);
    expect(result.text).not.toContain('▌');
  });
});

describe('ChoiceSelector', () => {
  const choices = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ];

  it('starts at first choice by default', () => {
    const sel = new ChoiceSelector({ choices });
    expect(sel.value).toBe('Alpha');
    expect(sel.valueId).toBe('a');
  });

  it('starts at specified value', () => {
    const sel = new ChoiceSelector({ choices, value: 'Beta' });
    expect(sel.value).toBe('Beta');
    expect(sel.index).toBe(1);
  });

  it('starts at specified value by id', () => {
    const sel = new ChoiceSelector({ choices, value: 'c' });
    expect(sel.value).toBe('Gamma');
  });

  it('right cycles forward', () => {
    const sel = new ChoiceSelector({ choices, value: 'a' });
    sel.handleKey('right');
    expect(sel.value).toBe('Beta');
    sel.handleKey('right');
    expect(sel.value).toBe('Gamma');
    sel.handleKey('right');
    expect(sel.value).toBe('Alpha'); // wraps
  });

  it('left cycles backward', () => {
    const sel = new ChoiceSelector({ choices, value: 'a' });
    sel.handleKey('left');
    expect(sel.value).toBe('Gamma'); // wraps backwards
  });

  it('enter cycles forward', () => {
    const sel = new ChoiceSelector({ choices, value: 'a' });
    sel.handleKey('enter');
    expect(sel.value).toBe('Beta');
  });

  it('set value updates index', () => {
    const sel = new ChoiceSelector({ choices });
    sel.value = 'Gamma';
    expect(sel.index).toBe(2);
  });

  it('setChoices preserves value when possible', () => {
    const sel = new ChoiceSelector({ choices, value: 'b' });
    sel.setChoices([
      { id: 'x', label: 'X' },
      { id: 'b', label: 'Beta' },
    ]);
    expect(sel.value).toBe('Beta');
    expect(sel.index).toBe(1);
  });

  it('setChoices resets to 0 when value not found', () => {
    const sel = new ChoiceSelector({ choices, value: 'b' });
    sel.setChoices([{ id: 'x', label: 'X' }]);
    expect(sel.value).toBe('X');
    expect(sel.index).toBe(0);
  });

  it('render shows arrows when selected', () => {
    const sel = new ChoiceSelector({ choices });
    const result = sel.render([255, 100, 100], true);
    expect(result.text).toContain('◂');
    expect(result.text).toContain('▸');
  });

  it('render hides arrows when not selected', () => {
    const sel = new ChoiceSelector({ choices });
    const result = sel.render([255, 100, 100], false);
    expect(result.text).not.toContain('◂');
  });

  it('ignores non-navigation keys', () => {
    const sel = new ChoiceSelector({ choices });
    expect(sel.handleKey('a')).toBe(false);
    expect(sel.handleKey('backspace')).toBe(false);
  });
});

describe('Toggle', () => {
  it('starts with specified value', () => {
    const t = new Toggle(true);
    expect(t.value).toBe(true);
  });

  it('defaults to false', () => {
    const t = new Toggle();
    expect(t.value).toBe(false);
  });

  it('toggle flips value', () => {
    const t = new Toggle(false);
    t.toggle();
    expect(t.value).toBe(true);
    t.toggle();
    expect(t.value).toBe(false);
  });

  it('enter toggles', () => {
    const t = new Toggle(false);
    t.handleKey('enter');
    expect(t.value).toBe(true);
  });

  it('space toggles', () => {
    const t = new Toggle(true);
    t.handleKey('space');
    expect(t.value).toBe(false);
  });

  it('left/right toggle', () => {
    const t = new Toggle(false);
    t.handleKey('right');
    expect(t.value).toBe(true);
    t.handleKey('left');
    expect(t.value).toBe(false);
  });

  it('ignores non-toggle keys', () => {
    const t = new Toggle(true);
    expect(t.handleKey('a')).toBe(false);
    expect(t.handleKey('up')).toBe(false);
    expect(t.value).toBe(true);
  });

  it('render shows filled when true', () => {
    const t = new Toggle(true);
    const result = t.render([255, 100, 100]);
    expect(result.text).toContain('●');
  });

  it('render shows empty when false', () => {
    const t = new Toggle(false);
    const result = t.render([255, 100, 100]);
    expect(result.text).not.toContain('●');
  });
});

describe('NumberInput', () => {
  it('accepts digits', () => {
    const n = new NumberInput();
    n.activate('');
    n.handleKey('4');
    n.handleKey('2');
    expect(n.value).toBe('42');
  });

  it('accepts decimal point', () => {
    const n = new NumberInput({ decimals: true });
    n.activate('');
    n.handleKey('3');
    n.handleKey('.');
    n.handleKey('1');
    n.handleKey('4');
    expect(n.value).toBe('3.14');
  });

  it('rejects second decimal point', () => {
    const n = new NumberInput({ decimals: true });
    n.activate('');
    n.handleKey('1');
    n.handleKey('.');
    n.handleKey('5');
    n.handleKey('.');
    expect(n.value).toBe('1.5');
  });

  it('rejects letters', () => {
    const n = new NumberInput();
    n.activate('');
    n.handleKey('a');
    n.handleKey('b');
    expect(n.value).toBe('');
  });

  it('accepts minus at start', () => {
    const n = new NumberInput();
    n.activate('');
    n.handleKey('-');
    n.handleKey('5');
    expect(n.value).toBe('-5');
  });

  it('rejects minus not at start', () => {
    const n = new NumberInput();
    n.activate('');
    n.handleKey('5');
    n.handleKey('-');
    expect(n.value).toBe('5');
  });

  it('rejects decimal when decimals=false', () => {
    const n = new NumberInput({ decimals: false });
    n.activate('');
    n.handleKey('1');
    n.handleKey('.');
    expect(n.value).toBe('1');
  });

  it('numericValue returns parsed number', () => {
    const n = new NumberInput({ value: '42.5' });
    expect(n.numericValue).toBe(42.5);
  });

  it('isValid checks bounds', () => {
    const n = new NumberInput({ min: 0, max: 100, value: '50' });
    expect(n.isValid).toBe(true);
    n.value = '150';
    expect(n.isValid).toBe(false);
    n.value = '-1';
    expect(n.isValid).toBe(false);
  });

  it('supports cursor movement like TextInput', () => {
    const n = new NumberInput({ value: '123' });
    n.activate();
    n.handleKey('left');
    n.handleKey('left');
    n.handleKey('4');
    expect(n.value).toBe('1423');
  });
});
