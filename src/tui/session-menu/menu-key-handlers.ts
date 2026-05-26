import type { MenuInternals } from './menu-actions.js';
import type { MenuItem } from './types.js';
import { LEGACY_MENU_ITEMS } from './constants.js';
import { handleJsonEditorKey, validateConfig } from './input-handling.js';
import { activateItem, moveSelection, isFormPanel, openFormPanel, openJsonEditor } from './menu-actions.js';

/** Handle legacy edit key.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {string} key - Description of key.
 */
export function handleLegacyEditKey(ctx: MenuInternals, key: string): void {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey === 'enter') {
    ctx._editing = false;
    ctx._editingItem = null;
    ctx._editingField = null;
    ctx._editBuffer = '';
    return;
  }
  if (normalizedKey === 'escape') {
    ctx._editing = false;
    ctx._editingItem = null;
    ctx._editingField = null;
    ctx._editBuffer = '';
    if (ctx._preEditKey && ctx._preEditValue !== undefined) {
      (ctx._config as unknown as Record<string, unknown>)[ctx._preEditKey] = ctx._preEditValue;
    }
    return;
  }
  if (normalizedKey === 'backspace') {
    ctx._editBuffer = ctx._editBuffer.slice(0, -1);
    return;
  }
  const upperEditKey = normalizedKey.toUpperCase();
  const switchItem = LEGACY_MENU_ITEMS.find(i => i.key === upperEditKey);
  if (switchItem) {
    ctx._editing = true;
    ctx._editingItem = switchItem.label;
    ctx._preEditKey = switchItem.configKey;
    ctx._preEditValue = (ctx._config as unknown as Record<string, unknown>)[switchItem.configKey];
    if (Array.isArray(ctx._preEditValue)) {
      ctx._preEditValue = [...ctx._preEditValue];
    }
    ctx.emit('item:select', { item: switchItem.label });
    ctx.render();
    return;
  }
  if (key.length === 1 && key.charCodeAt(0) >= 32) {
    ctx._editBuffer += key;
  }
}

/** Handle field edit key.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {string} normalizedKey - Description of normalized key.
 * @param {string} key - Description of key.
 */
export function handleFieldEditKey(ctx: MenuInternals, normalizedKey: string, key: string): void {
  if (normalizedKey === 'enter' || normalizedKey === 'down' || normalizedKey === 'up') {
    const { value, changed } = ctx._textInput.deactivate();
    const panel = ctx.getCurrentPanel();
    if (panel) {
      const item = panel.items.find(i => i.id === ctx._editingField);
      if (item) {
        const oldValue = item.value;
        item.value = value;
        if (changed) ctx.emit('config:change', { path: item.id, value, oldValue });
      }
    }
    ctx._editingField = null;
    if (normalizedKey === 'down') { moveSelection(ctx, 1); }
    else if (normalizedKey === 'up') { moveSelection(ctx, -1); }
    else { ctx.render(); }
    return;
  }
  if (normalizedKey === 'escape') {
    const original = ctx._textInput.cancel();
    const panel = ctx.getCurrentPanel();
    if (panel) {
      const item = panel.items.find(i => i.id === ctx._editingField);
      if (item) item.value = original;
    }
    ctx._editingField = null;
    ctx.render();
    return;
  }
  const handled = ctx._textInput.handleKey(key);
  if (handled) {
    const panel = ctx.getCurrentPanel();
    if (panel) {
      const item = panel.items.find(i => i.id === ctx._editingField);
      if (item) item.value = ctx._textInput.value;
    }
    ctx.render();
  }
}

/** Handle choice edit key.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {string} normalizedKey - Description of normalized key.
 */
export function handleChoiceEditKey(ctx: MenuInternals, normalizedKey: string): void {
  const panel = ctx.getCurrentPanel();
  const item = panel ? ctx.getFilteredItems(panel)[ctx._selectedIndex] : null;
  if (item && item.type === 'choice' && item.choices && item.choices.length > 0) {
    if (normalizedKey === 'up' || normalizedKey === 'left' || normalizedKey === 'k' || normalizedKey === 'h') {
      const currentIdx = item.choices.findIndex(c => c.id === item.value || c.label === item.value);
      const prevIdx = (currentIdx - 1 + item.choices.length) % item.choices.length;
      item.value = item.choices[prevIdx].label;
      ctx.render();
      return;
    }
    if (normalizedKey === 'down' || normalizedKey === 'right' || normalizedKey === 'j' || normalizedKey === 'l') {
      const currentIdx = item.choices.findIndex(c => c.id === item.value || c.label === item.value);
      const nextIdx = (currentIdx + 1) % item.choices.length;
      item.value = item.choices[nextIdx].label;
      ctx.render();
      return;
    }
    if (normalizedKey === 'enter') {
      ctx._editingChoice = false;
      ctx.emit('config:change', { path: item.id, value: item.value, oldValue: ctx._choiceOriginalValue });
      ctx.render();
      return;
    }
    if (normalizedKey === 'escape') {
      item.value = ctx._choiceOriginalValue;
      ctx._editingChoice = false;
      ctx.render();
      return;
    }
  }
}

