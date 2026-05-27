/**
 * @module ansi/banner
 * ASCII banner rendering and themed loading screens.
 * Delegates theme data to bannerThemes.ts and animation logic to bannerAnimation.ts.
 */

import { RESET, fg256 } from './colors.js';
import { LOGO, FLAVOR_TEXTS, THEMES, rgb, multiGradient, gradientBar } from './bannerThemes.js';
export type { ThemeColors } from './bannerThemes.js';
export { LOGO, LOGO as BANNER_ART, FLAVOR_TEXTS, THEMES } from './bannerThemes.js';

// Re-export animation module
export type { AnimationSpeed, AnimatedLoadingOptions } from './bannerAnimation.js';
export {
  animateLoadingScreen,
  LOADING_FRAMES,
  renderSeparator,
  renderLoadingFrame,
  renderStartupSequence,
} from './bannerAnimation.js';


/** Return a random loading flavor text string. */
export function getFlavorText(): string {
  return FLAVOR_TEXTS[Math.floor(Math.random() * FLAVOR_TEXTS.length)];
}

/**
 * Render the ASCII banner with per-line theme coloring.
 * Returns plain text when `noColor` is true.
 */
export function renderBanner(themeName: string | boolean = 'red', noColor = false): string {
  if (typeof themeName === 'boolean') {
    noColor = themeName;
    themeName = 'red';
  }
  if (noColor) return LOGO.join('\n');

  const theme = THEMES[themeName] ?? THEMES.red;
  const lines: string[] = [];
  for (let i = 0; i < LOGO.length; i++) {
    const [r, g, b] = theme.logoColors[i % theme.logoColors.length];
    lines.push(rgb(r, g, b) + LOGO[i] + RESET);
  }
  return lines.join('\n');
}


/** A single step displayed during the loading sequence. */
export interface LoadingStep {
  label: string;
  result: string;
  status: 'ok' | 'fail' | 'skip' | 'warn';
}

/** Configuration for static loading screen content. */
export interface LoadingContext {
  steps: LoadingStep[];
  workspace: string;
  version: string;
}

const DEFAULT_LOADING_CONTEXT: LoadingContext = {
  steps: [
    { label: 'loading config', result: 'ok', status: 'ok' },
    { label: 'providers', result: 'anthropic ✓  openai ✓  ollama ✓', status: 'ok' },
    { label: 'MCP servers', result: 'github, glean, atlassian, filesystem', status: 'ok' },
    { label: 'workspace', result: '~/projects/webapp', status: 'ok' },
  ],
  workspace: process.cwd(),
  version: '0.1.0',
};

/**
 * Render a full static loading screen (banner + flavor + steps + progress bar).
 * Suitable for non-TTY output or snapshot testing.
 */
export function renderLoadingScreen(themeName = 'red', noColor = false, ctx?: Partial<LoadingContext>): string {
  const theme = THEMES[themeName] ?? THEMES.red;
  const grey = noColor ? '' : '\x1b[38;2;100;100;100m';
  const dgrey = noColor ? '' : '\x1b[38;2;60;60;60m';
  const lgrey = noColor ? '' : '\x1b[38;2;187;187;187m';
  const r = noColor ? '' : RESET;
  const flavor = getFlavorText();

  const cols = process.stdout?.columns || 120;
  const logoWidth = LOGO[0].length;
  const pad = Math.max(0, Math.floor((cols - logoWidth) / 2));
  const padStr = ' '.repeat(pad);

  const context: LoadingContext = { ...DEFAULT_LOADING_CONTEXT, ...ctx };

  let out = '\n\n';


  const bannerLines = renderBanner(themeName, noColor).split('\n');
  out += bannerLines.map(l => padStr + l).join('\n') + '\n\n';


  const verText = `v${context.version}`;
  const verColored = noColor ? verText : `${dgrey}${verText}${r}`;

  const flavorGrad = noColor ? flavor : multiGradient(flavor, theme.flavorStops);
  const dashGrad = noColor ? '────────' : multiGradient('────────', theme.accentStops);

  const centerLine = `${dashGrad}  ${flavorGrad}  ${dashGrad}`;
  const centerPad = ' '.repeat(Math.max(0, Math.floor((cols - 80) / 2)));
  out += `${centerPad}${centerLine}\n`;
  out += `${centerPad}${' '.repeat(34)}${verColored}\n\n`;


  const sepWidth = Math.min(cols - 4, 120);
  const sepPad = ' '.repeat(Math.max(0, Math.floor((cols - sepWidth) / 2)));
  const sep = '─'.repeat(sepWidth);
  out += `${sepPad}${grey}${sep}${r}\n\n`;


  const stepPad = ' '.repeat(Math.max(4, Math.floor((cols - 80) / 2)));
  const accent0 = noColor ? '▸' : rgb(...theme.accentStops[0]) + '▸' + r;

  for (const step of context.steps) {
    const dots = '·'.repeat(Math.max(4, 28 - step.label.length));
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
      resultColored = rgb(...theme.logoColors[0]) + step.result + r;
    }
    out += `${stepPad}${accent0} ${lgrey}${step.label}${r} ${grey}${dots}${r} ${resultColored}\n`;
  }

  out += '\n';


  const barWidth = Math.min(60, cols - 20);
  const bar = noColor ? '█'.repeat(barWidth) : gradientBar(barWidth, theme.barStops);
  const readyText = noColor ? 'ready' : multiGradient('ready', theme.flavorStops);
  out += `${stepPad}${grey}[${r}${bar}${grey}]${r} ${readyText}\n`;


  out += `\n${sepPad}${grey}${sep}${r}\n\n`;

  return out;
}

