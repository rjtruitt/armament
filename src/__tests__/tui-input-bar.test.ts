// TDD-RED: Tests for InputBar class (not yet implemented)
// Input bar at bottom with channel indicator, text input, and cursor

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InputBar } from '../tui/InputBar.js';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';

describe('InputBar', () => {
  let buffer: ScreenBuffer;
  let inputBar: InputBar;
  let region: any;

  beforeEach(() => {
    vi.useFakeTimers();
    buffer = new ScreenBuffer(80, 24);
    region = { x: 22, y: 22, width: 58, height: 1 };
    inputBar = new InputBar(buffer, region);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create input bar', () => {
      expect(inputBar).toBeDefined();
    });

    it('should accept buffer and region', () => {
      expect(inputBar.getRegion()).toEqual(region);
    });

    it('should throw without buffer', () => {
      expect(() => new InputBar(null as any, region)).toThrow();
    });

    it('should throw without region', () => {
      expect(() => new InputBar(buffer, null as any)).toThrow();
    });

    it('should initialize with empty text', () => {
      expect(inputBar.getText()).toBe('');
    });

    it('should initialize with default channel', () => {
      expect(inputBar.getChannel()).toBe('#control');
    });
  });

  describe('rendering', () => {
    it('should render channel indicator', () => {
      inputBar.render();
      const content = buffer.toString();
      expect(content).toContain('#control |');
    });

    it('should render input text', () => {
      inputBar.setText('hello world');
      inputBar.render();
      const content = buffer.toString();
      expect(content).toContain('hello world');
    });

    it('should render cursor', () => {
      inputBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toBeDefined();
    });

    it('should render within region bounds', () => {
      inputBar.setText('A'.repeat(100));
      inputBar.render();
      expect(() => inputBar.render()).not.toThrow();
    });

    it('should apply background color', () => {
      inputBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should show cursor at correct position', () => {
      inputBar.setText('test');
      inputBar.setCursorPosition(2);
      inputBar.render();
      expect(inputBar.getCursorPosition()).toBe(2);
    });
  });

  describe('channel indicator', () => {
    it('should show current channel', () => {
      inputBar.setChannel('#general');
      inputBar.render();
      const content = buffer.toString();
      expect(content).toContain('#general |');
    });

    it('should update when channel changes', () => {
      inputBar.setChannel('#general');
      inputBar.render();
      const content1 = buffer.toString();
      buffer.clear();
      inputBar.setChannel('#agent-1');
      inputBar.render();
      const content2 = buffer.toString();
      expect(content2).toContain('#agent-1 |');
      expect(content2).not.toContain('#general |');
    });

    it('should style channel indicator', () => {
      inputBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should handle long channel names', () => {
      inputBar.setChannel('#very-long-channel-name');
      inputBar.render();
      expect(() => inputBar.render()).not.toThrow();
    });

    it('should emit channel:change event', () => {
      const handler = vi.fn();
      inputBar.on('channel:change', handler);
      inputBar.setChannel('#general');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ channel: '#general' })
      );
    });
  });

  describe('text input', () => {
    it('should set text', () => {
      inputBar.setText('hello');
      expect(inputBar.getText()).toBe('hello');
    });

    it('should append text', () => {
      inputBar.setText('hello');
      inputBar.appendText(' world');
      expect(inputBar.getText()).toBe('hello world');
    });

    it('should insert text at cursor', () => {
      inputBar.setText('helo');
      inputBar.setCursorPosition(3);
      inputBar.insertText('l');
      expect(inputBar.getText()).toBe('hello');
    });

    it('should delete character before cursor', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(5);
      inputBar.backspace();
      expect(inputBar.getText()).toBe('hell');
    });

    it('should delete character at cursor', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(2);
      inputBar.delete();
      expect(inputBar.getText()).toBe('helo');
    });

    it('should handle empty backspace', () => {
      inputBar.setText('');
      inputBar.backspace();
      expect(inputBar.getText()).toBe('');
    });

    it('should handle backspace at start', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(0);
      inputBar.backspace();
      expect(inputBar.getText()).toBe('hello');
    });

    it('should clear text', () => {
      inputBar.setText('hello world');
      inputBar.clear();
      expect(inputBar.getText()).toBe('');
    });

    it('should emit text:change event', () => {
      const handler = vi.fn();
      inputBar.on('text:change', handler);
      inputBar.setText('test');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'test' })
      );
    });
  });

  describe('cursor', () => {
    it('should set cursor position', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(3);
      expect(inputBar.getCursorPosition()).toBe(3);
    });

    it('should move cursor left', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(3);
      inputBar.moveCursorLeft();
      expect(inputBar.getCursorPosition()).toBe(2);
    });

    it('should move cursor right', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(2);
      inputBar.moveCursorRight();
      expect(inputBar.getCursorPosition()).toBe(3);
    });

    it('should not move cursor left beyond start', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(0);
      inputBar.moveCursorLeft();
      expect(inputBar.getCursorPosition()).toBe(0);
    });

    it('should not move cursor right beyond end', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(5);
      inputBar.moveCursorRight();
      expect(inputBar.getCursorPosition()).toBe(5);
    });

    it('should move cursor to start', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(3);
      inputBar.moveCursorToStart();
      expect(inputBar.getCursorPosition()).toBe(0);
    });

    it('should move cursor to end', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(2);
      inputBar.moveCursorToEnd();
      expect(inputBar.getCursorPosition()).toBe(5);
    });

    it('should show cursor', () => {
      inputBar.showCursor();
      expect(inputBar.isCursorVisible()).toBe(true);
    });

    it('should hide cursor', () => {
      inputBar.hideCursor();
      expect(inputBar.isCursorVisible()).toBe(false);
    });

    it('should blink cursor', async () => {
      inputBar.showCursor();
      inputBar.render();
      const visible1 = inputBar.isCursorVisible();

      await vi.advanceTimersByTimeAsync(500);
      const visible2 = inputBar.isCursorVisible();

      expect(visible1).not.toBe(visible2);
    });

    it('should update cursor position after insert', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(2);
      inputBar.insertText('XX');
      expect(inputBar.getCursorPosition()).toBe(4);
    });

    it('should update cursor position after backspace', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(3);
      inputBar.backspace();
      expect(inputBar.getCursorPosition()).toBe(2);
    });
  });

  describe('keyboard handling', () => {
    it('should handle character input', () => {
      inputBar.handleKey('a');
      inputBar.handleKey('b');
      inputBar.handleKey('c');
      expect(inputBar.getText()).toBe('abc');
    });

    it('should handle left arrow', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(5);
      inputBar.handleKey('left');
      expect(inputBar.getCursorPosition()).toBe(4);
    });

    it('should handle right arrow', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(2);
      inputBar.handleKey('right');
      expect(inputBar.getCursorPosition()).toBe(3);
    });

    it('should handle home key', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(3);
      inputBar.handleKey('home');
      expect(inputBar.getCursorPosition()).toBe(0);
    });

    it('should handle end key', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(2);
      inputBar.handleKey('end');
      expect(inputBar.getCursorPosition()).toBe(5);
    });

    it('should handle backspace key', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(5);
      inputBar.handleKey('backspace');
      expect(inputBar.getText()).toBe('hell');
    });

    it('should handle delete key', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(2);
      inputBar.handleKey('delete');
      expect(inputBar.getText()).toBe('helo');
    });

    it('should handle enter key', () => {
      const handler = vi.fn();
      inputBar.on('submit', handler);
      inputBar.setText('test');
      inputBar.handleKey('enter');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'test' })
      );
    });

    it('should handle ctrl+a (select all)', () => {
      inputBar.setText('hello');
      inputBar.handleKey('ctrl+a');
      expect(inputBar.getCursorPosition()).toBe(0);
    });

    it('should handle ctrl+e (end)', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(0);
      inputBar.handleKey('ctrl+e');
      expect(inputBar.getCursorPosition()).toBe(5);
    });

    it('should handle ctrl+u (clear line)', () => {
      inputBar.setText('hello');
      inputBar.handleKey('ctrl+u');
      expect(inputBar.getText()).toBe('');
    });

    it('should handle ctrl+k (kill to end)', () => {
      inputBar.setText('hello world');
      inputBar.setCursorPosition(5);
      inputBar.handleKey('ctrl+k');
      expect(inputBar.getText()).toBe('hello');
    });

    it('should handle ctrl+w (delete word)', () => {
      inputBar.setText('hello world');
      inputBar.setCursorPosition(11);
      inputBar.handleKey('ctrl+w');
      expect(inputBar.getText()).toBe('hello ');
    });
  });

  describe('paste handling', () => {
    it('should paste text at cursor', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(5);
      inputBar.paste(' world');
      expect(inputBar.getText()).toBe('hello world');
    });

    it('should paste multi-line text as single line', () => {
      inputBar.paste('line1\nline2');
      expect(inputBar.getText()).toBe('line1 line2');
    });

    it('should paste at cursor position', () => {
      inputBar.setText('hello');
      inputBar.setCursorPosition(2);
      inputBar.paste('XX');
      expect(inputBar.getText()).toBe('heXXllo');
    });

    it('should emit paste event', () => {
      const handler = vi.fn();
      inputBar.on('paste', handler);
      inputBar.paste('test');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('history navigation', () => {
    it('should add to history on submit', () => {
      inputBar.setText('command1');
      inputBar.submit();
      expect(inputBar.getHistory()).toContain('command1');
    });

    it('should navigate up in history', () => {
      inputBar.setText('command1');
      inputBar.submit();
      inputBar.setText('command2');
      inputBar.submit();
      inputBar.historyUp();
      expect(inputBar.getText()).toBe('command2');
    });

    it('should navigate down in history', () => {
      inputBar.setText('command1');
      inputBar.submit();
      inputBar.setText('command2');
      inputBar.submit();
      inputBar.historyUp();
      inputBar.historyUp();
      inputBar.historyDown();
      expect(inputBar.getText()).toBe('command2');
    });

    it('should handle up arrow for history', () => {
      inputBar.setText('test');
      inputBar.submit();
      inputBar.handleKey('up');
      expect(inputBar.getText()).toBe('test');
    });

    it('should handle down arrow for history', () => {
      inputBar.setText('test');
      inputBar.submit();
      inputBar.handleKey('up');
      inputBar.handleKey('down');
      expect(inputBar.getText()).toBe('');
    });

    it('should not add empty commands to history', () => {
      inputBar.setText('');
      inputBar.submit();
      expect(inputBar.getHistory().length).toBe(0);
    });

    it('should not add duplicate consecutive commands', () => {
      inputBar.setText('test');
      inputBar.submit();
      inputBar.setText('test');
      inputBar.submit();
      expect(inputBar.getHistory().length).toBe(1);
    });

    it('should limit history size', () => {
      for (let i = 0; i < 150; i++) {
        inputBar.setText(`command${i}`);
        inputBar.submit();
      }
      expect(inputBar.getHistory().length).toBeLessThanOrEqual(100);
    });

    it('should save current draft when navigating history', () => {
      inputBar.setText('draft');
      inputBar.historyUp();
      inputBar.historyDown();
      expect(inputBar.getText()).toBe('draft');
    });
  });

  describe('tab completion', () => {
    it('should trigger completion on tab', () => {
      const handler = vi.fn();
      inputBar.on('complete', handler);
      inputBar.setText('/hel');
      inputBar.handleKey('tab');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ text: '/hel' })
      );
    });

    it('should complete command', () => {
      inputBar.setCompletions(['/help', '/history', '/clear']);
      inputBar.setText('/hel');
      inputBar.complete();
      expect(inputBar.getText()).toBe('/help');
    });

    it('should cycle through completions', () => {
      inputBar.setCompletions(['/help', '/hello', '/header']);
      inputBar.setText('/hel');
      inputBar.complete();
      expect(inputBar.getText()).toBe('/help');
      inputBar.complete();
      expect(inputBar.getText()).toBe('/hello');
    });

    it('should reset completion on text change', () => {
      inputBar.setCompletions(['/help', '/hello']);
      inputBar.setText('/hel');
      inputBar.complete();
      inputBar.insertText('x');
      inputBar.complete();
      expect(inputBar.getCompletionIndex()).toBe(0);
    });

    it('should handle no completions', () => {
      inputBar.setText('xyz');
      inputBar.complete();
      expect(inputBar.getText()).toBe('xyz');
    });
  });

  describe('multi-line input', () => {
    it('should support multi-line mode', () => {
      const multiLine = new InputBar(buffer, { ...region, height: 2 });
      multiLine.setText('line1\nline2');
      multiLine.render();
      expect(multiLine.getText()).toContain('\n');
    });

    it('should handle shift+enter for new line', () => {
      const multiLine = new InputBar(buffer, { ...region, height: 3 });
      multiLine.setText('line1');
      multiLine.handleKey('shift+enter');
      multiLine.appendText('line2');
      expect(multiLine.getText()).toContain('\n');
    });

    it('should handle backslash continuation', () => {
      inputBar.setText('command \\');
      inputBar.handleKey('enter');
      expect(inputBar.isMultiLine()).toBe(true);
    });

    it('should submit multi-line on unmodified enter', () => {
      const handler = vi.fn();
      inputBar.on('submit', handler);
      inputBar.setText('line1\nline2');
      inputBar.handleKey('enter');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('should emit submit event', () => {
      const handler = vi.fn();
      inputBar.on('submit', handler);
      inputBar.setText('test command');
      inputBar.submit();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'test command',
          channel: '#control'
        })
      );
    });

    it('should clear text after submit', () => {
      inputBar.setText('test');
      inputBar.submit();
      expect(inputBar.getText()).toBe('');
    });

    it('should reset cursor after submit', () => {
      inputBar.setText('test');
      inputBar.setCursorPosition(2);
      inputBar.submit();
      expect(inputBar.getCursorPosition()).toBe(0);
    });

    it('should add to history on submit', () => {
      inputBar.setText('test');
      inputBar.submit();
      expect(inputBar.getHistory()).toContain('test');
    });

    it('should not submit empty text by default', () => {
      const handler = vi.fn();
      inputBar.on('submit', handler);
      inputBar.setText('');
      inputBar.submit();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should submit empty text if allowed', () => {
      const custom = new InputBar(buffer, region, { allowEmpty: true });
      const handler = vi.fn();
      custom.on('submit', handler);
      custom.setText('');
      custom.submit();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('scrolling', () => {
    it('should scroll text when exceeds width', () => {
      inputBar.setText('A'.repeat(100));
      inputBar.render();
      expect(() => inputBar.render()).not.toThrow();
    });

    it('should keep cursor visible when scrolling', () => {
      inputBar.setText('A'.repeat(100));
      inputBar.setCursorPosition(50);
      inputBar.render();
      expect(inputBar.getScrollOffset()).toBeGreaterThan(0);
    });

    it('should scroll left when cursor moves left', () => {
      inputBar.setText('A'.repeat(100));
      inputBar.setCursorPosition(80);
      inputBar.render();
      inputBar.moveCursorLeft();
      inputBar.render();
      expect(inputBar.getScrollOffset()).toBeDefined();
    });

    it('should scroll right when cursor moves right', () => {
      inputBar.setText('A'.repeat(100));
      inputBar.setCursorPosition(20);
      inputBar.moveCursorRight();
      inputBar.render();
      expect(inputBar.getScrollOffset()).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should validate input on submit', () => {
      const validator = vi.fn(() => true);
      inputBar.setValidator(validator);
      inputBar.setText('test');
      inputBar.submit();
      expect(validator).toHaveBeenCalledWith('test');
    });

    it('should prevent submit if invalid', () => {
      const handler = vi.fn();
      inputBar.on('submit', handler);
      inputBar.setValidator(() => false);
      inputBar.setText('test');
      inputBar.submit();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should emit validation:error on invalid', () => {
      const handler = vi.fn();
      inputBar.on('validation:error', handler);
      inputBar.setValidator(() => false);
      inputBar.setText('test');
      inputBar.submit();
      expect(handler).toHaveBeenCalled();
    });

    it('should show error message on validation fail', () => {
      inputBar.setValidator(() => false);
      inputBar.setText('test');
      inputBar.submit();
      const error = inputBar.getValidationError();
      expect(error).toBeDefined();
    });
  });

  describe('styling', () => {
    it('should apply background color', () => {
      inputBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should style channel indicator', () => {
      inputBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should style cursor', () => {
      inputBar.showCursor();
      inputBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should respect theme', () => {
      inputBar.setTheme('ice');
      inputBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });
  });

  describe('edge cases', () => {
    it('should handle very long text', () => {
      inputBar.setText('A'.repeat(10000));
      expect(() => inputBar.render()).not.toThrow();
    });

    it('should handle unicode characters', () => {
      inputBar.setText('Hello 世界 🎉');
      inputBar.render();
      expect(inputBar.getText()).toBe('Hello 世界 🎉');
    });

    it('should handle rapid input', () => {
      for (let i = 0; i < 100; i++) {
        inputBar.handleKey('a');
      }
      expect(inputBar.getText().length).toBe(100);
    });

    it('should handle region resize', () => {
      inputBar.setText('test');
      inputBar.setRegion({ ...region, width: 30 });
      inputBar.render();
      expect(inputBar.getRegion().width).toBe(30);
    });
  });
});
