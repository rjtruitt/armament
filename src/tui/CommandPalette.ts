/** Floating command picker triggered by '/' in the input bar. */

import { ScreenBuffer } from './ScreenBuffer.js';
import { THEMES, fgRgb, bgRgb, RESET } from '../rendering/index.js';

/** A single command entry shown in the palette. */
export interface CommandDef {
  name: string;
  description: string;
  usage?: string;
  category: 'irc' | 'standard' | 'config';
  handler?: string;
}

/** Options for configuring the command palette behavior. */
export interface CommandPaletteOptions {
  maxVisible?: number;
  theme?: string;
  noColor?: boolean;
  commands?: CommandDef[];
}

let ALL_COMMANDS: CommandDef[] = [];

/**
 * Floating command picker overlay triggered by '/' in the input bar.
 * Supports fuzzy filtering, keyboard navigation, and custom picker mode.
 */
export class CommandPalette {
  private screen: ScreenBuffer;
  private region: { x: number; y: number; width: number; height: number };
  private maxVisible: number;
  private themeName: string;
  private noColor: boolean;
  private visible = false;
  private filter = '';
  private matches: CommandDef[] = [];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private commands: CommandDef[];
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  constructor(
    screen: ScreenBuffer,
    region: { x: number; y: number; width: number; height: number },
    opts?: CommandPaletteOptions,
  ) {
    if (!screen) throw new Error('ScreenBuffer is required');
    if (!region) throw new Error('Region is required');

    this.screen = screen;
    this.region = region;
    this.maxVisible = opts?.maxVisible ?? 14;
    this.themeName = opts?.theme ?? 'red';
    this.noColor = opts?.noColor ?? false;
    if (opts?.commands) {
      ALL_COMMANDS = opts.commands;
    }
    this.commands = [...ALL_COMMANDS];
    this.matches = [...this.commands];
  }

  private _customTitle: string | null = null;
  private _customItems: CommandDef[] | null = null;
  private _onCustomSelect: ((item: CommandDef) => void) | null = null;

  /** Open the palette with the default command list. */
  show(): void {
    this.visible = true;
    this.filter = '';
    this._customTitle = null;
    this._customItems = null;
    this._onCustomSelect = null;
    this.matches = [...this.commands];
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.emit('show');
  }

  /** Open as a custom picker with a user-supplied item list and callback. */
  showPicker(title: string, items: CommandDef[], onSelect: (item: CommandDef) => void): void {
    this.visible = true;
    this.filter = '';
    this._customTitle = title;
    this._customItems = items;
    this._onCustomSelect = onSelect;
    this.matches = [...items];
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.emit('show');
  }

  /**
   * Checks whether custom picker.
   */
  isCustomPicker(): boolean {
    return this._customItems !== null;
  }

  /**
   * Gets the title.
   */
  getTitle(): string {
    return this._customTitle ?? 'commands';
  }

  /** Close the palette and reset custom picker state. */
  hide(): void {
    this.visible = false;
    this._customTitle = null;
    this._customItems = null;
    this._onCustomSelect = null;
    this.emit('hide');
  }

