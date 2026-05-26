/**
 * @module ansi/bannerAnimation
 * Animated loading sequences, spinner rendering, and frame-based terminal animations.
 */

import { RESET } from './colors.js';
import type { RGB, ThemeColors } from './bannerThemes.js';
import { THEMES, LOGO, SPINNER_GRADIENTS, rgb, multiGradient, gradientBar } from './bannerThemes.js';
import { renderBanner, getFlavorText } from './banner.js';
import type { LoadingStep } from './banner.js';

/** Controls animation timing: normal (real-time), fast (10x), or instant (no delay). */
export type AnimationSpeed = 'normal' | 'fast' | 'instant';

/** Options for the animated loading screen sequence. */
export interface AnimatedLoadingOptions {
  theme?: string;
  noColor?: boolean;
  speed?: AnimationSpeed;
  steps: LoadingStep[];
  version?: string;
  /** Custom write function (defaults to process.stdout.write). */
  write?: (text: string) => void;
}

const SPINNER_FRAMES = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];

function getSpinnerGradient(themeName: string): RGB[] {
  return SPINNER_GRADIENTS[themeName] ?? SPINNER_GRADIENTS.red;
}

/** Interpolate between gradient stops at position t (0-1). */
function interpolateGradientColor(gradient: RGB[], t: number): RGB {
  const segCount = gradient.length - 1;
  const seg = Math.min(Math.floor(t * segCount), segCount - 1);
  const localT = (t * segCount) - seg;
  const [r1, g1, b1] = gradient[seg];
  const [r2, g2, b2] = gradient[seg + 1];
  return [
    Math.round(r1 + (r2 - r1) * localT),
    Math.round(g1 + (g2 - g1) * localT),
    Math.round(b1 + (b2 - b1) * localT),
  ];
}

function coloredSpinner(frame: number, colorIndex: number, gradient: RGB[], noColor: boolean): string {
  if (noColor) return SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
  const t = colorIndex / (gradient.length * 2); // cycle through gradient
  const normalizedT = (Math.sin(t * Math.PI * 2) + 1) / 2; // oscillate 0..1
  const [r, g, b] = interpolateGradientColor(gradient, normalizedT);
  return `\x1b[38;2;${r};${g};${b}m${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}${RESET}`;
}

function delay(ms: number, speed: AnimationSpeed): Promise<void> {
  if (speed === 'instant') return Promise.resolve();
  const actual = speed === 'fast' ? Math.floor(ms / 10) : ms;
  return new Promise(resolve => setTimeout(resolve, actual));
}

function centerText(text: string, cols: number): string {
  const visible = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const pad = Math.max(0, Math.floor((cols - visible) / 2));
  return ' '.repeat(pad) + text;
}

/**
 * Animate the loading screen with color-pulsing spinners.
 * Uses the alternate screen buffer on TTY terminals and restores cursor on completion.
 */
