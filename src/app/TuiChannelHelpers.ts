/**
 * Rendering and helper logic for TuiChannelManager.
 * Handles tool block rendering, streaming message re-render, and staging utilities.
 */

import { LayoutManager, ScrollBuffer, createIrcChatRenderer, type ChatMessage } from '../tui/index.js';
import { RESET, fgRgb, THEMES } from '../rendering/index.js';
import type { ToolBlock, TuiRendererOptions } from './TuiTypes.js';

/** Render a tool block into display lines. */
export function renderToolBlockLines(block: ToolBlock, opts: TuiRendererOptions): string[] {
  const noColor = opts.noColor ?? false;
  const themeName = opts.theme ?? 'red';
  const theme = THEMES[themeName] ?? THEMES.red;
  const r = noColor ? '' : RESET;
  const accent = theme.accentStops[0];
  const dim = noColor ? '' : fgRgb(100, 100, 100);
  const dimLight = noColor ? '' : fgRgb(140, 140, 140);
  const green = noColor ? '' : fgRgb(80, 200, 80);
  const red = noColor ? '' : fgRgb(200, 80, 80);
  const bright = noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);

  if (block.pending) {
    const elapsed = block.startedAt ? Math.floor((Date.now() - block.startedAt) / 1000) : 0;
    const elapsedStr = elapsed > 0 ? ` ${dim}${elapsed}s${r}` : '';
    const t = (Date.now() % 2000) / 2000;
    const pulse = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    const pr = Math.round(100 + pulse * (accent[0] - 100));
    const pg = Math.round(100 + pulse * (accent[1] - 100));
    const pb = Math.round(100 + pulse * (accent[2] - 100));
    const pulseColor = noColor ? '' : fgRgb(pr, pg, pb);
    return [`  ${pulseColor}⋯${r} ${bright}${block.toolName}${r} ${dimLight}${block.description}${r}${elapsedStr}`];
  }

  const durStr = block.durationMs < 1000 ? `${block.durationMs}ms` : `${(block.durationMs / 1000).toFixed(1)}s`;
  const status = block.result.success ? `${green}✓${r}` : `${red}✗${r}`;
  const output = block.result.success ? (block.result.data ?? '') : (block.result.error ?? 'failed');
  const toggle = block.expanded ? `${dim}▾${r}` : `${dim}▸${r}`;

  const header = `  ${status} ${bright}${block.toolName}${r} ${dimLight}${block.description}${r}  ${dim}${durStr}${r}  ${toggle}`;

  if (!block.expanded) {
    return [header];
  }

  const lines: string[] = [header];
  const outputLines = output.split('\n').slice(0, 30);
  for (const ol of outputLines) {
    const trimmed = ol.slice(0, 120);
    let lineColor = dim;
    if (ol.startsWith('- ')) lineColor = red;
    else if (ol.startsWith('+ ')) lineColor = green;
    lines.push(`      ${lineColor}${trimmed}${r}`);
  }
  if (output.split('\n').length > 30) {
    lines.push(`      ${dim}... (${output.split('\n').length - 30} more)${r}`);
  }
  return lines;
}

/** Compute the number of rendered lines a tool block occupies. */
export function blockLineCount(block: ToolBlock): number {
  if (block.pending || !block.expanded) return 1;
  const output = block.result.success ? (block.result.data ?? '') : (block.result.error ?? '');
  const totalLines = output.split('\n').length;
  const outputLines = Math.min(totalLines, 30);
  return 1 + outputLines + (totalLines > 30 ? 1 : 0);
}

/** Cached renderer state to avoid re-creating on every streaming chunk. */
export interface CachedRendererState {
  renderer: ReturnType<typeof createIrcChatRenderer> | null;
  width: number;
  theme: string;
}

/** Get or create a cached chat renderer for streaming. */
export function getStreamRenderer(
  cache: CachedRendererState,
  chatWidth: number,
  opts: TuiRendererOptions,
): ReturnType<typeof createIrcChatRenderer> {
  const theme = opts.theme ?? 'red';
  if (cache.renderer && cache.width === chatWidth && cache.theme === theme) {
    return cache.renderer;
  }
  cache.renderer = createIrcChatRenderer({
    width: chatWidth,
    noColor: opts.noColor,
    theme,
    indent: 0,
  });
  cache.width = chatWidth;
  cache.theme = theme;
  return cache.renderer;
}

/** Re-render a streaming message in-place within the channel buffer. */
export function reRenderStreamMessage(
  channel: string,
  streamState: { sender: string; content: string; lineStart: number; thinkingContent: string },
  channelLines: Map<string, string[]>,
  scrollBuffers: Map<string, ScrollBuffer>,
  layout: LayoutManager,
  cache: CachedRendererState,
  opts: TuiRendererOptions,
  getScrollBuffer: (channel: string) => ScrollBuffer,
): void {
  const { sender, content, lineStart, thinkingContent } = streamState;
  const channelBuf = channelLines.get(channel)!;

  const layoutInfo = layout.getLayout();
  const chatWidth = layoutInfo.main.width - 2;
  const renderer = getStreamRenderer(cache, chatWidth, opts);

  const displayContent = content + '▌';
  const msg: ChatMessage = { type: 'agent', sender, content: displayContent, timestamp: new Date() };
  const rendered = renderer.renderMessage(msg);

  if (opts.showThinkingInBuffer === true && thinkingContent) {
    const thinkLine = `  \x1b[2m\u{1f4ad} thinking... (${thinkingContent.length} chars)\x1b[0m`;
    rendered.unshift(thinkLine);
  }

  channelBuf.splice(lineStart, channelBuf.length - lineStart, ...rendered);

  const scrollBuf = getScrollBuffer(channel);
  scrollBuf.replaceFrom(lineStart, rendered);
}

/** Render staging messages for a channel. */
export function renderStagingLines(
  stagingMessages: Array<{ sender: string; content: string; rendered: string[] }> | undefined,
): string[] {
  if (!stagingMessages || stagingMessages.length === 0) return [];
  const lines: string[] = [];
  for (const m of stagingMessages) lines.push(...m.rendered);
  return lines;
}

/** Re-render all channels after a layout resize. */
export function reRenderAllChannels(
  channelMessages: Map<string, ChatMessage[]>,
  channelLines: Map<string, string[]>,
  getScrollBuffer: (ch: string) => ScrollBuffer,
  layout: LayoutManager,
  opts: TuiRendererOptions,
): void {
  const layoutInfo = layout.getLayout();
  const chatWidth = layoutInfo.main.width - 2;
  const mainHeight = layoutInfo.main.height - 2;
  const renderer = createIrcChatRenderer({
    width: chatWidth,
    noColor: opts.noColor,
    theme: opts.theme ?? 'red',
    indent: 0,
  });

  for (const [ch, messages] of channelMessages.entries()) {
    const lines: string[] = [];
    for (const msg of messages) lines.push(...renderer.renderMessage(msg));
    channelLines.set(ch, lines);
    const scrollBuf = getScrollBuffer(ch);
    scrollBuf.resize(chatWidth, mainHeight);
    scrollBuf.setLines(lines);
  }
}
