import { ScreenBuffer, LayoutManager, ConfigPane } from '../tui/index.js';
import { THEMES, type ThemeColors, fgRgb, RESET } from '../rendering/index.js';
import type { TuiRendererOptions } from './TuiTypes.js';

/** Class representing TuiConfigPainter. */
export class TuiConfigPainter {
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

  /**
   * Paint config pane.
   */
  paintConfigPane(pane: ConfigPane): void {
    const mode = pane.viewMode;
    if (mode === 'list') {
      this.paintListView(pane);
    } else if (mode === 'detail') {
      this.paintDetailView(pane);
    } else {
      this.paintMenuView(pane);
    }
  }

  private paintMenuView(pane: ConfigPane): void {
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

    const dimC = noColor ? '' : fgRgb(100, 100, 100);
    const labelC = noColor ? '' : fgRgb(180, 180, 180);
    const accentC = noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);
    const selectedBg = noColor ? '' : `\x1b[48;2;${Math.round(accent[0] * 0.2)};${Math.round(accent[1] * 0.2)};${Math.round(accent[2] * 0.2)}m`;
    const toggleOn = noColor ? '' : fgRgb(100, 200, 100);
    const toggleOff = noColor ? '' : fgRgb(160, 80, 80);
    const choiceC = noColor ? '' : fgRgb(180, 160, 80);
    const editC = noColor ? '' : fgRgb(100, 180, 220);

    const items = pane.visibleItems;
    const cursor = pane.cursor;
    const editing = pane.editing;

    if (items.length === 0) {
      writeLine('  (empty)', dimC);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      if (row >= startRow + maxHeight - 2) break;
      const item = items[i];
      const isCursor = i === cursor;
      const pointer = isCursor ? '▸' : ' ';
      const bg = isCursor ? selectedBg : '';
      const resetBg = isCursor ? RESET : '';

      let line = '';
      switch (item.type) {
        case 'submenu':
          line = `${pointer} ${item.label}  →`;
          break;
        case 'toggle': {
          const state = item.value ? '[●]' : '[ ]';
          const stateColor = item.value ? toggleOn : toggleOff;
          if (noColor) {
            line = `${pointer} ${item.label}  ${state}`;
          } else {
            const fullLine = `${bg}${accentC}${pointer}${RESET}${bg} ${labelC}${item.label}  ${stateColor}${state}${resetBg}`;
            this.screen.writeAt(row, startCol, fullLine);
            if (item.description) {
              const descCol = startCol + 4 + item.label.length + state.length + 2;
              if (descCol < startCol + maxWidth - item.description.length) {
                this.screen.writeAt(row, descCol, `${dimC}${item.description}${RESET}`);
              }
            }
            row++;
            continue;
          }
          break;
        }
        case 'choice': {
          const currentChoice = item.choices?.find(c => c.id === item.value);
          const val = currentChoice?.label ?? String(item.value ?? '');
          if (noColor) {
            line = `${pointer} ${item.label}  < ${val} >`;
          } else {
            const fullLine = `${bg}${accentC}${pointer}${RESET}${bg} ${labelC}${item.label}  ${choiceC}< ${val} >${resetBg}`;
            this.screen.writeAt(row, startCol, fullLine);
            row++;
            continue;
          }
          break;
        }
        case 'text': {
          const isEditing = editing === item.id;
          const val = isEditing ? pane.editBuffer + '█' : String(item.value ?? '');
          const valDisplay = val || '(empty)';
          if (noColor) {
            line = `${pointer} ${item.label}:  ${valDisplay}`;
          } else {
            const valColor = isEditing ? editC : dimC;
            const fullLine = `${bg}${accentC}${pointer}${RESET}${bg} ${labelC}${item.label}: ${valColor}${valDisplay}${resetBg}`;
            this.screen.writeAt(row, startCol, fullLine);
            row++;
            continue;
          }
          break;
        }
        case 'display':
          line = `${pointer} ${item.label}`;
          if (item.description) line += `  ${item.description}`;
          break;
        case 'json':
          line = `${pointer} ${item.label}`;
          break;
        default:
          line = `${pointer} ${item.label}`;
      }

      if (noColor) {
        writeLine(line);
      } else {
        const color = isCursor ? accentC : labelC;
        const fullLine = `${bg}${color}${line}${resetBg}`;
        this.screen.writeAt(row, startCol, fullLine);
        row++;
      }
    }