export async function animateLoadingScreen(opts: AnimatedLoadingOptions): Promise<void> {
  const themeName = opts.theme ?? 'red';
  const noColor = opts.noColor ?? false;
  const speed = opts.speed ?? 'normal';
  const version = opts.version ?? '0.1.0';
  const write = opts.write ?? ((text: string) => process.stdout.write(text));
  const theme = THEMES[themeName] ?? THEMES.red;
  const cols = process.stdout?.columns || 80;
  const spinnerGradient = getSpinnerGradient(themeName);

  const grey = noColor ? '' : '\x1b[38;2;100;100;100m';
  const dgrey = noColor ? '' : '\x1b[38;2;60;60;60m';
  const lgrey = noColor ? '' : '\x1b[38;2;187;187;187m';
  const r = noColor ? '' : RESET;

  const writeAtRow = (row: number, text: string) => {
    write(`\x1b[${row};1H\x1b[2K${text}`);
  };

  const isTTY = process.stdout?.isTTY ?? false;
  const useAltBuffer = isTTY && speed !== 'instant';
  if (useAltBuffer) {
    write('\x1b[?1049h'); // enter alternate buffer
    write('\x1b[?25l');
    write('\x1b[2J');
  }


  const bannerStartRow = 2;
  const bannerLines = renderBanner(themeName, noColor).split('\n');
  const bannerEndRow = bannerStartRow + bannerLines.length - 1;
  const flavorRow = bannerEndRow + 2;
  const versionRow = flavorRow + 1;
  const sepRow = versionRow + 2;
  const stepsStartRow = sepRow + 2;
  const progressBarRow = stepsStartRow + opts.steps.length + 1;
  const bottomSepRow = progressBarRow + 2;


  const logoWidth = LOGO[0].length;
  const logoPad = Math.max(0, Math.floor((cols - logoWidth) / 2));
  const logoPadStr = ' '.repeat(logoPad);

  for (let i = 0; i < bannerLines.length; i++) {
    writeAtRow(bannerStartRow + i, logoPadStr + bannerLines[i]);
    await delay(40, speed);
  }


  const flavor = getFlavorText();
  const flavorGrad = noColor ? flavor : multiGradient(flavor, theme.flavorStops);
  const dashGrad = noColor ? '────────' : multiGradient('────────', theme.accentStops);
  const flavorLine = `${dashGrad}  ${flavorGrad}  ${dashGrad}`;

  writeAtRow(flavorRow, centerText(flavorLine, cols));

  const verText = `v${version}`;
  const verColored = noColor ? verText : `${dgrey}${verText}${r}`;
  writeAtRow(versionRow, centerText(verColored, cols));

  await delay(300, speed);


  const sepWidth = Math.min(cols - 4, 120);
  const sep = '─'.repeat(sepWidth);
  writeAtRow(sepRow, centerText(`${grey}${sep}${r}`, cols));

  await delay(200, speed);


  const stepPad = ' '.repeat(Math.max(4, Math.floor((cols - 80) / 2)));
  const accent0 = noColor ? '▸' : `\x1b[38;2;${theme.accentStops[0].join(';')}m▸${r}`;

  for (let si = 0; si < opts.steps.length; si++) {
    const step = opts.steps[si];
    const dots = '·'.repeat(Math.max(4, 28 - step.label.length));
    const stepRow = stepsStartRow + si;

    const spinnerDurationMs = speed === 'instant' ? 0 : (speed === 'fast' ? 30 : 300);
    const spinnerIntervalMs = speed === 'instant' ? 0 : 80;
    const spinnerCycles = speed === 'instant' ? 0 : Math.ceil(spinnerDurationMs / spinnerIntervalMs);

    const spinnerLineBase = `${stepPad}${accent0} ${lgrey}${step.label}${r} ${grey}${dots}${r} `;

    if (spinnerCycles > 0) {
      for (let c = 0; c < spinnerCycles; c++) {
        const frame = c % SPINNER_FRAMES.length;
        const spinChar = coloredSpinner(frame, c, spinnerGradient, noColor);
        writeAtRow(stepRow, spinnerLineBase + spinChar);
        await delay(spinnerIntervalMs, speed);
      }
    }

    let resultColored: string;
    if (noColor) {
      resultColored = step.status === 'fail' ? `✗ ${step.result}` : step.result;
    } else if (step.status === 'fail') {
      resultColored = `\x1b[38;2;255;60;60m✗ ${step.result}${r}`;
    } else if (step.status === 'warn') {
      resultColored = `\x1b[38;2;255;200;60m⚠ ${step.result}${r}`;
    } else if (step.status === 'skip') {
      resultColored = `${dgrey}— ${step.result}${r}`;
    } else {
      const [cr, cg, cb] = theme.logoColors[0];
      resultColored = `\x1b[38;2;${cr};${cg};${cb}m${step.result}${r}`;
    }
    writeAtRow(stepRow, spinnerLineBase + resultColored);

    const progress = (si + 1) / opts.steps.length;
    const barWidth = Math.min(60, cols - 20);
    const filledWidth = Math.round(progress * barWidth);
    const emptyWidth = barWidth - filledWidth;

    let bar: string;
    if (noColor) {
      bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
    } else {
      bar = gradientBar(filledWidth, theme.barStops) + `${grey}${'░'.repeat(emptyWidth)}${r}`;
    }

    if (si < opts.steps.length - 1) {
      const pctText = `${Math.round(progress * 100)}%`;
      const barLine = `${stepPad}${grey}[${r}${bar}${grey}]${r} ${dgrey}${pctText}${r}`;
      writeAtRow(progressBarRow, barLine);
    } else {
      const readyText = noColor ? 'ready' : multiGradient('ready', theme.flavorStops);
      const finalBarLine = `${stepPad}${grey}[${r}${bar}${grey}]${r} ${readyText}`;
      writeAtRow(progressBarRow, finalBarLine);
    }

    await delay(150, speed);
  }


  await delay(200, speed);
  writeAtRow(bottomSepRow, centerText(`${grey}${sep}${r}`, cols));

  if (useAltBuffer) {
    write('\x1b[?25h');
  }
}


