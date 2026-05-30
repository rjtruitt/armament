import { ScreenBuffer, LayoutManager, Sidebar, InputBar, FocusManager, ScrollBuffer, ApprovalWidget, ConfigPane } from '../tui/index.js';
import { THEMES, type ThemeColors, fgRgb } from '../rendering/index.js';
import type { RGB, TuiRendererOptions, ControlDashboardData, ChannelStatus } from './TuiTypes.js';
import { TuiConfigPainter } from './TuiConfigPainter.js';
import { TuiContentPainter } from './TuiContentPainter.js';
import { TuiStatusPainter } from './TuiStatusPainter.js';

/** Interface for StatusPart.
 * @property {string} label - Description of label.
 * @property {string} value - Description of value.
 */
export interface StatusPart {
  label: string;
  value: string;
}

/** Class representing TuiPainter. */
export class TuiPainter {
  private screen: ScreenBuffer;
  private layout: LayoutManager;
  private opts: TuiRendererOptions;
  private configPainter: TuiConfigPainter;
  private contentPainter: TuiContentPainter;
  private statusPainter: TuiStatusPainter;

  constructor(screen: ScreenBuffer, layout: LayoutManager, opts: TuiRendererOptions) {
    this.screen = screen;
    this.layout = layout;
    this.opts = opts;
    this.configPainter = new TuiConfigPainter(screen, layout, opts);
    this.contentPainter = new TuiContentPainter(screen, layout, opts);
    this.statusPainter = new TuiStatusPainter(screen, layout, opts);
  }

  /**
   * Gets the theme colors.
   */
  getThemeColors(): ThemeColors {
    const themeName = this.opts.theme ?? 'red';
    return THEMES[themeName] ?? THEMES.red;
  }

