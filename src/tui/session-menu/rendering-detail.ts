import { fgRgb, bgRgb, RESET } from '../../rendering/index.js';
import type { MenuItem, MenuPanel } from './types.js';
import { gradientText } from './theme-utils.js';
import type { RenderState } from './rendering.js';

/** Render dual panel.
 * @param {RenderState} state - Description of state.
 * @param {MenuPanel} menuPanel - Description of menu panel.
 */
export function renderDualPanel(state: RenderState, menuPanel: MenuPanel): void {
  const accent = state.themeColors.accentStops[0];
  const accentColor = fgRgb(accent[0], accent[1], accent[2]);
  const dimColorStr = fgRgb(160, 160, 160);
  const totalWidth = Math.min(state.screen.width - 4, state.screen.width > 140 ? 160 : 120);
  const gap = 2;
  const menuWidth = Math.min(Math.floor(totalWidth * 0.35), 36);
  const detailWidth = totalWidth - menuWidth - gap;
  const totalBlockWidth = menuWidth + gap + detailWidth;
  const baseCol = Math.floor((state.screen.width - totalBlockWidth) / 2);
  const detailCol = baseCol + menuWidth + gap;

  const menuH = state.calculatePanelHeight(menuPanel);
  const detailH = state.detailMode === 'json'
    ? Math.min(state.jsonBuffer.length + 6, state.screen.height - 4)
    : (state.detailPanelId ? state.calculatePanelHeight(state.panels.get(state.detailPanelId)!) : 10);
  const maxH = Math.max(menuH, detailH);
  const startRow = Math.max(1, Math.floor((state.screen.height - maxH) / 2));

  let row = startRow;
  const menuTitle = ` ${menuPanel.title} `;
  const menuTitleGrad = gradientText(menuTitle, state.themeColors.accentStops);
  const menuDashLen = Math.min(24, Math.max(8, (menuWidth - menuTitle.length - 3) * 2));
  state.screen.writeAt(row, baseCol,
    `${accentColor}┌─${RESET}${menuTitleGrad}${accentColor}${'─'.repeat(menuDashLen)}${RESET}`);
  row++;

  state.screen.writeAt(row, baseCol, `${accentColor}│${RESET}`);
  row++;

  const filteredMenu = state.getFilteredItems(menuPanel);
  const visibleItems = Math.min(filteredMenu.length, maxH - 5);
  for (let i = 0; i < visibleItems; i++) {
    const item = filteredMenu[i + state.scrollOffset];
    if (!item) break;
    const isSelected = !state.detailFocused && i + state.scrollOffset === state.selectedIndex;
    const itemPrefix = isSelected ? `${accentColor}  ▸ ${RESET}` : '    ';
    const itemLabel = item.type === 'display'
      ? `${dimColorStr}${item.label}${RESET}`
      : `${fgRgb(200, 200, 200)}${item.label}${RESET}`;
    state.screen.writeAt(row, baseCol, `${accentColor}│${RESET}${itemPrefix}${itemLabel}`);
    row++;
  }

  state.screen.writeAt(row, baseCol, `${accentColor}│${RESET}`);
  row++;
  const menuFooter = !state.detailFocused
    ? `  ${dimColorStr}[↑↓]nav [→]detail [Esc]back${RESET}`
    : `  ${dimColorStr}[←]focus here${RESET}`;
  state.screen.writeAt(row, baseCol, `${accentColor}│${RESET}${menuFooter}`);
  row++;
  state.screen.writeAt(row, baseCol, `${accentColor}└──${RESET}`);

  row = startRow;

  if (state.detailMode === 'json') {
    renderJsonDetailPanel(state, row, detailCol, detailWidth, maxH, accentColor, dimColorStr);
  } else if (state.detailMode === 'form' && state.detailPanelId) {
    renderFormDetailPanel(state, row, detailCol, detailWidth, accentColor, dimColorStr);
  }
}

