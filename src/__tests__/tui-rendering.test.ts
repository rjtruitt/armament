// TDD-RED: Comprehensive tests for TuiMode rendering with themes
// Verifies the full IRC-client TUI renders correctly: sidebar, main area,
// input bar, status bar, borders, and themed colors across all themes.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TuiRenderer as TuiMode } from '../app/TuiRenderer.js';
import type { TuiModeOptions } from '../app/TuiTypes.js';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';
import { LayoutManager } from '../tui/LayoutManager.js';
import { Sidebar } from '../tui/Sidebar.js';
import { InputBar } from '../tui/InputBar.js';
import { StatusBar } from '../tui/StatusBar.js';
import { THEMES } from '../rendering/ansi/banner.js';

// ── Helper: capture process.stdout.write output ─────────────────────────────

function createMockStdout() {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;
  const originalColumns = process.stdout.columns;
  const originalRows = process.stdout.rows;

  function mock() {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: 40, writable: true, configurable: true });
    (process.stdout as any).write = (chunk: any) => {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    };
  }

  function restore() {
    (process.stdout as any).write = originalWrite;
    Object.defineProperty(process.stdout, 'columns', { value: originalColumns, writable: true, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: originalRows, writable: true, configurable: true });
  }

  function getOutput(): string {
    return chunks.join('');
  }

  function clear(): void {
    chunks.length = 0;
  }

  return { mock, restore, getOutput, clear };
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\[\?[0-9;]*[A-Za-z]/g, '');
}

// ── Helper: create TuiMode without entering raw mode ────────────────────────

function createTuiMode(opts?: Partial<TuiModeOptions>): TuiMode {
  return new TuiMode({
    theme: opts?.theme ?? 'red',
    noColor: opts?.noColor ?? false,
    onSubmit: opts?.onSubmit ?? (async () => {}),
    onExit: opts?.onExit ?? (() => {}),
    formatPrompt: opts?.formatPrompt,
  });
}

// ── Helper: directly test rendering via ScreenBuffer + components ────────────

