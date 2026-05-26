/**
 * Rendering logic for the SessionMenu floating panels and legacy views.
 */

import { type ThemeColors, fgRgb, bgRgb, RESET, BOLD, stripAnsi } from '../../rendering/index.js';
import type { ScreenBuffer } from '../ScreenBuffer.js';
import type { TextInput } from '../widgets/TextInput.js';
import type { MenuItem, MenuPanel, LegacyMenuItemDef, SessionMenuConfig, RGB } from './types.js';
import { dimColor, gradientText } from './theme-utils.js';
import { LEGACY_MENU_ITEMS } from './constants.js';
import { renderDualPanel } from './rendering-detail.js';

/** State required by rendering functions, passed in from the SessionMenu class. */
export interface RenderState {
  screen: ScreenBuffer;
  config: SessionMenuConfig;
  theme: string;
  themeColors: ThemeColors;
  panels: Map<string, MenuPanel>;
  panelStack: string[];
  selectedIndex: number;
  scrollOffset: number;
  editingField: string | null;
  editingChoice: boolean;
  editing: boolean;
  editingItem: string | null;
  textInput: TextInput;
  detailMode: 'none' | 'form' | 'json';
  detailPanelId: string | null;
  detailFocused: boolean;
  detailSelectedIndex: number;
  jsonBuffer: string[];
  jsonCursorRow: number;
  jsonCursorCol: number;
  maxWidth: number;
  getFilteredItems: (panel: MenuPanel) => MenuItem[];
  getMaxVisibleItems: () => number;
  calculatePanelHeight: (panel: MenuPanel) => number;
}

/** Renders the floating panel for the hierarchical menu. */
export function renderFloatingPanel(state: RenderState): void {
  const panel = getCurrentPanel(state);
  if (!panel) return;

  const accent = state.themeColors.accentStops[0];
  const dimAccent = dimColor(accent, 0.3);

  if (state.detailMode !== 'none') {
    renderDualPanel(state, panel);
    return;
  }

  const panelWidth = Math.min(state.maxWidth, state.screen.width - 4);
  const panelHeight = state.calculatePanelHeight(panel);
  const startCol = Math.floor((state.screen.width - panelWidth) / 2);
  const startRow = Math.floor((state.screen.height - panelHeight) / 2);

  let row = startRow;
  const accentColor = fgRgb(accent[0], accent[1], accent[2]);

  const titleText = ` ${panel.title} `;
  const titleGrad = gradientText(titleText, state.themeColors.accentStops);
  let maxItemLen = 0;
  for (const item of panel.items) {
    const len = item.label.length + (item.description ? item.description.length + 3 : 0) + 8;
    maxItemLen = Math.max(maxItemLen, len);
  }
  const topDashLen = Math.min(50, Math.max(16, (maxItemLen - titleText.length) * 2));
  state.screen.writeAt(row, startCol,
    `${accentColor}┌─${RESET}${titleGrad}${accentColor}${'─'.repeat(topDashLen)}${RESET}`);
  row++;

  state.screen.writeAt(row, startCol, `${accentColor}│${RESET}`);
  row++;

  if (panel.parent) {
    const parentPanel = state.panels.get(panel.parent);
    const backLabel = parentPanel ? `← ${parentPanel.title}` : '← Back';
    state.screen.writeAt(row, startCol,
      `${accentColor}│${RESET}   ${fgRgb(140, 140, 140)}${backLabel}${RESET}`);
    row++;
    state.screen.writeAt(row, startCol, `${accentColor}│${RESET}`);
    row++;
  }

  const filtered = state.getFilteredItems(panel);
  const visibleItems = Math.min(filtered.length, state.getMaxVisibleItems());

  if (state.scrollOffset > 0) {
    state.screen.writeAt(row, startCol,
      `${accentColor}│${RESET}   ${fgRgb(140, 140, 140)}▲ more above${RESET}`);
    row++;
  }

  const endIdx = Math.min(filtered.length, state.scrollOffset + visibleItems);
  for (let i = state.scrollOffset; i < endIdx; i++) {
    const item = filtered[i];
    const isSelected = i === state.selectedIndex;
    const itemLine = renderMenuItem(item, isSelected, panelWidth - 4, state);
    state.screen.writeAt(row, startCol, `${accentColor}│${RESET}${itemLine}`);
    row++;
  }

  if (endIdx < filtered.length) {
    state.screen.writeAt(row, startCol,
      `${accentColor}│${RESET}   ${fgRgb(140, 140, 140)}▼ more below${RESET}`);
    row++;
  }

  state.screen.writeAt(row, startCol, `${accentColor}│${RESET}`);
  row++;

  const footer = getFooterHints(panel, state);
  state.screen.writeAt(row, startCol, `${accentColor}│${RESET}${footer}`);
  row++;

  state.screen.writeAt(row, startCol, `${accentColor}└──${RESET}`);
}

