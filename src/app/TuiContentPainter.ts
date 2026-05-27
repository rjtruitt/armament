import { ScreenBuffer, LayoutManager, InputBar, ScrollBuffer, ApprovalWidget } from '../tui/index.js';
import { THEMES, type ThemeColors, fgRgb, bgRgb, RESET } from '../rendering/index.js';
import type { RGB, TuiRendererOptions } from './TuiTypes.js';
import { SPINNER_FRAMES } from './TuiTypes.js';

/** Class representing TuiContentPainter. */
export class TuiContentPainter {
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
    const layoutInfo = this.layout.getLayout();
    const mainStartRow = layoutInfo.main.row + 2;
    const mainStartCol = layoutInfo.main.col + 1;
    const mainBottom = layoutInfo.main.row + layoutInfo.main.height - 1;
    const totalHeight = mainBottom - mainStartRow;
    const mainWidth = layoutInfo.main.width - 2;
    const noColor = this.opts.noColor ?? false;
    const theme = this.getThemeColors();
    const reset = noColor ? '' : RESET;

    let stagingHeight = 0;

    if (staging && staging.lines.length > 0) {
      const maxStagingHeight = Math.floor(totalHeight / 3);
      const minStagingHeight = Math.min(2, staging.lines.length);
      stagingHeight = Math.min(maxStagingHeight, Math.max(minStagingHeight, staging.lines.length));
      stagingHeight = Math.min(stagingHeight, totalHeight - 4);
    }

    const chatHeight = stagingHeight > 0 ? totalHeight - stagingHeight - 1 : totalHeight;
    const thinkingRows = thinkingActive ? 1 : 0;
    const contentHeight = chatHeight - thinkingRows;
    scrollBuf.resize(mainWidth, contentHeight);

    const viewportLines = scrollBuf.getViewport();
    const valColor = theme.valueStops[0];
    const textFg = noColor ? '' : fgRgb(valColor[0], valColor[1], valColor[2]);

    for (let i = 0; i < viewportLines.length && i < chatHeight; i++) {
      const row = mainStartRow + i;
      if (row >= mainBottom) break;
      const line = viewportLines[i];
      if (!line) continue;
      if (line.includes('\x1b[')) {
        this.screen.writeAt(row, mainStartCol, `${line}${reset}`);
      } else if (line.trim()) {
        this.screen.writeAt(row, mainStartCol, `${textFg}${line}${reset}`);
      }
    }

    if (thinkingActive) {
      const spinner = SPINNER_FRAMES[thinkingFrame % SPINNER_FRAMES.length];
      const elapsed = Math.floor(thinkingFrame / 10);
      const timeStr = elapsed > 0 ? ` ${elapsed}s` : '';
      const charsStr = thinkingText ? ` (${thinkingText.length} chars)` : '';
      const label = `${spinner} ${thinkingMsg}${timeStr}${charsStr}`;
      const thinkRow = mainStartRow + contentHeight;
      if (thinkRow < mainBottom) {
        if (noColor) {
          this.screen.writeAt(thinkRow, mainStartCol + 2, label);
        } else {
          const stops = theme.accentStops;
          const offset = thinkingFrame % label.length;
          let colored = '';
          for (let c = 0; c < label.length; c++) {
            const t = label.length > 1 ? ((c + offset) % label.length) / (label.length - 1) : 0;
            const [r, g, b] = this.interpolateStops(stops, t);
            colored += `${fgRgb(r, g, b)}${label[c]}`;
          }
          colored += reset;
          this.screen.writeAt(thinkRow, mainStartCol + 2, colored);
        }
      }


    }

