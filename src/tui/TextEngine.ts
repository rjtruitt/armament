/** ANSI-aware text measurement, wrapping, and slicing. */

import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';
import sliceAnsi from 'slice-ansi';

export { stringWidth, wrapAnsi, sliceAnsi };

/** Measure visible width of a string, ignoring ANSI escapes. */
export function visibleWidth(text: string): number {
  return stringWidth(text);
}

/** Wrap text to fit within a column width, preserving ANSI styling across line breaks. */
export function wrapText(text: string, width: number, hard = true): string[] {
  const wrapped = wrapAnsi(text, width, { trim: false, hard, wordWrap: true });
  return wrapped.split('\n');
}

/** Slice a styled string by visible character positions, preserving ANSI codes. */
export function sliceText(text: string, start: number, end?: number): string {
  return sliceAnsi(text, start, end);
}

/** Truncate text to fit within maxWidth visible columns, appending ellipsis if needed. */
export function truncate(text: string, maxWidth: number, ellipsis = '…'): string {
  const w = visibleWidth(text);
  if (w <= maxWidth) return text;
  const ellipsisWidth = visibleWidth(ellipsis);
  const sliced = sliceAnsi(text, 0, maxWidth - ellipsisWidth);
  return sliced + ellipsis;
}

/** Pad text to a fixed visible width (right-pad with spaces). */
export function padRight(text: string, targetWidth: number): string {
  const w = visibleWidth(text);
  if (w >= targetWidth) return text;
  return text + ' '.repeat(targetWidth - w);
}

/** Pad text to center within a fixed width. */
export function padCenter(text: string, targetWidth: number): string {
  const w = visibleWidth(text);
  if (w >= targetWidth) return text;
  const leftPad = Math.floor((targetWidth - w) / 2);
  const rightPad = targetWidth - w - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}
