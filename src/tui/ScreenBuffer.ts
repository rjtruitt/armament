/** Virtual terminal screen with cell-level control, regions, scrolling, and diff-based rendering. */

import {
  computeAllCells,
  computeDirtyCells,
  computeDiff,
  renderDiffString,
  toANSIStringFull,
  toStringWithANSI as toStringWithANSIHelper,
  writeAtParsed,
  scrollUp as scrollUpHelper,
  scrollDown as scrollDownHelper,
  scrollRegionUp as scrollRegionUpHelper,
} from './ScreenBufferDiff.js';

/** A single character cell with optional ANSI styling. */
export interface Cell {
  char: string;
  ansi?: string;
}

/** A named rectangular sub-area of the screen buffer. */
export interface Region {
  name: string;
  col: number;
  row: number;
  width: number;
  height: number;
}

/** A cell that has changed since the last render pass. */
export interface DirtyCell {
  row: number;
  col: number;
  cell: Cell;
}

/** Pre-compiled regex for stripping SGR color codes (hot path). */
const SGR_STRIP_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Core rendering primitive: a virtual terminal screen backed by a 2D cell grid.
 * Supports regions, cursor tracking, dirty-cell diffing, and alternate screen buffers.
 */
export class ScreenBuffer {
  private cells: Cell[][];
  private prevCells: Cell[][] | null = null;
  private altCells: Cell[][] | null = null;
  private regions: Map<string, Region> = new Map();
  private _width: number;
  private _height: number;
  private _cursorRow = 0;
  private _cursorCol = 0;
  private _cursorVisible = true;
  private _dirty: Set<number> = new Set();
  private _firstRender = true;
  private _listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  constructor(width: number, height: number) {
    if (width < 1 || height < 1) {
      throw new Error('Buffer dimensions must be at least 1x1');
    }
    this._width = width;
    this._height = height;
    this.cells = this.createGrid(width, height);
    this.markAllDirty();
  }

  /**
   * Gets the width.
   */
  get width(): number { return this._width; }
  /**
   * Gets the height.
   */
  get height(): number { return this._height; }
  /**
   * Gets the rows.
   */
  get rows(): number { return this._height; }
  /**
   * Gets the cols.
   */
  get cols(): number { return this._width; }

  private createGrid(width: number, height: number): Cell[][] {
    const grid: Cell[][] = new Array(height);
    for (let r = 0; r < height; r++) {
      const row: Cell[] = new Array(width);
      for (let c = 0; c < width; c++) {
        row[c] = { char: ' ' };
      }
      grid[r] = row;
    }
    return grid;
  }

  private markAllDirty(): void {
    this._firstRender = true;
    this._dirty.clear();
  }

  /** Set a single cell's character and optional ANSI color. Out-of-bounds writes are silently ignored. */
  setCell(row: number, col: number, char: string, ansi?: string): void {
    if (row < 0 || row >= this._height || col < 0 || col >= this._width) return;
    const cell = this.cells[row][col];
    cell.char = char;
    cell.ansi = ansi;
    this._dirty.add((row << 16) | col);
  }

  /** Write text at a position, parsing and preserving SGR color codes while discarding other CSI sequences. */
  writeAt(row: number, col: number, text: string): void {
    if (row < 0) throw new Error(`Row ${row} out of bounds`);
    if (col < 0) throw new Error(`Col ${col} out of bounds`);
    if (row >= this._height) throw new Error(`Row ${row} out of bounds (0-${this._height - 1})`);
    writeAtParsed(this.cells[row], row, col, text, this._width, this._dirty);
  }

  /** Write plain text at a position, stripping all ANSI escape codes. */
  write(row: number, col: number, text: string, _opts?: any): void {
    if (row < 0 || row >= this._height) return;
    const stripped = text.replace(SGR_STRIP_REGEX, '');
    let c = col;
    const rowCells = this.cells[row];
    for (const ch of stripped) {
      if (c >= this._width) break;
      if (c >= 0) {
        const cell = rowCells[c];
        cell.char = ch;
        cell.ansi = undefined;
        this._dirty.add((row << 16) | c);
      }
      c++;
    }
  }

  /** Read the plain-text content of a single row. */
  readRow(row: number): string {
    if (row < 0 || row >= this._height) return '';
    return this.cells[row].map(c => c.char).join('');
  }