/** Handle navigation key.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {string} normalizedKey - Description of normalized key.
 * @param {string} key - Description of key.
 */
export function handleNavigationKey(ctx: MenuInternals, normalizedKey: string, key: string): void {
  if (normalizedKey === 'up' || normalizedKey === 'k') {
    moveSelection(ctx, -1);
    return;
  }
  if (normalizedKey === 'down' || normalizedKey === 'j') {
    moveSelection(ctx, 1);
    return;
  }

  if (normalizedKey === 'right' || normalizedKey === 'l') {
    const panel = ctx.getCurrentPanel();
    if (panel) {
      const item = ctx.getFilteredItems(panel)[ctx._selectedIndex];
      if (item && item.type === 'choice') {
        ctx._editingChoice = true;
        ctx._choiceOriginalValue = item.value ?? '';
        ctx.render();
        return;
      }
      if (item && item.type === 'json') {
        openJsonEditor(ctx, item.id);
        ctx.render();
        return;
      }
      if (item && item.type === 'submenu') {
        const targetPanel = ctx._panels.get(item.id);
        if (targetPanel && isFormPanel(targetPanel)) {
          openFormPanel(ctx, item.id);
          ctx.render();
          return;
        }
        if (targetPanel) {
          ctx.navigateTo(item.id);
          ctx.render();
          return;
        }
      }
    }
    return;
  }

  if (normalizedKey === 'left' || normalizedKey === 'h') {
    if (ctx._panelStack.length > 1) {
      ctx.navigateBack();
      ctx.render();
    }
    return;
  }

  if (normalizedKey === 'enter') {
    const panel = ctx.getCurrentPanel();
    if (panel && ctx._visible && !ctx._launched) {
      const item = ctx.getFilteredItems(panel)[ctx._selectedIndex];
      if (item) {
        if (item.type === 'choice') {
          ctx._editingChoice = true;
          ctx._choiceOriginalValue = item.value ?? '';
          ctx.render();
          return;
        }
        activateItem(ctx, item);
        return;
      }
    }
    const error = validateConfig(ctx._config);
    if (error) throw new Error(error);
    ctx._launched = true;
    ctx.screen.clear();
    ctx.screen.write(2, 4, '✓ Launching ready');
    ctx.emit('menu:complete', { config: ctx.getConfig() });
    return;
  }

  if (normalizedKey === 'space') {
    const panel = ctx.getCurrentPanel();
    if (panel) {
      const item = ctx.getFilteredItems(panel)[ctx._selectedIndex];
      if (item && item.type === 'toggle') {
        item.value = !item.value;
        ctx.emit('config:change', { path: item.id, value: item.value, oldValue: !item.value });
        ctx.render();
      }
    }
    return;
  }

  if (normalizedKey === 'escape') {
    if (ctx._editingField) {
      ctx._textInput.cancel();
      ctx._editingField = null;
      ctx.render();
    } else if (ctx._panelStack.length > 1) {
      ctx.navigateBack();
      ctx.render();
    } else {
      ctx.hide();
    }
    return;
  }

  if (normalizedKey === 'q' && !ctx._editingField) {
    ctx.hide();
    return;
  }

  if (normalizedKey === '?') {
    ctx.showHelp();
    return;
  }

  const upperKey = normalizedKey.toUpperCase();
  const itemDef = LEGACY_MENU_ITEMS.find(i => i.key === upperKey);
  if (itemDef) {
    ctx._editing = true;
    ctx._editingItem = itemDef.label;
    ctx._preEditKey = itemDef.configKey;
    ctx._preEditValue = (ctx._config as unknown as Record<string, unknown>)[itemDef.configKey];
    if (Array.isArray(ctx._preEditValue)) {
      ctx._preEditValue = [...ctx._preEditValue];
    }
    ctx.emit('item:select', { item: itemDef.label });
    ctx.render();
    return;
  }
}