/** Pre-computed loading animation frames (block-height wave pattern). */
export const LOADING_FRAMES = [
  '▁▂▃▄▅▆▇█▇▆▅▄▃▂▁ ',
  '▂▃▄▅▆▇█▇▆▅▄▃▂▁ ▁',
  '▃▄▅▆▇█▇▆▅▄▃▂▁ ▁▂',
  '▄▅▆▇█▇▆▅▄▃▂▁ ▁▂▃',
  '▅▆▇█▇▆▅▄▃▂▁ ▁▂▃▄',
  '▆▇█▇▆▅▄▃▂▁ ▁▂▃▄▅',
  '▇█▇▆▅▄▃▂▁ ▁▂▃▄▅▆',
  '█▇▆▅▄▃▂▁ ▁▂▃▄▅▆▇',
];

/** Render a fading block separator at the given width. */
export function renderSeparator(width: number, noColor = false): string {
  if (width <= 0) return '';
  const pattern = ['▓', '▒', '░', ' '];
  let result = '';
  for (let i = 0; i < width; i++) {
    const ch = pattern[i % pattern.length];
    if (noColor) {
      result += ch;
    } else {
      const t = width > 1 ? i / (width - 1) : 0;
      const gradIdx = Math.min(Math.floor(t * 11), 11);
      result += `\x1b[38;5;${17 + gradIdx}m${ch}`;
    }
  }
  return result + '\x1b[0m';
}

/** Render a single loading animation frame, optionally padded to width. */
export function renderLoadingFrame(frame: number, width = 40, noColor = false): string {
  const idx = ((frame % LOADING_FRAMES.length) + LOADING_FRAMES.length) % LOADING_FRAMES.length;
  const frameStr = LOADING_FRAMES[idx];
  const padLen = Math.max(0, width - frameStr.length);
  const line = (frameStr + ' '.repeat(padLen)).slice(0, width);
  if (noColor) return line;
  return `\x1b[38;5;39m${line}\x1b[0m`;
}

/** Render a startup sequence as an array of pre-formatted lines. */
export function renderStartupSequence(noColor = false): string[] {
  const prefix = noColor ? '  > ' : `\x1b[38;5;39m  ▸ \x1b[0m`;
  const msgColor = noColor ? '' : '\x1b[38;5;240m';
  const r = noColor ? '' : '\x1b[0m';
  return [
    `${prefix}${msgColor}armament v0.1.0${r}`,
    `${prefix}${msgColor}loading config${r}`,
    `${prefix}${msgColor}initializing providers${r}`,
    `${prefix}${msgColor}connecting flight-controller${r}`,
    `${prefix}${msgColor}registering tools${r}`,
    `${prefix}${msgColor}loading MCP servers${r}`,
    `${prefix}${msgColor}system ready${r}`,
  ];
}
