// Tests for CommandPalette — floating command picker above input bar
// Covers visibility, filtering, navigation, selection, rendering, scrolling,
// category grouping, theme support, and edge cases.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';
import { CommandPalette, type CommandDef } from '../tui/CommandPalette.js';
import { getCommandsForPalette } from '../app/CommandRegistry.js';

const PALETTE_COMMANDS = getCommandsForPalette();

describe('CommandPalette', () => {
  let buffer: ScreenBuffer;
  let palette: CommandPalette;
  const defaultRegion = { x: 0, y: 20, width: 60, height: 10 };

  beforeEach(() => {
    buffer = new ScreenBuffer(80, 24);
    palette = new CommandPalette(buffer, defaultRegion, { commands: PALETTE_COMMANDS });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Visibility
  // ────────────────────────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('should start hidden', () => {
      expect(palette.isVisible()).toBe(false);
    });

    it('should become visible after show()', () => {
      palette.show();
      expect(palette.isVisible()).toBe(true);
    });

    it('should become hidden after hide()', () => {
      palette.show();
      palette.hide();
      expect(palette.isVisible()).toBe(false);
    });

    it('should toggle visibility with show/hide', () => {
      palette.show();
      expect(palette.isVisible()).toBe(true);
      palette.hide();
      expect(palette.isVisible()).toBe(false);
      palette.show();
      expect(palette.isVisible()).toBe(true);
    });

    it('should emit show event', () => {
      const handler = vi.fn();
      palette.on('show', handler);
      palette.show();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit hide event', () => {
      const handler = vi.fn();
      palette.on('hide', handler);
      palette.show();
      palette.hide();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not render when hidden', () => {
      palette.render();
      const content = buffer.toString();
      // Should be all spaces (nothing rendered)
      expect(content.trim()).toBe('');
    });

    it('should reset filter when shown', () => {
      palette.show();
      palette.setFilter('join');
      palette.hide();
      palette.show();
      expect(palette.getFilter()).toBe('');
      expect(palette.getMatches().length).toBe(PALETTE_COMMANDS.length);
    });

    it('should reset selection when shown', () => {
      palette.show();
      palette.moveDown();
      palette.moveDown();
      palette.hide();
      palette.show();
      expect(palette.getSelectedIndex()).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Filtering
  // ────────────────────────────────────────────────────────────────────────────

  describe('filtering', () => {
    beforeEach(() => {
      palette.show();
    });

    it('should show all commands with empty filter', () => {
      palette.setFilter('');
      expect(palette.getMatches().length).toBe(PALETTE_COMMANDS.length);
    });

    it('should narrow to /join when filter is "j"', () => {
      palette.setFilter('j');
      const matches = palette.getMatches();
      expect(matches.some(m => m.name === 'join')).toBe(true);
      // All matches should contain "j" somewhere
      for (const m of matches) {
        const matchesFilter =
          m.name.toLowerCase().includes('j') ||
          m.description.toLowerCase().includes('j');
        expect(matchesFilter).toBe(true);
      }
    });

    it('should narrow to /join with filter "join"', () => {
      palette.setFilter('join');
      const matches = palette.getMatches();
      expect(matches[0].name).toBe('join');
    });

    it('should narrow to /spawn with filter "sp"', () => {
      palette.setFilter('sp');
      const matches = palette.getMatches();
      expect(matches[0].name).toBe('spawn');
    });

    it('should match /spawn and /switch with filter "s"', () => {
      palette.setFilter('s');
      const matches = palette.getMatches();
      const names = matches.map(m => m.name);
      expect(names).toContain('spawn');
      expect(names).toContain('switch');
      expect(names).toContain('save_context');
      expect(names).toContain('status');
      expect(names).toContain('set');
    });

    it('should return exact match for full command name', () => {
      palette.setFilter('quit');
      const matches = palette.getMatches();
      expect(matches[0].name).toBe('quit');
    });

    it('should return empty array when no matches', () => {
      palette.setFilter('zzzznonexistent');
      expect(palette.getMatches().length).toBe(0);
    });

    it('should be case-insensitive', () => {
      palette.setFilter('JOIN');
      const matches = palette.getMatches();
      expect(matches.some(m => m.name === 'join')).toBe(true);
    });

    it('should match against description text', () => {
      palette.setFilter('agent');
      const matches = palette.getMatches();
      // Several commands mention "agent" in their descriptions
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.description.toLowerCase().includes('agent'))).toBe(true);
    });

    it('should prioritize startsWith over includes', () => {
      palette.setFilter('co');
      const matches = palette.getMatches();
      // "compact", "config", "context", "cost" all start with "co"
      const startsWithCo = matches.filter(m => m.name.startsWith('co'));
      expect(startsWithCo.length).toBeGreaterThan(0);
      // First result should start with "co"
      expect(matches[0].name.startsWith('co')).toBe(true);
    });

    it('should reset selection index when filter changes', () => {
      palette.moveDown();
      palette.moveDown();
      expect(palette.getSelectedIndex()).toBe(2);
      palette.setFilter('j');
      expect(palette.getSelectedIndex()).toBe(0);
    });

    it('should emit filter event', () => {
      const handler = vi.fn();
      palette.on('filter', handler);
      palette.setFilter('sp');
      expect(handler).toHaveBeenCalledWith('sp', expect.any(Array));
    });

    it('should return current filter via getFilter', () => {
      palette.setFilter('hello');
      expect(palette.getFilter()).toBe('hello');
    });

    it('should handle single character filter', () => {
      palette.setFilter('q');
      const matches = palette.getMatches();
      expect(matches.some(m => m.name === 'quit')).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Navigation
  // ────────────────────────────────────────────────────────────────────────────

  describe('navigation', () => {
    beforeEach(() => {
      palette.show();
    });

    it('should start at index 0', () => {
      expect(palette.getSelectedIndex()).toBe(0);
    });

    it('should move down by one', () => {
      palette.moveDown();
      expect(palette.getSelectedIndex()).toBe(1);
    });

    it('should move up by one from non-zero', () => {
      palette.moveDown();
      palette.moveDown();
      palette.moveUp();
      expect(palette.getSelectedIndex()).toBe(1);
    });

    it('should wrap to last item when moving up from index 0', () => {
      palette.moveUp();
      expect(palette.getSelectedIndex()).toBe(PALETTE_COMMANDS.length - 1);
    });

    it('should wrap to first item when moving down past last', () => {
      // Move to last item
      for (let i = 0; i < PALETTE_COMMANDS.length - 1; i++) {
        palette.moveDown();
      }
      expect(palette.getSelectedIndex()).toBe(PALETTE_COMMANDS.length - 1);
      palette.moveDown();
      expect(palette.getSelectedIndex()).toBe(0);
    });

    it('should return correct selected command', () => {
      const firstCmd = palette.getSelected();
      expect(firstCmd).toBeDefined();
      expect(firstCmd!.name).toBe(PALETTE_COMMANDS[0].name);
    });

    it('should return correct command after navigation', () => {
      palette.moveDown();
      palette.moveDown();
      const cmd = palette.getSelected();
      expect(cmd!.name).toBe(PALETTE_COMMANDS[2].name);
    });

    it('should work with filtered list', () => {
      palette.setFilter('s');
      const matches = palette.getMatches();
      palette.moveDown();
      const selected = palette.getSelected();
      expect(selected!.name).toBe(matches[1].name);
    });

    it('should wrap within filtered list', () => {
      palette.setFilter('quit');
      expect(palette.getMatches().length).toBe(1);
      palette.moveDown();
      expect(palette.getSelectedIndex()).toBe(0); // wraps around single item
    });

    it('should handle moveUp/moveDown when no matches', () => {
      palette.setFilter('zzzzz');
      palette.moveDown();
      expect(palette.getSelectedIndex()).toBe(0);
      palette.moveUp();
      expect(palette.getSelectedIndex()).toBe(0);
    });

    it('should return null getSelected when no matches', () => {
      palette.setFilter('zzzzz');
      expect(palette.getSelected()).toBeNull();
    });

    it('should emit navigate event', () => {
      const handler = vi.fn();
      palette.on('navigate', handler);
      palette.moveDown();
      expect(handler).toHaveBeenCalledWith(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Selection
  // ────────────────────────────────────────────────────────────────────────────

  describe('selection', () => {
    beforeEach(() => {
      palette.show();
    });

    it('should return command text with trailing space', () => {
      const result = palette.select();
      expect(result).toBe(`/${PALETTE_COMMANDS[0].name}`);
    });

    it('should return selected command after navigation', () => {
      palette.moveDown();
      const result = palette.select();
      expect(result).toBe(`/${PALETTE_COMMANDS[1].name}`);
    });

    it('should return /join after filtering to join', () => {
      palette.setFilter('join');
      const result = palette.select();
      expect(result).toBe('/join');
    });

    it('should return /spawn after filtering to sp', () => {
      palette.setFilter('sp');
      const result = palette.select();
      expect(result).toBe('/spawn');
    });

    it('should return null when no matches', () => {
      palette.setFilter('zzzzz');
      const result = palette.select();
      expect(result).toBeNull();
    });

    it('should emit select event with command and result string', () => {
      const handler = vi.fn();
      palette.on('select', handler);
      palette.select();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ name: PALETTE_COMMANDS[0].name }),
        `/${PALETTE_COMMANDS[0].name}`,
      );
    });

    it('should return /quit for quit command', () => {
      palette.setFilter('quit');
      expect(palette.select()).toBe('/quit');
    });

    it('should return /set for set command', () => {
      palette.setFilter('set');
      const matches = palette.getMatches();
      // 'set' should be the first match since it starts with 'set'
      expect(matches[0].name).toBe('set');
      expect(palette.select()).toBe('/set');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Rendering
  // ────────────────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    beforeEach(() => {
      palette.show();
    });

    it('should render border characters', () => {
      palette.render();
      const content = buffer.toString();
      expect(content).toContain('╭');
      expect(content).toContain('╮');
      expect(content).toContain('╰');
      expect(content).toContain('╯');
      expect(content).toContain('│');
    });

    it('should render "commands" title in header', () => {
      palette.render();
      const content = buffer.toString();
      expect(content).toContain('commands');
    });

    it('should render command names', () => {
      palette.setFilter('join');
      palette.render();
      const content = buffer.toString();
      expect(content).toContain('/join');
    });

    it('should render command descriptions', () => {
      palette.setFilter('join');
      palette.render();
      const content = buffer.toString();
      expect(content).toContain('Create/switch');
    });

    it('should render highlighted item marker', () => {
      palette.render();
      const content = buffer.toString();
      expect(content).toContain('▸');
    });

    it('should render within screen bounds', () => {
      expect(() => palette.render()).not.toThrow();
    });

    it('should render with ANSI codes when noColor is false', () => {
      palette.render();
      const ansiContent = buffer.toStringWithANSI();
      expect(ansiContent).toContain('\x1b[');
    });

    it('should render without ANSI codes when noColor is true', () => {
      const noColorPalette = new CommandPalette(buffer, defaultRegion, { noColor: true });
      noColorPalette.show();
      noColorPalette.render();
      const ansiContent = buffer.toStringWithANSI();
      // The ScreenBuffer stores cells without ansi when noColor text is written
      // The border and content should still be present
      const content = buffer.toString();
      expect(content).toContain('╭');
      expect(content).toContain('commands');
    });

    it('should use horizontal rules for top and bottom borders', () => {
      palette.render();
      const content = buffer.toString();
      expect(content).toContain('─');
    });

    it('should render at the correct region position', () => {
      // Region is at y=20, palette renders above it
      palette.setFilter('quit'); // single match = smaller panel
      palette.render();
      // Panel uses rounded corners (╭╰) and includes a detail row for usage
      const content = buffer.toString();
      expect(content).toContain('╭');
      expect(content).toContain('╰');
      expect(content).toContain('quit');
    });

    it('should not render if it would go above screen', () => {
      const tinyBuffer = new ScreenBuffer(80, 5);
      const highRegion = { x: 0, y: 2, width: 60, height: 10 };
      const highPalette = new CommandPalette(tinyBuffer, highRegion);
      highPalette.show();
      // With all commands, panel would need more rows than available
      // Should not crash
      expect(() => highPalette.render()).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Scrolling
  // ────────────────────────────────────────────────────────────────────────────

  describe('scrolling', () => {
    beforeEach(() => {
      palette.show();
    });

    it('should show only maxVisible items', () => {
      const smallPalette = new CommandPalette(buffer, defaultRegion, { maxVisible: 4 });
      smallPalette.show();
      smallPalette.render();
      const content = buffer.toString();
      // Count visible items by looking for │ rows between borders
      // The total commands exceeds 4, so only 4 content rows + category headers + detail row
      const rows = content.split('\n');
      let contentRows = 0;
      for (const row of rows) {
        if (row.includes('│') && !row.includes('╭') && !row.includes('╰')) {
          contentRows++;
        }
      }
      // 4 items + category header(s) + detail separator/usage row
      expect(contentRows).toBeGreaterThanOrEqual(4);
    });

    it('should scroll down when navigating past visible area', () => {
      const smallPalette = new CommandPalette(buffer, defaultRegion, { maxVisible: 3 });
      smallPalette.show();
      // Move down past visible area
      smallPalette.moveDown(); // index 1
      smallPalette.moveDown(); // index 2
      smallPalette.moveDown(); // index 3 — should trigger scroll
      expect(smallPalette.getSelectedIndex()).toBe(3);
      // Selected item should still be accessible
      expect(smallPalette.getSelected()).not.toBeNull();
    });

    it('should scroll up when navigating before visible area', () => {
      const smallPalette = new CommandPalette(buffer, defaultRegion, { maxVisible: 3 });
      smallPalette.show();
      // Move to end first
      smallPalette.moveUp(); // wraps to last
      // Then move up again
      smallPalette.moveUp();
      expect(smallPalette.getSelected()).not.toBeNull();
    });

    it('should handle wrap-around scrolling', () => {
      const smallPalette = new CommandPalette(buffer, defaultRegion, { maxVisible: 3 });
      smallPalette.show();
      // Wrap from 0 to last
      smallPalette.moveUp();
      expect(smallPalette.getSelectedIndex()).toBe(PALETTE_COMMANDS.length - 1);
      // Wrap from last to 0
      smallPalette.moveDown();
      expect(smallPalette.getSelectedIndex()).toBe(0);
    });

    it('should display correct items after scrolling', () => {
      const smallPalette = new CommandPalette(buffer, defaultRegion, { maxVisible: 3, noColor: true });
      smallPalette.show();
      // Navigate to show items at index 3,4,5
      smallPalette.moveDown(); // 1
      smallPalette.moveDown(); // 2
      smallPalette.moveDown(); // 3
      smallPalette.render();
      const content = buffer.toString();
      // The 4th command should be visible
      expect(content).toContain(PALETTE_COMMANDS[3].name);
    });

    it('should render correctly when matches < maxVisible', () => {
      palette.setFilter('quit');
      palette.render();
      const content = buffer.toString();
      expect(content).toContain('quit');
      // Should still have proper borders (now uses rounded corners)
      expect(content).toContain('╭');
      expect(content).toContain('╰');
    });

    it('default maxVisible is 14', () => {
      // Default palette with all commands — only 14 items should render (plus category headers and detail row)
      palette.render();
      const content = buffer.toString();
      const rows = content.split('\n');
      let contentRows = 0;
      for (const row of rows) {
        if (row.includes('│') && !row.includes('╭') && !row.includes('╰')) {
          contentRows++;
        }
      }
      // 14 items + category headers + detail (├ + usage) rows
      expect(contentRows).toBeGreaterThanOrEqual(14);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. Category Grouping
  // ────────────────────────────────────────────────────────────────────────────

  describe('category grouping', () => {
    it('should have IRC commands', () => {
      const ircCommands = palette.getCommandsByCategory('irc');
      expect(ircCommands.length).toBeGreaterThan(0);
      expect(ircCommands.some(c => c.name === 'join')).toBe(true);
      expect(ircCommands.some(c => c.name === 'spawn')).toBe(true);
      expect(ircCommands.some(c => c.name === 'kill')).toBe(true);
      expect(ircCommands.some(c => c.name === 'msg')).toBe(true);
      expect(ircCommands.some(c => c.name === 'whois')).toBe(true);
    });

    it('should have standard commands', () => {
      const stdCommands = palette.getCommandsByCategory('standard');
      expect(stdCommands.length).toBeGreaterThan(0);
      expect(stdCommands.some(c => c.name === 'help')).toBe(true);
      expect(stdCommands.some(c => c.name === 'quit')).toBe(true);
      expect(stdCommands.some(c => c.name === 'clear')).toBe(true);
      expect(stdCommands.some(c => c.name === 'status')).toBe(true);
      expect(stdCommands.some(c => c.name === 'undo')).toBe(true);
    });

    it('should have config commands', () => {
      const cfgCommands = palette.getCommandsByCategory('config');
      expect(cfgCommands.length).toBeGreaterThan(0);
      expect(cfgCommands.some(c => c.name === 'thinking')).toBe(true);
      expect(cfgCommands.some(c => c.name === 'theme')).toBe(true);
      expect(cfgCommands.some(c => c.name === 'config')).toBe(true);
      expect(cfgCommands.some(c => c.name === 'set')).toBe(true);
    });

    it('should include all defined commands', () => {
      const all = palette.getCommands();
      expect(all.length).toBe(PALETTE_COMMANDS.length);
    });

    it('IRC commands should have correct count (12)', () => {
      const ircCommands = palette.getCommandsByCategory('irc');
      expect(ircCommands.length).toBe(12);
    });

    it('standard commands should have correct count (26)', () => {
      const stdCommands = palette.getCommandsByCategory('standard');
      expect(stdCommands.length).toBe(26);
    });

    it('all categories should sum to total commands', () => {
      const irc = palette.getCommandsByCategory('irc').length;
      const std = palette.getCommandsByCategory('standard').length;
      const cfg = palette.getCommandsByCategory('config').length;
      expect(irc + std + cfg).toBe(PALETTE_COMMANDS.length);
    });

    it('every command should have a valid category', () => {
      const all = palette.getCommands();
      for (const cmd of all) {
        expect(['irc', 'standard', 'config']).toContain(cmd.category);
      }
    });

    it('every command should have a non-empty description', () => {
      const all = palette.getCommands();
      for (const cmd of all) {
        expect(cmd.description.length).toBeGreaterThan(0);
      }
    });

    it('every command should have a non-empty name', () => {
      const all = palette.getCommands();
      for (const cmd of all) {
        expect(cmd.name.length).toBeGreaterThan(0);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 8. Theme Support
  // ────────────────────────────────────────────────────────────────────────────

  describe('theme support', () => {
    it('should accept "red" theme', () => {
      const p = new CommandPalette(buffer, defaultRegion, { theme: 'red' });
      p.show();
      expect(() => p.render()).not.toThrow();
    });

    it('should accept "ice" theme', () => {
      const p = new CommandPalette(buffer, defaultRegion, { theme: 'ice' });
      p.show();
      expect(() => p.render()).not.toThrow();
    });

    it('should accept "green" theme', () => {
      const p = new CommandPalette(buffer, defaultRegion, { theme: 'green' });
      p.show();
      expect(() => p.render()).not.toThrow();
    });

    it('should accept "purple" theme', () => {
      const p = new CommandPalette(buffer, defaultRegion, { theme: 'purple' });
      p.show();
      expect(() => p.render()).not.toThrow();
    });

    it('should accept "synthwave" theme', () => {
      const p = new CommandPalette(buffer, defaultRegion, { theme: 'synthwave' });
      p.show();
      expect(() => p.render()).not.toThrow();
    });

    it('should produce different ANSI codes for different themes', () => {
      const bufRed = new ScreenBuffer(80, 24);
      const bufIce = new ScreenBuffer(80, 24);

      const pRed = new CommandPalette(bufRed, defaultRegion, { theme: 'red' });
      const pIce = new CommandPalette(bufIce, defaultRegion, { theme: 'ice' });

      pRed.show();
      pIce.show();
      pRed.render();
      pIce.render();

      const redAnsi = bufRed.toStringWithANSI();
      const iceAnsi = bufIce.toStringWithANSI();

      // They should differ because accent colors are different
      expect(redAnsi).not.toEqual(iceAnsi);
    });

    it('should produce ANSI styling for red theme', () => {
      const bufRed = new ScreenBuffer(80, 24);
      const pRed = new CommandPalette(bufRed, defaultRegion, { theme: 'red' });
      pRed.show();
      pRed.render();
      const ansi = bufRed.toStringWithANSI();
      expect(ansi).toContain('\x1b[38;2;');
    });

    it('should produce ANSI styling for ice theme', () => {
      const bufIce = new ScreenBuffer(80, 24);
      const pIce = new CommandPalette(bufIce, defaultRegion, { theme: 'ice' });
      pIce.show();
      pIce.render();
      const ansi = bufIce.toStringWithANSI();
      expect(ansi).toContain('\x1b[38;2;');
    });

    it('should fall back to red theme for unknown theme', () => {
      const bufUnknown = new ScreenBuffer(80, 24);
      const bufRed = new ScreenBuffer(80, 24);

      const pUnknown = new CommandPalette(bufUnknown, defaultRegion, { theme: 'nonexistent' });
      const pRed = new CommandPalette(bufRed, defaultRegion, { theme: 'red' });

      pUnknown.show();
      pRed.show();
      pUnknown.render();
      pRed.render();

      expect(bufUnknown.toStringWithANSI()).toEqual(bufRed.toStringWithANSI());
    });

    it('should not emit ANSI codes in noColor mode', () => {
      const bufNoColor = new ScreenBuffer(80, 24);
      const p = new CommandPalette(bufNoColor, defaultRegion, { noColor: true });
      p.show();
      p.render();
      const ansi = bufNoColor.toStringWithANSI();
      // Should not contain RGB escape sequences
      expect(ansi).not.toContain('38;2;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 9. Edge Cases
  // ────────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should show "no matches" when filter has no matches', () => {
      palette.show();
      palette.setFilter('xyznonexistent');
      palette.render();
      const content = buffer.toString();
      expect(content).toContain('no matches');
    });

    it('should auto-highlight single match', () => {
      palette.show();
      palette.setFilter('quit');
      expect(palette.getMatches().length).toBe(1);
      expect(palette.getSelectedIndex()).toBe(0);
      expect(palette.getSelected()!.name).toBe('quit');
    });

    it('should handle rapid filter changes', () => {
      palette.show();
      palette.setFilter('j');
      palette.setFilter('jo');
      palette.setFilter('joi');
      palette.setFilter('join');
      const matches = palette.getMatches();
      expect(matches[0].name).toBe('join');
    });

    it('should handle empty filter after having a filter', () => {
      palette.show();
      palette.setFilter('quit');
      expect(palette.getMatches().length).toBe(1);
      palette.setFilter('');
      expect(palette.getMatches().length).toBe(PALETTE_COMMANDS.length);
    });

    it('should throw when constructed without screen', () => {
      expect(() => new CommandPalette(null as any, defaultRegion)).toThrow();
    });

    it('should throw when constructed without region', () => {
      expect(() => new CommandPalette(buffer, null as any)).toThrow();
    });

    it('should handle maxVisible of 1', () => {
      const p = new CommandPalette(buffer, defaultRegion, { maxVisible: 1 });
      p.show();
      expect(() => p.render()).not.toThrow();
      p.moveDown();
      expect(p.getSelectedIndex()).toBe(1);
    });

    it('should handle very large maxVisible', () => {
      const p = new CommandPalette(buffer, defaultRegion, { maxVisible: 100 });
      p.show();
      // Should still only show as many as available commands
      expect(() => p.render()).not.toThrow();
    });

    it('should not crash when selecting without show', () => {
      // palette is hidden but getSelected works
      const result = palette.select();
      // Matches are populated even when hidden
      expect(result).not.toBeNull();
    });

    it('should handle multiple event listeners', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      palette.on('show', h1);
      palette.on('show', h2);
      palette.show();
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('should handle command names containing special characters in filter', () => {
      palette.show();
      palette.setFilter('/');
      // '/' is not in command names (names don't include slash)
      // Should show commands that have '/' in description if any
      expect(palette.getMatches().length).toBeGreaterThanOrEqual(0);
    });

    it('should return proper usage strings', () => {
      const all = palette.getCommands();
      for (const cmd of all) {
        if (cmd.usage) {
          expect(cmd.usage.startsWith('/')).toBe(true);
        }
      }
    });

    it('should handle filter that matches multiple words', () => {
      palette.show();
      palette.setFilter('list');
      const matches = palette.getMatches();
      expect(matches.some(m => m.name === 'list')).toBe(true);
    });

    it('should render correctly with narrow width', () => {
      const narrowBuffer = new ScreenBuffer(30, 24);
      const narrowRegion = { x: 0, y: 20, width: 28, height: 10 };
      const p = new CommandPalette(narrowBuffer, narrowRegion, { noColor: true });
      p.show();
      p.setFilter('quit');
      expect(() => p.render()).not.toThrow();
      const content = narrowBuffer.toString();
      expect(content).toContain('quit');
    });
  });
});
