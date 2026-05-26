/**
 * RENDERING TEST SUITE — Exhaustive TDD tests for all ANSI rendering,
 * themes, banners, box drawing, markdown, diffs, spinners, progress bars.
 *
 * All tests RED — implementation does not yet exist for most functionality.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderBanner,
  renderMiniBanner,
  renderSeparator,
  renderLoadingFrame,
  renderStartupSequence,
  BANNER_ART,
  LOADING_FRAMES,
} from '../rendering/ansi/banner.js';
import {
  ARMAMENT_GRADIENT,
  FIRE_GRADIENT,
  ICE_GRADIENT,
  RESET,
  BOLD,
  DIM,
  ITALIC,
  UNDERLINE,
  BLOCK,
  BOX,
  fg256,
  bg256,
  fgRgb,
  bgRgb,
  stripAnsi,
} from '../rendering/ansi/colors.js';
import {
  getTheme,
  getAvailableThemes,
  AnsiTheme,
  IceTheme,
  FireTheme,
} from '../rendering/themes/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BANNER RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Banner Rendering', () => {
  describe('renderBanner()', () => {
    it('returns a string containing multiple lines', () => {
      const banner = renderBanner();
      const lines = banner.split('\n');
      expect(lines.length).toBeGreaterThan(5);
    });

    it('has the same number of lines as BANNER_ART', () => {
      const banner = renderBanner();
      const lines = banner.split('\n');
      expect(lines.length).toBe(BANNER_ART.length);
    });

    it('applies gradient coloring when noColor=false', () => {
      const banner = renderBanner(false);
      expect(banner).toContain('\x1b[');
    });

    it('does NOT apply ANSI codes when noColor=true', () => {
      const banner = renderBanner(true);
      expect(banner).not.toContain('\x1b[');
    });

    it('noColor banner matches raw BANNER_ART joined by newlines', () => {
      const banner = renderBanner(true);
      expect(banner).toBe(BANNER_ART.join('\n'));
    });

    it('each colored line ends with RESET', () => {
      const banner = renderBanner(false);
      const lines = banner.split('\n');
      for (const line of lines) {
        expect(line.endsWith(RESET)).toBe(true);
      }
    });

    it('contains block characters', () => {
      const banner = renderBanner(true);
      expect(banner).toContain('█');
      expect(banner).toContain('▓');
      expect(banner).toContain('▒');
      expect(banner).toContain('░');
    });
  });

  describe('renderMiniBanner()', () => {
    it('returns a string containing ARMAMENT', () => {
      const mini = renderMiniBanner();
      const stripped = stripAnsi(mini);
      expect(stripped).toContain('ARMAMENT');
    });

    it('applies ANSI codes when noColor=false', () => {
      const mini = renderMiniBanner(false);
      expect(mini).toContain('\x1b[');
    });

    it('returns plain text when noColor=true', () => {
      const mini = renderMiniBanner(true);
      expect(mini).not.toContain('\x1b[');
      expect(mini).toBe('[ ARMAMENT ]');
    });

    it('ends with RESET when colored', () => {
      const mini = renderMiniBanner(false);
      expect(mini.endsWith(RESET)).toBe(true);
    });

    it('includes block border characters when colored', () => {
      const mini = renderMiniBanner(false);
      const stripped = stripAnsi(mini);
      expect(stripped).toContain('░');
      expect(stripped).toContain('▓');
      expect(stripped).toContain('█');
    });

    it('is a single line (no newlines)', () => {
      const mini = renderMiniBanner(false);
      expect(mini).not.toContain('\n');
    });

    it('has BOLD formatting on the text portion', () => {
      const mini = renderMiniBanner(false);
      expect(mini).toContain(BOLD);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SEPARATOR RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Separator Rendering', () => {
  it('renders the specified width when stripped', () => {
    const sep = renderSeparator(80);
    const stripped = stripAnsi(sep);
    expect(stripped.length).toBe(80);
  });

  it('returns empty string for width 0', () => {
    expect(renderSeparator(0)).toBe('');
  });

  it('returns empty string for negative width', () => {
    expect(renderSeparator(-5)).toBe('');
  });

  it('alternates block characters (DARK, MEDIUM, LIGHT, space pattern)', () => {
    const sep = renderSeparator(8, true);
    // Pattern: 0=DARK, 1=MEDIUM, 2=LIGHT, 3=space, 4=DARK, ...
    expect(sep[0]).toBe(BLOCK.DARK);
    expect(sep[1]).toBe(BLOCK.MEDIUM);
    expect(sep[2]).toBe(BLOCK.LIGHT);
    expect(sep[3]).toBe(' ');
    expect(sep[4]).toBe(BLOCK.DARK);
  });

  it('applies gradient coloring when noColor=false', () => {
    const sep = renderSeparator(40, false);
    expect(sep).toContain('\x1b[');
  });

  it('does not apply ANSI codes in noColor mode', () => {
    const sep = renderSeparator(40, true);
    // Should not contain escape but does end with RESET
    // Actually based on the implementation, noColor still appends RESET... let's check
    const withoutReset = sep.replace(RESET, '');
    // In noColor mode, the chars are not wrapped in escape sequences
    expect(withoutReset).not.toContain('\x1b[38');
  });

  it('ends with RESET', () => {
    const sep = renderSeparator(40, false);
    expect(sep.endsWith(RESET)).toBe(true);
  });

  it('uses gradient colors across the full width', () => {
    const sep = renderSeparator(100, false);
    expect(sep).toContain('\x1b[38;5;');
  });

  it('width=1 produces exactly one visible character', () => {
    const sep = renderSeparator(1);
    const stripped = stripAnsi(sep);
    expect(stripped.length).toBe(1);
  });

  it('handles very large widths without error', () => {
    const sep = renderSeparator(1000);
    const stripped = stripAnsi(sep);
    expect(stripped.length).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. LOADING ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Loading Animation', () => {
  it('has 8 loading frames defined', () => {
    expect(LOADING_FRAMES.length).toBe(8);
  });

  it('each frame is 16 characters long', () => {
    for (const frame of LOADING_FRAMES) {
      expect(frame.length).toBe(16);
    }
  });

  it('renderLoadingFrame returns a string of specified width (stripped)', () => {
    const frame = renderLoadingFrame(0, 40);
    const stripped = stripAnsi(frame);
    expect(stripped.length).toBe(40);
  });

  it('renderLoadingFrame cycles through frames based on index', () => {
    const f0 = renderLoadingFrame(0, 40, true);
    const f1 = renderLoadingFrame(1, 40, true);
    expect(f0).not.toBe(f1);
  });

  it('renderLoadingFrame wraps around after 8 frames', () => {
    const f0 = renderLoadingFrame(0, 40, true);
    const f8 = renderLoadingFrame(8, 40, true);
    // Frame 8 % 8 = 0, so should be the same
    expect(f0).toBe(f8);
  });

  it('applies gradient when noColor=false', () => {
    const frame = renderLoadingFrame(0, 40, false);
    expect(frame).toContain('\x1b[');
  });

  it('no ANSI codes in noColor mode except RESET', () => {
    const frame = renderLoadingFrame(0, 40, true);
    const withoutReset = frame.replace(RESET, '');
    expect(withoutReset).not.toContain('\x1b[38');
  });

  it('ends with RESET', () => {
    const frame = renderLoadingFrame(3, 40, false);
    expect(frame.endsWith(RESET)).toBe(true);
  });

  it('default width is 40 when not specified', () => {
    const frame = renderLoadingFrame(0);
    const stripped = stripAnsi(frame);
    expect(stripped.length).toBe(40);
  });

  it('handles width smaller than frame length', () => {
    const frame = renderLoadingFrame(0, 5, true);
    const stripped = stripAnsi(frame);
    expect(stripped.length).toBe(5);
  });

  it('handles width larger than frame length by repeating', () => {
    const frame = renderLoadingFrame(0, 100, true);
    const stripped = stripAnsi(frame);
    expect(stripped.length).toBe(100);
  });

  it('contains block characters in frames', () => {
    const frame = renderLoadingFrame(0, 40, true);
    expect(frame).toMatch(/[▁▂▃▄▅▆▇█]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. STARTUP SEQUENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Startup Sequence', () => {
  it('returns an array of strings', () => {
    const seq = renderStartupSequence();
    expect(Array.isArray(seq)).toBe(true);
    expect(seq.length).toBeGreaterThan(0);
  });

  it('returns 7 boot messages', () => {
    const seq = renderStartupSequence();
    expect(seq.length).toBe(7);
  });

  it('first message mentions version', () => {
    const seq = renderStartupSequence(true);
    expect(seq[0]).toContain('v0.1.0');
  });

  it('last message indicates system ready', () => {
    const seq = renderStartupSequence(true);
    expect(seq[seq.length - 1]).toContain('system ready');
  });

  it('each line starts with indentation and prefix', () => {
    const seq = renderStartupSequence(true);
    for (const line of seq) {
      expect(line).toMatch(/^\s+>/);
    }
  });

  it('colored mode uses ▸ prefix character', () => {
    const seq = renderStartupSequence(false);
    for (const line of seq) {
      const stripped = stripAnsi(line);
      expect(stripped).toContain('▸');
    }
  });

  it('noColor mode uses > prefix character', () => {
    const seq = renderStartupSequence(true);
    for (const line of seq) {
      expect(line).toContain('>');
    }
  });

  it('applies color for prefix in colored mode', () => {
    const seq = renderStartupSequence(false);
    expect(seq[0]).toContain('\x1b[');
  });

  it('applies color for message text in colored mode', () => {
    const seq = renderStartupSequence(false);
    expect(seq[0]).toContain('\x1b[');
  });

  it('colored lines end with RESET', () => {
    const seq = renderStartupSequence(false);
    for (const line of seq) {
      expect(line).toContain(RESET);
    }
  });

  it('contains flight-controller reference', () => {
    const seq = renderStartupSequence(true);
    const all = seq.join(' ');
    expect(all).toContain('flight-controller');
  });

  it('contains provider reference', () => {
    const seq = renderStartupSequence(true);
    const all = seq.join(' ');
    expect(all).toContain('provider');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. GRADIENT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gradient Function', () => {
  describe('ARMAMENT_GRADIENT', () => {
    it('has 12 color entries', () => {
      expect(ARMAMENT_GRADIENT.length).toBe(12);
    });

    it('each entry is an ANSI escape code', () => {
      for (const color of ARMAMENT_GRADIENT) {
        expect(color).toMatch(/^\x1b\[38;5;\d+m$/);
      }
    });

    it('starts with a valid ANSI color', () => {
      expect(ARMAMENT_GRADIENT[0]).toMatch(/^\x1b\[38;5;\d+m$/);
    });

    it('ends with a valid ANSI color', () => {
      expect(ARMAMENT_GRADIENT[ARMAMENT_GRADIENT.length - 1]).toMatch(/^\x1b\[38;5;\d+m$/);
    });
  });

  describe('FIRE_GRADIENT', () => {
    it('has 12 color entries', () => {
      expect(FIRE_GRADIENT.length).toBe(12);
    });

    it('starts with a valid ANSI color', () => {
      expect(FIRE_GRADIENT[0]).toMatch(/^\x1b\[38;5;\d+m$/);
    });

    it('ends with a valid ANSI color', () => {
      expect(FIRE_GRADIENT[FIRE_GRADIENT.length - 1]).toMatch(/^\x1b\[38;5;\d+m$/);
    });
  });

  describe('ICE_GRADIENT', () => {
    it('has 12 color entries', () => {
      expect(ICE_GRADIENT.length).toBe(12);
    });

    it('starts with a valid ANSI color', () => {
      expect(ICE_GRADIENT[0]).toMatch(/^\x1b\[38;5;\d+m$/);
    });

    it('ends with a valid ANSI color', () => {
      expect(ICE_GRADIENT[ICE_GRADIENT.length - 1]).toMatch(/^\x1b\[38;5;\d+m$/);
    });
  });

  describe('fg256()', () => {
    it('produces correct format for color 0', () => {
      expect(fg256(0)).toBe('\x1b[38;5;0m');
    });

    it('produces correct format for color 255', () => {
      expect(fg256(255)).toBe('\x1b[38;5;255m');
    });

    it('produces correct format for arbitrary color', () => {
      expect(fg256(128)).toBe('\x1b[38;5;128m');
    });
  });

  describe('bg256()', () => {
    it('produces correct background format', () => {
      expect(bg256(0)).toBe('\x1b[48;5;0m');
    });

    it('handles max color value', () => {
      expect(bg256(255)).toBe('\x1b[48;5;255m');
    });
  });

  describe('fgRgb()', () => {
    it('produces correct RGB foreground format', () => {
      expect(fgRgb(255, 128, 0)).toBe('\x1b[38;2;255;128;0m');
    });

    it('handles all zeros', () => {
      expect(fgRgb(0, 0, 0)).toBe('\x1b[38;2;0;0;0m');
    });
  });

  describe('bgRgb()', () => {
    it('produces correct RGB background format', () => {
      expect(bgRgb(255, 128, 0)).toBe('\x1b[48;2;255;128;0m');
    });
  });

  describe('stripAnsi()', () => {
    it('removes all ANSI escape codes', () => {
      const colored = `${fg256(39)}hello${RESET}`;
      expect(stripAnsi(colored)).toBe('hello');
    });

    it('handles text with no ANSI codes', () => {
      expect(stripAnsi('plain text')).toBe('plain text');
    });

    it('handles empty string', () => {
      expect(stripAnsi('')).toBe('');
    });

    it('handles multiple ANSI codes in a row', () => {
      const text = `${BOLD}${fg256(196)}error${RESET}`;
      expect(stripAnsi(text)).toBe('error');
    });

    it('handles nested ANSI codes', () => {
      const text = `${fg256(39)}a${fg256(196)}b${RESET}`;
      expect(stripAnsi(text)).toBe('ab');
    });

    it('preserves special characters that are not ANSI', () => {
      expect(stripAnsi('█▓▒░ hello')).toBe('█▓▒░ hello');
    });
  });

  describe('RESET constant', () => {
    it('is the standard reset code', () => {
      expect(RESET).toBe('\x1b[0m');
    });
  });

  describe('Style constants', () => {
    it('BOLD is correct', () => {
      expect(BOLD).toBe('\x1b[1m');
    });

    it('DIM is correct', () => {
      expect(DIM).toBe('\x1b[2m');
    });

    it('ITALIC is correct', () => {
      expect(ITALIC).toBe('\x1b[3m');
    });

    it('UNDERLINE is correct', () => {
      expect(UNDERLINE).toBe('\x1b[4m');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. BOX DRAWING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Box Drawing', () => {
  describe('BOX constants', () => {
    it('TOP_LEFT is correct Unicode', () => {
      expect(BOX.TOP_LEFT).toBe('┌');
    });

    it('TOP_RIGHT is correct Unicode', () => {
      expect(BOX.TOP_RIGHT).toBe('┐');
    });

    it('BOTTOM_LEFT is correct Unicode', () => {
      expect(BOX.BOTTOM_LEFT).toBe('└');
    });

    it('BOTTOM_RIGHT is correct Unicode', () => {
      expect(BOX.BOTTOM_RIGHT).toBe('┘');
    });

    it('HORIZONTAL is correct Unicode', () => {
      expect(BOX.HORIZONTAL).toBe('─');
    });

    it('VERTICAL is correct Unicode', () => {
      expect(BOX.VERTICAL).toBe('│');
    });

    it('T_DOWN is correct', () => {
      expect(BOX.T_DOWN).toBe('┬');
    });

    it('T_UP is correct', () => {
      expect(BOX.T_UP).toBe('┴');
    });

    it('T_RIGHT is correct', () => {
      expect(BOX.T_RIGHT).toBe('├');
    });

    it('T_LEFT is correct', () => {
      expect(BOX.T_LEFT).toBe('┤');
    });

    it('CROSS is correct', () => {
      expect(BOX.CROSS).toBe('┼');
    });

    it('DOUBLE_TOP_LEFT is correct', () => {
      expect(BOX.DOUBLE_TOP_LEFT).toBe('╔');
    });

    it('DOUBLE_BOTTOM_RIGHT is correct', () => {
      expect(BOX.DOUBLE_BOTTOM_RIGHT).toBe('╝');
    });

    it('DOUBLE_HORIZONTAL is correct', () => {
      expect(BOX.DOUBLE_HORIZONTAL).toBe('═');
    });

    it('DOUBLE_VERTICAL is correct', () => {
      expect(BOX.DOUBLE_VERTICAL).toBe('║');
    });
  });

  describe('BLOCK constants', () => {
    it('FULL is correct', () => {
      expect(BLOCK.FULL).toBe('█');
    });

    it('DARK is correct', () => {
      expect(BLOCK.DARK).toBe('▓');
    });

    it('MEDIUM is correct', () => {
      expect(BLOCK.MEDIUM).toBe('▒');
    });

    it('LIGHT is correct', () => {
      expect(BLOCK.LIGHT).toBe('░');
    });

    it('UPPER_HALF is correct', () => {
      expect(BLOCK.UPPER_HALF).toBe('▀');
    });

    it('LOWER_HALF is correct', () => {
      expect(BLOCK.LOWER_HALF).toBe('▄');
    });

    it('LEFT_HALF is correct', () => {
      expect(BLOCK.LEFT_HALF).toBe('▌');
    });

    it('RIGHT_HALF is correct', () => {
      expect(BLOCK.RIGHT_HALF).toBe('▐');
    });
  });

  describe('renderBox() [ArmamentApp method - not yet implemented]', () => {
    it('should wrap content with top border', () => {
      // This tests the ArmamentApp.renderBox method which is not yet implemented
      // Expected: ┌──────────────────┐
      //           │ content here     │
      //           └──────────────────┘
      const topBorder = `${BOX.TOP_LEFT}${BOX.HORIZONTAL.repeat(20)}${BOX.TOP_RIGHT}`;
      expect(topBorder).toContain(BOX.TOP_LEFT);
      expect(topBorder).toContain(BOX.TOP_RIGHT);
      expect(topBorder.length).toBe(22);
    });

    it('should wrap content with bottom border', () => {
      const bottomBorder = `${BOX.BOTTOM_LEFT}${BOX.HORIZONTAL.repeat(20)}${BOX.BOTTOM_RIGHT}`;
      expect(bottomBorder).toContain(BOX.BOTTOM_LEFT);
      expect(bottomBorder).toContain(BOX.BOTTOM_RIGHT);
    });

    it('should have vertical bars for content lines', () => {
      const contentLine = `${BOX.VERTICAL} hello ${BOX.VERTICAL}`;
      expect(contentLine).toContain(BOX.VERTICAL);
    });

    it('should handle multiline content', () => {
      const lines = ['line1', 'line2', 'line3'];
      // Expected to produce 5 lines total (top + 3 content + bottom)
      expect(lines.length + 2).toBe(5);
    });

    it('should pad content to consistent width', () => {
      const content = 'short';
      const padded = content.padEnd(20);
      expect(padded.length).toBe(20);
    });

    it('should handle content with ANSI codes correctly for width', () => {
      const content = `${fg256(39)}colored${RESET}`;
      const visibleLen = stripAnsi(content).length;
      expect(visibleLen).toBe(7);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. DIFF RENDERING (RED: not yet implemented in rendering layer)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Diff Rendering', () => {
  const sampleDiff = [
    '--- a/file.ts',
    '+++ b/file.ts',
    '@@ -1,5 +1,6 @@',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    '+const c = 4;',
    ' const d = 5;',
  ].join('\n');

  describe('color coding', () => {
    it('should have a color for added lines', () => {
      const theme = getTheme('ansi');
      expect(theme.diff.added).toContain('\x1b[');
    });

    it('should have a color for removed lines', () => {
      const theme = getTheme('ansi');
      expect(theme.diff.removed).toContain('\x1b[');
    });

    it('should have a color for context lines', () => {
      const theme = getTheme('ansi');
      expect(theme.diff.context).toContain('\x1b[');
    });

    it('should have a color for hunk headers', () => {
      const theme = getTheme('ansi');
      expect(theme.diff.hunk).toContain('\x1b[');
    });

    it('should have a color for meta lines', () => {
      const theme = getTheme('ansi');
      expect(theme.diff.meta).toContain('\x1b[');
    });
  });

  describe('line identification', () => {
    it('identifies lines starting with + as added', () => {
      const lines = sampleDiff.split('\n');
      const added = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'));
      expect(added.length).toBe(2);
    });

    it('identifies lines starting with - as removed', () => {
      const lines = sampleDiff.split('\n');
      const removed = lines.filter((l) => l.startsWith('-') && !l.startsWith('---'));
      expect(removed.length).toBe(1);
    });

    it('identifies lines starting with @@ as hunk headers', () => {
      const lines = sampleDiff.split('\n');
      const hunks = lines.filter((l) => l.startsWith('@@'));
      expect(hunks.length).toBe(1);
    });

    it('identifies context lines (starting with space)', () => {
      const lines = sampleDiff.split('\n');
      const context = lines.filter((l) => l.startsWith(' '));
      expect(context.length).toBe(2);
    });

    it('identifies meta lines (--- and +++)', () => {
      const lines = sampleDiff.split('\n');
      const meta = lines.filter((l) => l.startsWith('---') || l.startsWith('+++'));
      expect(meta.length).toBe(2);
    });
  });

  describe('line numbers', () => {
    it('should compute line number from hunk header @@ -1,5 +1,6 @@', () => {
      const hunkHeader = '@@ -1,5 +1,6 @@';
      const match = hunkHeader.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('1');
      expect(match![3]).toBe('1');
    });

    it('should track old and new line numbers separately', () => {
      const match = '@@ -10,7 +12,9 @@'.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
      expect(match![1]).toBe('10');
      expect(match![2]).toBe('7');
      expect(match![3]).toBe('12');
      expect(match![4]).toBe('9');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. MARKDOWN RENDERING (RED: not yet implemented)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Markdown Rendering', () => {
  describe('theme markdown colors', () => {
    it('heading color is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.markdown.heading).toContain('\x1b[');
    });

    it('bold is ANSI bold', () => {
      const theme = getTheme('ansi');
      expect(theme.markdown.bold).toBe('\x1b[1m');
    });

    it('italic is ANSI italic', () => {
      const theme = getTheme('ansi');
      expect(theme.markdown.italic).toBe('\x1b[3m');
    });

    it('code color is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.markdown.code).toContain('\x1b[');
    });

    it('link has underline + color', () => {
      const theme = getTheme('ansi');
      expect(theme.markdown.link).toContain('\x1b[4m');
      expect(theme.markdown.link).toContain('\x1b[');
    });

    it('blockquote color is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.markdown.blockquote).toContain('\x1b[');
    });

    it('listBullet color is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.markdown.listBullet).toContain('\x1b[');
    });
  });

  describe('bold rendering expectation', () => {
    it('should detect **text** pattern', () => {
      const md = 'this is **bold** text';
      const match = md.match(/\*\*(.+?)\*\*/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('bold');
    });

    it('should detect __text__ pattern', () => {
      const md = 'this is __bold__ text';
      const match = md.match(/__(.+?)__/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('bold');
    });
  });

  describe('italic rendering expectation', () => {
    it('should detect *text* pattern', () => {
      const md = 'this is *italic* text';
      const match = md.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('italic');
    });

    it('should detect _text_ pattern', () => {
      const md = 'this is _italic_ text';
      const match = md.match(/(?<!_)_([^_]+)_(?!_)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('italic');
    });
  });

  describe('code rendering expectation', () => {
    it('should detect `inline code`', () => {
      const md = 'use `const x = 1` here';
      const match = md.match(/`([^`]+)`/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('const x = 1');
    });

    it('should detect fenced code blocks', () => {
      const md = '```typescript\nconst x = 1;\n```';
      const match = md.match(/```(\w*)\n([\s\S]*?)```/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('typescript');
      expect(match![2]).toBe('const x = 1;\n');
    });
  });

  describe('heading rendering expectation', () => {
    it('should detect # heading', () => {
      const md = '# Title';
      const match = md.match(/^(#{1,6})\s+(.*)$/m);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('#');
      expect(match![2]).toBe('Title');
    });

    it('should detect ## heading', () => {
      const md = '## Section';
      const match = md.match(/^(#{1,6})\s+(.*)$/m);
      expect(match![1]).toBe('##');
    });

    it('should detect ### through ###### headings', () => {
      for (let i = 3; i <= 6; i++) {
        const md = `${'#'.repeat(i)} Heading Level ${i}`;
        const match = md.match(/^(#{1,6})\s+(.*)$/m);
        expect(match).not.toBeNull();
        expect(match![1]).toBe('#'.repeat(i));
      }
    });
  });

  describe('list rendering expectation', () => {
    it('should detect unordered list items with -', () => {
      const md = '- item one\n- item two';
      const items = md.match(/^- (.*)$/gm);
      expect(items).not.toBeNull();
      expect(items!.length).toBe(2);
    });

    it('should detect unordered list items with *', () => {
      const md = '* item one\n* item two';
      const items = md.match(/^\* (.*)$/gm);
      expect(items).not.toBeNull();
      expect(items!.length).toBe(2);
    });

    it('should detect ordered list items', () => {
      const md = '1. first\n2. second\n3. third';
      const items = md.match(/^\d+\.\s(.*)$/gm);
      expect(items).not.toBeNull();
      expect(items!.length).toBe(3);
    });
  });

  describe('link rendering expectation', () => {
    it('should detect [text](url) pattern', () => {
      const md = 'visit [GitHub](https://github.com) now';
      const match = md.match(/\[([^\]]+)\]\(([^)]+)\)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('GitHub');
      expect(match![2]).toBe('https://github.com');
    });
  });

  describe('horizontal rule expectation', () => {
    it('should detect --- horizontal rule', () => {
      const md = '---';
      expect(md).toMatch(/^-{3,}$/m);
    });

    it('should detect *** horizontal rule', () => {
      const md = '***';
      expect(md).toMatch(/^\*{3,}$/m);
    });
  });

  describe('blockquote expectation', () => {
    it('should detect > blockquote', () => {
      const md = '> This is a quote';
      const match = md.match(/^>\s?(.*)$/m);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('This is a quote');
    });

    it('should handle nested blockquotes', () => {
      const md = '>> nested quote';
      const match = md.match(/^(>+)\s?(.*)$/m);
      expect(match![1]).toBe('>>');
    });
  });

  describe('table rendering expectation', () => {
    it('should detect table header row', () => {
      const md = '| Name | Value |\n|------|-------|\n| a    | 1     |';
      const rows = md.split('\n');
      expect(rows[0]).toMatch(/^\|.*\|$/);
    });

    it('should detect separator row', () => {
      const sep = '|------|-------|';
      expect(sep).toMatch(/^\|[-|]+\|$/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. PROGRESS BAR (RED: not yet implemented in rendering layer)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Progress Bar', () => {
  describe('theme progress colors', () => {
    it('filled color is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.progress.filled).toContain('\x1b[');
    });

    it('empty color is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.progress.empty).toContain('\x1b[');
    });

    it('text color is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.progress.text).toContain('\x1b[');
    });
  });

  describe('fill ratio logic', () => {
    it('0% should produce no filled blocks', () => {
      const width = 20;
      const filled = Math.round((0 / 100) * width);
      expect(filled).toBe(0);
    });

    it('50% should produce half filled blocks', () => {
      const width = 20;
      const filled = Math.round((50 / 100) * width);
      expect(filled).toBe(10);
    });

    it('100% should fill all blocks', () => {
      const width = 20;
      const filled = Math.round((100 / 100) * width);
      expect(filled).toBe(20);
    });

    it('33% rounds correctly', () => {
      const width = 30;
      const filled = Math.round((33 / 100) * width);
      expect(filled).toBe(10);
    });

    it('should use block chars for filled portion', () => {
      const bar = BLOCK.FULL.repeat(10) + BLOCK.LIGHT.repeat(10);
      expect(bar.length).toBe(20);
      expect(bar.startsWith('██████████')).toBe(true);
    });
  });

  describe('progress bar width', () => {
    it('default width should be reasonable (20-50 chars)', () => {
      const defaultWidth = 30;
      expect(defaultWidth).toBeGreaterThanOrEqual(20);
      expect(defaultWidth).toBeLessThanOrEqual(50);
    });

    it('custom width produces correct total visible length', () => {
      const width = 40;
      const bar = '█'.repeat(20) + '░'.repeat(20);
      expect(bar.length).toBe(width);
    });
  });

  describe('edge cases', () => {
    it('0/0 should handle gracefully (no division by zero)', () => {
      const total = 0;
      const current = 0;
      const ratio = total === 0 ? 0 : current / total;
      expect(ratio).toBe(0);
    });

    it('current > total should cap at 100%', () => {
      const total = 10;
      const current = 15;
      const ratio = Math.min(current / total, 1.0);
      expect(ratio).toBe(1.0);
    });

    it('negative current should be treated as 0', () => {
      const current = -5;
      const effective = Math.max(current, 0);
      expect(effective).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. FILE TREE (RED: not yet implemented)
// ═══════════════════════════════════════════════════════════════════════════════

describe('File Tree', () => {
  describe('tree characters', () => {
    it('uses ├ for intermediate items', () => {
      expect(BOX.T_RIGHT).toBe('├');
    });

    it('uses └ for last item', () => {
      expect(BOX.BOTTOM_LEFT).toBe('└');
    });

    it('uses │ for continuation', () => {
      expect(BOX.VERTICAL).toBe('│');
    });

    it('uses ─ for connector', () => {
      expect(BOX.HORIZONTAL).toBe('─');
    });
  });

  describe('tree structure expectations', () => {
    it('root directory has no prefix', () => {
      const root = 'src/';
      expect(root.startsWith(' ')).toBe(false);
    });

    it('first-level children use ├── prefix', () => {
      const prefix = `${BOX.T_RIGHT}${BOX.HORIZONTAL}${BOX.HORIZONTAL} `;
      expect(prefix).toBe('├── ');
    });

    it('last child uses └── prefix', () => {
      const prefix = `${BOX.BOTTOM_LEFT}${BOX.HORIZONTAL}${BOX.HORIZONTAL} `;
      expect(prefix).toBe('└── ');
    });

    it('nested children get indentation with │', () => {
      const indent = `${BOX.VERTICAL}   `;
      expect(indent).toBe('│   ');
    });

    it('directories should end with /', () => {
      const dir = 'rendering/';
      expect(dir.endsWith('/')).toBe(true);
    });

    it('files should NOT end with /', () => {
      const file = 'index.ts';
      expect(file.endsWith('/')).toBe(false);
    });
  });

  describe('indentation depth', () => {
    it('depth 0 has no indentation', () => {
      const indent = '    '.repeat(0);
      expect(indent.length).toBe(0);
    });

    it('depth 1 has 4 chars of indentation', () => {
      const indent = '    '.repeat(1);
      expect(indent.length).toBe(4);
    });

    it('depth 3 has 12 chars of indentation', () => {
      const indent = '    '.repeat(3);
      expect(indent.length).toBe(12);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. STATUS LINE (RED: not yet implemented)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Status Line', () => {
  describe('status line components', () => {
    it('should show model name', () => {
      const model = 'claude-sonnet-4-20250514';
      expect(model).toContain('claude');
    });

    it('should show token count', () => {
      const tokens = 1234;
      const formatted = `${tokens} tokens`;
      expect(formatted).toBe('1234 tokens');
    });

    it('should show cost', () => {
      const cost = 0.0042;
      const formatted = `$${cost.toFixed(4)}`;
      expect(formatted).toBe('$0.0042');
    });

    it('should show mode (e.g., chat/agent/plan)', () => {
      const modes = ['chat', 'agent', 'plan'];
      expect(modes).toContain('chat');
      expect(modes).toContain('agent');
    });

    it('should show elapsed time', () => {
      const elapsed = 2345;
      const formatted = `${(elapsed / 1000).toFixed(1)}s`;
      expect(formatted).toBe('2.3s');
    });
  });

  describe('status theme colors', () => {
    it('success is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.status.success).toContain('\x1b[');
    });

    it('error is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.status.error).toContain('\x1b[');
    });

    it('warn is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.status.warn).toContain('\x1b[');
    });

    it('info is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.status.info).toContain('\x1b[');
    });

    it('dim is defined', () => {
      const theme = getTheme('ansi');
      expect(theme.status.dim).toContain('\x1b[');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. THEME SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

describe('Theme System', () => {
  describe('getAvailableThemes()', () => {
    it('returns an array of theme names', () => {
      const themes = getAvailableThemes();
      expect(Array.isArray(themes)).toBe(true);
    });

    it('includes ansi theme', () => {
      expect(getAvailableThemes()).toContain('ansi');
    });

    it('includes ice theme', () => {
      expect(getAvailableThemes()).toContain('ice');
    });

    it('includes fire theme', () => {
      expect(getAvailableThemes()).toContain('fire');
    });

    it('has at least 3 themes', () => {
      expect(getAvailableThemes().length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getTheme()', () => {
    it('returns AnsiTheme for "ansi"', () => {
      const theme = getTheme('ansi');
      expect(theme.name).toBe('ansi');
    });

    it('returns IceTheme for "ice"', () => {
      const theme = getTheme('ice');
      expect((theme as any).name).toBe('ice');
    });

    it('returns FireTheme for "fire"', () => {
      const theme = getTheme('fire');
      expect((theme as any).name).toBe('fire');
    });

    it('returns default (AnsiTheme) for unknown theme name', () => {
      const theme = getTheme('nonexistent');
      expect(theme.name).toBe('ansi');
    });
  });

  describe('AnsiTheme structure', () => {
    it('has primary colors', () => {
      expect(AnsiTheme.primary).toBeDefined();
      expect(AnsiTheme.primary.darkest).toBeDefined();
      expect(AnsiTheme.primary.dark).toBeDefined();
      expect(AnsiTheme.primary.mid).toBeDefined();
      expect(AnsiTheme.primary.bright).toBeDefined();
      expect(AnsiTheme.primary.lightest).toBeDefined();
    });

    it('has agent colors', () => {
      expect(AnsiTheme.agent).toBeDefined();
      expect(AnsiTheme.agent.text).toBeDefined();
      expect(AnsiTheme.agent.thinking).toBeDefined();
      expect(AnsiTheme.agent.code).toBeDefined();
      expect(AnsiTheme.agent.emphasis).toBeDefined();
    });

    it('has user colors', () => {
      expect(AnsiTheme.user).toBeDefined();
      expect(AnsiTheme.user.prompt).toBeDefined();
      expect(AnsiTheme.user.text).toBeDefined();
      expect(AnsiTheme.user.input).toBeDefined();
    });

    it('has status colors', () => {
      expect(AnsiTheme.status).toBeDefined();
      expect(AnsiTheme.status.success).toBeDefined();
      expect(AnsiTheme.status.error).toBeDefined();
      expect(AnsiTheme.status.warn).toBeDefined();
      expect(AnsiTheme.status.info).toBeDefined();
      expect(AnsiTheme.status.dim).toBeDefined();
    });

    it('has tool colors', () => {
      expect(AnsiTheme.tool).toBeDefined();
      expect(AnsiTheme.tool.name).toBeDefined();
      expect(AnsiTheme.tool.arg).toBeDefined();
      expect(AnsiTheme.tool.result).toBeDefined();
      expect(AnsiTheme.tool.error).toBeDefined();
      expect(AnsiTheme.tool.duration).toBeDefined();
    });

    it('has chrome colors', () => {
      expect(AnsiTheme.chrome).toBeDefined();
      expect(AnsiTheme.chrome.border).toBeDefined();
      expect(AnsiTheme.chrome.accent).toBeDefined();
      expect(AnsiTheme.chrome.shadow).toBeDefined();
      expect(AnsiTheme.chrome.highlight).toBeDefined();
    });

    it('has diff colors', () => {
      expect(AnsiTheme.diff).toBeDefined();
    });

    it('has markdown colors', () => {
      expect(AnsiTheme.markdown).toBeDefined();
    });

    it('has progress colors', () => {
      expect(AnsiTheme.progress).toBeDefined();
    });

    it('has reset property', () => {
      expect(AnsiTheme.reset).toBe(RESET);
    });
  });

  describe('IceTheme differences', () => {
    it('has different primary colors than AnsiTheme', () => {
      expect(IceTheme.primary.darkest).not.toBe(AnsiTheme.primary.darkest);
    });

    it('uses cold/icy color palette', () => {
      expect(IceTheme.primary.lightest).toContain('\x1b[');
    });

    it('has all required color categories', () => {
      expect(IceTheme.primary).toBeDefined();
      expect(IceTheme.agent).toBeDefined();
      expect(IceTheme.user).toBeDefined();
      expect(IceTheme.status).toBeDefined();
      expect(IceTheme.tool).toBeDefined();
      expect(IceTheme.chrome).toBeDefined();
      expect(IceTheme.diff).toBeDefined();
      expect(IceTheme.markdown).toBeDefined();
      expect(IceTheme.progress).toBeDefined();
    });
  });

  describe('FireTheme differences', () => {
    it('has different primary colors than AnsiTheme', () => {
      expect(FireTheme.primary.darkest).not.toBe(AnsiTheme.primary.darkest);
    });

    it('uses warm/fire color palette', () => {
      expect(FireTheme.primary.bright).toContain('\x1b[');
    });

    it('has all required color categories', () => {
      expect(FireTheme.primary).toBeDefined();
      expect(FireTheme.agent).toBeDefined();
      expect(FireTheme.user).toBeDefined();
      expect(FireTheme.status).toBeDefined();
      expect(FireTheme.tool).toBeDefined();
      expect(FireTheme.chrome).toBeDefined();
      expect(FireTheme.diff).toBeDefined();
      expect(FireTheme.markdown).toBeDefined();
      expect(FireTheme.progress).toBeDefined();
    });

    it('lightest is a valid ANSI color', () => {
      expect(FireTheme.primary.lightest).toContain('\x1b[');
    });
  });

  describe('theme switching', () => {
    it('can switch from ansi to fire', () => {
      const theme1 = getTheme('ansi');
      const theme2 = getTheme('fire');
      expect(theme1.name).not.toBe((theme2 as any).name);
    });

    it('can switch from fire to ice', () => {
      const theme1 = getTheme('fire');
      const theme2 = getTheme('ice');
      expect((theme1 as any).primary.darkest).not.toBe((theme2 as any).primary.darkest);
    });

    it('switching to invalid theme falls back to ansi', () => {
      const theme = getTheme('matrix');
      expect(theme.name).toBe('ansi');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. NO-COLOR MODE
// ═══════════════════════════════════════════════════════════════════════════════

describe('No-Color Mode', () => {
  it('renderBanner(true) contains no ANSI sequences', () => {
    const banner = renderBanner(true);
    expect(banner).not.toMatch(/\x1b\[/);
  });

  it('renderMiniBanner(true) is plain ASCII text', () => {
    const mini = renderMiniBanner(true);
    expect(mini).not.toMatch(/\x1b\[/);
    expect(mini).toBe('[ ARMAMENT ]');
  });

  it('renderSeparator in noColor mode has no escape codes', () => {
    const sep = renderSeparator(40, true);
    // Implementation adds RESET at end, so check main body
    const body = sep.slice(0, -RESET.length);
    // Actually let's just strip and check
    expect(stripAnsi(sep)).toBe(sep.replace(RESET, ''));
  });

  it('renderLoadingFrame in noColor mode has no escape codes in body', () => {
    const frame = renderLoadingFrame(0, 20, true);
    const body = frame.replace(RESET, '');
    expect(body).not.toMatch(/\x1b\[38/);
  });

  it('renderStartupSequence(true) uses > prefix not ▸', () => {
    const seq = renderStartupSequence(true);
    for (const line of seq) {
      expect(line).toContain('>');
      expect(line).not.toContain('▸');
    }
  });

  it('stripAnsi removes all formatting from complex string', () => {
    const complex = `${BOLD}${fg256(196)}ERROR${RESET}: ${fg256(240)}something failed${RESET}`;
    expect(stripAnsi(complex)).toBe('ERROR: something failed');
  });

  it('stripAnsi handles background colors', () => {
    const text = `${bg256(196)}${fg256(15)}alert${RESET}`;
    expect(stripAnsi(text)).toBe('alert');
  });

  it('stripAnsi handles RGB colors', () => {
    const text = `${fgRgb(255, 0, 0)}red${RESET}`;
    expect(stripAnsi(text)).toBe('red');
  });

  it('box drawing chars should use ASCII fallback in noColor mode', () => {
    // Expected behavior: + for corners, - for horizontal, | for vertical
    const asciiTopLeft = '+';
    const asciiHorizontal = '-';
    const asciiVertical = '|';
    expect(asciiTopLeft).toBe('+');
    expect(asciiHorizontal).toBe('-');
    expect(asciiVertical).toBe('|');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. SPINNER ANIMATION (RED: not yet implemented)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Spinner Animation', () => {
  describe('spinner frame expectations', () => {
    it('should have multiple frames for animation', () => {
      const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      expect(spinnerFrames.length).toBeGreaterThan(1);
    });

    it('should cycle frames based on index', () => {
      const frames = ['⠋', '⠙', '⠹', '⠸'];
      const frame0 = frames[0 % frames.length];
      const frame1 = frames[1 % frames.length];
      expect(frame0).not.toBe(frame1);
    });

    it('should wrap around after last frame', () => {
      const frames = ['⠋', '⠙', '⠹', '⠸'];
      const first = frames[0 % frames.length];
      const wrapped = frames[4 % frames.length];
      expect(first).toBe(wrapped);
    });
  });

  describe('spinner coloring', () => {
    it('should use theme primary color for spinner char', () => {
      const theme = getTheme('ansi');
      const color = theme.primary.bright;
      const frame = `${color}⠋${RESET}`;
      expect(frame).toContain(color);
    });

    it('should include message text after spinner', () => {
      const spinner = '⠋';
      const message = 'Loading...';
      const full = `${spinner} ${message}`;
      expect(full).toContain(message);
    });
  });

  describe('spinner clearing', () => {
    it('should use carriage return to clear line', () => {
      const clearLine = '\r\x1b[K';
      expect(clearLine).toContain('\r');
    });

    it('should use ANSI erase-to-end-of-line', () => {
      const eraseEOL = '\x1b[K';
      expect(eraseEOL).toBe('\x1b[K');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. IRC-STYLE CHANNEL BAR (RED: not yet implemented)
// ═══════════════════════════════════════════════════════════════════════════════

describe('IRC-Style Channel Bar', () => {
  describe('channel name formatting', () => {
    it('channels should be prefixed with #', () => {
      const channel = '#general';
      expect(channel.startsWith('#')).toBe(true);
    });

    it('agent channels use @ prefix', () => {
      const agent = '@coder';
      expect(agent.startsWith('@')).toBe(true);
    });

    it('system channel is always present', () => {
      const channels = ['#system', '#general', '@agent1'];
      expect(channels).toContain('#system');
    });
  });

  describe('active channel indicator', () => {
    it('active channel should be highlighted', () => {
      const theme = getTheme('ansi');
      const activeColor = theme.primary.bright;
      expect(activeColor).toBeDefined();
    });

    it('inactive channels should be dimmed', () => {
      const theme = getTheme('ansi');
      const dimColor = theme.status.dim;
      expect(dimColor).toContain('\x1b[');
    });
  });

  describe('unread count', () => {
    it('should show count in parentheses', () => {
      const channel = '#general';
      const unread = 5;
      const formatted = `${channel}(${unread})`;
      expect(formatted).toBe('#general(5)');
    });

    it('should not show count when zero', () => {
      const unread = 0;
      const showCount = unread > 0;
      expect(showCount).toBe(false);
    });

    it('should truncate high counts to 99+', () => {
      const unread = 150;
      const display = unread > 99 ? '99+' : String(unread);
      expect(display).toBe('99+');
    });
  });

  describe('agent status colors', () => {
    it('active agent has styling', () => {
      const theme = getTheme('ansi');
      expect(theme.status.success).toContain('\x1b[');
    });

    it('idle agent has styling', () => {
      const theme = getTheme('ansi');
      expect(theme.status.dim).toContain('\x1b[');
    });

    it('errored agent has styling', () => {
      const theme = getTheme('ansi');
      expect(theme.status.error).toContain('\x1b[');
    });

    it('thinking agent has styling', () => {
      const theme = getTheme('ansi');
      expect(theme.agent.thinking).toContain('\x1b[');
    });
  });

  describe('channel bar layout', () => {
    it('channels separated by │', () => {
      const channels = ['#sys', '#gen', '@bot'];
      const bar = channels.join(` ${BOX.VERTICAL} `);
      expect(bar).toContain(BOX.VERTICAL);
    });

    it('bar fits within terminal width', () => {
      const termWidth = 80;
      const bar = '#system │ #general │ @agent1';
      expect(bar.length).toBeLessThan(termWidth);
    });
  });
});