    const currentItem = items[cursor];
    if (currentItem?.description && row < startRow + maxHeight) {
      row++;
      writeLine(`  ${currentItem.description}`, dimC);
    }
  }

  private paintListView(pane: ConfigPane): void {
    const layoutInfo = this.layout.getLayout();
    const noColor = this.opts.noColor ?? false;
    const startRow = layoutInfo.main.row + 2;
    const startCol = layoutInfo.main.col + 2;
    const maxWidth = layoutInfo.main.width - 4;
    const maxHeight = layoutInfo.main.height - 3;
    const theme = this.getThemeColors();
    const accent = theme.accentStops[0];

    const lv = pane.listView;
    if (!lv) return;
    const dimC = noColor ? '' : fgRgb(100, 100, 100);
    const headerC = noColor ? '' : fgRgb(180, 180, 180);
    const accentC = noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);
    const rowBg = noColor ? '' : `\x1b[48;2;${Math.round(accent[0] * 0.15)};${Math.round(accent[1] * 0.15)};${Math.round(accent[2] * 0.15)}m`;
    const selectC = noColor ? '' : fgRgb(100, 200, 255);
    const statusColors: Record<string, string> = noColor ? {} : {
      active: fgRgb(100, 200, 100),
      inactive: fgRgb(120, 120, 120),
      error: fgRgb(220, 80, 60),
      warning: fgRgb(220, 180, 60),
      pending: fgRgb(100, 160, 220),
    };

    let row = startRow;
    const rows = pane.filteredRows;
    const cursor = pane.cursor;
    const viewportH = maxHeight - 4;
    pane.setViewportHeight(viewportH);
    const scroll = pane.listScroll;

    if (pane.filterActive) {
      const filterLine = `  / ${pane.filterText}█`;
      this.screen.writeAt(row, startCol, `${accentC}${filterLine}${RESET}`);
      row++;
    } else if (pane.filterText) {
      const filterLine = `  filter: "${pane.filterText}" (${rows.length} results)`;
      this.screen.writeAt(row, startCol, `${dimC}${filterLine}${RESET}`);
      row++;
    }

    let headerLine = '  ';
    if (lv.multiSelect) headerLine += '☐ ';
    for (const col of lv.columns) {
      const sortInd = lv.sortColumn === col.key ? (lv.sortAsc ? ' ▲' : ' ▼') : '';
      const label = (col.label + sortInd).slice(0, col.width);
      const padded = col.align === 'right'
        ? label.padStart(col.width)
        : label.padEnd(col.width);
      headerLine += padded + ' ';
    }
    headerLine = headerLine.slice(0, maxWidth);
    this.screen.writeAt(row, startCol, `${headerC}${headerLine}${RESET}`);
    row++;

    const sepLine = '  ' + '─'.repeat(Math.min(maxWidth - 2, headerLine.length - 2));
    this.screen.writeAt(row, startCol, `${dimC}${sepLine}${RESET}`);
    row++;

    const visibleEnd = Math.min(rows.length, scroll + viewportH);
    for (let i = scroll; i < visibleEnd; i++) {
      if (row >= startRow + maxHeight - 1) break;
      const r = rows[i];
      const isCursor = i === cursor;
      const isSelected = pane.selectedRows.has(r.id);
      const bg = isCursor ? rowBg : '';
      const resetBg = isCursor ? RESET : '';
      const pointer = isCursor ? '▸' : ' ';

      let cellLine = `${pointer} `;
      if (lv.multiSelect) {
        cellLine += isSelected ? `${selectC}☑${RESET}${bg} ` : '☐ ';
      }

      if (r.status) {
        const sColor = statusColors[r.status] ?? '';
        cellLine += `${sColor}●${RESET}${bg} `;
      }

      for (const col of lv.columns) {
        const val = (r.cells[col.key] ?? '').slice(0, col.width);
        const padded = col.align === 'right'
          ? val.padStart(col.width)
          : val.padEnd(col.width);
        cellLine += padded + ' ';
      }

      cellLine = cellLine.slice(0, maxWidth);
      const color = isCursor ? accentC : (isSelected ? selectC : (r.status === 'inactive' ? (statusColors.inactive || dimC) : headerC));
      this.screen.writeAt(row, startCol, `${bg}${color}${cellLine}${resetBg}${RESET}`);
      row++;
    }

    if (rows.length > viewportH) {
      row = startRow + maxHeight - 2;
      const pct = Math.round(((scroll + viewportH / 2) / rows.length) * 100);
      const scrollInfo = `  ${scroll + 1}-${visibleEnd} of ${rows.length} (${pct}%)`;
      this.screen.writeAt(row, startCol, `${dimC}${scrollInfo}${RESET}`);
    }
    row = startRow + maxHeight - 2;
    if (!noColor) {
      const legend = `  ${statusColors.active}●${RESET} active  ${statusColors.warning}●${RESET} warning  ${statusColors.error}●${RESET} error  ${statusColors.pending}●${RESET} pending  ${statusColors.inactive}●${RESET} inactive`;
      this.screen.writeAt(row, startCol, legend);
    }

    row = startRow + maxHeight - 1;
    const actions = pane.listActions;
    if (actions.length > 0) {
      let actLine = '  ';
      for (const act of actions) {
        actLine += `[${act.key}]${act.label} `;
      }
      actLine = actLine.slice(0, maxWidth);
      this.screen.writeAt(row, startCol, `${dimC}${actLine}${RESET}`);
    } else {
      const defaultActs = '  [/]filter [s]sort [space]select [enter]detail';
      this.screen.writeAt(row, startCol, `${dimC}${defaultActs.slice(0, maxWidth)}${RESET}`);
    }
  }

  private paintDetailView(pane: ConfigPane): void {
    const layoutInfo = this.layout.getLayout();
    const noColor = this.opts.noColor ?? false;
    const startRow = layoutInfo.main.row + 2;
    const startCol = layoutInfo.main.col + 2;
    const maxWidth = layoutInfo.main.width - 4;
    const maxHeight = layoutInfo.main.height - 3;
    const theme = this.getThemeColors();
    const accent = theme.accentStops[0];

    const dimC = noColor ? '' : fgRgb(100, 100, 100);
    const labelC = noColor ? '' : fgRgb(160, 160, 160);
    const valueC = noColor ? '' : fgRgb(200, 200, 200);
    const accentC = noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);
    const activeC = noColor ? '' : fgRgb(100, 200, 100);
    const dangerC = noColor ? '' : fgRgb(220, 80, 60);
    const statusColors: Record<string, string> = noColor ? {} : {
      active: fgRgb(100, 200, 100),
      inactive: fgRgb(120, 120, 120),
      error: fgRgb(220, 80, 60),
      warning: fgRgb(220, 180, 60),
      pending: fgRgb(100, 160, 220),
    };

    const rows = pane.filteredRows;
    const currentRow = rows[pane.cursor];
    if (!currentRow) return;

    const config = pane.getDetailConfig();
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

    const title = `── ${currentRow.cells[Object.keys(currentRow.cells)[0]] ?? currentRow.id} ──`;
    writeLine(title, accentC);

    if (currentRow.status) {
      const sColor = statusColors[currentRow.status] ?? '';
      writeLine(`  ● ${currentRow.status}`, sColor);
    }
    row++;

    if (!config) {
      const lv = pane.listView;
      if (lv) {
        for (const col of lv.columns) {
          writeLine(`  ${col.label}: ${currentRow.cells[col.key] ?? ''}`, labelC);
        }
      }
      row++;
      writeLine('  esc: back', dimC);
      return;
    }

    const editableFields = config.fields.filter(f => f.type !== 'readonly');
    for (const field of config.fields) {
      if (row >= startRow + maxHeight - 2) break;

      if (field.type === 'readonly') {
        writeLine(`  ${field.label}: ${String(field.value ?? '')}`, dimC);
        continue;
      }

      const isCursor = editableFields.indexOf(field) === pane.detailCursor && pane.detailCursor < editableFields.length;
      const pointer = isCursor ? '▸' : ' ';
      const highlight = isCursor ? accentC : '';

      if (field.type === 'text') {
        if (isCursor && pane.detailEditing) {
          writeLine(`${pointer} ${field.label}:`, highlight || labelC);
          const editLine = `    [${pane.detailEditBuffer}█]`;
          writeLine(editLine, accentC);
        } else {
          writeLine(`${pointer} ${field.label}: ${String(field.value ?? '')}`, highlight || valueC);
        }
      } else if (field.type === 'toggle') {
        const on = field.value === true;
        const indicator = on ? `${activeC}[ON]${RESET}` : `${dimC}[OFF]${RESET}`;
        if (noColor) {
          writeLine(`${pointer} ${field.label}: ${on ? '[ON]' : '[OFF]'}`);
        } else {
          writeLine(`${pointer} ${field.label}: ${indicator}`, highlight);
        }
      } else if (field.type === 'choice') {
        const current = field.choices?.find(c => c.id === field.value);
        writeLine(`${pointer} ${field.label}: < ${current?.label ?? String(field.value)} >`, highlight || valueC);
      }

      if (field.description && isCursor) {
        writeLine(`    ${field.description}`, dimC);
      }
    }
    if (config.actions && config.actions.length > 0) {
      row++;
      for (let i = 0; i < config.actions.length; i++) {
        const action = config.actions[i];
        const actionIdx = editableFields.length + i;
        const isCursor = pane.detailCursor === actionIdx;
        const pointer = isCursor ? '▸' : ' ';
        const color = action.danger ? dangerC : (isCursor ? accentC : dimC);
        writeLine(`${pointer} [ ${action.label} ]`, color);
      }
    }
    row++;
    writeLine('  ↑↓:navigate │ enter:edit │ esc:back', dimC);
  }
}