/** Renders the legacy flat SESSION CONFIG panel. */
export function renderLegacyPanel(state: RenderState): void {
  const accent = state.themeColors.accentStops[0];
  const accentColor = fgRgb(accent[0], accent[1], accent[2]);
  const outerWidth = Math.min(state.screen.width - 4, 70);
  const startRow = 2;
  const startCol = 4;

  let row = startRow;

  const headerText = ' SESSION CONFIG ';
  const headerGrad = gradientText(headerText, state.themeColors.accentStops);
  const topDashLen = Math.max(0, outerWidth - headerText.length - 3);
  state.screen.writeAt(row, startCol,
    `${accentColor}┌─${RESET}${headerGrad}${accentColor}${'─'.repeat(topDashLen)}${RESET}`);
  row++;

  state.screen.writeAt(row, startCol, `${accentColor}│${RESET}`);
  row++;

  for (const item of LEGACY_MENU_ITEMS) {
    const value = formatLegacyValue(item, state.config);
    const hint = getLegacyHint(item, state.config);
    const isEditing = state.editing && state.editingItem === item.label;

    const keyStr = `${accentColor}${BOLD}[${item.key}]${RESET}`;
    const labelStr = `${fgRgb(140, 140, 140)}${item.label}${RESET}`;
    const labelPad = ' '.repeat(Math.max(0, 14 - item.label.length));

    let contentLine: string;
    if (isEditing) {
      const bgAccent = dimColor(accent, 0.15);
      const bg = `${bgRgb(bgAccent[0], bgAccent[1], bgAccent[2])}`;
      const valueStr = `${bg}${fgRgb(220, 220, 220)}${value}${fgRgb(...accent)}▌${RESET}`;
      const hintStr = hint ? `  ${fgRgb(120, 120, 120)}(${hint})${RESET}` : '';
      contentLine = `  ${keyStr} ${labelStr}${labelPad}${valueStr}${hintStr}`;
    } else {
      const valueStr = `${fgRgb(220, 220, 220)}${value}${RESET}`;
      const hintStr = hint ? `  ${fgRgb(120, 120, 120)}(${hint})${RESET}` : '';
      contentLine = `  ${keyStr} ${labelStr}${labelPad}${valueStr}${hintStr}`;
    }

    state.screen.writeAt(row, startCol, `${accentColor}│${RESET}${contentLine}`);
    row++;
  }

  state.screen.writeAt(row, startCol, `${accentColor}│${RESET}`);
  row++;

  state.screen.writeAt(row, startCol,
    `${accentColor}│${RESET}  ${accentColor}[enter]${RESET} ${fgRgb(140, 140, 140)}launch${RESET}     ${accentColor}[letter]${RESET} ${fgRgb(140, 140, 140)}change${RESET}     ${accentColor}[?]${RESET} ${fgRgb(140, 140, 140)}help${RESET}`);
  row++;

  state.screen.writeAt(row, startCol,
    `${accentColor}└──${RESET} ${fgRgb(120, 120, 120)}.armament/config.json${RESET}${' '.repeat(Math.max(0, outerWidth - 40))}${fgRgb(120, 120, 120)}v0.1.0${RESET}`);
}