function renderJsonDetailPanel(
  state: RenderState, startRow: number, detailCol: number, detailWidth: number,
  maxH: number, accentColor: string, dimColorStr: string,
): void {
  const accent = state.themeColors.accentStops[0];
  let row = startRow;

  const jsonTitle = ` Edit JSON `;
  const jsonTitleGrad = gradientText(jsonTitle, state.themeColors.accentStops);
  const jsonDashLen = Math.min(32, Math.max(8, (detailWidth - jsonTitle.length - 3) * 2));
  state.screen.writeAt(row, detailCol,
    `${accentColor}┌─${RESET}${jsonTitleGrad}${accentColor}${'─'.repeat(jsonDashLen)}${RESET}`);
  row++;

  state.screen.writeAt(row, detailCol, `${accentColor}│${RESET}`);
  row++;

  const maxJsonLines = maxH - 7;
  const scrollStart = Math.max(0, state.jsonCursorRow - maxJsonLines + 2);
  for (let i = scrollStart; i < Math.min(state.jsonBuffer.length, scrollStart + maxJsonLines); i++) {
    const lineNum = `${String(i + 1).padStart(3)} `;
    const lineContent = state.jsonBuffer[i].slice(0, detailWidth - 8);
    const isCursorLine = state.detailFocused && i === state.jsonCursorRow;
    const lineNumColor = isCursorLine ? accentColor : dimColorStr;
    const textColor = isCursorLine ? fgRgb(255, 255, 255) : fgRgb(210, 210, 210);

    if (isCursorLine) {
      const before = lineContent.slice(0, state.jsonCursorCol);
      const cursorChar = lineContent[state.jsonCursorCol] ?? ' ';
      const after = lineContent.slice(state.jsonCursorCol + 1);
      const cursorBg = bgRgb(accent[0], accent[1], accent[2]);
      state.screen.writeAt(row, detailCol,
        `${accentColor}│${RESET} ${lineNumColor}${lineNum}${RESET}${textColor}${before}${cursorBg}${fgRgb(255, 255, 255)}${cursorChar}${RESET}${textColor}${after}${RESET}`);
    } else {
      state.screen.writeAt(row, detailCol,
        `${accentColor}│${RESET} ${lineNumColor}${lineNum}${RESET}${textColor}${lineContent}${RESET}`);
    }
    row++;
  }

  state.screen.writeAt(row, detailCol, `${accentColor}│${RESET}`);
  row++;
  const saveHint = state.detailFocused
    ? `  ${accentColor}[Ctrl+S]${RESET}${dimColorStr} save  ${RESET}${accentColor}[Esc]${RESET}${dimColorStr} cancel${RESET}`
    : `  ${dimColorStr}[→] focus editor${RESET}`;
  state.screen.writeAt(row, detailCol, `${accentColor}│${RESET}${saveHint}`);
  row++;
  state.screen.writeAt(row, detailCol, `${accentColor}└──${RESET}`);
}

function renderFormDetailPanel(
  state: RenderState, startRow: number, detailCol: number, detailWidth: number,
  accentColor: string, dimColorStr: string,
): void {
  const accent = state.themeColors.accentStops[0];
  const formPanel = state.panels.get(state.detailPanelId!);
  if (!formPanel) return;

  let row = startRow;
  const formTitle = ` ${formPanel.title} `;
  const formTitleGrad = gradientText(formTitle, state.themeColors.accentStops);
  const formDashLen = Math.min(32, Math.max(8, (detailWidth - formTitle.length - 3) * 2));
  state.screen.writeAt(row, detailCol,
    `${accentColor}┌─${RESET}${formTitleGrad}${accentColor}${'─'.repeat(formDashLen)}${RESET}`);
  row++;

  state.screen.writeAt(row, detailCol, `${accentColor}│${RESET}`);
  row++;

  for (let i = 0; i < formPanel.items.length; i++) {
    const field = formPanel.items[i];
    const isFocused = state.detailFocused && i === state.detailSelectedIndex;
    const fieldPrefix = isFocused ? `${accentColor}  ▸ ${RESET}` : '    ';

    let fieldContent: string;
    if (field.label.startsWith('✓')) {
      fieldContent = `${accentColor}${field.label}${RESET}`;
    } else if (field.type === 'text') {
      const val = String(field.value ?? '');
      if (isFocused && state.editingField === field.id) {
        const rendered = state.textInput.render(accent);
        fieldContent = `${fgRgb(180, 180, 180)}${field.label}:${RESET} ${rendered.text}`;
      } else {
        fieldContent = `${fgRgb(180, 180, 180)}${field.label}:${RESET} ${fgRgb(220, 220, 220)}${val}${RESET}${val ? '' : ` ${dimColorStr}${field.description ?? ''}${RESET}`}`;
      }
    } else if (field.type === 'choice') {
      const val = String(field.value ?? '');
      fieldContent = `${fgRgb(180, 180, 180)}${field.label}:${RESET} ${fgRgb(220, 220, 220)}${val}${RESET}`;
    } else if (field.type === 'toggle') {
      const on = field.value ? `${fgRgb(100, 230, 170)}●${RESET}` : `${dimColorStr}○${RESET}`;
      fieldContent = `${on} ${fgRgb(180, 180, 180)}${field.label}${RESET}`;
    } else {
      fieldContent = `${fgRgb(180, 180, 180)}${field.label}${RESET}`;
    }

    state.screen.writeAt(row, detailCol, `${accentColor}│${RESET}${fieldPrefix}${fieldContent}`);
    row++;
  }

  state.screen.writeAt(row, detailCol, `${accentColor}│${RESET}`);
  row++;
  const formFooter = state.detailFocused
    ? `  ${dimColorStr}[↑↓]nav [Enter]edit/save [Esc]cancel${RESET}`
    : `  ${dimColorStr}[→] focus form${RESET}`;
  state.screen.writeAt(row, detailCol, `${accentColor}│${RESET}${formFooter}`);
  row++;
  state.screen.writeAt(row, detailCol, `${accentColor}└──${RESET}`);
}