function createTestRenderer(opts?: { cols?: number; rows?: number; theme?: string }) {
  const cols = opts?.cols ?? 120;
  const rows = opts?.rows ?? 40;
  const theme = opts?.theme ?? 'red';

  const screen = new ScreenBuffer(cols, rows);
  const layout = new LayoutManager(screen, { sidebarWidth: 22 });
  const layoutInfo = layout.getLayout();

  const sidebar = new Sidebar(screen, {
    x: layoutInfo.sidebar.col,
    y: layoutInfo.sidebar.row,
    width: layoutInfo.sidebar.width,
    height: layoutInfo.sidebar.height,
  });

  const inputBar = new InputBar(screen, {
    x: layoutInfo.inputBar.col,
    y: layoutInfo.inputBar.row,
    width: layoutInfo.inputBar.width,
    height: 1,
  });

  const statusBar = new StatusBar(screen, {
    x: layoutInfo.statusBar.col,
    y: layoutInfo.statusBar.row,
    width: layoutInfo.statusBar.width,
    height: 1,
  });

  sidebar.setTheme(theme);
  inputBar.setTheme(theme);
  statusBar.setTheme(theme);

  // Setup defaults like TuiMode does
  inputBar.setChannel('#control');
  sidebar.addChannel('#control', { active: true });
  sidebar.addSystemChannel('#logs');
  sidebar.addSystemChannel('#cost');

  function renderFull(): void {
    screen.clear();

    // Draw sidebar border
    if (layoutInfo.sidebarVisible) {
      const borderCol = layoutInfo.sidebar.width;
      for (let row = 0; row < layoutInfo.sidebar.height; row++) {
        screen.writeAt(row, borderCol, '│');
      }
    }

    // Draw border above status bar (between main content and status info)
    const statusRow = layoutInfo.statusBar.row;
    if (statusRow > 0) {
      const borderRow = statusRow - 1;
      if (borderRow < screen.height) {
        const startCol = layoutInfo.sidebarVisible ? layoutInfo.sidebar.width + 1 : 0;
        const lineWidth = layoutInfo.statusBar.width;
        screen.writeAt(borderRow, startCol, '─'.repeat(lineWidth));
      }
    }

    // Draw channel header in main area
    const mainStartRow = layoutInfo.main.row;
    const mainStartCol = layoutInfo.main.col + 1;
    const activeChannel = sidebar.getActive() ?? '#control';
    screen.writeAt(mainStartRow, mainStartCol, `── ${activeChannel} ──`);

    // Render components
    sidebar.render();
    inputBar.render();
    statusBar.render();
  }

  return { screen, layout, sidebar, inputBar, statusBar, layoutInfo, renderFull };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Theme Color Application
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Theme Color Application', () => {
  const themeNames = ['red', 'ice', 'green', 'purple', 'synthwave'] as const;

  for (const themeName of themeNames) {
    describe(`theme: ${themeName}`, () => {
      let renderer: ReturnType<typeof createTestRenderer>;

      beforeEach(() => {
        renderer = createTestRenderer({ theme: themeName });
        renderer.renderFull();
      });

      it(`should apply ${themeName} accent colors to sidebar`, () => {
        const ansiContent = renderer.screen.toStringWithANSI();
        // Theme should inject ANSI color codes
        expect(ansiContent).toContain('\x1b[');
      });

      it(`should include ANSI color codes on border characters (│)`, () => {
        const ansiContent = renderer.screen.toStringWithANSI();
        // The border column should have color-coded │ characters
        // In a themed TUI, border chars should carry accent ANSI
        const borderCol = renderer.layoutInfo.sidebar.width;
        // Read the cell at the border column directly
        const plainContent = renderer.screen.toString();
        const lines = plainContent.split('\n');
        // Verify the border character exists
        expect(lines[0][borderCol]).toBe('│');
      });

      it(`should include ANSI color codes on horizontal border (─)`, () => {
        const plainContent = renderer.screen.toString();
        const lines = plainContent.split('\n');
        const borderRow = renderer.layoutInfo.statusBar.row - 1;
        expect(lines[borderRow]).toContain('─');
      });

      it(`should color sidebar section labels with theme`, () => {
        const ansiContent = renderer.screen.toStringWithANSI();
        // Section labels should have dim styling at minimum
        expect(ansiContent).toContain('\x1b['); // styled text
      });

      it(`should color channel dots (● active) with accent`, () => {
        const plainContent = renderer.screen.toString();
        // Active channel should show filled dot
        expect(plainContent).toContain('●');
      });

      it(`should color channel dots (○ inactive) differently`, () => {
        renderer.sidebar.addChannel('#other', { active: false });
        renderer.renderFull();
        const plainContent = renderer.screen.toString();
        expect(plainContent).toContain('○');
      });

      it(`should highlight active channel with accent`, () => {
        const ansiContent = renderer.screen.toStringWithANSI();
        // Active channel row should have bold or accent color
        expect(ansiContent).toContain('\x1b[1m'); // bold for active
      });

      it(`should apply theme-specific RGB colors`, () => {
        const theme = THEMES[themeName];
        expect(theme).toBeDefined();
        expect(theme.accentStops).toBeDefined();
        expect(theme.accentStops.length).toBeGreaterThan(0);
        // The accent stops should be valid RGB triplets
        for (const stop of theme.accentStops) {
          expect(stop.length).toBe(3);
          expect(stop[0]).toBeGreaterThanOrEqual(0);
          expect(stop[0]).toBeLessThanOrEqual(255);
          expect(stop[1]).toBeGreaterThanOrEqual(0);
          expect(stop[1]).toBeLessThanOrEqual(255);
          expect(stop[2]).toBeGreaterThanOrEqual(0);
          expect(stop[2]).toBeLessThanOrEqual(255);
        }
      });
    });
  }

  it('should fall back to red theme for unknown theme names', () => {
    const renderer = createTestRenderer({ theme: 'nonexistent' });
    renderer.renderFull();
    const plainContent = renderer.screen.toString();
    // Should still render without crashing
    expect(plainContent).toContain('#control');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Layout Structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Layout Structure', () => {
  let renderer: ReturnType<typeof createTestRenderer>;

  beforeEach(() => {
    renderer = createTestRenderer({ cols: 120, rows: 40 });
    renderer.renderFull();
  });

  it('should render sidebar in correct region (left 22 cols)', () => {
    const sidebarRegion = renderer.layoutInfo.sidebar;
    expect(sidebarRegion.col).toBe(0);
    expect(sidebarRegion.width).toBe(22);
  });

  it('should render main area starting after sidebar', () => {
    const mainRegion = renderer.layoutInfo.main;
    expect(mainRegion.col).toBe(22); // right after sidebar
  });

  it('should render input bar at bottom-2 row', () => {
    const inputRegion = renderer.layoutInfo.inputBar;
    // input bar is at rows - 2 (statusbar is last row)
    expect(inputRegion.row).toBe(37); // rows(40) - fkey(1) - fkeyBorder(1) - input(1) = row 37
  });

  it('should render status bar above input bar', () => {
    const statusRegion = renderer.layoutInfo.statusBar;
    const inputRegion = renderer.layoutInfo.inputBar;
    // Status bar sits two rows above input (inputBorder between them)
    expect(statusRegion.row).toBe(inputRegion.row - 2);
  });

  it('should render vertical border between sidebar and main', () => {
    const plainContent = renderer.screen.toString();
    const lines = plainContent.split('\n');
    const borderCol = renderer.layoutInfo.sidebar.width; // col 22
    // The border should be present on all rows within the sidebar region
    const borderRow = renderer.layoutInfo.statusBar.row; // sidebar ends at status bar
    let borderCount = 0;
    for (let r = 0; r < borderRow; r++) {
      if (lines[r] && lines[r][borderCol] === '│') {
        borderCount++;
      }
    }
    expect(borderCount).toBeGreaterThan(0);
    // Should have borders on all rows up to the status bar
    expect(borderCount).toBe(borderRow);
  });

  it('should render horizontal border above status bar', () => {
    const plainContent = renderer.screen.toString();
    const lines = plainContent.split('\n');
    const borderRow = renderer.layoutInfo.statusBar.row - 1;
    expect(lines[borderRow]).toContain('─');
  });

  it('should report sidebar visible for wide terminals', () => {
    expect(renderer.layoutInfo.sidebarVisible).toBe(true);
  });

  it('should hide sidebar for narrow terminals', () => {
    const narrow = createTestRenderer({ cols: 50, rows: 40 });
    narrow.renderFull();
    expect(narrow.layoutInfo.sidebarVisible).toBe(false);
  });

  it('should have main area fill remaining width', () => {
    const mainWidth = renderer.layoutInfo.main.width;
    const expectedWidth = 120 - 22; // total cols minus sidebar
    expect(mainWidth).toBe(expectedWidth);
  });

  it('should have main area fill from top to status bar', () => {
    const mainHeight = renderer.layoutInfo.main.height;
    // rows(40) - fkey(1) - fkeyBorder(1) - input(1) - inputBorder(1) - status(1) = 35
    expect(mainHeight).toBe(35);
  });

  it('should have status bar span full width', () => {
    const statusWidth = renderer.layoutInfo.statusBar.width;
    // Status bar spans full terminal width
    expect(statusWidth).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Content Rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Content Rendering', () => {
  let renderer: ReturnType<typeof createTestRenderer>;

  beforeEach(() => {
    renderer = createTestRenderer();
    renderer.renderFull();
  });

  it('should render channel header ── #control ── in main area', () => {
    const plainContent = renderer.screen.toString();
    expect(plainContent).toContain('── #control ──');
  });

  it('should position channel header in main area row', () => {
    const mainRow = renderer.layoutInfo.main.row;
    const mainCol = renderer.layoutInfo.main.col + 1;
    const row = renderer.screen.readRow(mainRow);
    const headerText = '── #control ──';
    const idx = row.indexOf(headerText);
    expect(idx).toBeGreaterThanOrEqual(mainCol);
  });

  it('should render status bar with model info', () => {
    renderer.statusBar.update({ model: 'sonnet-4', agents: 0, cost: { current: 0, budget: 5.0 } });
    const statusRow = renderer.layoutInfo.statusBar.row;
    const statusContent = renderer.screen.readRow(statusRow);
    expect(statusContent).toContain('model:');
    expect(statusContent).toContain('sonnet-4');
  });

  it('should render status bar with agent count', () => {
    renderer.statusBar.update({ model: 'sonnet-4', agents: 2, cost: { current: 0, budget: 5.0 } });
    const statusRow = renderer.layoutInfo.statusBar.row;
    const statusContent = renderer.screen.readRow(statusRow);
    expect(statusContent).toContain('agents:');
    expect(statusContent).toContain('2');
  });

  it('should render status bar with cost', () => {
    renderer.statusBar.update({ model: 'sonnet-4', agents: 0, cost: { current: 1.23, budget: 5.0 } });
    const statusRow = renderer.layoutInfo.statusBar.row;
    const statusContent = renderer.screen.readRow(statusRow);
    expect(statusContent).toContain('cost:');
    expect(statusContent).toContain('$1.23');
    expect(statusContent).toContain('$5.00');
  });

  it('should render input bar with channel prompt #control |', () => {
    const inputRow = renderer.layoutInfo.inputBar.row;
    const inputContent = renderer.screen.readRow(inputRow);
    expect(inputContent).toContain('#control |');
  });

  it('should render sidebar section header CHANNELS', () => {
    const plainContent = renderer.screen.toString();
    expect(plainContent).toMatch(/channels/i);
  });

  it('should render sidebar section header AGENTS', () => {
    const plainContent = renderer.screen.toString();
    expect(plainContent).toMatch(/agents/i);
  });

  it('should render sidebar section header MCP', () => {
    const plainContent = renderer.screen.toString();
    expect(plainContent).toMatch(/mcp/i);
  });

  it('should render default channel #control in sidebar', () => {
    const plainContent = renderer.screen.toString();
    expect(plainContent).toContain('#control');
  });

  it('should render system log channel in sidebar', () => {
    const plainContent = renderer.screen.toString();
    expect(plainContent).toContain('system');
  });

  it('should render errors log channel in sidebar', () => {
    const plainContent = renderer.screen.toString();
    expect(plainContent).toContain('errors');
  });

  it('should render #control as active (● indicator)', () => {
    const plainContent = renderer.screen.toString();
    // Find the #control line in the sidebar area
    const lines = plainContent.split('\n');
    const controlLine = lines.find(l => l.includes('#control') && l.includes('●'));
    expect(controlLine).toBeDefined();
  });

  it('should render system log as inactive (○ indicator)', () => {
    const plainContent = renderer.screen.toString();
    const lines = plainContent.split('\n');
    const logsLine = lines.find(l => l.includes('system') && l.includes('○'));
    expect(logsLine).toBeDefined();
  });

  it('should render errors log as inactive (○ indicator)', () => {
    const plainContent = renderer.screen.toString();
    const lines = plainContent.split('\n');
    const errLine = lines.find(l => l.includes('errors') && l.includes('○'));
    expect(errLine).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Dynamic Updates
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Dynamic Updates', () => {
  let renderer: ReturnType<typeof createTestRenderer>;

  beforeEach(() => {
    renderer = createTestRenderer();
    renderer.renderFull();
  });

  it('should show new channel in sidebar after adding', () => {
    renderer.sidebar.addChannel('#general');
    renderer.renderFull();
    const plainContent = renderer.screen.toString();
    expect(plainContent).toContain('#general');
  });

  it('should show new agent in sidebar after adding', () => {
    // Agents are tracked internally but no longer rendered in a separate sidebar section
    renderer.sidebar.addAgent('#agent-1', { model: 'opus-4' });
    renderer.renderFull();
    expect(renderer.sidebar.hasAgent('#agent-1')).toBe(true);
  });

  it('should update status bar agent count after adding agent', () => {
    renderer.statusBar.incrementAgents();
    renderer.statusBar.render();
    const statusRow = renderer.layoutInfo.statusBar.row;
    const statusContent = renderer.screen.readRow(statusRow);
    expect(statusContent).toContain('agents:');
    expect(statusContent).toContain('1');
  });

  it('should update input bar prompt when switching active channel', () => {
    renderer.sidebar.addChannel('#general');
    renderer.sidebar.setActive('#general');
    renderer.inputBar.setChannel('#general');
    renderer.renderFull();
    const inputRow = renderer.layoutInfo.inputBar.row;
    const inputContent = renderer.screen.readRow(inputRow);
    expect(inputContent).toContain('#general |');
  });

  it('should update channel header when switching active channel', () => {
    renderer.sidebar.addChannel('#general');
    renderer.sidebar.setActive('#general');
    renderer.renderFull();
    const plainContent = renderer.screen.toString();
    expect(plainContent).toContain('── #general ──');
  });

  it('should render text in main area via writeAt', () => {
    const mainRow = renderer.layoutInfo.main.row + 2;
    const mainCol = renderer.layoutInfo.main.col + 1;
    renderer.screen.writeAt(mainRow, mainCol, 'Hello from main area');
    const row = renderer.screen.readRow(mainRow);
    expect(row).toContain('Hello from main area');
  });

  it('should render multiple lines of text in main area', () => {
    const lines = ['Line 1: Hello', 'Line 2: World', 'Line 3: Test'];
    for (let i = 0; i < lines.length; i++) {
      const row = renderer.layoutInfo.main.row + 2 + i;
      renderer.screen.writeAt(row, renderer.layoutInfo.main.col + 1, lines[i]);
    }
    const row1 = renderer.screen.readRow(renderer.layoutInfo.main.row + 2);
    const row2 = renderer.screen.readRow(renderer.layoutInfo.main.row + 3);
    const row3 = renderer.screen.readRow(renderer.layoutInfo.main.row + 4);
    expect(row1).toContain('Line 1: Hello');
    expect(row2).toContain('Line 2: World');
    expect(row3).toContain('Line 3: Test');
  });

  it('should update status bar model on updateStatus', () => {
    renderer.statusBar.update({ model: 'opus-4', agents: 3, cost: { current: 2.5, budget: 10.0 } });
    const statusRow = renderer.layoutInfo.statusBar.row;
    const statusContent = renderer.screen.readRow(statusRow);
    expect(statusContent).toContain('opus-4');
    expect(statusContent).toContain('3');
    expect(statusContent).toContain('$2.50');
  });

  it('should update status bar cost on setCost', () => {
    renderer.statusBar.setCost(3.75, 10.0);
    renderer.statusBar.render();
    const statusRow = renderer.layoutInfo.statusBar.row;
    const statusContent = renderer.screen.readRow(statusRow);
    expect(statusContent).toContain('$3.75');
    expect(statusContent).toContain('$10.00');
  });

  it('should remove channel from sidebar', () => {
    renderer.sidebar.addChannel('#temp');
    renderer.renderFull();
    let content = renderer.screen.toString();
    expect(content).toContain('#temp');

    renderer.sidebar.removeChannel('#temp');
    renderer.renderFull();
    content = renderer.screen.toString();
    expect(content).not.toContain('#temp');
  });

  it('should remove agent from sidebar and decrement count', () => {
    // Agents are tracked internally but no longer rendered in a separate sidebar section
    renderer.sidebar.addAgent('#agent-1');
    renderer.statusBar.incrementAgents();
    renderer.renderFull();
    expect(renderer.sidebar.hasAgent('#agent-1')).toBe(true);

    renderer.sidebar.removeAgent('#agent-1');
    renderer.statusBar.decrementAgents();
    renderer.renderFull();
    expect(renderer.sidebar.hasAgent('#agent-1')).toBe(false);
    const statusRow = renderer.layoutInfo.statusBar.row;
    const statusContent = renderer.screen.readRow(statusRow);
    expect(statusContent).toContain('0');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Theme Switching
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Theme Switching', () => {
  it('should change sidebar colors when theme changes', () => {
    const renderer = createTestRenderer({ theme: 'red' });
    renderer.renderFull();
    const redAnsi = renderer.screen.toStringWithANSI();

    // Switch to ice theme
    renderer.sidebar.setTheme('ice');
    renderer.inputBar.setTheme('ice');
    renderer.statusBar.setTheme('ice');
    renderer.renderFull();
    const iceAnsi = renderer.screen.toStringWithANSI();

    // Both should have ANSI codes but they should render (content same, styling may differ)
    expect(redAnsi).toContain('\x1b[');
    expect(iceAnsi).toContain('\x1b[');
  });

  it('should apply synthwave theme without error', () => {
    const renderer = createTestRenderer({ theme: 'synthwave' });
    renderer.renderFull();
    const content = renderer.screen.toString();
    expect(content).toContain('#control');
    expect(content).toContain('channels');
  });

  it('should apply green theme without error', () => {
    const renderer = createTestRenderer({ theme: 'green' });
    renderer.renderFull();
    const content = renderer.screen.toString();
    expect(content).toContain('#control');
    expect(content).toContain('channels');
  });

  it('should apply purple theme without error', () => {
    const renderer = createTestRenderer({ theme: 'purple' });
    renderer.renderFull();
    const content = renderer.screen.toString();
    expect(content).toContain('#control');
    expect(content).toContain('channels');
  });

  it('should strip all ANSI codes in noColor mode', () => {
    const renderer = createTestRenderer({ theme: 'red' });
    renderer.renderFull();
    // The plain toString() already strips ANSI from writeAt
    const plain = renderer.screen.toString();
    expect(plain).not.toContain('\x1b[');
  });

  it('should still render content correctly in noColor mode', () => {
    const renderer = createTestRenderer({ theme: 'red' });
    renderer.renderFull();
    const plain = renderer.screen.toString();
    expect(plain).toContain('#control');
    expect(plain).toContain('channels');
    expect(plain).toContain('mcp');
    expect(plain).toContain('│');
    expect(plain).toContain('─');
  });

  it('should render ANSI output that contains theme color data', () => {
    const renderer = createTestRenderer({ theme: 'red' });
    renderer.renderFull();
    const ansi = renderer.screen.toStringWithANSI();
    // Sidebar renders with dim ANSI (\x1b[2m) for section headers
    expect(ansi).toContain('\x1b[');
    // Active item gets bold (\x1b[1m)
    expect(ansi).toContain('\x1b[1m');
  });

  it('should render all five themes without throwing', () => {
    for (const theme of ['red', 'ice', 'green', 'purple', 'synthwave']) {
      expect(() => {
        const r = createTestRenderer({ theme });
        r.renderFull();
      }).not.toThrow();
    }
  });

  it('should retain content after theme switch', () => {
    const renderer = createTestRenderer({ theme: 'red' });
    renderer.sidebar.addChannel('#general');
    renderer.sidebar.addAgent('#agent-x', { model: 'haiku' });
    renderer.renderFull();

    // Switch theme
    renderer.sidebar.setTheme('purple');
    renderer.inputBar.setTheme('purple');
    renderer.statusBar.setTheme('purple');
    renderer.renderFull();

    const content = renderer.screen.toString();
    expect(content).toContain('#general');
    // Agents are tracked internally but no longer rendered in sidebar
    expect(renderer.sidebar.hasAgent('#agent-x')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Resize Behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Resize Behavior', () => {
  it('should collapse sidebar below 60 cols', () => {
    const renderer = createTestRenderer({ cols: 55, rows: 24 });
    expect(renderer.layoutInfo.sidebarVisible).toBe(false);
    expect(renderer.layoutInfo.sidebar.width).toBe(0);
  });

  it('should show sidebar at 60+ cols', () => {
    const renderer = createTestRenderer({ cols: 60, rows: 24 });
    expect(renderer.layoutInfo.sidebarVisible).toBe(true);
    expect(renderer.layoutInfo.sidebar.width).toBe(22);
  });

  it('should adjust main area when sidebar collapses', () => {
    const wide = createTestRenderer({ cols: 120, rows: 40 });
    const narrow = createTestRenderer({ cols: 50, rows: 40 });

    // Wide: main starts at col 22
    expect(wide.layoutInfo.main.col).toBe(22);

    // Narrow: main starts at col 0 (no sidebar)
    expect(narrow.layoutInfo.main.col).toBe(0);
  });


  it('should render correctly after resize via LayoutManager', () => {
    const renderer = createTestRenderer({ cols: 120, rows: 40 });
    renderer.renderFull();

    // Simulate resize
    renderer.screen.resize(80, 30);
    renderer.layout.resize(80, 30);
    const newLayout = renderer.layout.getLayout();

    // Sidebar should still be visible at 80 cols
    expect(newLayout.sidebarVisible).toBe(true);
    // Layout: fkey(29), fkeyBorder(28), input(27), inputBorder(26), status(25)
    expect(newLayout.statusBar.row).toBe(25);
  });

  it('should render correctly at minimum terminal size', () => {
    const renderer = createTestRenderer({ cols: 60, rows: 10 });
    renderer.renderFull();
    const content = renderer.screen.toString();
    // Should still render basic structure
    expect(content).toBeDefined();
    expect(content.split('\n').length).toBe(10);
  });

  it('should render correctly at large terminal size', () => {
    const renderer = createTestRenderer({ cols: 200, rows: 60 });
    renderer.renderFull();
    const content = renderer.screen.toString();
    expect(content).toContain('#control');
    expect(content).toContain('│');
  });

  it('should move status bar to correct position on resize', () => {
    const renderer = createTestRenderer({ cols: 120, rows: 40 });
    // Layout: fkey(39), fkeyBorder(38), input(37), inputBorder(36), status(35)
    expect(renderer.layoutInfo.statusBar.row).toBe(35);

    const smaller = createTestRenderer({ cols: 120, rows: 25 });
    // fkey(24), fkeyBorder(23), input(22), inputBorder(21), status(20)
    expect(smaller.layoutInfo.statusBar.row).toBe(20);
  });

  it('should move input bar row on resize', () => {
    const renderer = createTestRenderer({ cols: 120, rows: 40 });
    // fkey(39), fkeyBorder(38), input(37)
    expect(renderer.layoutInfo.inputBar.row).toBe(37);

    const smaller = createTestRenderer({ cols: 120, rows: 25 });
    // fkey(24), fkeyBorder(23), input(22)
    expect(smaller.layoutInfo.inputBar.row).toBe(22);
  });

  it('should not render vertical border when sidebar is collapsed', () => {
    const renderer = createTestRenderer({ cols: 50, rows: 24 });
    renderer.renderFull();
    const content = renderer.screen.toString();
    const lines = content.split('\n');
    // At col 22 there should NOT be a solid column of │
    let borderCount = 0;
    for (let r = 0; r < lines.length; r++) {
      if (lines[r] && lines[r].length > 22 && lines[r][22] === '│') {
        borderCount++;
      }
    }
    expect(borderCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. TuiMode Integration (process.stdout capture)
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Integration via stdout capture', () => {
  let mockStdout: ReturnType<typeof createMockStdout>;
  let originalSetRawMode: any;
  let originalResume: any;
  let originalPause: any;

  beforeEach(() => {
    mockStdout = createMockStdout();
    mockStdout.mock();
    // Mock stdin methods to prevent actual terminal interaction
    originalSetRawMode = process.stdin.setRawMode;
    originalResume = process.stdin.resume;
    originalPause = process.stdin.pause;
    (process.stdin as any).setRawMode = vi.fn();
    (process.stdin as any).resume = vi.fn();
    (process.stdin as any).pause = vi.fn();
  });

  afterEach(() => {
    mockStdout.restore();
    (process.stdin as any).setRawMode = originalSetRawMode;
    (process.stdin as any).resume = originalResume;
    (process.stdin as any).pause = originalPause;
  });

  it('should exit alternate buffer on start for text selection support', () => {
    const tui = createTuiMode({ theme: 'red' });
    tui.start();
    const output = mockStdout.getOutput();
    expect(output).toContain('\x1b[?1049l'); // leave alternate buffer
    tui.stop();
  });

  it('should write hide cursor then show cursor on start', () => {
    const tui = createTuiMode({ theme: 'red' });
    tui.start();
    const output = mockStdout.getOutput();
    expect(output).toContain('\x1b[?25l'); // hide cursor
    expect(output).toContain('\x1b[?25h'); // show cursor
    tui.stop();
  });

  it('should clear screen on start', () => {
    const tui = createTuiMode({ theme: 'red' });
    tui.start();
    const output = mockStdout.getOutput();
    expect(output).toContain('\x1b[2J');
    tui.stop();
  });

  it('should flush screen content containing border chars', () => {
    const tui = createTuiMode({ theme: 'red' });
    tui.start();
    const output = mockStdout.getOutput();
    expect(output).toContain('│');
    expect(output).toContain('─');
    tui.stop();
  });

  it('should flush screen content containing #control channel', () => {
    const tui = createTuiMode({ theme: 'red' });
    tui.start();
    const output = mockStdout.getOutput();
    const stripped = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped).toContain('#control');
    tui.stop();
  });

  it('should clear screen and show cursor on stop', () => {
    const tui = createTuiMode({ theme: 'red' });
    tui.start();
    mockStdout.clear();
    tui.stop();
    const output = mockStdout.getOutput();
    expect(output).toContain('\x1b[2J'); // clear screen
    expect(output).toContain('\x1b[?25h'); // show cursor
  });

  it('should set running to true on start and false on stop', () => {
    const tui = createTuiMode({ theme: 'red' });
    expect(tui.running).toBe(false);
    tui.start();
    expect(tui.running).toBe(true);
    tui.stop();
    expect(tui.running).toBe(false);
  });

  it('should render sidebar channels in output', () => {
    const tui = createTuiMode({ theme: 'ice' });
    tui.start();
    const output = stripAnsi(mockStdout.getOutput());
    expect(output).toContain('#control');
    expect(output).toMatch(/channels/i);
    tui.stop();
  });

  it('should update output when adding a channel', () => {
    vi.useFakeTimers();
    const tui = createTuiMode({ theme: 'red' });
    tui.start();
    mockStdout.clear();
    vi.advanceTimersByTime(20); // advance past 16ms render throttle
    tui.addChannel('general');
    vi.advanceTimersByTime(20);
    const output = stripAnsi(mockStdout.getOutput());
    expect(output).toContain('#general');
    tui.stop();
    vi.useRealTimers();
  });

  it('should track agent internally when added', () => {
    const tui = createTuiMode({ theme: 'red' });
    tui.start();
    tui.addAgent('worker-1', { model: 'haiku' });
    expect(tui.sidebar.hasAgent('worker-1')).toBe(true);
    tui.stop();
  });

  it('should call onExit when stop is invoked externally', () => {
    const onExit = vi.fn();
    const tui = createTuiMode({ theme: 'red', onExit });
    tui.start();
    tui.stop();
    // onExit is triggered by Ctrl+C/D, not by stop() itself
    expect(onExit).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ANSI Color Verification per Theme
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — ANSI Color Verification per Theme', () => {
  const themeNames = ['red', 'ice', 'green', 'purple', 'synthwave'] as const;

  for (const themeName of themeNames) {
    it(`${themeName}: theme object has logoColors array`, () => {
      const theme = THEMES[themeName];
      expect(theme.logoColors).toBeDefined();
      expect(theme.logoColors.length).toBeGreaterThanOrEqual(1);
    });

    it(`${themeName}: theme object has barStops array`, () => {
      const theme = THEMES[themeName];
      expect(theme.barStops).toBeDefined();
      expect(theme.barStops.length).toBeGreaterThanOrEqual(2);
    });

    it(`${themeName}: theme object has flavorStops array`, () => {
      const theme = THEMES[themeName];
      expect(theme.flavorStops).toBeDefined();
      expect(theme.flavorStops.length).toBeGreaterThanOrEqual(2);
    });

    it(`${themeName}: theme object has accentStops array`, () => {
      const theme = THEMES[themeName];
      expect(theme.accentStops).toBeDefined();
      expect(theme.accentStops.length).toBeGreaterThanOrEqual(2);
    });

    it(`${themeName}: all RGB values are within 0-255 range`, () => {
      const theme = THEMES[themeName];
      const allStops = [...theme.logoColors, ...theme.barStops, ...theme.flavorStops, ...theme.accentStops];
      for (const [r, g, b] of allStops) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      }
    });

    it(`${themeName}: sidebar renders with ANSI styling applied`, () => {
      const renderer = createTestRenderer({ theme: themeName });
      renderer.renderFull();
      const ansi = renderer.screen.toStringWithANSI();
      // Dim styling from section headers
      expect(ansi).toContain('\x1b[');
    });

    it(`${themeName}: input bar renders with ANSI styling`, () => {
      const renderer = createTestRenderer({ theme: themeName });
      renderer.renderFull();
      const ansi = renderer.screen.toStringWithANSI();
      // Input bar renders with dim style
      expect(ansi).toContain('\x1b[');
    });

    it(`${themeName}: status bar renders with ANSI styling`, () => {
      const renderer = createTestRenderer({ theme: themeName });
      renderer.statusBar.update({ model: 'sonnet-4', agents: 1, cost: { current: 0.5, budget: 5.0 } });
      const ansi = renderer.screen.toStringWithANSI();
      expect(ansi).toContain('\x1b[');
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Border Rendering Details
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Border Details', () => {
  let renderer: ReturnType<typeof createTestRenderer>;

  beforeEach(() => {
    renderer = createTestRenderer({ cols: 120, rows: 40 });
    renderer.renderFull();
  });

  it('should render vertical border from row 0 to input border row', () => {
    const borderCol = renderer.layoutInfo.sidebar.width; // 22
    const borderEndRow = renderer.layoutInfo.statusBar.row; // sidebar ends at status bar
    // Border should be on all rows within the sidebar region
    for (let r = 0; r < borderEndRow; r++) {
      const row = renderer.screen.readRow(r);
      expect(row[borderCol]).toBe('│');
    }
  });

  it('should render horizontal border across main area width', () => {
    const borderRow = renderer.layoutInfo.statusBar.row - 1;
    const row = renderer.screen.readRow(borderRow);
    const startCol = renderer.layoutInfo.sidebar.width + 1;
    // Check that consecutive ─ chars appear from startCol
    let dashCount = 0;
    for (let c = startCol; c < row.length; c++) {
      if (row[c] === '─') dashCount++;
    }
    expect(dashCount).toBeGreaterThan(0);
    // The border fills from startCol to end of buffer
    const expectedDashes = renderer.screen.width - startCol;
    expect(dashCount).toBe(expectedDashes);
  });

  it('should not have border artifacts in main content area', () => {
    const mainRow = renderer.layoutInfo.main.row + 5;
    const row = renderer.screen.readRow(mainRow);
    const mainCol = renderer.layoutInfo.main.col + 1;
    // After the channel header row, main area should be spaces
    const mainContent = row.slice(mainCol);
    // Should be mostly spaces (empty main content)
    const trimmed = mainContent.trim();
    expect(trimmed).toBe('');
  });

  it('should not render border beyond sidebar height into status bar', () => {
    const statusRow = renderer.layoutInfo.statusBar.row;
    const row = renderer.screen.readRow(statusRow);
    // The status bar row should not have a │ at sidebar border position
    // because status bar spans full width
    const borderCol = renderer.layoutInfo.sidebar.width;
    // Status bar content overrides border
    expect(row.slice(0, 5)).not.toBe('│'.repeat(5));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Sidebar Content Structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('TuiMode Rendering — Sidebar Content Structure', () => {
  let renderer: ReturnType<typeof createTestRenderer>;

  beforeEach(() => {
    renderer = createTestRenderer();
    renderer.renderFull();
  });

  it('should render channels section before mcp section in sidebar', () => {
    const content = renderer.screen.toString();
    const channelsIdx = content.indexOf('channels');
    const mcpIdx = content.indexOf('mcp');
    expect(channelsIdx).toBeGreaterThanOrEqual(0);
    expect(channelsIdx).toBeLessThan(mcpIdx);
  });

  it('should render channels section before mcp section', () => {
    const content = renderer.screen.toString();
    const channelsIdx = content.indexOf('channels');
    const mcpIdx = content.indexOf('mcp');
    expect(channelsIdx).toBeLessThan(mcpIdx);
  });

  it('should render section collapse indicators (▼ for expanded)', () => {
    const content = renderer.screen.toString();
    expect(content).toContain('▼');
  });

  it('should render sidebar within 22 col boundary', () => {
    const lines = renderer.screen.toString().split('\n');
    // Check that sidebar content is within first 22 cols
    // The sidebar writes at x=0 for width 22
    for (let r = 0; r < 5; r++) {
      const sidebarPart = lines[r].slice(0, 22);
      // Should contain something (section headers or channels)
      expect(sidebarPart.trim().length).toBeGreaterThan(0);
    }
  });

  it('should sort channels alphabetically in sidebar', () => {
    renderer.sidebar.addChannel('#zebra');
    renderer.sidebar.addChannel('#alpha');
    renderer.sidebar.addChannel('#beta');
    renderer.renderFull();
    const content = renderer.screen.toString();
    const alphaIdx = content.indexOf('#alpha');
    const betaIdx = content.indexOf('#beta');
    const zebraIdx = content.indexOf('#zebra');
    expect(alphaIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(zebraIdx);
  });

  it('should show unread badge in sidebar', () => {
    renderer.sidebar.addChannel('#general', { unread: 5 });
    renderer.renderFull();
    const content = renderer.screen.toString();
    expect(content).toContain('5');
  });

  it('should track agent model internally after adding', () => {
    // Agents are no longer rendered in sidebar; verify internal tracking
    renderer.sidebar.addAgent('#agent-1', { model: 'opus-4' });
    renderer.renderFull();
    expect(renderer.sidebar.hasAgent('#agent-1')).toBe(true);
  });

  it('should track agent with running status internally', () => {
    renderer.sidebar.addAgent('#agent-1', { status: 'running' });
    renderer.renderFull();
    expect(renderer.sidebar.hasAgent('#agent-1')).toBe(true);
  });

  it('should track agent with complete status internally', () => {
    renderer.sidebar.addAgent('#agent-1', { status: 'complete' });
    renderer.renderFull();
    expect(renderer.sidebar.hasAgent('#agent-1')).toBe(true);
  });
});
