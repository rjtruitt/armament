/** IRC-style chat message rendering. */

import { THEMES, type ThemeColors, fgRgb, RESET } from '../rendering/index.js';
import { wrapText as engineWrap } from './TextEngine.js';
import { renderMarkdown } from './MarkdownRenderer.js';

type RGB = [number, number, number];

/** A chat message from a user, agent, or system. */
export interface ChatMessage {
  type: 'user' | 'agent' | 'system';
  sender: string;
  content: string;
  timestamp: Date;
}

/** A tool invocation result block shown inline in the chat. */
export interface ToolCallBlock {
  name: string;
  description: string;
  status: 'success' | 'error' | 'running' | 'denied';
  result: string;
  latencyMs: number;
}

/** Context header displayed when an agent takes over a channel. */
export interface AgentContextHeader {
  agentName: string;
  role?: string;
  model?: string;
  task?: string;
}

/** Visual indicator when focus switches to a different channel/agent. */
export interface SwitchingIndicator {
  target: string;
}

/** Union of all renderable chat timeline items. */
export type ChatLine =
  | { kind: 'message'; data: ChatMessage }
  | { kind: 'tool'; data: ToolCallBlock }
  | { kind: 'header'; data: AgentContextHeader }
  | { kind: 'switch'; data: SwitchingIndicator };

interface ChatRendererConfig {
  width: number;
  noColor?: boolean;
  theme?: string;
  indent?: number;
  showAgentHeader?: boolean;
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'success': return '✓';
    case 'error': return '✗';
    case 'running': return '⏳';
    case 'denied': return '⊘';
    default: return '';
  }
}

