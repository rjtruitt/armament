import type { TextInput } from '../widgets/TextInput.js';
import type { ScreenBuffer } from '../ScreenBuffer.js';
import type { MenuItem, MenuPanel, SessionMenuConfig, McpServerConfig } from './types.js';
import { LEGACY_MENU_ITEMS } from './constants.js';
import { resolveJsonContent, validateBudget, validateWorkspace } from './input-handling.js';

/** Interface for MenuInternals.
 * @property {Map<string, MenuPanel>} _panels - Description of _panels.
 * @property {string} _panelStack - Description of _panelStack.
 * @property {number} _selectedIndex - Description of _selectedIndex.
 * @property {number} _scrollOffset - Description of _scrollOffset.
 * @property {string} _editingField - Description of _editingField.
 * @property {boolean} _editingChoice - Description of _editingChoice.
 * @property {string} _choiceOriginalValue - Description of _choiceOriginalValue.
 * @property {TextInput} _textInput - Description of _textInput.
 * @property ... and 19 more properties.
 */
export interface MenuInternals {
  _panels: Map<string, MenuPanel>;
  _panelStack: string[];
  _selectedIndex: number;
  _scrollOffset: number;
  _editingField: string | null;
  _editingChoice: boolean;
  _choiceOriginalValue: string;
  _textInput: TextInput;
  _editBuffer: string;
  _editing: boolean;
  _editingItem: string | null;
  _preEditKey: keyof SessionMenuConfig | null;
  _preEditValue: any;
  _detailMode: 'none' | 'form' | 'json';
  _detailPanelId: string | null;
  _detailFocused: boolean;
  _detailSelectedIndex: number;
  _jsonBuffer: string[];
  _jsonCursorRow: number;
  _jsonCursorCol: number;
  _jsonSection: string;
  _config: SessionMenuConfig;
  _mcpConfigs: McpServerConfig[];
  _maxWidth: number;
  _launched: boolean;
  _visible: boolean;
  _modified: boolean;
  screen: ScreenBuffer;

  emit(event: string, data: any): void;
  render(): void;
  getCurrentPanel(): MenuPanel | undefined;
  getFilteredItems(panel: MenuPanel): MenuItem[];
  navigateTo(panelId: string): void;
  navigateBack(): void;
  hide(): void;
  closeDetailPanel(): void;
  showHelp(): void;
  getConfig(): SessionMenuConfig;
}

/** Handle json click.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {number} row - Description of row.
 * @param {number} col - Description of col.
 */
export function handleJsonClick(ctx: MenuInternals, row: number, col: number): void {
  const totalWidth = Math.min(ctx.screen.width - 4, ctx.screen.width > 140 ? 160 : 120);
  const gap = 2;
  const menuWidth = Math.min(Math.floor(totalWidth * 0.35), 36);
  const detailWidth = totalWidth - menuWidth - gap;
  const totalBlockWidth = menuWidth + gap + detailWidth;
  const baseCol = Math.floor((ctx.screen.width - totalBlockWidth) / 2);
  const detailCol = baseCol + menuWidth + gap;

  const panel = ctx.getCurrentPanel();
  if (!panel) return;
  const menuH = calculatePanelHeight(ctx, panel);
  const detailH = Math.min(ctx._jsonBuffer.length + 6, ctx.screen.height - 4);
  const maxH = Math.max(menuH, detailH);
  const startRow = Math.max(1, Math.floor((ctx.screen.height - maxH) / 2));

  const jsonContentStart = startRow + 2;
  const maxJsonLines = maxH - 7;
  if (col >= detailCol && row >= jsonContentStart && row < jsonContentStart + maxJsonLines) {
    ctx._detailFocused = true;
    const scrollStart = Math.max(0, ctx._jsonCursorRow - maxJsonLines + 2);
    const clickedLine = scrollStart + (row - jsonContentStart);
    if (clickedLine < ctx._jsonBuffer.length) {
      ctx._jsonCursorRow = clickedLine;
      const textStartCol = detailCol + 6;
      ctx._jsonCursorCol = Math.min(
        Math.max(0, col - textStartCol),
        ctx._jsonBuffer[clickedLine].length
      );
    }
    ctx.render();
    return;
  }

  if (col >= baseCol && col < baseCol + menuWidth) {
    ctx._detailFocused = false;
    ctx.render();
    return;
  }
}

