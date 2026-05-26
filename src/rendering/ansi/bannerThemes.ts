/**
 * @module ansi/bannerThemes
 * Theme definitions, color constants, and gradient utilities for banner rendering.
 */

import { RESET } from './colors.js';

/** RGB color triplet [red, green, blue], each 0-255. */
export type RGB = [number, number, number];

/**
 * LOGO constant.
 */
export const LOGO = [
  ' ▄▄▄       ██▀███   ███▄ ▄███▓ ▄▄▄       ███▄ ▄███▓▓█████  ███▄    █ ▄▄▄█████▓',
  '▒████▄    ▓██ ▒ ██▒▓██▒▀█▀ ██▒▒████▄    ▓██▒▀█▀ ██▒▓█   ▀  ██ ▀█   █ ▓  ██▒ ▓▒',
  '▒██  ▀█▄  ▓██ ░▄█ ▒▓██    ▓██░▒██  ▀█▄  ▓██    ▓██░▒███   ▓██  ▀█ ██▒▒ ▓██░ ▒░',
  '░██▄▄▄▄██ ▒██▀▀█▄  ▒██    ▒██ ░██▄▄▄▄██ ▒██    ▒██ ▒▓█  ▄ ▓██▒  ▐▌██▒░ ▓██▓ ░ ',
  ' ▓█   ▓██▒░██▓ ▒██▒▒██▒   ░██▒ ▓█   ▓██▒▒██▒   ░██▒░▒████▒▒██░   ▓██░  ▒██▒ ░ ',
  ' ▒▒   ▓▒█░░ ▒▓ ░▒▓░░ ▒░   ░  ░ ▒▒   ▓▒█░░ ▒░   ░  ░░░ ▒░ ░░ ▒░   ▒ ▒   ▒ ░░  ',
  '  ▒   ▒▒ ░  ░▒ ░ ▒░░  ░      ░  ▒   ▒▒ ░░  ░      ░ ░ ░  ░░ ░░   ░ ▒░    ░   ',
  '  ░   ▒     ░░   ░ ░      ░     ░   ▒   ░      ░      ░      ░   ░ ░   ░     ',
  '      ░  ░   ░            ░         ░  ░       ░      ░  ░         ░         ',
];

/**
 * FLAVOR_TEXTS constant.
 */
export const FLAVOR_TEXTS = [
  'loading tactical subroutines...',
  'arming response batteries...',
  'charging forward arrays...',
  'deploying countermeasures...',
  'weapons systems online...',
  'targeting matrix locked...',
  'shield harmonics stable...',
  'torpedo bays loaded...',
  'engaging combat protocols...',
  'main guns spooling up...',
  'fire control standing by...',
  'munitions bay pressurized...',
  'point defense grid active...',
  'all stations battle ready...',
  'awaiting firing solution...',
  'ordnance primed and hot...',
  'threat board clear...',
  'flak screen deployed...',
  'railgun capacitors charged...',
  'launch tubes green...',
];

/** Color palette for banner/loading screen rendering (distinct from TUI ThemeColors). */
export interface ThemeColors {
  logoColors: RGB[];
  barStops: RGB[];
  flavorStops: RGB[];
  accentStops: RGB[];
  titleStops: RGB[];
  labelStops: RGB[];
  valueStops: RGB[];
  successStops: RGB[];
  warnStops: RGB[];
  dim: RGB;
}

/**
 * THEMES constant.
 */