/** Create an IRC-style chat renderer with gradient theming and markdown support. */
export function createIrcChatRenderer(config: ChatRendererConfig) {
  const { width, noColor = false, theme: themeName = 'red', indent = 0, showAgentHeader = true } = config;
  const theme: ThemeColors = THEMES[themeName] ?? THEMES.red;
  const indentStr = ' '.repeat(indent);

  function interpolate(stops: RGB[], t: number): RGB {
    if (stops.length === 1) return stops[0];
    if (t <= 0) return stops[0];
    if (t >= 1) return stops[stops.length - 1];
    const segCount = stops.length - 1;
    const seg = Math.min(Math.floor(t * segCount), segCount - 1);
    const localT = (t * segCount) - seg;
    const [r1, g1, b1] = stops[seg];
    const [r2, g2, b2] = stops[seg + 1];
    return [
      Math.round(r1 + (r2 - r1) * localT),
      Math.round(g1 + (g2 - g1) * localT),
      Math.round(b1 + (b2 - b1) * localT),
    ];
  }

  function gradText(text: string, stops: RGB[]): string {
    if (noColor) return text;
    const chars = [...text];
    const visible = chars.filter(c => c !== ' ');
    if (visible.length === 0) return text;
    let idx = 0;
    return chars.map(ch => {
      if (ch === ' ') return ch;
      const t = visible.length === 1 ? 0 : idx / (visible.length - 1);
      const [r, g, b] = interpolate(stops, t);
      idx++;
      return `${fgRgb(r, g, b)}${ch}`;
    }).join('') + RESET;
  }

  function coloredSender(type: string, sender: string): string {
    if (noColor) return `<${sender}>`;
    let stops: RGB[];
    switch (type) {
      case 'user': stops = theme.titleStops; break;
      case 'agent': stops = theme.accentStops; break;
      case 'system': stops = [[140, 140, 140], [180, 180, 180]]; break;
      default: stops = theme.accentStops;
    }
    return gradText(`<${sender}>`, stops);
  }

  function renderGradientBar(barWidth: number): string {
    if (noColor) return '─'.repeat(barWidth);
    const mid = Math.floor(barWidth / 2);
    const chars: string[] = [];
    for (let i = 0; i < barWidth; i++) {
      const t = barWidth === 1 ? 0.5 : i / (barWidth - 1);
      const d = Math.min(t, 1 - t) * 2;
      const [r, g, b] = interpolate(theme.barStops, d);
      let ch: string;
      if (i === mid) ch = '◆';
      else if (d < 0.05) ch = ' ';
      else if (d < 0.15) ch = '╶';
      else if (d < 0.4) ch = '─';
      else if (d < 0.7) ch = '═';
      else ch = '━';
      chars.push(`${fgRgb(r, g, b)}${ch}`);
    }
    return chars.join('') + RESET;
  }

  return {
    renderMessage(msg: ChatMessage): string[] {
      const time = formatTime(msg.timestamp);
      const timeStr = noColor ? time : `${fgRgb(160, 160, 160)}${time}${RESET}`;
      const sender = coloredSender(msg.type, msg.sender);
      const rst = noColor ? '' : RESET;

      if (msg.type === 'agent') {
        if (!showAgentHeader) {
          // Minimal: just content. No header/sender/timestamp — the thinking
          // icon already signals the agent is speaking.
          const contentCols = Math.max(20, width - 2 - indent);
          const styledContent = renderMarkdown(msg.content, { noColor });
          const contentLines = engineWrap(styledContent, contentCols);
          const output: string[] = [''];
          for (const line of contentLines) {
            output.push(`${indentStr}  ${line}${rst}`);
          }
          return output;
        }

        // Original format: header with timestamp, sender, gradient tail
        const contentPad = 4;
        const contentCols = Math.max(20, width - contentPad - indent);
        const styledContent = renderMarkdown(msg.content, { noColor });
        const contentLines = engineWrap(styledContent, contentCols);

        const output: string[] = [''];

        const dimColor = noColor ? '' : fgRgb(...interpolate(theme.barStops, 0.3));
        const label = noColor ? ` ${time} <${msg.sender}> ` : ` ${timeStr} ${sender} `;
        output.push(`${indentStr}${dimColor}-${rst}${label}`);

        for (const line of contentLines) {
          output.push(`${indentStr}    ${line}${rst}`);
        }
        return output;
      }

      if (msg.type === 'user') {
        // Always show user headers — the toggle is for agent headers only.
        // Format: gradient header ─ time sender ━═─╶·
        const textFg = noColor ? '' : fgRgb(220, 220, 220);
        const headerText = `─ ${time} ${msg.sender} `;
        let headerLine: string;
        if (themeName === 'pro') {
          if (noColor) {
            headerLine = headerText;
          } else {
            const fullChars = [...headerText];
            const totalLen = fullChars.length;
            headerLine = fullChars.map((ch, i) => {
              const t = i / (totalLen - 1);
              const brightness = Math.round(70 + t * 90);
              return `${fgRgb(brightness, brightness, brightness)}${ch}`;
            }).join('') + rst;
          }
        } else {
          headerLine = headerText + rst;
        }

        const contentCols = Math.max(20, width - 2 - indent);
        const contentLines = engineWrap(msg.content, contentCols);

        const output: string[] = [];
        output.push('');
        output.push(`${indentStr}${headerLine}`);
        for (const line of contentLines) {
          output.push(`${indentStr}  ${textFg}${line}${rst}`);
        }
        return output;
      }

      // system messages: always use original format with timestamp + sender
      const prefix = `${timeStr} ${sender} `;
      const prefixVisibleLen = time.length + 1 + msg.sender.length + 2 + 1;

      const contentCols = Math.max(20, width - prefixVisibleLen - indent);
      const contentLines = engineWrap(msg.content, contentCols);

      const textFg = noColor ? '' : fgRgb(160, 160, 160);
      const continuationPad = ' '.repeat(prefixVisibleLen);

      const output: string[] = [];
      for (let i = 0; i < contentLines.length; i++) {
        if (i === 0) {
          output.push(`${indentStr}${prefix}${textFg}${contentLines[i]}${rst}`);
        } else {
          output.push(`${indentStr}${continuationPad}${textFg}${contentLines[i]}${rst}`);
        }
      }
      return output;
    },

    renderContextHeader(header: AgentContextHeader): string[] {
      const parts = [header.agentName];
      if (header.role) parts.push(`(${header.role})`);
      if (header.model) parts.push(header.model);
      if (header.task) parts.push(`task: ${header.task}`);

      const content = parts.join(' ── ');
      const dashLen = Math.max(0, width - content.length - 8 - indent);

      if (noColor) {
        return [`${indentStr}── ${content} ──${'─'.repeat(dashLen)}`];
      }

      const accent = theme.accentStops[0];
      const dimAccent: RGB = [
        Math.round(accent[0] * 0.3),
        Math.round(accent[1] * 0.3),
        Math.round(accent[2] * 0.3),
      ];
      const dashColor = fgRgb(dimAccent[0], dimAccent[1], dimAccent[2]);
      const contentColored = gradText(content, theme.accentStops);
      const dashes = `${dashColor}${'─'.repeat(dashLen)}${RESET}`;

      return [`${indentStr}${dashColor}──${RESET} ${contentColored} ${dashColor}──${RESET}${dashes}`];
    },

    renderSwitchingIndicator(sw: SwitchingIndicator): string[] {
      const text = `switching to ${sw.target}`;
      const dashLen = Math.max(0, width - text.length - 8 - indent);

      if (noColor) {
        return [`${indentStr}── ${text} ──${'─'.repeat(dashLen)}`];
      }

      const dimColor = fgRgb(170, 170, 170);
      return [`${indentStr}${dimColor}── ${text} ──${'─'.repeat(dashLen)}${RESET}`];
    },

    renderToolCall(tool: ToolCallBlock): string[] {
      const lines: string[] = [];
      const accent = theme.accentStops[0];
      const borderColor = noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);
      const r = noColor ? '' : RESET;

      const topContent = `${tool.name} — ${tool.description}`;
      const topDashLen = Math.max(3, width - topContent.length - 6 - indent);
      if (noColor) {
        lines.push(`${indentStr}┌─ ${topContent} ${'─'.repeat(topDashLen)}`);
      } else {
        const nameColored = gradText(tool.name, theme.titleStops);
        const descColor = fgRgb(180, 180, 180);
        lines.push(`${indentStr}${borderColor}┌─${r} ${nameColored} ${borderColor}—${r} ${descColor}${tool.description}${r} ${borderColor}${'─'.repeat(topDashLen)}${r}`);
      }

      const icon = statusIcon(tool.status);
      const latency = formatLatency(tool.latencyMs);
      const resultContent = `  ${tool.description}${' '.repeat(Math.max(1, 30 - tool.description.length))}${icon}  ${tool.result}   ${latency}`;

      if (noColor) {
        lines.push(`${indentStr}│${resultContent}`);
      } else {
        const iconColor = tool.status === 'success' ? fgRgb(80, 255, 80) : fgRgb(255, 60, 60);
        const resultColor = fgRgb(190, 190, 190);
        const latencyColor = fgRgb(150, 150, 150);
        const contentLine = `  ${fgRgb(180, 180, 180)}${tool.description}${r}${' '.repeat(Math.max(1, 30 - tool.description.length))}${iconColor}${icon}${r}  ${resultColor}${tool.result}${r}   ${latencyColor}${latency}${r}`;
        lines.push(`${indentStr}${borderColor}│${r}${contentLine}`);
      }

      lines.push(`${indentStr}${borderColor}└─${r}`);

      return lines;
    },

    renderChatLines(timeline: ChatLine[]): string[] {
      const output: string[] = [];
      for (const line of timeline) {
        switch (line.kind) {
          case 'message':
            output.push(...this.renderMessage(line.data));
            break;
          case 'tool':
            output.push(...this.renderToolCall(line.data));
            break;
          case 'header':
            output.push(...this.renderContextHeader(line.data));
            break;
          case 'switch':
            output.push(...this.renderSwitchingIndicator(line.data));
            break;
        }
      }
      return output;
    },
  };
}