  /**
   * Checks whether visible.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /** Update the filter text and re-rank matches. */
  setFilter(text: string): void {
    this.filter = text;
    const source = this._customItems ?? this.commands;
    if (text === '') {
      this.matches = [...source];
    } else {
      const lower = text.toLowerCase();
      this.matches = source.filter(cmd =>
        cmd.name.toLowerCase().startsWith(lower) ||
        cmd.name.toLowerCase().includes(lower) ||
        cmd.description.toLowerCase().includes(lower),
      );
      this.matches.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      });
    }
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.emit('filter', text, this.matches);
  }

  /**
   * Gets the filter.
   */
  getFilter(): string {
    return this.filter;
  }

  /**
   * Gets the matches.
   */
  getMatches(): CommandDef[] {
    return [...this.matches];
  }

  /**
   * Move up.
   */
  moveUp(): void {
    if (this.matches.length === 0) return;
    if (this.selectedIndex <= 0) {
      this.selectedIndex = this.matches.length - 1;
    } else {
      this.selectedIndex--;
    }
    this.adjustScroll();
    this.emit('navigate', this.selectedIndex);
  }

  /**
   * Move down.
   */
  moveDown(): void {
    if (this.matches.length === 0) return;
    if (this.selectedIndex >= this.matches.length - 1) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex++;
    }
    this.adjustScroll();
    this.emit('navigate', this.selectedIndex);
  }

  /**
   * Gets the selected index.
   */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /**
   * Gets the selected.
   */
  getSelected(): CommandDef | null {
    if (this.matches.length === 0) return null;
    return this.matches[this.selectedIndex] ?? null;
  }

  /** Confirm the highlighted item. Returns the command string (e.g., '/help') or null for custom pickers. */
  select(): string | null {
    const cmd = this.getSelected();
    if (!cmd) return null;
    if (this._onCustomSelect) {
      this._onCustomSelect(cmd);
      this.hide();
      return null;
    }
    const result = `/${cmd.name}`;
    this.emit('select', cmd, result);
    return result;
  }

  /** Render the palette overlay onto the screen buffer. */
  render(): void {
    if (!this.visible) return;

    const theme = THEMES[this.themeName] ?? THEMES.red;
    const { x, y, width } = this.region;
    const accent = theme.accentStops[0];
    const w = Math.min(width, Math.max(120, Math.floor(width * 0.9)));

    const ac = this.noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);
    const dim = this.noColor ? '' : fgRgb(100, 100, 100);
    const bright = this.noColor ? '' : fgRgb(200, 200, 200);
    const catColor = this.noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);
    const selBg = this.noColor ? '' : bgRgb(accent[0] >> 2, accent[1] >> 2, accent[2] >> 2);
    const r = this.noColor ? '' : RESET;

    const visibleCount = Math.min(this.maxVisible, this.matches.length);
    const selectedCmd = this.getSelected();
    const hasDetail = selectedCmd && selectedCmd.usage;
    let catHeaders = 0;
    if (!this.filter && this.matches.length > 0) {
      let prev = '';
      for (let i = this.scrollOffset; i < Math.min(this.scrollOffset + visibleCount, this.matches.length); i++) {
        if (this.matches[i].category !== prev) { catHeaders++; prev = this.matches[i].category; }
      }
    }
    const contentHeight = (this.matches.length === 0 ? 1 : visibleCount) + catHeaders;
    const panelHeight = contentHeight + 2 + (hasDetail ? 2 : 0);

    const startRow = y - panelHeight;
    if (startRow < 0) return;

    const titleText = this.getTitle();
    let col = x;
    this.screen.setCell(startRow, col++, '╭', ac);
    this.screen.setCell(startRow, col++, '─', ac);
    this.screen.setCell(startRow, col++, ' ', ac);
    for (const ch of titleText) { if (col < x + w - 1) this.screen.setCell(startRow, col++, ch, ac); }
    this.screen.setCell(startRow, col++, ' ', ac);
    while (col < x + w - 1) this.screen.setCell(startRow, col++, '─', ac);
    this.screen.setCell(startRow, col, '╮', ac);

    let row = startRow + 1;
    if (this.matches.length === 0) {
      this.screen.setCell(row, x, '│', ac);
      const msg = ' no matches';
      let c = x + 1;
      for (const ch of msg) { if (c < x + w - 1) this.screen.setCell(row, c++, ch, dim); }
      while (c < x + w - 1) this.screen.setCell(row, c++, ' ');
      this.screen.setCell(row, x + w - 1, '│', ac);
      row++;
    } else {
      let lastCategory = '';
      for (let i = 0; i < visibleCount; i++) {
        const cmdIdx = this.scrollOffset + i;
        const cmd = this.matches[cmdIdx];
        const isSelected = cmdIdx === this.selectedIndex;

        if (!this.filter && cmd.category !== lastCategory && row < y - 1) {
          lastCategory = cmd.category;
          this.screen.setCell(row, x, '│', ac);
          let c = x + 1;
          const catLabel = ` ${cmd.category.toUpperCase()} `;
          this.screen.setCell(row, c++, ' ');
          for (const ch of catLabel) { if (c < x + w - 1) this.screen.setCell(row, c++, ch, catColor); }
          while (c < x + w - 1) this.screen.setCell(row, c++, ' ');
          this.screen.setCell(row, x + w - 1, '│', ac);
          row++;
          if (row >= y) break;
        }

        this.screen.setCell(row, x, '│', ac);
        let c = x + 1;

        const lineColor = isSelected ? selBg : '';
        const indicator = isSelected ? '▸' : ' ';
        const nameColor = isSelected ? bright : ac;
        const descColor = isSelected ? bright : dim;

        if (lineColor) this.screen.setCell(row, c, ' ', lineColor);
        c++;
        this.screen.setCell(row, c++, indicator, isSelected ? ac : dim);
        this.screen.setCell(row, c++, ' ');

        const isCustom = this._customItems !== null;
        const cmdName = isCustom ? cmd.name : `/${cmd.name}`;
        const maxNameWidth = isCustom ? Math.min(cmdName.length, w - 8) : 18;
        const nameWidth = Math.min(cmdName.length, maxNameWidth);
        for (let j = 0; j < nameWidth; j++) {
          if (c < x + w - 1) this.screen.setCell(row, c++, cmdName[j], `${lineColor}${nameColor}`);
        }

        const nameEnd = isCustom ? c + 2 : x + 23;
        while (c < nameEnd && c < x + w - 1) {
          this.screen.setCell(row, c++, ' ', lineColor);
        }

        const descSpace = (x + w - 1) - c - 1;
        const desc = cmd.description.slice(0, descSpace);
        for (const ch of desc) {
          if (c < x + w - 1) this.screen.setCell(row, c++, ch, `${lineColor}${descColor}`);
        }
        while (c < x + w - 1) this.screen.setCell(row, c++, ' ', lineColor);
        this.screen.setCell(row, x + w - 1, '│', ac);
        row++;
        if (row >= y) break;
      }
    }

    if (hasDetail && row < y) {
      this.screen.setCell(row, x, '├', ac);
      let c = x + 1;
      while (c < x + w - 1) this.screen.setCell(row, c++, '─', dim);
      this.screen.setCell(row, x + w - 1, '┤', ac);
      row++;

      if (row < y) {
        this.screen.setCell(row, x, '│', ac);
        let c = x + 1;
        this.screen.setCell(row, c++, ' ');
        const usage = selectedCmd!.usage ?? `/${selectedCmd!.name}`;
        for (const ch of usage) { if (c < x + w - 1) this.screen.setCell(row, c++, ch, bright); }
        while (c < x + w - 1) this.screen.setCell(row, c++, ' ');
        this.screen.setCell(row, x + w - 1, '│', ac);
        row++;
      }
    }

    if (row <= y) {
      this.screen.setCell(row, x, '╰', ac);
      let c = x + 1;
      while (c < x + w - 1) this.screen.setCell(row, c++, '─', ac);
      this.screen.setCell(row, x + w - 1, '╯', ac);
    }

    if (this.scrollOffset > 0) {
      this.screen.setCell(startRow + 1, x + w - 2, '↑', dim);
    }
    if (this.scrollOffset + visibleCount < this.matches.length) {
      this.screen.setCell(row - 1, x + w - 2, '↓', dim);
    }
  }

  /**
   * On.
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  private emit(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(...args);
    }
  }

  private adjustScroll(): void {
    const visibleCount = Math.min(this.maxVisible, this.matches.length);
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + visibleCount) {
      this.scrollOffset = this.selectedIndex - visibleCount + 1;
    }
  }

  /** Get all registered commands */
  getCommands(): CommandDef[] {
    return [...this.commands];
  }

  /** Get commands by category */
  getCommandsByCategory(category: 'irc' | 'standard' | 'config'): CommandDef[] {
    return this.commands.filter(cmd => cmd.category === category);
  }
}

export { ALL_COMMANDS };
