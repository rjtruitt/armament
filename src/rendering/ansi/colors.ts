/**
 * @module ansi/colors
 * Core ANSI escape sequence primitives: style constants, color functions, and unicode characters.
 */

const ESC = '\x1b[';


/** Reset all ANSI styles. */
export const RESET = '\x1b[0m';

/** Bold/bright text. */
export const BOLD = '\x1b[1m';

/** Dim/faint text. */
export const DIM = '\x1b[2m';

/** Italic text (terminal support varies). */
export const ITALIC = '\x1b[3m';

/** Underlined text. */
export const UNDERLINE = '\x1b[4m';

/** Blinking text (rarely supported). */
export const BLINK = '\x1b[5m';

/** Inverse/reverse video. */
export const INVERSE = '\x1b[7m';

/** Hidden/invisible text. */
export const HIDDEN = '\x1b[8m';

/** Strikethrough text. */
export const STRIKETHROUGH = '\x1b[9m';


/** Set foreground to a 256-color palette index (0-255). */
export function fg256(n: number): string {
  return `${ESC}38;5;${n}m`;
}

/** Set background to a 256-color palette index (0-255). */
export function bg256(n: number): string {
  return `${ESC}48;5;${n}m`;
}

/** Set foreground to a 24-bit RGB color. */
export function fgRgb(r: number, g: number, b: number): string {
  return `${ESC}38;2;${r};${g};${b}m`;
}

/** Set background to a 24-bit RGB color. */
export function bgRgb(r: number, g: number, b: number): string {
  return `${ESC}48;2;${r};${g};${b}m`;
}


/** Navy-to-cyan foreground gradient (12 stops, 256-color). */
export const ARMAMENT_GRADIENT = [
  fg256(17),   // deep navy
  fg256(18),   // dark blue
  fg256(19),   // blue
  fg256(20),   // medium blue
  fg256(21),   // bright blue
  fg256(27),   // royal blue
  fg256(33),   // dodger blue
  fg256(39),   // deep sky blue
  fg256(45),   // turquoise
  fg256(51),   // cyan
  fg256(87),   // light cyan
  fg256(123),  // pale cyan
] as const;

/** Dark-red-to-cream foreground gradient (12 stops, 256-color). */
export const FIRE_GRADIENT = [
  fg256(52),   // dark red
  fg256(88),   // maroon
  fg256(124),  // dark red
  fg256(160),  // red
  fg256(196),  // bright red
  fg256(202),  // orange-red
  fg256(208),  // orange
  fg256(214),  // gold
  fg256(220),  // yellow
  fg256(226),  // bright yellow
  fg256(228),  // pale yellow
  fg256(230),  // cream
] as const;

/** Black-to-ice-white foreground gradient (12 stops, 256-color). */
export const ICE_GRADIENT = [
  fg256(16),   // black
  fg256(17),   // deep navy
  fg256(18),   // dark blue
  fg256(24),   // teal
  fg256(30),   // dark cyan
  fg256(37),   // cyan
  fg256(44),   // turquoise
  fg256(51),   // bright cyan
  fg256(87),   // light cyan
  fg256(123),  // pale cyan
  fg256(159),  // ice blue
  fg256(195),  // near-white blue
] as const;


/** Block-drawing characters for bar/fill rendering. */
export const BLOCK = {
  FULL: '█',
  DARK: '▓',
  MEDIUM: '▒',
  LIGHT: '░',
  UPPER_HALF: '▀',
  LOWER_HALF: '▄',
  LEFT_HALF: '▌',
  RIGHT_HALF: '▐',
} as const;

/** Box-drawing characters for borders and layout. */
export const BOX = {
  TOP_LEFT: '┌',
  TOP_RIGHT: '┐',
  BOTTOM_LEFT: '└',
  BOTTOM_RIGHT: '┘',
  HORIZONTAL: '─',
  VERTICAL: '│',
  T_DOWN: '┬',
  T_UP: '┴',
  T_RIGHT: '├',
  T_LEFT: '┤',
  CROSS: '┼',
  DOUBLE_TOP_LEFT: '╔',
  DOUBLE_TOP_RIGHT: '╗',
  DOUBLE_BOTTOM_LEFT: '╚',
  DOUBLE_BOTTOM_RIGHT: '╝',
  DOUBLE_HORIZONTAL: '═',
  DOUBLE_VERTICAL: '║',
} as const;


/** Strip all ANSI escape sequences from a string, returning raw visible text. */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
