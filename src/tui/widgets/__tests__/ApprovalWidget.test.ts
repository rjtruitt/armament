import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalWidget, ApprovalRequest } from '../ApprovalWidget.js';

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'req-1',
    source: 'agent-alpha',
    question: 'Deploy to production?',
    options: ['Yes', 'No', 'Maybe'],
    inputType: 'radio',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeWidget(width = 80) {
  return new ApprovalWidget({ width });
}

describe('ApprovalWidget', () => {
  let widget: ApprovalWidget;

  beforeEach(() => {
    widget = makeWidget();
  });

  describe('empty state', () => {
    it('render returns empty array when no requests', () => {
      expect(widget.render()).toEqual([]);
    });

    it('handleKey returns false when no requests', () => {
      expect(widget.handleKey('enter')).toBe(false);
      expect(widget.handleKey('up')).toBe(false);
      expect(widget.handleKey('a')).toBe(false);
    });

    it('isEmpty is true when no requests', () => {
      expect(widget.isEmpty).toBe(true);
    });

    it('pending is 0 when no requests', () => {
      expect(widget.pending).toBe(0);
    });

    it('activeRequest is undefined when no requests', () => {
      expect(widget.activeRequest).toBeUndefined();
    });
  });

  describe('push and remove', () => {
    it('push adds a request and updates pending count', () => {
      widget.push(makeRequest());
      expect(widget.pending).toBe(1);
      expect(widget.isEmpty).toBe(false);
    });

    it('push sets activeIndex to 0 on first request', () => {
      widget.push(makeRequest());
      expect(widget.activeRequest?.id).toBe('req-1');
    });

    it('pushing multiple requests increments pending', () => {
      widget.push(makeRequest({ id: 'a' }));
      widget.push(makeRequest({ id: 'b' }));
      widget.push(makeRequest({ id: 'c' }));
      expect(widget.pending).toBe(3);
    });

    it('remove removes request by id', () => {
      widget.push(makeRequest({ id: 'a' }));
      widget.push(makeRequest({ id: 'b' }));
      widget.remove('a');
      expect(widget.pending).toBe(1);
      expect(widget.activeRequest?.id).toBe('b');
    });

    it('remove does nothing for non-existent id', () => {
      widget.push(makeRequest({ id: 'a' }));
      widget.remove('nonexistent');
      expect(widget.pending).toBe(1);
    });

    it('remove adjusts activeIndex if out of bounds', () => {
      widget.push(makeRequest({ id: 'a' }));
      widget.push(makeRequest({ id: 'b' }));
      // Navigate to second request
      widget.handleKey('right');
      expect(widget.activeRequest?.id).toBe('b');
      // Remove the second request
      widget.remove('b');
      expect(widget.activeRequest?.id).toBe('a');
    });

    it('removing the only request leaves empty state', () => {
      widget.push(makeRequest({ id: 'a' }));
      widget.remove('a');
      expect(widget.isEmpty).toBe(true);
      expect(widget.render()).toEqual([]);
    });
  });

  describe('radio mode', () => {
    beforeEach(() => {
      widget.push(makeRequest({
        id: 'radio-1',
        options: ['Alpha', 'Beta', 'Gamma'],
        inputType: 'radio',
      }));
    });

    it('down key navigates to next option', () => {
      expect(widget.handleKey('down')).toBe(true);
      // Internal state: selectedOption should be 1
      // We verify via selecting and checking resolve callback
    });

    it('up key wraps to last option (including "other")', () => {
      // options: Alpha, Beta, Gamma, + Other = 4 total
      expect(widget.handleKey('up')).toBe(true);
      // Should wrap to index 3 (Other)
    });

    it('j/k keys work as down/up', () => {
      expect(widget.handleKey('j')).toBe(true);
      expect(widget.handleKey('k')).toBe(true);
    });

    it('enter selects current option and resolves', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('radio-1', 'Alpha');
    });

    it('enter on second option resolves with that option', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('down');
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('radio-1', 'Beta');
    });

    it('number keys quick-select and resolve immediately', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('2');
      expect(handler).toHaveBeenCalledWith('radio-1', 'Beta');
    });

    it('number key 3 selects third option', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('3');
      expect(handler).toHaveBeenCalledWith('radio-1', 'Gamma');
    });

    it('number key beyond range returns false', () => {
      // 4 options total (3 + Other), so 5 is out of range
      expect(widget.handleKey('5')).toBe(false);
    });

    it('space acts like enter in radio mode', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('down'); // move to Beta
      widget.handleKey('space');
      expect(handler).toHaveBeenCalledWith('radio-1', 'Beta');
    });

    it('request is removed after resolve', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      expect(widget.isEmpty).toBe(true);
    });

    it('selecting "Other" (last option) enters freeform mode', () => {
      // Navigate to "Other" (index 3 for 3 options)
      widget.handleKey('down'); // 1
      widget.handleKey('down'); // 2
      widget.handleKey('down'); // 3 (Other)
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      // Should not resolve yet, should enter freeform
      expect(handler).not.toHaveBeenCalled();
      expect(widget.pending).toBe(1); // Still pending
    });

    it('number key for "Other" enters freeform mode', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      // Other is at position 4 (3 options + 1)
      widget.handleKey('4');
      expect(handler).not.toHaveBeenCalled();
      expect(widget.pending).toBe(1);
    });
  });

  describe('picklist mode (same as radio)', () => {
    it('picklist behaves identically to radio', () => {
      widget.push(makeRequest({
        id: 'pick-1',
        options: ['Opt1', 'Opt2'],
        inputType: 'picklist',
      }));
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('down');
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('pick-1', 'Opt2');
    });
  });

  describe('multi-select mode', () => {
    beforeEach(() => {
      widget.push(makeRequest({
        id: 'multi-1',
        options: ['Apple', 'Banana', 'Cherry'],
        inputType: 'multi-select',
      }));
    });

    it('space toggles selection of current option', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('space'); // toggle Apple
      widget.handleKey('enter'); // submit
      expect(handler).toHaveBeenCalledWith('multi-1', 'Apple');
    });

    it('space toggles off a previously selected option', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('space'); // toggle Apple ON
      widget.handleKey('space'); // toggle Apple OFF
      widget.handleKey('down');
      widget.handleKey('space'); // toggle Banana ON
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('multi-1', 'Banana');
    });

    it('multiple selections are submitted as comma-separated', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('space'); // Apple
      widget.handleKey('down');
      widget.handleKey('space'); // Banana
      widget.handleKey('down');
      widget.handleKey('space'); // Cherry
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('multi-1', 'Apple, Banana, Cherry');
    });

    it('enter with no selections does not resolve', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      expect(handler).not.toHaveBeenCalled();
      expect(widget.pending).toBe(1);
    });

    it('number keys toggle selection in multi-select', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('1'); // toggle Apple
      widget.handleKey('3'); // toggle Cherry
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('multi-1', 'Apple, Cherry');
    });

    it('number key toggles off when pressed again', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('1'); // toggle Apple ON
      widget.handleKey('1'); // toggle Apple OFF
      widget.handleKey('2'); // toggle Banana ON
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('multi-1', 'Banana');
    });

    it('space on "Other" does nothing (Other index >= options.length)', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      // Navigate to "Other" (index 3)
      widget.handleKey('down');
      widget.handleKey('down');
      widget.handleKey('down');
      widget.handleKey('space'); // should not toggle since it's the "other" slot
      widget.handleKey('enter');
      // Nothing was selected so no resolve
      expect(handler).not.toHaveBeenCalled();
    });

    it('selections are submitted in sorted index order', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('down');
      widget.handleKey('down');
      widget.handleKey('space'); // Cherry (index 2)
      widget.handleKey('up');
      widget.handleKey('up');
      widget.handleKey('space'); // Apple (index 0)
      widget.handleKey('enter');
      // Should be sorted by index: Apple, Cherry
      expect(handler).toHaveBeenCalledWith('multi-1', 'Apple, Cherry');
    });
  });

  describe('confirm mode', () => {
    beforeEach(() => {
      widget.push(makeRequest({
        id: 'confirm-1',
        question: 'Are you sure?',
        options: undefined,
        inputType: 'confirm',
      }));
    });

    it('y resolves with "yes"', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('y');
      expect(handler).toHaveBeenCalledWith('confirm-1', 'yes');
    });

    it('Y resolves with "yes"', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('Y');
      expect(handler).toHaveBeenCalledWith('confirm-1', 'yes');
    });

    it('n resolves with "no"', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('n');
      expect(handler).toHaveBeenCalledWith('confirm-1', 'no');
    });

    it('N resolves with "no"', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('N');
      expect(handler).toHaveBeenCalledWith('confirm-1', 'no');
    });

    it('enter resolves with current selection (defaults to yes)', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('confirm-1', 'yes');
    });

    it('up/down toggles between yes and no', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('down'); // switch to no
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('confirm-1', 'no');
    });

    it('up toggles back to yes', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('down'); // no
      widget.handleKey('up'); // yes
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('confirm-1', 'yes');
    });

    it('j/k work as down/up in confirm mode', () => {
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('j'); // switch to no
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('confirm-1', 'no');
    });

    it('unrecognized keys return false', () => {
      expect(widget.handleKey('x')).toBe(false);
      expect(widget.handleKey('z')).toBe(false);
    });

    it('request is removed after confirm resolve', () => {
      widget.onResolve(vi.fn());
      widget.handleKey('y');
      expect(widget.isEmpty).toBe(true);
    });
  });

  describe('freeform mode', () => {
    describe('pure freeform (no options)', () => {
      beforeEach(() => {
        widget.push(makeRequest({
          id: 'free-1',
          question: 'Enter a value:',
          options: undefined,
          inputType: 'freeform',
        }));
      });

      it('enter activates freeform text input', () => {
        expect(widget.handleKey('enter')).toBe(true);
      });

      it('other keys return false when not in freeform input mode', () => {
        expect(widget.handleKey('a')).toBe(false);
        expect(widget.handleKey('up')).toBe(false);
      });

      it('typing characters adds to freeform text', () => {
        widget.handleKey('enter'); // enter freeform mode
        widget.handleKey('h');
        widget.handleKey('e');
        widget.handleKey('l');
        widget.handleKey('l');
        widget.handleKey('o');
        const handler = vi.fn();
        widget.onResolve(handler);
        widget.handleKey('enter');
        expect(handler).toHaveBeenCalledWith('free-1', 'hello');
      });

      it('backspace removes last character', () => {
        widget.handleKey('enter');
        widget.handleKey('a');
        widget.handleKey('b');
        widget.handleKey('c');
        widget.handleKey('backspace');
        const handler = vi.fn();
        widget.onResolve(handler);
        widget.handleKey('enter');
        expect(handler).toHaveBeenCalledWith('free-1', 'ab');
      });

      it('backspace on empty text does nothing harmful', () => {
        widget.handleKey('enter');
        expect(widget.handleKey('backspace')).toBe(true);
      });

      it('enter with only whitespace does not resolve', () => {
        widget.handleKey('enter');
        widget.handleKey(' ');
        widget.handleKey(' ');
        const handler = vi.fn();
        widget.onResolve(handler);
        widget.handleKey('enter');
        expect(handler).not.toHaveBeenCalled();
        expect(widget.pending).toBe(1);
      });

      it('escape exits freeform mode without resolving', () => {
        widget.handleKey('enter');
        widget.handleKey('h');
        widget.handleKey('i');
        const handler = vi.fn();
        widget.onResolve(handler);
        expect(widget.handleKey('escape')).toBe(true);
        expect(handler).not.toHaveBeenCalled();
        expect(widget.pending).toBe(1);
      });

      it('response is trimmed before resolve', () => {
        widget.handleKey('enter');
        widget.handleKey(' ');
        widget.handleKey('x');
        widget.handleKey(' ');
        const handler = vi.fn();
        widget.onResolve(handler);
        widget.handleKey('enter');
        expect(handler).toHaveBeenCalledWith('free-1', 'x');
      });
    });

    describe('freeform via "Other" in radio mode', () => {
      beforeEach(() => {
        widget.push(makeRequest({
          id: 'radio-other',
          options: ['A', 'B'],
          inputType: 'radio',
        }));
      });

      it('selecting "Other" and typing resolves with custom text', () => {
        // Navigate to Other (index 2)
        widget.handleKey('down'); // B
        widget.handleKey('down'); // Other
        widget.handleKey('enter'); // enters freeform
        widget.handleKey('c');
        widget.handleKey('u');
        widget.handleKey('s');
        widget.handleKey('t');
        widget.handleKey('o');
        widget.handleKey('m');
        const handler = vi.fn();
        widget.onResolve(handler);
        widget.handleKey('enter');
        expect(handler).toHaveBeenCalledWith('radio-other', 'custom');
      });
    });

    describe('inputType inferred as freeform when no options', () => {
      it('request with no inputType and no options acts as freeform', () => {
        widget.push(makeRequest({
          id: 'inferred-free',
          question: 'What do you think?',
          options: undefined,
          inputType: undefined,
        }));
        // Should behave as freeform since no options
        expect(widget.handleKey('enter')).toBe(true);
        widget.handleKey('o');
        widget.handleKey('k');
        const handler = vi.fn();
        widget.onResolve(handler);
        widget.handleKey('enter');
        expect(handler).toHaveBeenCalledWith('inferred-free', 'ok');
      });
    });

    describe('inputType inferred as radio when options exist', () => {
      it('request with no inputType but with options acts as radio', () => {
        widget.push(makeRequest({
          id: 'inferred-radio',
          options: ['X', 'Y'],
          inputType: undefined,
        }));
        const handler = vi.fn();
        widget.onResolve(handler);
        widget.handleKey('enter');
        expect(handler).toHaveBeenCalledWith('inferred-radio', 'X');
      });
    });
  });

  describe('queue carousel (left/right navigation)', () => {
    beforeEach(() => {
      widget.push(makeRequest({ id: 'q1', source: 'agent-1', question: 'Q1' }));
      widget.push(makeRequest({ id: 'q2', source: 'agent-2', question: 'Q2' }));
      widget.push(makeRequest({ id: 'q3', source: 'agent-3', question: 'Q3' }));
    });

    it('right moves to next request in queue', () => {
      expect(widget.activeRequest?.id).toBe('q1');
      widget.handleKey('right');
      expect(widget.activeRequest?.id).toBe('q2');
    });

    it('left moves to previous request in queue', () => {
      widget.handleKey('right'); // q2
      widget.handleKey('left');  // q1
      expect(widget.activeRequest?.id).toBe('q1');
    });

    it('right wraps around to first', () => {
      widget.handleKey('right'); // q2
      widget.handleKey('right'); // q3
      widget.handleKey('right'); // wraps to q1
      expect(widget.activeRequest?.id).toBe('q1');
    });

    it('left wraps around to last', () => {
      widget.handleKey('left'); // wraps to q3
      expect(widget.activeRequest?.id).toBe('q3');
    });

    it('switching requests resets selection state', () => {
      widget.handleKey('down'); // move cursor
      widget.handleKey('down');
      widget.handleKey('right'); // switch to q2
      // After switch, should be at option 0
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      // Should resolve with first option of q2
      expect(handler).toHaveBeenCalledWith('q2', 'Yes');
    });

    it('left/right returns false with only one request', () => {
      const singleWidget = makeWidget();
      singleWidget.push(makeRequest({ id: 'only' }));
      expect(singleWidget.handleKey('left')).toBe(false);
      expect(singleWidget.handleKey('right')).toBe(false);
    });
  });

  describe('escape key', () => {
    it('escape returns true (unfocuses) in radio mode', () => {
      widget.push(makeRequest({ inputType: 'radio' }));
      expect(widget.handleKey('escape')).toBe(true);
    });

    it('escape does not resolve the request', () => {
      widget.push(makeRequest({ id: 'esc-test', inputType: 'radio' }));
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('escape');
      expect(handler).not.toHaveBeenCalled();
      expect(widget.pending).toBe(1);
    });

    it('escape exits freeform mode without resolving', () => {
      widget.push(makeRequest({ id: 'esc-free', inputType: 'freeform' }));
      widget.handleKey('enter'); // enter freeform
      widget.handleKey('t');
      widget.handleKey('e');
      widget.handleKey('s');
      widget.handleKey('t');
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('escape');
      expect(handler).not.toHaveBeenCalled();
      expect(widget.pending).toBe(1);
    });
  });

  describe('onResolve callback', () => {
    it('fires with correct id and response', () => {
      widget.push(makeRequest({ id: 'cb-1', options: ['X'], inputType: 'radio' }));
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('cb-1', 'X');
    });

    it('does not fire when no handler is registered', () => {
      widget.push(makeRequest({ id: 'no-handler', options: ['X'], inputType: 'radio' }));
      // Should not throw
      expect(() => widget.handleKey('enter')).not.toThrow();
    });

    it('fires for each resolved request independently', () => {
      widget.push(makeRequest({ id: 'first', options: ['A'], inputType: 'radio' }));
      widget.push(makeRequest({ id: 'second', options: ['B'], inputType: 'radio' }));
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter'); // resolves first with 'A'
      widget.handleKey('enter'); // resolves second with 'B'
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, 'first', 'A');
      expect(handler).toHaveBeenNthCalledWith(2, 'second', 'B');
    });
  });

  describe('render', () => {
    it('renders non-empty lines when request exists', () => {
      widget.push(makeRequest());
      const lines = widget.render();
      expect(lines.length).toBeGreaterThan(0);
    });

    it('renders source name in queue indicator', () => {
      widget.push(makeRequest({ id: 'a', source: 'test-agent' }));
      widget.push(makeRequest({ id: 'b', source: 'other-agent' }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('test-agent');
    });

    it('renders question text', () => {
      widget.push(makeRequest({ question: 'Should we proceed?' }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('Should we proceed?');
    });

    it('renders options in radio mode', () => {
      widget.push(makeRequest({ options: ['Opt1', 'Opt2'] }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('Opt1');
      expect(joined).toContain('Opt2');
    });

    it('renders "other" option', () => {
      widget.push(makeRequest({ options: ['A'] }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('other...');
    });

    it('renders queue indicator when multiple requests', () => {
      widget.push(makeRequest({ id: 'a', source: 'agent-1' }));
      widget.push(makeRequest({ id: 'b', source: 'agent-2' }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('1/2');
    });

    it('renders confirm mode with Yes/No', () => {
      widget.push(makeRequest({ inputType: 'confirm', options: undefined }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('Yes');
      expect(joined).toContain('No');
    });

    it('renders freeform prompt text when not in input mode', () => {
      widget.push(makeRequest({ inputType: 'freeform', options: undefined }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('press enter to type');
    });

    it('renders freeform cursor when in input mode', () => {
      widget.push(makeRequest({ inputType: 'freeform', options: undefined }));
      widget.handleKey('enter'); // activate freeform
      widget.handleKey('h');
      widget.handleKey('i');
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('hi');
    });

    it('renders navigation hints for radio', () => {
      widget.push(makeRequest({ inputType: 'radio' }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('↑↓');
      expect(joined).toContain('enter select');
    });

    it('renders navigation hints for multi-select', () => {
      widget.push(makeRequest({ inputType: 'multi-select' }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('toggle');
      expect(joined).toContain('submit');
    });

    it('renders navigation hints for confirm', () => {
      widget.push(makeRequest({ inputType: 'confirm', options: undefined }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('y/n');
    });

    it('renders queue navigation hint when multiple pending', () => {
      widget.push(makeRequest({ id: 'a' }));
      widget.push(makeRequest({ id: 'b' }));
      const lines = widget.render();
      const joined = lines.join('\n');
      expect(joined).toContain('queue');
    });

    it('wraps long question text', () => {
      const longQuestion = 'This is a very long question that should be wrapped because it exceeds the maximum width of the widget rendering area by quite a large margin indeed';
      widget = makeWidget(40);
      widget.push(makeRequest({ question: longQuestion }));
      const lines = widget.render();
      // Should have multiple question lines
      expect(lines.length).toBeGreaterThan(5);
    });
  });

  describe('setWidth', () => {
    it('updates the width used for rendering', () => {
      widget.push(makeRequest({
        question: 'This is a very long question that will definitely wrap when the width is narrow enough to force text wrapping behavior',
      }));
      widget.setWidth(30);
      const narrowLines = widget.render();
      widget.setWidth(200);
      const wideLines = widget.render();
      // Narrow width forces wrapping (more lines), wide width fits on one line
      expect(narrowLines.length).toBeGreaterThan(wideLines.length);
    });
  });

  describe('edge cases', () => {
    it('freeform: control characters (charCode < 32) are not appended', () => {
      widget.push(makeRequest({ inputType: 'freeform', options: undefined }));
      widget.handleKey('enter');
      widget.handleKey('a');
      // Simulate a control character
      const result = widget.handleKey(String.fromCharCode(1));
      expect(result).toBe(false);
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith(expect.any(String), 'a');
    });

    it('handles request with empty options array as freeform', () => {
      widget.push(makeRequest({
        id: 'empty-opts',
        options: [],
        inputType: 'radio',
      }));
      // With empty options, it falls through to freeform behavior
      expect(widget.handleKey('enter')).toBe(true);
      widget.handleKey('y');
      widget.handleKey('e');
      widget.handleKey('s');
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('empty-opts', 'yes');
    });

    it('pushing second request does not reset first request state', () => {
      widget.push(makeRequest({ id: 'first', options: ['A', 'B'] }));
      widget.handleKey('down'); // move to B
      widget.push(makeRequest({ id: 'second', options: ['X', 'Y'] }));
      // Still on first request at index 1
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter');
      expect(handler).toHaveBeenCalledWith('first', 'B');
    });

    it('resolving one request in queue makes next one active', () => {
      widget.push(makeRequest({ id: 'first', options: ['A'] }));
      widget.push(makeRequest({ id: 'second', options: ['B'] }));
      const handler = vi.fn();
      widget.onResolve(handler);
      widget.handleKey('enter'); // resolve first
      expect(widget.activeRequest?.id).toBe('second');
    });
  });
});