/** Renders a single menu item line. */
export function renderMenuItem(item: MenuItem, isSelected: boolean, maxContentWidth: number, state: RenderState): string {
  const accent = state.themeColors.accentStops[0];
  const prefix = isSelected ? `${fgRgb(...accent)}   ▸ ${RESET}` : '     ';
  const prefixLen = 5;

  let label: string;
  let detail: string;
  let detailLen: number;

  switch (item.type) {
    case 'submenu':
      label = `${fgRgb(220, 220, 220)}${item.label}${RESET}`;
      detail = item.description ? `${fgRgb(120, 120, 120)}${item.description}${RESET}` : '';
      detailLen = item.description ? item.description.length : 0;
      break;

    case 'toggle': {
      const on = item.value === true;
      const indicator = on ? `${fgRgb(...accent)}[●]${RESET}` : `${fgRgb(120, 120, 120)}[○]${RESET}`;
      label = `${indicator} ${fgRgb(220, 220, 220)}${item.label}${RESET}`;
      detail = item.description ? `${fgRgb(120, 120, 120)}${item.description}${RESET}` : '';
      detailLen = (item.description ? item.description.length : 0) + 4;
      break;
    }

    case 'choice': {
      const editing = state.editingChoice && isSelected;
      if (editing) {
        const arrows = `${fgRgb(255, 255, 100)}◂ ${RESET}`;
        const arrowsR = `${fgRgb(255, 255, 100)} ▸${RESET}`;
        label = `${fgRgb(140, 140, 140)}${item.label}:${RESET} ${arrows}${BOLD}${fgRgb(...accent)}${item.value}${RESET}${arrowsR}`;
        detail = `${fgRgb(255, 255, 100)}↵ commit  esc cancel${RESET}`;
        detailLen = 20;
      } else {
        label = `${fgRgb(140, 140, 140)}${item.label}:${RESET}  ${fgRgb(...accent)}${item.value}${RESET}`;
        detail = '';
        detailLen = 0;
      }
      break;
    }

    case 'text': {
      let displayValue: string;
      if (state.editingField === item.id) {
        const rendered = state.textInput.render(accent);
        displayValue = rendered.text;
      } else {
        displayValue = `${fgRgb(220, 220, 220)}${item.value ?? ''}${RESET}`;
      }
      label = `${fgRgb(140, 140, 140)}${item.label}:${RESET} ${displayValue}`;
      detail = item.description && state.editingField !== item.id ? `${fgRgb(120, 120, 120)}${item.description}${RESET}` : '';
      detailLen = (item.description && state.editingField !== item.id) ? item.description.length : 0;
      break;
    }

    case 'display':
      label = `${fgRgb(140, 140, 140)}${item.label}:${RESET} ${fgRgb(220, 220, 220)}${item.description ?? item.value ?? ''}${RESET}`;
      detail = '';
      detailLen = 0;
      break;

    case 'json':
      label = `${fgRgb(140, 140, 140)}${item.label}${RESET}`;
      detail = `${fgRgb(120, 120, 120)}{...}${RESET}`;
      detailLen = 5;
      break;

    default:
      label = item.label;
      detail = '';
      detailLen = 0;
  }

  const labelVisibleLen = stripAnsi(label).length;
  const gap = Math.max(2, maxContentWidth - prefixLen - labelVisibleLen - detailLen);

  if (isSelected) {
    const bgAccent = dimColor(accent, 0.08);
    const bg = `${bgRgb(bgAccent[0], bgAccent[1], bgAccent[2])}`;
    const totalContent = `${prefix}${label}${' '.repeat(gap)}${detail}`;
    const visLen = stripAnsi(totalContent).length;
    const remaining = Math.max(0, maxContentWidth - visLen + 2);
    return `${bg}${prefix}${label}${' '.repeat(gap)}${detail}${' '.repeat(remaining)}${RESET}`;
  }

  const totalContent = `${prefix}${label}${' '.repeat(gap)}${detail}`;
  const visLen = stripAnsi(totalContent).length;
  const remaining = Math.max(0, maxContentWidth - visLen + 2);
  return `${totalContent}${' '.repeat(remaining)}`;
}

export { renderDualPanel } from './rendering-detail.js';