/** Activate item.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {MenuItem} item - Description of item.
 */
export function activateItem(ctx: MenuInternals, item: MenuItem): void {
  switch (item.type) {
    case 'submenu': {
      const targetPanel = ctx._panels.get(item.id);
      if (targetPanel) {
        if (isFormPanel(targetPanel)) {
          openFormPanel(ctx, item.id);
        } else {
          ctx.navigateTo(item.id);
        }
        ctx.render();
      } else if (item.id.endsWith('.remove') || item.id.endsWith('.delete')) {
        ctx.emit('config:change', { path: item.id, value: null, oldValue: undefined });
        ctx.navigateBack();
        ctx.render();
      } else if (item.id.endsWith('.save')) {
        const panel = ctx.getCurrentPanel();
        const fields: Record<string, any> = {};
        if (panel) {
          for (const i of panel.items) {
            if (i.type === 'text' || i.type === 'toggle' || i.type === 'choice') {
              fields[i.id] = i.value;
            }
          }
        }
        const parentPanel = panel?.parent;
        const grandparent = parentPanel ? ctx._panels.get(parentPanel)?.parent : undefined;
        if (grandparent && ctx._panels.has(grandparent)) {
          const gpIdx = ctx._panelStack.lastIndexOf(grandparent);
          if (gpIdx >= 0) {
            ctx._panelStack = ctx._panelStack.slice(0, gpIdx + 1);
          } else {
            ctx._panelStack = ['root', grandparent];
          }
          ctx._selectedIndex = 0;
          ctx._scrollOffset = 0;
        } else {
          ctx.navigateBack();
        }
        ctx.emit('config:save', { path: item.id, fields });
        ctx.render();
      }
      break;
    }
    case 'toggle':
      item.value = !item.value;
      ctx.emit('config:change', { path: item.id, value: item.value, oldValue: !item.value });
      ctx.render();
      break;
    case 'choice':
      if (item.choices && item.choices.length > 0) {
        const currentIdx = item.choices.findIndex(c => c.id === item.value || c.label === item.value);
        const nextIdx = (currentIdx + 1) % item.choices.length;
        const oldValue = item.value;
        item.value = item.choices[nextIdx].label;
        ctx.emit('config:change', { path: item.id, value: item.value, oldValue });
        ctx.render();
      }
      break;
    case 'text':
      ctx._editingField = item.id;
      ctx._textInput.activate(String(item.value ?? ''));
      ctx.render();
      break;
    case 'display':
      break;
    case 'json':
      openJsonEditor(ctx, item.id);
      break;
  }
}

/** Move selection.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {number} direction - Description of direction.
 */
export function moveSelection(ctx: MenuInternals, direction: number): void {
  const panel = ctx.getCurrentPanel();
  if (!panel) return;

  const filtered = ctx.getFilteredItems(panel);
  const newIndex = ctx._selectedIndex + direction;
  if (newIndex < 0) {
    ctx._selectedIndex = 0;
  } else if (newIndex >= filtered.length) {
    ctx._selectedIndex = filtered.length - 1;
  } else {
    ctx._selectedIndex = newIndex;
  }

  const visibleItems = Math.min(filtered.length, getMaxVisibleItems(ctx));
  if (ctx._selectedIndex < ctx._scrollOffset) {
    ctx._scrollOffset = ctx._selectedIndex;
  } else if (ctx._selectedIndex >= ctx._scrollOffset + visibleItems) {
    ctx._scrollOffset = ctx._selectedIndex - visibleItems + 1;
  }

  if (ctx._visible) {
    ctx.render();
  }
}

/** Calculate panel height.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {MenuPanel} panel - Description of panel.
 * @returns {number} - Description of return value.
 */
export function calculatePanelHeight(ctx: MenuInternals, panel: MenuPanel): number {
  const filtered = ctx.getFilteredItems(panel);
  let height = 2;
  if (panel.parent) {
    height += 2;
  }
  height += Math.min(filtered.length, getMaxVisibleItems(ctx));
  height += 3;

  if (filtered.length > getMaxVisibleItems(ctx)) {
    height += 2;
  }

  return Math.min(height, ctx.screen.height - 2);
}

/** Get max visible items.
 * @param {MenuInternals} ctx - Description of ctx.
 * @returns {number} - Description of return value.
 */
