// TDD-RED: Tests for ScreenBuffer class (not yet implemented)
// Virtual terminal screen buffer with ANSI support, regions, and efficient rendering

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';

describe('ScreenBuffer', () => {
  let buffer: ScreenBuffer;

  beforeEach(() => {
    buffer = new ScreenBuffer(80, 24);
  });

  describe('initialization', () => {
    it('should create a buffer with specified dimensions', () => {
      expect(buffer.width).toBe(80);
      expect(buffer.height).toBe(24);
    });

    it('should initialize all cells as empty spaces', () => {
      const content = buffer.toString();
      expect(content.split('\n').length).toBe(24);
      expect(content.split('\n')[0].length).toBeLessThanOrEqual(80);
    });

    it('should throw on invalid dimensions', () => {
      expect(() => new ScreenBuffer(0, 24)).toThrow();
      expect(() => new ScreenBuffer(80, 0)).toThrow();
      expect(() => new ScreenBuffer(-1, 24)).toThrow();
    });

    it('should accept minimum dimensions (1x1)', () => {
      const tiny = new ScreenBuffer(1, 1);
      expect(tiny.width).toBe(1);
      expect(tiny.height).toBe(1);
    });
  });

  describe('writing text', () => {
    it('should write text at specific row/col position', () => {
      buffer.writeAt(0, 0, 'Hello');
      expect(buffer.toString()).toContain('Hello');
    });

    it('should write text at middle position', () => {
      buffer.writeAt(5, 10, 'Test');
      const lines = buffer.toString().split('\n');
      expect(lines[5]).toContain('Test');
    });

    it('should overwrite existing text at same position', () => {
      buffer.writeAt(0, 0, 'First');
      buffer.writeAt(0, 0, 'Second');
      const firstLine = buffer.toString().split('\n')[0];
      expect(firstLine).toContain('Second');
      expect(firstLine).not.toContain('First');
    });

    it('should handle text extending beyond width by truncating', () => {
      const longText = 'A'.repeat(100);
      buffer.writeAt(0, 0, longText);
      const firstLine = buffer.toString().split('\n')[0];
      expect(firstLine.replace(/\s+$/g, '').length).toBeLessThanOrEqual(80);
    });

    it('should throw when writing to negative positions', () => {
      expect(() => buffer.writeAt(-1, 0, 'Text')).toThrow();
      expect(() => buffer.writeAt(0, -1, 'Text')).toThrow();
    });

    it('should throw when writing beyond height', () => {
      expect(() => buffer.writeAt(25, 0, 'Text')).toThrow();
    });

    it('should handle empty string writes', () => {
      buffer.writeAt(0, 0, '');
      expect(buffer.toString()).toBeDefined();
    });

    it('should handle multi-character unicode correctly', () => {
      buffer.writeAt(0, 0, '◉ ● ○ ✓ ✗ ⚠');
      expect(buffer.toString()).toContain('◉ ● ○ ✓ ✗ ⚠');
    });
  });

  describe('ANSI color support', () => {
    it('should preserve ANSI escape codes when writing', () => {
      const coloredText = '\x1b[31mRed\x1b[0m';
      buffer.writeAt(0, 0, coloredText);
      expect(buffer.toStringWithANSI()).toContain('\x1b[31m');
    });

    it('should handle multiple ANSI codes in one string', () => {
      const text = '\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m';
      buffer.writeAt(0, 0, text);
      const result = buffer.toStringWithANSI();
      expect(result).toContain('\x1b[31m');
      expect(result).toContain('\x1b[32m');
      expect(result).toContain('\x1b[34m');
    });

    it('should strip ANSI codes in plain toString()', () => {
      const coloredText = '\x1b[31mRed\x1b[0m';
      buffer.writeAt(0, 0, coloredText);
      const plain = buffer.toString();
      expect(plain).not.toContain('\x1b[31m');
      expect(plain).toContain('Red');
    });

    it('should handle bold, dim, and other ANSI styles', () => {
      const styled = '\x1b[1mBold\x1b[0m \x1b[2mDim\x1b[0m \x1b[3mItalic\x1b[0m';
      buffer.writeAt(0, 0, styled);
      expect(buffer.toStringWithANSI()).toContain('\x1b[1m');
      expect(buffer.toStringWithANSI()).toContain('\x1b[2m');
    });

    it('should handle RGB color codes', () => {
      const rgb = '\x1b[38;2;255;100;50mCustom Color\x1b[0m';
      buffer.writeAt(0, 0, rgb);
      expect(buffer.toStringWithANSI()).toContain('38;2;255;100;50');
    });
  });

  describe('screen regions', () => {
    it('should define a region with boundaries', () => {
      const region = buffer.defineRegion('sidebar', 0, 0, 20, 24);
      expect(region.name).toBe('sidebar');
      expect(region.width).toBe(20);
      expect(region.height).toBe(24);
    });

    it('should write to a defined region', () => {
      const region = buffer.defineRegion('main', 20, 0, 60, 24);
      buffer.writeToRegion('main', 0, 0, 'Content');
      expect(buffer.toString()).toContain('Content');
    });

    it('should constrain writes to region boundaries', () => {
      buffer.defineRegion('small', 0, 0, 10, 5);
      const longText = 'A'.repeat(50);
      buffer.writeToRegion('small', 0, 0, longText);
      const firstLine = buffer.toString().split('\n')[0];
      expect(firstLine.replace(/\s+$/g, '').length).toBeLessThanOrEqual(10);
    });

    it('should throw when writing to undefined region', () => {
      expect(() => buffer.writeToRegion('nonexistent', 0, 0, 'Test')).toThrow();
    });

    it('should support multiple overlapping regions', () => {
      buffer.defineRegion('full', 0, 0, 80, 24);
      buffer.defineRegion('left', 0, 0, 40, 24);
      buffer.defineRegion('right', 40, 0, 40, 24);
      expect(buffer.getRegion('full')).toBeDefined();
      expect(buffer.getRegion('left')).toBeDefined();
      expect(buffer.getRegion('right')).toBeDefined();
    });

    it('should throw on invalid region dimensions', () => {
      expect(() => buffer.defineRegion('invalid', -1, 0, 10, 10)).toThrow();
      expect(() => buffer.defineRegion('invalid', 0, 0, 0, 10)).toThrow();
      expect(() => buffer.defineRegion('invalid', 0, 0, 90, 10)).toThrow(); // beyond width
    });
  });

  describe('clearing', () => {
    it('should clear entire screen', () => {
      buffer.writeAt(0, 0, 'Test content');
      buffer.clear();
      const content = buffer.toString();
      expect(content).not.toContain('Test content');
    });

    it('should clear specific region', () => {
      buffer.defineRegion('sidebar', 0, 0, 20, 24);
      buffer.writeToRegion('sidebar', 0, 0, 'Sidebar');
      buffer.writeAt(0, 30, 'Main');
      buffer.clearRegion('sidebar');
      const content = buffer.toString();
      expect(content).not.toContain('Sidebar');
      expect(content).toContain('Main');
    });

    it('should clear specific line', () => {
      buffer.writeAt(0, 0, 'Line 1');
      buffer.writeAt(1, 0, 'Line 2');
      buffer.clearLine(0);
      const lines = buffer.toString().split('\n');
      expect(lines[0]).not.toContain('Line 1');
      expect(lines[1]).toContain('Line 2');
    });

    it('should clear rectangle area', () => {
      buffer.writeAt(0, 0, 'A'.repeat(80));
      buffer.writeAt(1, 0, 'B'.repeat(80));
      buffer.clearRect(0, 0, 40, 2);
      const content = buffer.toString();
      const lines = content.split('\n');
      expect(lines[0].substring(0, 40).trim()).toBe('');
      expect(lines[0].substring(40)).toContain('A');
    });
  });

  describe('resize handling', () => {
    it('should resize buffer preserving content', () => {
      buffer.writeAt(0, 0, 'Content');
      buffer.resize(100, 30);
      expect(buffer.width).toBe(100);
      expect(buffer.height).toBe(30);
      expect(buffer.toString()).toContain('Content');
    });

    it('should handle resize to smaller dimensions', () => {
      buffer.writeAt(0, 0, 'Line 1');
      buffer.writeAt(20, 0, 'Line 20');
      buffer.resize(80, 10);
      expect(buffer.height).toBe(10);
      const lines = buffer.toString().split('\n');
      expect(lines.length).toBe(10);
    });

    it('should update regions on resize', () => {
      buffer.defineRegion('main', 0, 0, 80, 24);
      buffer.resize(100, 30);
      // Regions should recalculate if needed
      expect(buffer.width).toBe(100);
    });

    it('should emit resize event', () => {
      const handler = vi.fn();
      buffer.on('resize', handler);
      buffer.resize(100, 30);
      expect(handler).toHaveBeenCalledWith({ width: 100, height: 30 });
    });

    it('should throw on invalid resize dimensions', () => {
      expect(() => buffer.resize(0, 24)).toThrow();
      expect(() => buffer.resize(80, -1)).toThrow();
    });
  });

  describe('rendering optimization', () => {
    it('should track dirty cells for efficient redraw', () => {
      buffer.writeAt(0, 0, 'Test');
      expect(buffer.getDirtyCells().length).toBeGreaterThan(0);
    });

    it('should clear dirty state after rendering', () => {
      buffer.writeAt(0, 0, 'Test');
      buffer.render();
      expect(buffer.getDirtyCells().length).toBe(0);
    });

    it('should generate diff for changed cells only', () => {
      buffer.writeAt(0, 0, 'Original');
      buffer.render();
      buffer.writeAt(10, 10, 'New');
      const diff = buffer.getDiff();
      expect(diff.length).toBeLessThan(buffer.width * buffer.height);
      expect(diff).toEqual(expect.arrayContaining([
        expect.objectContaining({ row: 10, col: 10 })
      ]));
    });

    it('should render full screen on first render', () => {
      buffer.writeAt(0, 0, 'Test');
      const diff = buffer.getDiff();
      expect(diff.length).toBe(buffer.width * buffer.height);
    });

    it('should optimize consecutive writes to same area', () => {
      buffer.render(); // establish baseline
      buffer.writeAt(0, 0, 'A');
      buffer.writeAt(0, 1, 'B');
      buffer.writeAt(0, 2, 'C');
      const diff = buffer.getDiff();
      // Should mark minimal dirty region
      expect(diff.length).toBeLessThan(buffer.width * buffer.height);
    });
  });

  describe('cursor control', () => {
    it('should set cursor position', () => {
      buffer.setCursor(10, 5);
      const cursor = buffer.getCursor();
      expect(cursor.row).toBe(10);
      expect(cursor.col).toBe(5);
    });

    it('should show cursor', () => {
      buffer.showCursor();
      expect(buffer.isCursorVisible()).toBe(true);
    });

    it('should hide cursor', () => {
      buffer.showCursor();
      buffer.hideCursor();
      expect(buffer.isCursorVisible()).toBe(false);
    });

    it('should include cursor in ANSI output when visible', () => {
      buffer.setCursor(5, 5);
      buffer.showCursor();
      const output = buffer.toANSIString();
      expect(output).toContain('\x1b[6;6H'); // ANSI cursor position (1-indexed)
    });

    it('should throw on invalid cursor position', () => {
      expect(() => buffer.setCursor(-1, 0)).toThrow();
      expect(() => buffer.setCursor(0, -1)).toThrow();
      expect(() => buffer.setCursor(25, 0)).toThrow();
      expect(() => buffer.setCursor(0, 81)).toThrow();
    });
  });

  describe('scrolling', () => {
    it('should scroll up by one line', () => {
      buffer.writeAt(0, 0, 'Line 1');
      buffer.writeAt(1, 0, 'Line 2');
      buffer.scrollUp(1);
      const lines = buffer.toString().split('\n');
      expect(lines[0]).toContain('Line 2');
    });

    it('should scroll down by one line', () => {
      buffer.writeAt(0, 0, 'Line 1');
      buffer.writeAt(1, 0, 'Line 2');
      buffer.scrollDown(1);
      const lines = buffer.toString().split('\n');
      expect(lines[1]).toContain('Line 1');
    });

    it('should scroll multiple lines', () => {
      for (let i = 0; i < 10; i++) {
        buffer.writeAt(i, 0, `Line ${i}`);
      }
      buffer.scrollUp(5);
      const lines = buffer.toString().split('\n');
      expect(lines[0]).toContain('Line 5');
    });

    it('should handle scrolling beyond buffer size', () => {
      buffer.writeAt(0, 0, 'Test');
      buffer.scrollUp(50);
      expect(buffer.toString()).toBeDefined();
    });

    it('should scroll within a region', () => {
      buffer.defineRegion('scrollable', 0, 0, 80, 10);
      buffer.writeToRegion('scrollable', 0, 0, 'Line 1');
      buffer.writeToRegion('scrollable', 1, 0, 'Line 2');
      buffer.scrollRegionUp('scrollable', 1);
      expect(buffer.toString()).toBeDefined();
    });
  });

  describe('alternate buffer', () => {
    it('should switch to alternate buffer', () => {
      buffer.writeAt(0, 0, 'Main content');
      buffer.switchToAlternate();
      buffer.writeAt(0, 0, 'Alt content');
      expect(buffer.toString()).toContain('Alt content');
      expect(buffer.toString()).not.toContain('Main content');
    });

    it('should restore main buffer', () => {
      buffer.writeAt(0, 0, 'Main content');
      buffer.switchToAlternate();
      buffer.writeAt(0, 0, 'Alt content');
      buffer.switchToMain();
      expect(buffer.toString()).toContain('Main content');
      expect(buffer.toString()).not.toContain('Alt content');
    });

    it('should preserve cursor position across buffer switch', () => {
      buffer.setCursor(5, 10);
      buffer.switchToAlternate();
      const cursor = buffer.getCursor();
      expect(cursor.row).toBe(5);
      expect(cursor.col).toBe(10);
    });
  });

  describe('full render output', () => {
    it('should render to string with newlines', () => {
      buffer.writeAt(0, 0, 'Line 1');
      buffer.writeAt(1, 0, 'Line 2');
      const output = buffer.toString();
      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output.split('\n').length).toBe(24);
    });

    it('should render to ANSI string with escape codes', () => {
      buffer.writeAt(0, 0, '\x1b[31mRed\x1b[0m');
      buffer.setCursor(0, 0);
      buffer.showCursor();
      const output = buffer.toANSIString();
      expect(output).toContain('\x1b[31m');
      expect(output).toContain('\x1b[0m');
    });

    it('should generate minimal ANSI for diff render', () => {
      buffer.writeAt(0, 0, 'Test');
      buffer.render();
      buffer.writeAt(10, 10, 'Change');
      const diffANSI = buffer.renderDiff();
      // Should only contain escape codes for changed position
      expect(diffANSI).toContain('\x1b[11;11H'); // Move to row 11, col 11 (1-indexed)
      expect(diffANSI).toContain('Change');
      expect(diffANSI.length).toBeLessThan(buffer.toANSIString().length);
    });
  });
});