  /**
   * Interpolate stops.
   */
  interpolateStops(stops: RGB[], t: number): RGB {
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
   * Paint outer frame.
   */
  paintOuterFrame(): void {
    const theme = this.getThemeColors();
    const noColor = this.opts.noColor ?? false;
    const h = this.screen.height;
    const bright = theme.accentStops[0];
    const faint: RGB = [
      Math.round(bright[0] * 0.55),
      Math.round(bright[1] * 0.55),
      Math.round(bright[2] * 0.55),
    ];

    if (noColor) {
      for (let row = 0; row < h; row++) {
        this.screen.setCell(row, 0, '│');
      }
      return;
    }

    const edgeAnsi = fgRgb(faint[0], faint[1], faint[2]);
    for (let row = 0; row < h; row++) {
      this.screen.setCell(row, 0, '│', edgeAnsi);
    }
  }

  /**
   * Paint sidebar.
   */
  paintSidebar(
    sidebar: Sidebar,
    focusManager: FocusManager,
    activeView: string | null,
    approvalPending: number,
    getMcpStatus?: () => Array<{ name: string; status: string }>,
  ): (string | null)[] {
    const layoutInfo = this.layout.getLayout();
    if (!layoutInfo.sidebarVisible) return [];
    const theme = this.getThemeColors();
    const activeChannel = activeView ?? sidebar.getActive();
    sidebar.renderThemed({
      accent: theme.accentStops[0],
      noColor: this.opts.noColor ?? false,
      focused: focusManager.hasFocus('sidebar'),
      activeChannel,
      stats: {
        pendingApprovals: approvalPending,
        mcpServers: getMcpStatus?.(),
      },
    });
    return sidebar.getRowMap?.() ?? [];
  }

  /**
   * Paint sidebar border.
   */
  paintSidebarBorder(focusManager: FocusManager): void {
    const layoutInfo = this.layout.getLayout();
    if (!layoutInfo.sidebarVisible) return;
    const theme = this.getThemeColors();
    const noColor = this.opts.noColor ?? false;
    const borderCol = layoutInfo.sidebar.width;
    const height = layoutInfo.sidebar.height;
    const focused = focusManager.hasFocus('sidebar');
    const bright = theme.accentStops[0];
    const faint: RGB = [Math.round(bright[0] * 0.4), Math.round(bright[1] * 0.4), Math.round(bright[2] * 0.4)];

    if (noColor) {
      for (let row = 0; row < height; row++) {
        this.screen.setCell(row, borderCol, '│');
      }
      return;
    }

    const color = focused
      ? fgRgb(bright[0], bright[1], bright[2])
      : fgRgb(faint[0], faint[1], faint[2]);

    for (let row = 0; row < height; row++) {
      this.screen.setCell(row, borderCol, '│', color);
    }
  }

  /**
   * Paint borders.
   */
  paintBorders(focusManager: FocusManager): void {
    const theme = this.getThemeColors();
    const noColor = this.opts.noColor ?? false;
    const bright = theme.accentStops[0];
    const faint: RGB = [Math.round(bright[0] * 0.35), Math.round(bright[1] * 0.35), Math.round(bright[2] * 0.35)];
    const focusedAnsi = fgRgb(bright[0], bright[1], bright[2]);
    const dimAnsi = fgRgb(faint[0], faint[1], faint[2]);

    if (this.layout.hasRegion('statusBorder')) {
      const reg = this.layout.getRegion('statusBorder');
      const w = this.screen.width;
      const ansi = noColor ? undefined : dimAnsi;
      this.screen.setCell(reg.y, 0, '├', ansi);
      for (let i = 1; i < w; i++) {
        this.screen.setCell(reg.y, i, '─', ansi);
      }
    }

    const statusRow = this.layout.getRegion('status').y;
    if (statusRow > 0) {
      const borderRow = statusRow - 1;
      if (borderRow >= 0 && borderRow < this.screen.height) {
        const mainFocused = focusManager.hasFocus('main');
        const w = this.screen.width;
        const ansi = noColor ? undefined : (mainFocused ? focusedAnsi : dimAnsi);
        this.screen.setCell(borderRow, 0, '├', ansi);
        for (let i = 1; i < w; i++) {
          this.screen.setCell(borderRow, i, '─', ansi);
        }
      }
    }

    if (this.layout.hasRegion('inputBorder')) {
      const reg = this.layout.getRegion('inputBorder');
      const inputFocused = focusManager.hasFocus('input');
      const w = this.screen.width;
      const ansi = noColor ? undefined : (inputFocused ? focusedAnsi : dimAnsi);
      this.screen.setCell(reg.y, 0, '├', ansi);
      for (let i = 1; i < w; i++) {
        this.screen.setCell(reg.y, i, '─', ansi);
      }
    }

    if (this.layout.hasRegion('fkeyBorder')) {
      const reg = this.layout.getRegion('fkeyBorder');
      const w = this.screen.width;
      const ansi = noColor ? undefined : dimAnsi;
      this.screen.setCell(reg.y, 0, '├', ansi);
      for (let i = 1; i < w; i++) {
        this.screen.setCell(reg.y, i, '─', ansi);
      }
    }
  }

  /**
   * Paint channel header.
   */
  paintChannelHeader(activeChannel: string, rootPath?: string): void {
    const layoutInfo = this.layout.getLayout();
    const theme = this.getThemeColors();
    const noColor = this.opts.noColor ?? false;
    const mainStartRow = layoutInfo.main.row + 1;
    const mainStartCol = layoutInfo.main.col + 1;
    const mainWidth = layoutInfo.main.width - 2;

    const suffix = rootPath ? ` (${rootPath})` : '';
    const headerText = `${activeChannel}${suffix}`;

    if (noColor) {
      this.screen.writeAt(mainStartRow, mainStartCol, `── ${headerText} ──`);
      return;
    }

    const accent = theme.accentStops[0];
    const dim: RGB = [Math.round(accent[0] * 0.4), Math.round(accent[1] * 0.4), Math.round(accent[2] * 0.4)];
    const dashAnsi = fgRgb(dim[0], dim[1], dim[2]);
    const nameAnsi = fgRgb(accent[0], accent[1], accent[2]);
    const rootAnsi = fgRgb(Math.round(accent[0] * 0.7), Math.round(accent[1] * 0.7), Math.round(accent[2] * 0.7));

    const headerLen = headerText.length;
    const leftDashes = 2;
    const rightDashes = Math.max(2, mainWidth - headerLen - leftDashes - 4);

    let col = mainStartCol;
    for (let i = 0; i < leftDashes; i++) {
      this.screen.setCell(mainStartRow, col++, '─', dashAnsi);
    }
    this.screen.setCell(mainStartRow, col++, ' ');
    // Write channel name
    for (let i = 0; i < activeChannel.length; i++) {
      this.screen.setCell(mainStartRow, col++, activeChannel[i], nameAnsi);
    }
    // Write root suffix
    if (rootPath) {
      for (let i = 0; i < suffix.length; i++) {
        this.screen.setCell(mainStartRow, col++, suffix[i], rootAnsi);
      }
    }
    this.screen.setCell(mainStartRow, col++, ' ');
    for (let i = 0; i < rightDashes && col < mainStartCol + mainWidth; i++) {
      this.screen.setCell(mainStartRow, col++, '─', dashAnsi);
    }
  }

  /**
   * Paint main content.
   */
  paintMainContent(
    scrollBuf: ScrollBuffer,
    thinkingActive: boolean,
    thinkingFrame: number,
    thinkingMsg: string,
    staging?: { lines: string[]; scrollOffset: number; messageCount: number },
    thinkingText?: string,
  ): void {
    this.contentPainter.paintMainContent(scrollBuf, thinkingActive, thinkingFrame, thinkingMsg, staging, thinkingText);
  }

  /**
   * Paint welcome.
   */
  paintWelcome(): void {
    this.contentPainter.paintWelcome();
  }

  /**
   * Paint config pane.
   */
  paintConfigPane(pane: ConfigPane): void {
    this.configPainter.paintConfigPane(pane);
  }

  /**
   * Paint approval widget.
   */
  paintApprovalWidget(approvalWidget: ApprovalWidget): void {
    this.contentPainter.paintApprovalWidget(approvalWidget);
  }

  /**
   * Paint input bar.
   */
  paintInputBar(inputBar: InputBar, disabled?: string): void {
    this.contentPainter.paintInputBar(inputBar, disabled);
  }

  /**
   * Paint status bar.
   */
  paintStatusBar(parts: StatusPart[], compacting = false): void {
    this.statusPainter.paintStatusBar(parts, compacting);
  }

  /**
   * Paint f key bar.
   */
  paintFKeyBar(): void {
    this.statusPainter.paintFKeyBar();
  }

  /**
   * Gets the contextual status parts.
   */
  getContextualStatusParts(
    channel: string,
    values: { provider: string; model: string; agents: number; cost: { current: number; budget: number } },
    approvalPending: number,
    getChannelStatus?: (channel: string) => ChannelStatus | null,
  ): StatusPart[] {
    return this.statusPainter.getContextualStatusParts(channel, values, approvalPending, getChannelStatus);
  }

  /**
   * Paint control dashboard.
   */
  paintControlDashboard(data: ControlDashboardData): void {
    this.statusPainter.paintControlDashboard(data);
  }
}
