/**
 * Diff calculation and ANSI rendering helpers for ScreenBuffer.
 * Extracted to keep ScreenBuffer under 400 lines while preserving its public API.
 */

import type { Cell, DirtyCell } from './ScreenBuffer.js';

/** Compute all cells as dirty (used on first render or full invalidation). */
export function computeAllCells(cells: Cell[][], width: number, height: number): DirtyCell[] {
  const all: DirtyCell[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      all.push({ row: r, col: c, cell: cells[r][c] });
    }
  }
  return all;
}

/** Compute dirty cells from the dirty set. */
export function computeDirtyCells(cells: Cell[][], dirty: Set<number>): DirtyCell[] {
  const result: DirtyCell[] = [];
  for (const packed of dirty) {
    const r = packed >> 16;
    const c = packed & 0xFFFF;
    result.push({ row: r, col: c, cell: cells[r][c] });
  }
  return result;
}

/** Compute only cells that differ from the previous snapshot. */
export function computeDiff(
  cells: Cell[][],
  prevCells: Cell[][] | null,
  dirty: Set<number>,
  width: number,
  height: number,
  firstRender: boolean,
): DirtyCell[] {
  if (firstRender || !prevCells) {
    return computeAllCells(cells, width, height);
  }
  const diff: DirtyCell[] = [];
  for (const packed of dirty) {
    const r = packed >> 16;
    const c = packed & 0xFFFF;
    if (r < height && c < width) {
      const prev = prevCells[r]?.[c];
      const curr = cells[r][c];
      if (!prev || prev.char !== curr.char || prev.ansi !== curr.ansi) {
        diff.push({ row: r, col: c, cell: curr });
      }
    }
  }
  return diff;
}

/** Generate an optimized ANSI escape string that only repaints changed cells. */
export function renderDiffString(diff: DirtyCell[]): string {
  if (diff.length === 0) return '';
  diff.sort((a, b) => a.row - b.row || a.col - b.col);
  const parts: string[] = [];
  let prevRow = -1;
  let prevCol = -1;
  for (const d of diff) {
    const consecutive = d.row === prevRow && d.col === prevCol + 1;
    if (!consecutive) {
      parts.push(`\x1b[${d.row + 1};${d.col + 1}H`);
    }
    if (d.cell.ansi) parts.push(d.cell.ansi);
    parts.push(d.cell.char);
    prevRow = d.row;
    prevCol = d.col;
  }
  return parts.join('');
}

/** Generate a full-screen ANSI repaint string with cursor positioning. */
export function toANSIStringFull(
  cells: Cell[][],
  width: number,
  height: number,
  cursorRow: number,
  cursorCol: number,
  cursorVisible: boolean,
): string {
  const parts: string[] = ['\x1b[?25l\x1b[H'];
  let lastAnsi = '';
  for (let r = 0; r < height; r++) {
    const row = cells[r];
    for (let c = 0; c < width; c++) {
      if (r === height - 1 && c === width - 1) break;
      const cell = row[c];
      const ansi = cell.ansi || '';
      if (ansi !== lastAnsi) {
        parts.push(ansi || '\x1b[0m');
        lastAnsi = ansi;
      }
      parts.push(cell.char);
    }
    if (r < height - 1) {
      parts.push('\r\n');
    }
  }
  parts.push('\x1b[0m');
  if (cursorVisible) {
    parts.push(`\x1b[${cursorRow + 1};${cursorCol + 1}H\x1b[?25h`);
  }
  return parts.join('');
}

/** Serialize with inline ANSI codes preserved per-cell. */
export function toStringWithANSI(cells: Cell[][], width: number, height: number): string {
  const lines: string[] = new Array(height);
  for (let r = 0; r < height; r++) {
    const row = cells[r];
    const parts: string[] = [];
    for (let c = 0; c < width; c++) {
      const cell = row[c];
      if (cell.ansi) parts.push(cell.ansi);
      parts.push(cell.char);
    }
    lines[r] = parts.join('');
  }
  return lines.join('\n');
}

/** Scroll content up by N lines, returning the mutated grid. */
export function scrollUp(cells: Cell[][], height: number, lines: number, makeBlankRow: () => Cell[]): void {
  const clamped = Math.min(lines, height);
  for (let r = 0; r < height - clamped; r++) {
    cells[r] = cells[r + clamped];
  }
  for (let r = height - clamped; r < height; r++) {
    cells[r] = makeBlankRow();
  }
}

/** Scroll content down by N lines, mutating the grid in place. */
export function scrollDown(cells: Cell[][], height: number, lines: number, makeBlankRow: () => Cell[]): void {
  const clamped = Math.min(lines, height);
  for (let r = height - 1; r >= clamped; r--) {
    cells[r] = cells[r - clamped];
  }
  for (let r = 0; r < clamped; r++) {
    cells[r] = makeBlankRow();
  }
}

/**
 * Write text at a position, parsing and preserving SGR color codes while discarding other CSI sequences.
 * Operates directly on the cell row and dirty set for performance.
 */
export function writeAtParsed(
  rowCells: Cell[],
  row: number,
  col: number,
  text: string,
  width: number,
  dirty: Set<number>,
): void {
  let activeColor = '';
  let currentAnsi = '';
  let charIdx = col;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const code = text.charCodeAt(i);

    if (code >= 32 && code !== 0x1b) {
      if (charIdx >= width) break;
      const cell = rowCells[charIdx];
      cell.char = text[i];
      cell.ansi = currentAnsi || activeColor || undefined;
      dirty.add((row << 16) | charIdx);
      currentAnsi = '';
      charIdx++;
      i++;
      continue;
    }

    if (code === 0x1b) {
      if (i + 1 < len && text.charCodeAt(i + 1) === 0x5b) {
        let j = i + 2;
        while (j < len) {
          const fb = text.charCodeAt(j);
          if (fb >= 0x40 && fb <= 0x7e) {
            const seq = text.slice(i, j + 1);
            if (fb === 0x6d) {
              if (seq === '\x1b[0m' || seq === '\x1b[m') {
                activeColor = '';
                currentAnsi = seq;
              } else {
                activeColor = seq;
                currentAnsi = seq;
              }
            }
            i = j + 1;
            break;
          } else if (fb >= 0x20 && fb <= 0x3f) {
            j++;
          } else {
            i = j + 1;
            break;
          }
        }
        if (j >= len) i = len;
      } else {
        i++;
        if (i < len && text.charCodeAt(i) >= 0x40 && text.charCodeAt(i) <= 0x7e) i++;
      }
      continue;
    }

    i++;
  }
}

/** Scroll content within a region up by N lines. */
export function scrollRegionUp(
  cells: Cell[][],
  regionRow: number,
  regionCol: number,
  regionWidth: number,
  regionHeight: number,
  lines: number,
  bufferHeight: number,
): void {
  const clamped = Math.min(lines, regionHeight);
  for (let r = regionRow; r < regionRow + regionHeight - clamped; r++) {
    for (let c = regionCol; c < regionCol + regionWidth; c++) {
      cells[r][c] = cells[r + clamped]?.[c] ?? { char: ' ' };
    }
  }
  for (let r = regionRow + regionHeight - clamped; r < regionRow + regionHeight; r++) {
    for (let c = regionCol; c < regionCol + regionWidth; c++) {
      if (r < bufferHeight) cells[r][c] = { char: ' ' };
    }
  }
}