    if (stagingHeight > 0 && staging) {
      const separatorRow = mainStartRow + chatHeight;
      if (separatorRow < mainBottom) {
        const accent = theme.accentStops[0];
        const dim: RGB = [Math.round(accent[0] * 0.4), Math.round(accent[1] * 0.4), Math.round(accent[2] * 0.4)];
        const sepColor = noColor ? '' : fgRgb(dim[0], dim[1], dim[2]);
        const msgWord = staging.messageCount === 1 ? 'message' : 'messages';
        const queueLabel = ` queued (${staging.messageCount} ${msgWord}) `;
        const leftDash = 2;
        const rightDash = Math.max(2, mainWidth - leftDash - queueLabel.length - 2);

        let col = mainStartCol;
        for (let d = 0; d < leftDash && col < mainStartCol + mainWidth; d++) {
          this.screen.setCell(separatorRow, col++, '─', sepColor);
        }
        const labelColor = noColor ? '' : fgRgb(dim[0] + 40, dim[1] + 40, dim[2] + 40);
        for (const ch of queueLabel) {
          if (col < mainStartCol + mainWidth) this.screen.setCell(separatorRow, col++, ch, labelColor);
        }
        for (let d = 0; d < rightDash && col < mainStartCol + mainWidth; d++) {
          this.screen.setCell(separatorRow, col++, '─', sepColor);
        }
      }

      const stagingStartRow = separatorRow + 1;
      const visibleStagingLines = staging.lines.slice(staging.scrollOffset, staging.scrollOffset + stagingHeight);
      for (let i = 0; i < visibleStagingLines.length && i < stagingHeight; i++) {
        const row = stagingStartRow + i;
        if (row >= mainBottom) break;
        const line = visibleStagingLines[i];
        if (!line) continue;
        if (line.includes('\x1b[')) {
          this.screen.writeAt(row, mainStartCol, `${line}${reset}`);
        } else if (line.trim()) {
          this.screen.writeAt(row, mainStartCol, `${textFg}${line}${reset}`);
        }
      }
    }
  }

  /**
   * Paint welcome.
   */
  paintWelcome(): void {
    const layoutInfo = this.layout.getLayout();
    const noColor = this.opts.noColor ?? false;
    const mainStartRow = layoutInfo.main.row + 3;
    const mainStartCol = layoutInfo.main.col + 3;
    const mainWidth = layoutInfo.main.width - 6;
    const theme = this.getThemeColors();

    if (mainStartRow + 5 >= layoutInfo.main.row + layoutInfo.main.height) return;

    const title = 'armament';
    const ready = '[ ready ]';
    const hints = ['Tab: navigate', '/: commands', 'Esc: back', 'Ctrl+C: exit'];

    if (noColor) {
      this.screen.writeAt(mainStartRow + 2, mainStartCol + 2, title);
      this.screen.writeAt(mainStartRow + 4, mainStartCol + 2, ready);
      this.screen.writeAt(mainStartRow + 6, mainStartCol + 2, hints.join(' │ '));
      return;
    }

    const accent = theme.accentStops[0];
    const titleAnsi = fgRgb(accent[0], accent[1], accent[2]);
    const dimAnsi = fgRgb(100, 100, 100);
    const hintAnsi = fgRgb(140, 140, 140);

    let col = mainStartCol + 2;
    for (const ch of title) {
      this.screen.setCell(mainStartRow + 2, col++, ch, titleAnsi);
    }
    col = mainStartCol + 2;
    for (const ch of ready) {
      this.screen.setCell(mainStartRow + 4, col++, ch, dimAnsi);
    }
    const hintStr = hints.join(' │ ');
    col = mainStartCol + 2;
    for (const ch of hintStr) {
      if (col >= mainStartCol + mainWidth) break;
      this.screen.setCell(mainStartRow + 6, col++, ch, hintAnsi);
    }
  }

  /**
   * Paint approval widget.
   */
  paintApprovalWidget(approvalWidget: ApprovalWidget): void {
    if (approvalWidget.isEmpty) return;

    const layoutInfo = this.layout.getLayout();
    const noColor = this.opts.noColor ?? false;
    const theme = this.getThemeColors();
    const screenWidth = this.screen.width;

    const modalWidth = Math.max(40, Math.min(80, Math.floor(screenWidth * 0.5)));
    const innerWidth = modalWidth - 4;
    approvalWidget.setWidth(innerWidth);
    // Set theme colors so the widget's render() uses them instead of hardcoded defaults
    const accent = theme.accentStops[0];
    const dim: RGB = [
      Math.round(accent[0] * 0.65 + 60),
      Math.round(accent[1] * 0.65 + 60),
      Math.round(accent[2] * 0.65 + 60),
    ];
    approvalWidget.setAccentColor(accent);
    approvalWidget.setDimColor(dim);
    const contentLines = approvalWidget.render();
    if (contentLines.length === 0) return;

    const modalHeight = contentLines.length + 2;
    const statusRow = layoutInfo.inputBar.row - 1;
    const startRow = Math.max(layoutInfo.main.row + 1, statusRow - modalHeight - 2);
    const startCol = Math.floor((screenWidth - modalWidth) / 2);

    const bg = noColor ? '' : bgRgb(28, 28, 32);
    const borderStyle = noColor ? '' : `${fgRgb(60, 60, 70)}${bg}`;
    const titleStyle = noColor ? '' : `${fgRgb(theme.accentStops[0][0], theme.accentStops[0][1], theme.accentStops[0][2])}${bg}`;

    for (let r = startRow; r < startRow + modalHeight; r++) {
      if (r > statusRow) break;
      for (let c = startCol; c < startCol + modalWidth; c++) {
        this.screen.setCell(r, c, ' ', bg);
      }
    }

    const source = approvalWidget.getSourceChannel() ?? 'agent';
    const titleText = ` ${source} `;
    const innerW = modalWidth - 2;
    const tLeft = Math.floor((innerW - titleText.length) / 2);
    const tRight = innerW - titleText.length - tLeft;
    this.screen.setCell(startRow, startCol, '╭', borderStyle);
    for (let c = 0; c < tLeft; c++) {
      this.screen.setCell(startRow, startCol + 1 + c, '─', borderStyle);
    }
    for (let c = 0; c < titleText.length; c++) {
      this.screen.setCell(startRow, startCol + 1 + tLeft + c, titleText[c], titleStyle);
    }
    for (let c = 0; c < tRight; c++) {
      this.screen.setCell(startRow, startCol + 1 + tLeft + titleText.length + c, '─', borderStyle);
    }
    this.screen.setCell(startRow, startCol + modalWidth - 1, '╮', borderStyle);

    for (let i = 0; i < contentLines.length; i++) {
      const row = startRow + 1 + i;
      if (row > statusRow) break;
      this.screen.setCell(row, startCol, '│', borderStyle);
      this.screen.writeAt(row, startCol + 2, `${bg}${contentLines[i]}${RESET}`);
      this.screen.setCell(row, startCol + modalWidth - 1, '│', borderStyle);
    }

    const bottomRow = startRow + 1 + contentLines.length;
    if (bottomRow <= statusRow) {
      this.screen.setCell(bottomRow, startCol, '╰', borderStyle);
      for (let c = 1; c < modalWidth - 1; c++) {
        this.screen.setCell(bottomRow, startCol + c, '─', borderStyle);
      }
      this.screen.setCell(bottomRow, startCol + modalWidth - 1, '╯', borderStyle);
    }
  }

  /**
   * Paint input bar.
   */
  paintInputBar(inputBar: InputBar, disabled?: string): void {
    const layoutInfo = this.layout.getLayout();
    const theme = this.getThemeColors();
    const noColor = this.opts.noColor ?? false;
    const y = layoutInfo.inputBar.row;
    const x = layoutInfo.inputBar.col;
    const w = layoutInfo.inputBar.width;

    this.screen.clearRect(x + 1, y, w - 1, 1);

    if (disabled) {
      const dimAnsi = noColor ? '' : fgRgb(80, 80, 80);
      let col = x + 1;
      for (const ch of disabled) { if (col < x + w) this.screen.setCell(y, col++, ch, dimAnsi); }
      while (col < x + w) { this.screen.setCell(y, col++, ' '); }
      return;
    }

    const channel = inputBar.getChannel();
    const text = inputBar.getText();
    const cursorPos = inputBar.getCursorPosition();

    const prompt = `${channel} | `;
    const promptPlainLen = prompt.length;
    const maxTextWidth = w - promptPlainLen;

    let scrollOffset = inputBar.getScrollOffset();
    if (cursorPos - scrollOffset >= maxTextWidth) {
      scrollOffset = cursorPos - maxTextWidth + 1;
    } else if (cursorPos < scrollOffset) {
      scrollOffset = cursorPos;
    }
    const visibleText = text.replace(/\n/g, ' ').slice(scrollOffset, scrollOffset + maxTextWidth);

    let col = x + 1;
    if (noColor) {
      for (const ch of prompt) { if (col < x + w) this.screen.setCell(y, col++, ch); }
      for (const ch of visibleText) { if (col < x + w) this.screen.setCell(y, col++, ch); }
    } else {
      const accent0 = theme.accentStops[0];
      const channelAnsi = fgRgb(
        Math.min(255, accent0[0] + 30),
        Math.min(255, accent0[1] + 30),
        Math.min(255, accent0[2] + 30),
      );
      const sepAnsi = fgRgb(
        Math.round(accent0[0] * 0.5),
        Math.round(accent0[1] * 0.5),
        Math.round(accent0[2] * 0.5),
      );
      const valColor = theme.valueStops[0];
      const textAnsi = fgRgb(valColor[0], valColor[1], valColor[2]);

      for (const ch of channel) { if (col < x + w) this.screen.setCell(y, col++, ch, channelAnsi); }
      if (col < x + w) this.screen.setCell(y, col++, ' ');
      if (col < x + w) this.screen.setCell(y, col++, '|', sepAnsi);
      if (col < x + w) this.screen.setCell(y, col++, ' ');
      for (const ch of visibleText) { if (col < x + w) this.screen.setCell(y, col++, ch, textAnsi); }
    }
    while (col < x + w) { this.screen.setCell(y, col++, ' '); }

    const cursorScreenCol = x + 1 + promptPlainLen + (cursorPos - scrollOffset);
    if (cursorScreenCol < this.screen.width && y < this.screen.height) {
      this.screen.setCursor(y, cursorScreenCol);
    }
  }
}