export const THEMES: Record<string, ThemeColors> = {
  red: {
    logoColors: [[255,60,60],[240,40,40],[220,30,30],[200,20,20],[180,30,30],[170,30,40],[160,30,35],[150,30,30],[140,30,25]],
    barStops: [[200,40,40],[255,60,60],[255,120,120]],
    flavorStops: [[255,80,80],[255,140,140]],
    accentStops: [[255,60,60],[180,40,40]],
    titleStops: [[255,80,80],[255,150,150]],
    labelStops: [[255,70,70],[200,50,50]],
    valueStops: [[255,210,210],[255,170,170]],
    successStops: [[120,255,120],[200,255,170]],
    warnStops: [[255,210,70],[255,150,70]],
    dim: [140,50,50],
  },
  fire: {
    logoColors: [[255,80,40],[255,100,30],[255,120,30],[255,140,40],[255,160,50],[255,180,60],[240,120,40],[210,80,30],[180,60,25]],
    barStops: [[255,80,40],[255,150,70],[255,210,100]],
    flavorStops: [[255,100,60],[255,200,80]],
    accentStops: [[255,120,60],[190,70,30]],
    titleStops: [[255,130,50],[255,210,80]],
    labelStops: [[255,120,60],[210,80,30]],
    valueStops: [[255,235,190],[255,200,130]],
    successStops: [[120,255,120],[200,255,170]],
    warnStops: [[255,210,70],[255,150,70]],
    dim: [160,80,40],
  },
  ice: {
    logoColors: [[200,255,255],[170,250,255],[140,235,255],[110,220,255],[80,200,255],[60,180,240],[50,160,220],[45,140,200],[40,120,180]],
    barStops: [[60,200,255],[130,240,255],[200,255,255]],
    flavorStops: [[80,220,255],[180,255,255]],
    accentStops: [[60,200,255],[40,120,180]],
    titleStops: [[80,220,255],[180,255,255]],
    labelStops: [[60,180,230],[40,130,170]],
    valueStops: [[210,255,255],[170,235,250]],
    successStops: [[120,255,210],[200,255,240]],
    warnStops: [[255,210,70],[255,170,30]],
    dim: [40,120,150],
  },
  green: {
    logoColors: [[140,255,140],[120,245,100],[100,235,80],[80,220,60],[60,200,50],[50,185,40],[45,170,40],[40,155,35],[35,140,30]],
    barStops: [[50,180,50],[80,230,80],[140,255,140]],
    flavorStops: [[80,220,80],[170,255,130]],
    accentStops: [[60,200,80],[40,140,50]],
    titleStops: [[80,230,80],[170,255,130]],
    labelStops: [[60,190,70],[40,140,50]],
    valueStops: [[210,255,210],[170,245,170]],
    successStops: [[120,255,120],[200,255,200]],
    warnStops: [[255,210,40],[220,170,30]],
    dim: [40,130,50],
  },
  purple: {
    logoColors: [[200,160,255],[185,140,255],[170,120,255],[155,100,255],[140,80,255],[130,65,245],[120,55,235],[110,45,220],[100,40,210]],
    barStops: [[140,80,255],[180,120,255],[210,170,255]],
    flavorStops: [[160,100,255],[200,160,255]],
    accentStops: [[150,70,240],[100,45,180]],
    titleStops: [[160,100,255],[200,160,255]],
    labelStops: [[150,70,230],[110,50,190]],
    valueStops: [[230,215,255],[200,185,250]],
    successStops: [[160,255,160],[210,255,210]],
    warnStops: [[255,210,120],[255,170,70]],
    dim: [90,50,160],
  },
  synthwave: {
    logoColors: [[60,255,255],[90,230,255],[130,200,255],[160,170,255],[200,130,255],[220,90,230],[235,60,200],[245,40,170],[255,30,130]],
    barStops: [[60,255,255],[170,130,255],[255,40,130]],
    flavorStops: [[60,255,220],[255,50,170]],
    accentStops: [[140,50,220],[220,40,140]],
    titleStops: [[60,255,255],[255,50,220]],
    labelStops: [[140,50,220],[50,180,220]],
    valueStops: [[255,210,255],[210,255,255]],
    successStops: [[60,255,210],[130,255,255]],
    warnStops: [[255,210,40],[255,80,120]],
    dim: [100,50,120],
  },
  midnight: {
    logoColors: [[150,180,255],[130,160,245],[120,150,235],[110,140,225],[100,130,215],[90,120,205],[85,115,195],[80,110,185],[75,105,175]],
    barStops: [[80,120,210],[120,170,255],[180,215,255]],
    flavorStops: [[120,170,245],[195,230,255]],
    accentStops: [[100,160,245],[70,120,200]],
    titleStops: [[120,180,255],[190,220,255]],
    labelStops: [[100,150,230],[80,120,200]],
    valueStops: [[210,225,255],[180,205,245]],
    successStops: [[120,235,185],[185,255,220]],
    warnStops: [[255,210,100],[230,170,70]],
    dim: [70,100,160],
  },
  pro: {
    logoColors: [[220,220,225],[200,200,210],[180,185,195],[160,165,180],[140,148,165],[120,130,150],[100,112,135],[85,95,120],[70,80,105]],
    barStops: [[130,140,160],[180,185,195],[220,222,228]],
    flavorStops: [[140,155,180],[200,208,220]],
    accentStops: [[100,120,150],[60,70,90]],
    titleStops: [[210,215,225],[170,180,200]],
    labelStops: [[130,140,160],[90,100,120]],
    valueStops: [[230,232,236],[200,205,215]],
    successStops: [[120,200,140],[160,220,175]],
    warnStops: [[220,180,80],[200,150,50]],
    dim: [70,75,85],
  },
};

/**
 * SPINNER_GRADIENTS constant.
 */
export const SPINNER_GRADIENTS: Record<string, RGB[]> = {
  red: [[139, 0, 0], [220, 20, 60], [255, 69, 0], [255, 140, 0], [255, 215, 0]],
  ice: [[0, 40, 80], [0, 100, 160], [0, 180, 255], [100, 220, 255], [200, 255, 255]],
  green: [[0, 60, 0], [0, 120, 20], [0, 180, 40], [80, 220, 80], [160, 255, 160]],
  purple: [[80, 0, 80], [140, 20, 170], [180, 50, 220], [220, 100, 255], [255, 180, 255]],
  synthwave: [[0, 100, 100], [0, 200, 200], [100, 150, 255], [180, 60, 255], [255, 0, 100]],
  midnight: [[40, 60, 120], [60, 100, 180], [80, 140, 230], [120, 170, 255], [170, 210, 255]],
  pro: [[60, 65, 80], [90, 100, 120], [130, 140, 160], [180, 185, 195], [220, 222, 228]],
};


/** Emit a single foreground RGB escape. */
export function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Apply a multi-stop RGB gradient across the visible characters of a string.
 * Spaces are preserved without coloring; non-space characters are interpolated
 * linearly between adjacent color stops.
 */
export function multiGradient(text: string, stops: RGB[]): string {
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
    return `\x1b[38;2;${r};${g};${b}m${ch}`;
  }).join('') + RESET;
}

/** Render a solid-block gradient bar of the given width using multi-stop interpolation. */
export function gradientBar(width: number, stops: RGB[]): string {
  let bar = '';
  for (let i = 0; i < width; i++) {
    const t = width === 1 ? 0 : i / (width - 1);
    const segCount = stops.length - 1;
    const seg = Math.min(Math.floor(t * segCount), segCount - 1);
    const localT = (t * segCount) - seg;
    const [r1, g1, b1] = stops[seg];
    const [r2, g2, b2] = stops[seg + 1];
    const r = Math.round(r1 + (r2 - r1) * localT);
    const g = Math.round(g1 + (g2 - g1) * localT);
    const b = Math.round(b1 + (b2 - b1) * localT);
    bar += `\x1b[38;2;${r};${g};${b}m█`;
  }
  return bar + RESET;
}