/** Handle detail key.
 * @param {MenuInternals} ctx - Description of ctx.
 * @param {string} normalizedKey - Description of normalized key.
 * @param {string} rawKey - Description of raw key.
 */
export function handleDetailKey(ctx: MenuInternals, normalizedKey: string, rawKey: string): void {
  if (normalizedKey === 'escape') {
    ctx.closeDetailPanel();
    return;
  }

  if (normalizedKey === 'left' || normalizedKey === 'h') {
    if (ctx._detailFocused) {
      ctx._detailFocused = false;
      ctx.render();
    } else {
      ctx.closeDetailPanel();
    }
    return;
  }

  if (normalizedKey === 'right' || normalizedKey === 'l') {
    ctx._detailFocused = true;
    ctx.render();
    return;
  }

  if (!ctx._detailFocused) {
    if (normalizedKey === 'up' || normalizedKey === 'k') {
      moveSelection(ctx, -1);
    } else if (normalizedKey === 'down' || normalizedKey === 'j') {
      moveSelection(ctx, 1);
    } else if (normalizedKey === 'enter') {
      const panel = ctx.getCurrentPanel();
      if (panel) {
        const item = ctx.getFilteredItems(panel)[ctx._selectedIndex];
        if (item) activateItem(ctx, item);
      }
    }
    return;
  }

  if (ctx._detailMode === 'json') {
    handleJsonEditorKeyPress(ctx, normalizedKey, rawKey);
  } else if (ctx._detailMode === 'form') {
    handleFormKey(ctx, normalizedKey, rawKey);
  }
}

function handleJsonEditorKeyPress(ctx: MenuInternals, normalizedKey: string, rawKey: string): void {
  const result = handleJsonEditorKey(normalizedKey, rawKey, ctx._jsonBuffer, ctx._jsonCursorRow, ctx._jsonCursorCol);
  if (result) {
    ctx._jsonBuffer = result.buffer;
    ctx._jsonCursorRow = result.cursorRow;
    ctx._jsonCursorCol = result.cursorCol;
    if (result.saved) {
      saveJsonEditor(ctx);
      return;
    }
  }
  ctx.render();
}

function saveJsonEditor(ctx: MenuInternals): void {
  try {
    const jsonText = ctx._jsonBuffer.join('\n');
    JSON.parse(jsonText);
    ctx.emit('json:save', { section: ctx._jsonSection, content: jsonText });
    ctx.closeDetailPanel();
  } catch {
    ctx.render();
  }
}

function handleFormKey(ctx: MenuInternals, normalizedKey: string, rawKey: string): void {
  const formPanel = ctx._detailPanelId ? ctx._panels.get(ctx._detailPanelId) : null;
  if (!formPanel) return;

  if (normalizedKey === 'up') {
    ctx._detailSelectedIndex = Math.max(0, ctx._detailSelectedIndex - 1);
  } else if (normalizedKey === 'down') {
    ctx._detailSelectedIndex = Math.min(formPanel.items.length - 1, ctx._detailSelectedIndex + 1);
  } else if (normalizedKey === 'enter') {
    const field = formPanel.items[ctx._detailSelectedIndex];
    if (field) {
      if (field.label.startsWith('✓')) {
        const fields: Record<string, any> = {};
        for (const i of formPanel.items) {
          if (i.type === 'text' || i.type === 'toggle' || i.type === 'choice') {
            fields[i.id] = i.value;
          }
        }
        const savePath = field.id;
        ctx.closeDetailPanel();
        ctx.emit('config:save', { path: savePath, fields });
        return;
      } else if (field.type === 'text') {
        ctx._editingField = field.id;
        ctx._textInput.activate(String(field.value ?? ''));
      } else if (field.type === 'toggle') {
        field.value = !field.value;
      } else if (field.type === 'choice' && field.choices) {
        const idx = field.choices.findIndex(c => c.id === field.value || c.label === field.value);
        const next = (idx + 1) % field.choices.length;
        field.value = field.choices[next].label;
      }
    }
  } else if (ctx._editingField) {
    const handled = ctx._textInput.handleKey(rawKey);
    if (handled) {
      const field = formPanel.items.find(f => f.id === ctx._editingField);
      if (field) field.value = ctx._textInput.value;
    }
  }
  ctx.render();
}