export function getMaxVisibleItems(ctx: MenuInternals): number {
  return Math.max(3, ctx.screen.height - 12);
}

/** Is form panel.
 * @param {MenuPanel} panel - Description of panel.
 * @returns {boolean} - Description of return value.
 */
export function isFormPanel(panel: MenuPanel): boolean {
  const hasTextFields = panel.items.some(i => i.type === 'text' || i.type === 'toggle' || i.type === 'choice');
  const hasSave = panel.items.some(i => i.label.startsWith('✓'));
  return hasTextFields && hasSave;
}

/** Open form panel.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {string} panelId - Description of panel id.
 */
export function openFormPanel(ctx: MenuInternals, panelId: string): void {
  ctx._detailMode = 'form';
  ctx._detailPanelId = panelId;
  ctx._detailFocused = true;
  ctx._detailSelectedIndex = 0;
}

/** Open json editor.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {string} itemId - Description of item id.
 */
export function openJsonEditor(ctx: MenuInternals, itemId: string): void {
  const { content, section } = resolveJsonContent(itemId, ctx._config, ctx._mcpConfigs);
  const formatted = JSON.stringify(content, null, 2);
  ctx._jsonBuffer = formatted.split('\n');
  ctx._jsonCursorRow = 0;
  ctx._jsonCursorCol = 0;
  ctx._jsonSection = section;
  ctx._detailMode = 'json';
  ctx._detailPanelId = itemId;
  ctx._detailFocused = true;
  ctx._detailSelectedIndex = 0;
}

/** Handle menu click.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {number} row - Description of row.
 * @param {number} col - Description of col.
 */
export function handleMenuClick(ctx: MenuInternals, row: number, col: number): void {
  if (!ctx._visible) return;

  if (ctx._detailMode === 'json') {
    handleJsonClick(ctx, row, col);
    return;
  }

  const panelWidth = Math.min(ctx._maxWidth, ctx.screen.width - 4);
  const panel = ctx.getCurrentPanel();
  if (!panel) return;

  const panelHeight = calculatePanelHeight(ctx, panel);
  const startCol = Math.floor((ctx.screen.width - panelWidth) / 2);
  const startRow = Math.floor((ctx.screen.height - panelHeight) / 2);

  if (col < startCol || col >= startCol + panelWidth) return;
  if (row < startRow || row >= startRow + panelHeight) return;

  const headerOffset = panel.parent ? 4 : 3;
  const itemRow = row - startRow - headerOffset;

  const filtered = ctx.getFilteredItems(panel);
  if (itemRow >= 0 && itemRow < filtered.length) {
    const adjustedIndex = itemRow + ctx._scrollOffset;
    if (adjustedIndex < filtered.length) {
      ctx._selectedIndex = adjustedIndex;
      activateItem(ctx, filtered[adjustedIndex]);
    }
  }
}

/** Handle menu input.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {string} text - Description of text.
 */
export function handleMenuInput(ctx: MenuInternals, text: string): void {
  if (!ctx._editing || !ctx._editingItem) return;

  const itemDef = LEGACY_MENU_ITEMS.find(i => i.label === ctx._editingItem);
  if (!itemDef) return;

  switch (itemDef.configKey) {
    case 'budget': {
      const error = validateBudget(text);
      if (error) {
        ctx.screen.write(20, 4, 'invalid budget format');
        throw new Error(error);
      }
      ctx._config.budget = text;
      ctx._modified = true;
      break;
    }
    case 'model':
      ctx._config.model = text;
      ctx._modified = true;
      break;
    case 'providers':
      ctx._config.providers = text.split(',').map(s => s.trim()).filter(Boolean);
      ctx._modified = true;
      break;
    case 'denyPaths':
      ctx._config.denyPaths = text.split(',').map(s => s.trim()).filter(Boolean);
      ctx._modified = true;
      break;
    case 'workspace': {
      const error = validateWorkspace(text);
      if (error) throw new Error(error);
      ctx._config.workspace = text;
      ctx._modified = true;
      break;
    }
    case 'mcpServers':
      ctx._config.mcpServers = text.split(',').map(s => s.trim()).filter(Boolean);
      ctx._modified = true;
      break;
    case 'nodes':
      ctx._config.nodes = text;
      ctx._modified = true;
      break;
    case 'theme':
      ctx._config.theme = text;
      ctx._modified = true;
      break;
  }
}
