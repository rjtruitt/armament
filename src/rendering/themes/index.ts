export { AnsiTheme } from './AnsiTheme.js';
export type { ThemeColors } from './AnsiTheme.js';
export { IceTheme } from './IceTheme.js';
export { FireTheme } from './FireTheme.js';
export { ProTheme } from './ProTheme.js';

import { AnsiTheme, ThemeColors } from './AnsiTheme.js';
import { IceTheme } from './IceTheme.js';
import { FireTheme } from './FireTheme.js';
import { ProTheme } from './ProTheme.js';

const THEMES: Record<string, ThemeColors> = {
  ansi: AnsiTheme,
  ice: IceTheme as unknown as ThemeColors,
  fire: FireTheme as unknown as ThemeColors,
  red: FireTheme as unknown as ThemeColors,
  pro: ProTheme as unknown as ThemeColors,
};

/** Get theme.
 * @param {string} name - Description of name.
 * @returns {ThemeColors} - Description of return value.
 */
export function getTheme(name: string): ThemeColors {
  return THEMES[name] ?? AnsiTheme;
}

/** Get available themes.
 */
export function getAvailableThemes(): string[] {
  return Object.keys(THEMES);
}
