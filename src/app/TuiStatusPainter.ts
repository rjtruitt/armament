import { ScreenBuffer, LayoutManager } from '../tui/index.js';
import { THEMES, type ThemeColors, fgRgb, RESET } from '../rendering/index.js';
import type { RGB, TuiRendererOptions, ControlDashboardData } from './TuiTypes.js';
import type { StatusPart } from './TuiPainter.js';

/** Class representing TuiStatusPainter. */
export class TuiStatusPainter {
  private screen: ScreenBuffer;
  private layout: LayoutManager;
  private opts: TuiRendererOptions;

  constructor(screen: ScreenBuffer, layout: LayoutManager, opts: TuiRendererOptions) {
    this.screen = screen;
    this.layout = layout;
    this.opts = opts;
  }

  private getThemeColors(): ThemeColors {
    const themeName = this.opts.theme ?? 'red';
    return THEMES[themeName] ?? THEMES.red;
  }

  private interpolateStops(stops: RGB[], t: number): RGB {
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

  /**
   * Paint status bar.
   */
  paintStatusBar(parts: StatusPart[], compacting = false): void {
    const layoutInfo = this.layout.getLayout();
    const theme = this.getThemeColors();
    const noColor = this.opts.noColor ?? false;
    const y = layoutInfo.statusBar.row;
    const x = layoutInfo.statusBar.col;
    const w = layoutInfo.statusBar.width;

    if (noColor) {
      const plain = parts.map(p => `${p.label}:${p.value}`).join(' │ ');
      const innerW = w - 1;
      this.screen.writeAt(y, x + 1, plain + ' '.repeat(Math.max(0, innerW - plain.length)));
      return;
    }

    const labelColor = fgRgb(160, 160, 160);
    const valColor = theme.valueStops[0];
    const valAnsi = fgRgb(valColor[0], valColor[1], valColor[2]);
    const sepAnsi = fgRgb(80, 80, 80);

    let col = x + 1;
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        const sep = ' │ ';
        for (const ch of sep) {
          if (col < x + w) this.screen.setCell(y, col++, ch, sepAnsi);
        }
      }
      const { label, value } = parts[i];

      if (label === 'ctx') {
        const pct = parseInt(value, 10) || 0;
        const ctxTokensMatch = value.match(/\d+%\s+(.+)/);
        const ctxTokLabel = ctxTokensMatch ? ctxTokensMatch[1] : '';
        const barWidth = 20;
        const filled = Math.round((pct / 100) * barWidth);
        const ctxColor = pct >= 75 ? fgRgb(220, 80, 80) : pct >= 55 ? fgRgb(200, 160, 60) : fgRgb(80, 180, 100);
        const dimColor = pct >= 75 ? fgRgb(120, 40, 40) : pct >= 55 ? fgRgb(100, 80, 30) : fgRgb(40, 90, 50);
        const tag = compacting ? 'compacting...' : (ctxTokLabel ? `(${ctxTokLabel})` : `(${pct}%)`);
        const tagPos = Math.max(0, Math.min(filled, barWidth - tag.length));

        const shimmerStops: RGB[] = compacting
          ? [[80, 180, 100], [200, 220, 100], [80, 180, 100]]
          : [];

        for (const ch of 'ctx') { if (col < x + w) this.screen.setCell(y, col++, ch, labelColor); }
        if (col < x + w) this.screen.setCell(y, col++, ':');
        for (let b = 0; b < barWidth; b++) {
          if (col >= x + w) break;
          if (compacting) {
            const t = ((Date.now() % 1200) / 1200 + b / barWidth) % 1;
            const [sr, sg, sb] = this.interpolateStops(shimmerStops, t);
            const shimColor = fgRgb(sr, sg, sb);
            if (b >= tagPos && b < tagPos + tag.length) {
              this.screen.setCell(y, col++, tag[b - tagPos], shimColor);
            } else {
              this.screen.setCell(y, col++, '━', shimColor);
            }
          } else if (b >= tagPos && b < tagPos + tag.length) {
            const tch = tag[b - tagPos];
            this.screen.setCell(y, col++, tch, ctxColor);
          } else if (b < filled) {
            this.screen.setCell(y, col++, '━', ctxColor);
          } else {
            this.screen.setCell(y, col++, '─', dimColor);
          }
        }
        const maxLabel = '200k';
        for (const ch of maxLabel) { if (col < x + w) this.screen.setCell(y, col++, ch, dimColor); }
      } else {
        for (const ch of label) { if (col < x + w) this.screen.setCell(y, col++, ch, labelColor); }
        if (col < x + w) this.screen.setCell(y, col++, ':');
        for (const ch of value) { if (col < x + w) this.screen.setCell(y, col++, ch, valAnsi); }
      }
    }
    while (col < x + w) { this.screen.setCell(y, col++, ' '); }
  }

  /**
   * Paint f key bar.
   */
  paintFKeyBar(): void {
    const layoutInfo = this.layout.getLayout();
    if (this.screen.height < 5) return;
    if (!this.layout.hasRegion('fkey')) return;
    const reg = this.layout.getRegion('fkey');
    const y = reg.y;
    const noColor = this.opts.noColor ?? false;
    const theme = this.getThemeColors();

    const items = [
      { key: 'F1', label: 'Help' },
      { key: 'F2', label: 'Config' },
      { key: 'F3', label: 'MCP' },
      { key: 'F4', label: 'Agents' },
      { key: 'F5', label: 'Theme' },
      { key: 'F10', label: 'Quit' },
    ];

    if (noColor) {
      const plain = items.map(i => `${i.key}:${i.label}`).join(' ');
      this.screen.writeAt(y, 1, plain);
      return;
    }

    const accent = theme.accentStops[0];
    const keyAnsi = fgRgb(accent[0], accent[1], accent[2]);
    const labelAnsi = fgRgb(180, 180, 180);
    const sepAnsi = fgRgb(60, 60, 60);

    let col = 1;
    for (let i = 0; i < items.length; i++) {
      if (i > 0) {
        if (col < this.screen.width - 1) this.screen.setCell(y, col++, ' ');
        if (col < this.screen.width - 1) this.screen.setCell(y, col++, '│', sepAnsi);
        if (col < this.screen.width - 1) this.screen.setCell(y, col++, ' ');
      }
      for (const ch of items[i].key) {
        if (col < this.screen.width - 1) this.screen.setCell(y, col++, ch, keyAnsi);
      }
      if (col < this.screen.width - 1) this.screen.setCell(y, col++, ':');
      for (const ch of items[i].label) {
        if (col < this.screen.width - 1) this.screen.setCell(y, col++, ch, labelAnsi);
      }
    }
  }

  /**
   * Gets the contextual status parts.
   */
  getContextualStatusParts(
    channel: string,
    values: { provider: string; model: string; agents: number; cost: { current: number; budget: number } },
    approvalPending: number,
    getChannelStatus?: (channel: string) => { tokens: number; cacheRead?: number; cacheWrite?: number; model: string; provider: string; status: string; contextPercent?: number; contextTokens?: number } | null,
  ): StatusPart[] {
    const parts: StatusPart[] = [];
    const chStatus = getChannelStatus?.(channel);

    switch (channel) {
      case '#control':
        parts.push({ label: 'model', value: values.model || 'none' });
        parts.push({ label: 'agents', value: String(values.agents) });
        parts.push({ label: 'cost', value: `$${values.cost.current.toFixed(2)}/$${values.cost.budget.toFixed(2)}` });
        break;
      case '#approvals':
        parts.push({ label: 'pending', value: String(approvalPending ?? 0) });
        parts.push({ label: 'cost', value: `$${values.cost.current.toFixed(2)}/$${values.cost.budget.toFixed(2)}` });
        break;
      case '#logs':
      case '#cost':
        parts.push({ label: 'cost', value: `$${values.cost.current.toFixed(2)}/$${values.cost.budget.toFixed(2)}` });
        break;
      default:
        if (chStatus) {
          parts.push({ label: 'model', value: chStatus.model });
          parts.push({ label: 'provider', value: chStatus.provider });
          const tokStr = chStatus.tokens >= 1000 ? `${(chStatus.tokens / 1000).toFixed(1)}k` : String(chStatus.tokens);
          parts.push({ label: 'tokens', value: tokStr });
          if ((chStatus.cacheRead ?? 0) > 0 || (chStatus.cacheWrite ?? 0) > 0) {
            const crStr = (chStatus.cacheRead ?? 0) >= 1000 ? `${((chStatus.cacheRead ?? 0) / 1000).toFixed(1)}k` : String(chStatus.cacheRead ?? 0);
            const cwStr = (chStatus.cacheWrite ?? 0) >= 1000 ? `${((chStatus.cacheWrite ?? 0) / 1000).toFixed(1)}k` : String(chStatus.cacheWrite ?? 0);
            parts.push({ label: 'cache', value: `${crStr}r/${cwStr}w` });
          }
          if (chStatus.contextPercent !== undefined) {
            const ctxTokStr = chStatus.contextTokens !== undefined
              ? (chStatus.contextTokens >= 1000 ? `${(chStatus.contextTokens / 1000).toFixed(1)}k` : String(chStatus.contextTokens))
              : '';
            const ctxLabel = ctxTokStr ? `${chStatus.contextPercent}% ${ctxTokStr}` : `${chStatus.contextPercent}%`;
            parts.push({ label: 'ctx', value: ctxLabel });
          }
          parts.push({ label: 'status', value: chStatus.status });
        } else {
          parts.push({ label: 'provider', value: values.provider || 'none' });
          parts.push({ label: 'model', value: values.model || 'none' });
        }
    }
    return parts;
  }

  /**
   * Paint control dashboard.
   */
  paintControlDashboard(data: ControlDashboardData): void {
    const layoutInfo = this.layout.getLayout();
    const noColor = this.opts.noColor ?? false;
    const startRow = layoutInfo.main.row + 2;
    const startCol = layoutInfo.main.col + 2;
    const maxWidth = layoutInfo.main.width - 4;
    const maxHeight = layoutInfo.main.height - 3;
    const theme = this.getThemeColors();
    const accent = theme.accentStops[0];

    let row = startRow;

    const writeLine = (text: string, color?: string) => {
      if (row >= startRow + maxHeight) return;
      const clipped = text.slice(0, maxWidth);
      if (noColor || !color) {
        this.screen.writeAt(row, startCol, clipped);
      } else {
        this.screen.writeAt(row, startCol, `${color}${clipped}${RESET}`);
      }
      row++;
    };

    const accentC = noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);
    const dimC = noColor ? '' : fgRgb(100, 100, 100);
    const labelC = noColor ? '' : fgRgb(160, 160, 160);
    const valueC = noColor ? '' : fgRgb(200, 200, 200);
    const greenC = noColor ? '' : fgRgb(80, 200, 100);
    const yellowC = noColor ? '' : fgRgb(220, 180, 60);

    const uptimeStr = this.formatUptime(data.uptime);
    const tokStr = data.totalTokens >= 1_000_000
      ? `${(data.totalTokens / 1_000_000).toFixed(1)}M`
      : data.totalTokens >= 1_000
        ? `${(data.totalTokens / 1_000).toFixed(1)}k`
        : `${data.totalTokens}`;

    writeLine('┌─ overview ─────────────────────────────', accentC);
    writeLine(`│  uptime: ${uptimeStr}   tokens: ${tokStr}   cost: $${data.totalCost.toFixed(4)}   workers: ${data.activeWorkers}`, labelC);
    writeLine('└────────────────────────────────────────', accentC);
    row++;

    if (data.channels.length > 0) {
      writeLine('┌─ channels ─────────────────────────────', dimC);
      for (const ch of data.channels) {
        if (row >= startRow + maxHeight) break;
        const statusColor = ch.status === 'thinking' || ch.status === 'tool_use' ? greenC :
          ch.status === 'idle' ? yellowC : labelC;
        const ctxBar = this.miniBar(ch.contextPercent, 10);
        const tokLabel = ch.tokens >= 1000 ? `${(ch.tokens / 1000).toFixed(0)}k` : `${ch.tokens}`;
        writeLine(`│  ${statusColor}${ch.status.padEnd(9)}${RESET} ${valueC}${ch.name.padEnd(16)}${RESET} ${dimC}ctx${RESET} ${ctxBar} ${dimC}${tokLabel}${RESET}`, '');
      }
      writeLine('└────────────────────────────────────────', dimC);
    } else {
      writeLine('  no active channels', dimC);
    }
  }

  private formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  private miniBar(percent: number, width: number): string {
    const noColor = this.opts.noColor ?? false;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    if (noColor) return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
    const theme = this.getThemeColors();
    const accent = theme.accentStops[0];
    const barColor = percent > 80 ? fgRgb(220, 60, 60) : percent > 50 ? fgRgb(220, 180, 60) : fgRgb(accent[0], accent[1], accent[2]);
    const emptyColor = fgRgb(60, 60, 60);
    return `${barColor}${'█'.repeat(filled)}${emptyColor}${'░'.repeat(empty)}${RESET}`;
  }
}