  /** Read plain-text content from a rectangular region of the buffer. */
  readRegion(startRow: number, startCol: number, width: number, height: number): string[] {
    const result: string[] = [];
    for (let r = startRow; r < startRow + height && r < this._height; r++) {
      if (r < 0) { result.push(''); continue; }
      const row = this.cells[r];
      const chars: string[] = new Array(Math.min(width, this._width - startCol));
      let idx = 0;
      for (let c = startCol; c < startCol + width && c < this._width; c++) {
        chars[idx++] = c < 0 ? ' ' : row[c].char;
      }
      result.push(chars.join(''));
    }
    return result;
  }

  /** Serialize the entire buffer as plain text (rows joined by newline). */
  toString(): string {
    return this.cells.map(row => row.map(c => c.char).join('')).join('\n');
  }

  /** Serialize with inline ANSI codes preserved per-cell. */
  toStringWithANSI(): string {
    return toStringWithANSIHelper(this.cells, this._width, this._height);
  }

  /** Generate a full-screen ANSI repaint string with cursor positioning. */
  toANSIString(): string {
    return toANSIStringFull(this.cells, this._width, this._height, this._cursorRow, this._cursorCol, this._cursorVisible);
  }

  /** Snapshot cells for future diffing, clear dirty set, and return plain text. */
  render(): string {
    this.prevCells = this.cells.map(row => row.map(c => ({ ...c })));
    const output = this.toString();
    this._dirty.clear();
    this._firstRender = false;
    return output;
  }

  /** Reset all cells to blank spaces. */
  clear(): void {
    for (let r = 0; r < this._height; r++) {
      const row = this.cells[r];
      for (let c = 0; c < this._width; c++) {
        const cell = row[c];
        cell.char = ' ';
        cell.ansi = undefined;
      }
    }
    this.markAllDirty();
  }

  /** Clear a single row to blank spaces. */
  clearLine(row: number): void {
    if (row < 0 || row >= this._height) return;
    const rowCells = this.cells[row];
    for (let c = 0; c < this._width; c++) {
      const cell = rowCells[c];
      cell.char = ' ';
      cell.ansi = undefined;
      this._dirty.add((row << 16) | c);
    }
  }

  /** Clear a rectangular area to blank spaces. */
  clearRect(col: number, row: number, width: number, height: number): void {
    for (let r = row; r < row + height && r < this._height; r++) {
      if (r < 0) continue;
      const rowCells = this.cells[r];
      for (let c = col; c < col + width && c < this._width; c++) {
        if (c < 0) continue;
        const cell = rowCells[c];
        cell.char = ' ';
        cell.ansi = undefined;
        this._dirty.add((r << 16) | c);
      }
    }
  }

  /** Clear a named region to blank spaces. */
  clearRegion(regionName: string): void {
    const region = this.regions.get(regionName);
    if (!region) return;
    this.clearRect(region.col, region.row, region.width, region.height);
  }

  /** Define a named region within the buffer. Throws if it exceeds buffer bounds. */
  defineRegion(name: string, col: number, row: number, width: number, height: number): Region {
    if (col < 0 || row < 0) {
      throw new Error('Region position cannot be negative');
    }
    if (width < 1 || height < 1) {
      throw new Error('Region dimensions must be at least 1x1');
    }
    if (col + width > this._width) {
      throw new Error('Region extends beyond buffer width');
    }
    if (row + height > this._height) {
      throw new Error('Region extends beyond buffer height');
    }
    const region: Region = { name, col, row, width, height };
    this.regions.set(name, region);
    return region;
  }

  /** Look up a region by name. */
  getRegion(name: string): Region | undefined {
    return this.regions.get(name);
  }

  /** Get all defined regions. */
  getRegions(): Region[] {
    return [...this.regions.values()];
  }

  /** Write text into a named region using region-local coordinates. */
  writeToRegion(regionName: string, localRow: number, localCol: number, text: string): void {
    const region = this.regions.get(regionName);
    if (!region) {
      throw new Error(`Region "${regionName}" not found`);
    }
    const absRow = region.row + localRow;
    const absCol = region.col + localCol;
    const maxLen = region.width - localCol;
    const stripped = text.replace(SGR_STRIP_REGEX, '');
    const clipped = stripped.slice(0, Math.max(0, maxLen));
    if (absRow >= 0 && absRow < this._height) {
      let c = absCol;
      const rowCells = this.cells[absRow];
      for (const ch of clipped) {
        if (c >= this._width) break;
        if (c >= 0) {
          const cell = rowCells[c];
          cell.char = ch;
          cell.ansi = undefined;
          this._dirty.add((absRow << 16) | c);
        }
        c++;
      }
    }
  }