/** Renders the help overlay. */
export function renderHelp(state: RenderState): void {
  const accent = state.themeColors.accentStops[0];
  const dimAccent = dimColor(accent, 0.3);
  const boxWidth = Math.min(state.screen.width - 8, 60);
  const startRow = 2;
  const startCol = 4;

  const helpItems = [
    ['workspace', 'workspace access mode'],
    ['budget', 'spending limit for session'],
    ['model', 'LLM model to use'],
    ['providers', 'available AI providers'],
    ['MCP servers', 'connected tool servers'],
    ['deny paths', 'forbidden file patterns'],
    ['nodes', 'distributed node config'],
    ['theme', 'color theme'],
  ];

  const headerText = ' HELP ';
  const headerGrad = gradientText(headerText, state.themeColors.accentStops);
  const topDashes = '─'.repeat(Math.max(0, boxWidth - headerText.length - 3));
  state.screen.writeAt(startRow, startCol,
    `${fgRgb(...accent)}┌─${RESET}${headerGrad}${fgRgb(...accent)}${topDashes}┐${RESET}`);

  state.screen.writeAt(startRow + 1, startCol,
    `${fgRgb(...dimAccent)}│${RESET}${' '.repeat(boxWidth - 2)}${fgRgb(...dimAccent)}│${RESET}`);

  for (let i = 0; i < helpItems.length; i++) {
    const [itemLabel, desc] = helpItems[i];
    const row = startRow + 2 + i;
    const content = `  ${fgRgb(220, 220, 220)}${itemLabel.padEnd(14)}${RESET}${fgRgb(140, 140, 140)}- ${desc}${RESET}`;
    const padLen = Math.max(0, boxWidth - 2 - itemLabel.padEnd(14).length - 2 - desc.length);
    state.screen.writeAt(row, startCol,
      `${fgRgb(...dimAccent)}│${RESET}${content}${' '.repeat(padLen)}${fgRgb(...dimAccent)}│${RESET}`);
  }

  const bottomRow = startRow + 2 + helpItems.length;
  state.screen.writeAt(bottomRow, startCol,
    `${fgRgb(...dimAccent)}│${RESET}${' '.repeat(boxWidth - 2)}${fgRgb(...dimAccent)}│${RESET}`);
  state.screen.writeAt(bottomRow + 1, startCol,
    `${fgRgb(...accent)}└${'─'.repeat(boxWidth - 2)}┘${RESET}`);
}

function getCurrentPanel(state: RenderState): MenuPanel | undefined {
  const id = state.panelStack[state.panelStack.length - 1];
  return id ? state.panels.get(id) : undefined;
}

function getFooterHints(panel: MenuPanel, state: RenderState): string {
  const accent = state.themeColors.accentStops[0];
  const filtered = state.getFilteredItems(panel);
  const hasToggles = filtered.some(i => i.type === 'toggle');
  const hasSubmenus = filtered.some(i => i.type === 'submenu');

  let hints = `   ${fgRgb(...accent)}[↑↓]${RESET} ${fgRgb(140, 140, 140)}navigate${RESET}`;

  if (hasSubmenus) {
    hints += `  ${fgRgb(...accent)}[Enter]${RESET} ${fgRgb(140, 140, 140)}open${RESET}`;
  } else {
    hints += `  ${fgRgb(...accent)}[Enter]${RESET} ${fgRgb(140, 140, 140)}edit${RESET}`;
  }

  if (hasToggles) {
    hints += `  ${fgRgb(...accent)}[Space]${RESET} ${fgRgb(140, 140, 140)}toggle${RESET}`;
  }

  if (panel.parent) {
    hints += `  ${fgRgb(...accent)}[Esc]${RESET} ${fgRgb(140, 140, 140)}back${RESET}`;
  } else {
    hints += `  ${fgRgb(...accent)}[q]${RESET} ${fgRgb(140, 140, 140)}close${RESET}`;
  }

  return hints;
}

function formatLegacyValue(item: LegacyMenuItemDef, config: SessionMenuConfig): string {
  const val = config[item.configKey];
  if (Array.isArray(val)) {
    if (item.configKey === 'mcpServers') {
      return `${val.length} loaded`;
    }
    return val.join(', ');
  }
  return String(val);
}

function getLegacyHint(item: LegacyMenuItemDef, config: SessionMenuConfig): string {
  switch (item.configKey) {
    case 'providers':
      return `via ${config.providers[0] ?? 'anthropic'}  avail: anthropic, openai, ollama`;
    case 'budget':
      return 'warn at 80%, freeze at limit';
    case 'mcpServers':
      return `(${config.mcpServers.join(', ')})`;
    case 'workspace':
      return 'src/, tests/, docs/';
    case 'denyPaths':
      return '';
    default:
      return '';
  }
}