/** Render a compact single-line banner with block shading. */
export function renderMiniBanner(noColor = false): string {
  if (noColor) return '[ ARMAMENT ]';
  const left = `${fg256(17)}░▒▓${fg256(21)}█`;
  const right = `${fg256(21)}█${fg256(17)}▓▒░`;
  const text = `${fg256(45)}\x1b[1m ARMAMENT ${RESET}`;
  return `${left}${text}${right}${RESET}`;
}


/** Data for the session-end summary panel. */
export interface SessionSummaryData {
  duration: string;
  agents: string;
  tools: string;
  tokens: string;
  cost: { current: number; budget: number };
  costByModel?: Array<{ model: string; cost: number; inputTokens: number; outputTokens: number }>;
  files: string;
  providers: string;
  commits?: string[];
}

/** Render a themed session summary panel for display on exit. */
export function renderExitSummary(themeName = 'red', noColor = false, data: SessionSummaryData): string {
  const theme = THEMES[themeName] ?? THEMES.red;
  const r = noColor ? '' : RESET;

  const accent = (s: string) => noColor ? s : multiGradient(s, theme.accentStops);
  const title = (s: string) => noColor ? s : multiGradient(s, theme.titleStops);
  const label = (s: string) => noColor ? s : multiGradient(s, theme.labelStops);
  const value = (s: string) => noColor ? s : multiGradient(s, theme.valueStops);
  const dim = (s: string) => noColor ? s : `\x1b[38;2;${theme.dim[0]};${theme.dim[1]};${theme.dim[2]}m${s}${r}`;
  const success = (s: string) => noColor ? s : multiGradient(s, theme.successStops);

  const lines: string[] = [];

  lines.push('');
  lines.push(accent('── session complete ──'));
  lines.push('');

  const panelWidth = 60;
  const topDash = '─'.repeat(Math.max(0, panelWidth - 'session summary'.length - 4));
  lines.push(`${accent('┌─')} ${title('session summary')} ${accent(topDash)}`);
  lines.push(accent('│'));
  lines.push(`${accent('│')}  ${label('duration:')}   ${value(data.duration)}`);
  lines.push(`${accent('│')}  ${label('agents:')}     ${value(data.agents)}`);
  lines.push(`${accent('│')}  ${label('tools:')}      ${value(data.tools)}`);
  lines.push(`${accent('│')}  ${label('tokens:')}     ${value(data.tokens)}`);

  let pct = data.cost.budget > 0 ? Math.round((data.cost.current / data.cost.budget) * 100) : 0;
  if (isNaN(pct) || pct < 0) pct = 0;
  const costText = `${data.cost.current.toFixed(2)} / ${data.cost.budget.toFixed(2)} (${pct}%)`;
  const barWidth = 20;
  const filled = Math.max(0, Math.min(barWidth, Math.round((pct / 100) * barWidth)));
  let costBar: string;
  if (noColor) {
    costBar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  } else {
    costBar = gradientBar(filled, theme.barStops) + `\x1b[38;2;60;60;60m${'░'.repeat(barWidth - filled)}${r}`;
  }
  lines.push(`${accent('│')}  ${label('cost:')}       ${costBar} ${value(costText)}`);
  lines.push(`${accent('│')}  ${label('files:')}      ${value(data.files)}`);
  lines.push(`${accent('│')}  ${label('providers:')}  ${value(data.providers)}`);

  if (data.costByModel && data.costByModel.length > 0) {
    lines.push(accent('│'));
    lines.push(`${accent('│')}  ${label('by model:')}`);
    for (const m of data.costByModel) {
      const inK = Math.round(m.inputTokens / 1000);
      const outK = Math.round(m.outputTokens / 1000);
      lines.push(`${accent('│')}   ${value(m.model)}  ${dim(m.cost.toFixed(2))}  (${dim(`${inK}k in / ${outK}k out`)})`);
    }
  }

  if (data.commits && data.commits.length > 0) {
    lines.push(accent('│'));
    lines.push(`${accent('│')}  ${label('commits:')}`);
    for (const commit of data.commits) {
      const [hash, ...msgParts] = commit.split(' ');
      lines.push(`${accent('│')}   ${success(hash)} ${dim(msgParts.join(' '))}`);
    }
  }

  lines.push(accent('│'));
  lines.push(accent('└──'));
  lines.push('');

  return lines.join('\n');
}