  /** Resize the buffer, copying existing content that fits. Emits 'resize'. */
  resize(width: number, height: number): void {
    if (width < 1 || height < 1) {
      throw new Error('Buffer dimensions must be at least 1x1');
    }
    const newGrid = this.createGrid(width, height);
    const copyRows = Math.min(this._height, height);
    const copyCols = Math.min(this._width, width);
    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        newGrid[r][c] = this.cells[r][c];
      }
    }
    this.cells = newGrid;
    this._width = width;
    this._height = height;
    this.markAllDirty();
    this.emit('resize', { width, height });
  }

  /** Move the logical cursor position. Throws if out of bounds. */
  setCursor(row: number, col: number): void {
    if (row < 0 || row >= this._height) {
      throw new Error(`Cursor row ${row} out of bounds`);
    }
    if (col < 0 || col >= this._width) {
      throw new Error(`Cursor col ${col} out of bounds`);
    }
    this._cursorRow = row;
    this._cursorCol = col;
  }

  /** Get current cursor position. */
  getCursor(): { row: number; col: number } {
    return { row: this._cursorRow, col: this._cursorCol };
  }

  /**
   * Show cursor.
   */
  showCursor(): void { this._cursorVisible = true; }
  /**
   * Hide cursor.
   */
  hideCursor(): void { this._cursorVisible = false; }
  /**
   * Checks whether cursor visible.
   */
  isCursorVisible(): boolean { return this._cursorVisible; }

  /** Get all cells marked dirty since last render. */
  getDirtyCells(): DirtyCell[] {
    if (this._firstRender) {
      return computeAllCells(this.cells, this._width, this._height);
    }
    return computeDirtyCells(this.cells, this._dirty);
  }

  /** Get only the cells that differ from the previous render snapshot. */
  getDiff(): DirtyCell[] {
    return computeDiff(this.cells, this.prevCells, this._dirty, this._width, this._height, this._firstRender);
  }

  /** Generate an optimized ANSI escape string that only repaints changed cells. */
  renderDiff(): string {
    return renderDiffString(this.getDiff());
  }

  /** Scroll content up by N lines, filling new rows at the bottom with blanks. */
  scrollUp(lines: number): void {
    scrollUpHelper(this.cells, this._height, lines, () => this.makeBlankRow());
    this.markAllDirty();
  }

  /** Scroll content down by N lines, filling new rows at the top with blanks. */
  scrollDown(lines: number): void {
    scrollDownHelper(this.cells, this._height, lines, () => this.makeBlankRow());
    this.markAllDirty();
  }

  private makeBlankRow(): Cell[] {
    const row: Cell[] = new Array(this._width);
    for (let c = 0; c < this._width; c++) {
      row[c] = { char: ' ' };
    }
    return row;
  }

  /** Scroll content within a named region up by N lines. */
  scrollRegionUp(regionName: string, lines: number): void {
    const region = this.regions.get(regionName);
    if (!region) return;
    scrollRegionUpHelper(this.cells, region.row, region.col, region.width, region.height, lines, this._height);
    this.markAllDirty();
  }

  /** Save current buffer and switch to a fresh alternate screen. */
  switchToAlternate(): void {
    this.altCells = this.cells;
    this.cells = this.createGrid(this._width, this._height);
    this.markAllDirty();
  }

  /** Restore the previously saved main screen buffer. */
  switchToMain(): void {
    if (this.altCells) {
      this.cells = this.altCells;
      this.altCells = null;
      this.markAllDirty();
    }
  }

  /** Get the raw character grid (array of rows, each row an array of characters). */
  getScreen(): string[][] {
    return this.cells.map(row => row.map(c => c.char));
  }

  /** Register an event listener (e.g., 'resize'). */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event)!.push(handler);
  }

  private emit(event: string, ...args: any[]): void {
    const handlers = this._listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(...args);
    }
  }
}
