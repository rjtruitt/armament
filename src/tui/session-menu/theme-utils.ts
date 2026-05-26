/**
 * Color and gradient utilities for themed menu rendering.
 */

import { THEMES, type ThemeColors, fgRgb, RESET } from '../../rendering/index.js';
import type { RGB } from './types.js';

/** Resolves the active theme by name, falling back to red. */
export function getThemeColors(themeName: string): ThemeColors {
  return THEMES[themeName] ?? THEMES.red;
}

/** Scales an RGB color by a brightness factor (0-1). */
export function dimColor(color: RGB, factor: number): RGB {
  return [
    Math.round(color[0] * factor),
    Math.round(color[1] * factor),
    Math.round(color[2] * factor),
  ];
}

/** Renders a single character with sine-wave brightness based on vertical position. */
export function sineGradientChar(ch: string, pos: number, totalHeight: number, baseColor: RGB): string {
  const t = totalHeight > 1 ? pos / (totalHeight - 1) : 0.5;
  const brightness = 0.3 + 0.7 * Math.sin(t * Math.PI);
  const r = Math.round(baseColor[0] * brightness);
  const g = Math.round(baseColor[1] * brightness);
  const b = Math.round(baseColor[2] * brightness);
  return `${fgRgb(r, g, b)}${ch}`;
}

/** Renders a horizontal line with sine-wave brightness distribution. */
export function sineGradientHLine(length: number, startOffset: number, totalWidth: number, baseColor: RGB): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const pos = startOffset + i;
    const t = totalWidth > 1 ? pos / (totalWidth - 1) : 0.5;
    const brightness = 0.3 + 0.7 * Math.sin(t * Math.PI);
    const r = Math.round(baseColor[0] * brightness);
    const g = Math.round(baseColor[1] * brightness);
    const b = Math.round(baseColor[2] * brightness);
    result += `${fgRgb(r, g, b)}─`;
  }
  return result + RESET;
}

/** Applies a multi-stop gradient across visible characters in a string. */
export function gradientText(text: string, stops: RGB[]): string {
  const chars = [...text];
  const visible = chars.filter(c => c !== ' ').length;
  let idx = 0;
  return chars.map(ch => {
    if (ch === ' ') return ch;
    const t = visible > 1 ? idx / (visible - 1) : 0;
    const segCount = stops.length - 1;
    const seg = Math.min(Math.floor(t * segCount), segCount - 1);
    const localT = (t * segCount) - seg;
    const [r1, g1, b1] = stops[seg];
    const [r2, g2, b2] = stops[seg + 1];
    const r = Math.round(r1 + (r2 - r1) * localT);
    const g = Math.round(g1 + (g2 - g1) * localT);
    const b = Math.round(b1 + (b2 - b1) * localT);
    idx++;
    return `${fgRgb(r, g, b)}${ch}`;
  }).join('') + RESET;
}
