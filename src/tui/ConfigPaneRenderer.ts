/**
 * Key handler implementations for ConfigPane view modes.
 * Extracted from ConfigPane to keep files under 400 lines.
 */

import type { MenuItem } from './ConfigPane.js';
import type { ConfigPaneState, DetailConfig, DetailField, ListAction, ListView, ListRow } from './ConfigPane.js';

/** Shared context passed to handler functions from ConfigPane. */
export interface ConfigPaneContext {
  state: ConfigPaneState;
  currentPanelId: string;
  visibleItems: MenuItem[];
  filteredRows: ListRow[];
  listView: ListView | undefined;
  listActions: ListAction[];
  defaultAction?: string;
  getDetailConfig(): DetailConfig | undefined;
  panels: Map<string, { title?: string; items: MenuItem[] }>;
  onNavigate: ((target: string) => void) | null;
  onChange: ((path: string, value: any, row?: ListRow) => void) | null;
  onAction: ((action: string, rowId: string, panelId: string) => void) | null;
  markDirty(): void;
  toggleSort(columnKey: string): void;
  toggleRowSelect(rowId: string): void;
  selectAll(): void;
  clearSelection(): void;
}

/** Handle key events in list view mode. Returns true if consumed. */
export function handleListKey(ctx: ConfigPaneContext, key: string): boolean {
  const rows = ctx.filteredRows;

  switch (key) {
    case 'up':
      ctx.state.cursor = ctx.state.cursor > 0 ? ctx.state.cursor - 1 : rows.length - 1;
      ensureVisible(ctx);
      return true;

    case 'down':
      ctx.state.cursor = ctx.state.cursor < rows.length - 1 ? ctx.state.cursor + 1 : 0;
      ensureVisible(ctx);
      return true;

    case 'enter':
      if (rows[ctx.state.cursor]?.status === 'inactive') return true;
      if (ctx.defaultAction && rows[ctx.state.cursor]) {
        const defAct = ctx.listActions.find(a => a.key === ctx.defaultAction);
        if (defAct) {
          ctx.onAction?.(defAct.key, rows[ctx.state.cursor].id, ctx.currentPanelId);
          return true;
        }
      }
      ctx.state.detailOpen = true;
      ctx.state.detailCursor = 0;
      ctx.state.detailEditing = false;
      return true;

    case 'back':
      if (ctx.state.panelStack.length > 1) {
        ctx.state.panelStack.pop();
        ctx.state.cursor = 0;
        ctx.state.listScroll = 0;
        return true;
      }
      return false;

    case ' ':
      if (rows[ctx.state.cursor]) {
        ctx.toggleRowSelect(rows[ctx.state.cursor].id);
      }
      return true;

    case 'e':
      if (rows[ctx.state.cursor]?.status === 'inactive') return true;
      ctx.state.detailOpen = true;
      ctx.state.detailCursor = 0;
      ctx.state.detailEditing = false;
      return true;

    case 'a': {
      const aAction = ctx.listActions.find(a => a.key === 'a');
      if (aAction && rows[ctx.state.cursor]) {
        ctx.onAction?.(aAction.key, rows[ctx.state.cursor].id, ctx.currentPanelId);
      } else {
        ctx.selectAll();
      }
      return true;
    }

    case 'c': {
      const cAction = ctx.listActions.find(a => a.key === 'c');
      if (cAction && rows[ctx.state.cursor] && rows[ctx.state.cursor].status !== 'inactive') {
        ctx.onAction?.(cAction.key, rows[ctx.state.cursor].id, ctx.currentPanelId);
      } else {
        ctx.clearSelection();
      }
      return true;
    }

    default: {
      const lv = ctx.listView;
      if (lv && key === 's') {
        const sortable = lv.columns.filter(c => c.sortable !== false);
        if (sortable.length > 0) {
          const currentIdx = sortable.findIndex(c => c.key === lv.sortColumn);
          const nextCol = sortable[(currentIdx + 1) % sortable.length];
          ctx.toggleSort(nextCol.key);
        }
        return true;
      }
      const actions = ctx.listActions;
      if (actions.length > 0) {
        const action = actions.find(a => a.key === key);
        // Allow actions even on 'inactive' rows (e.g. pressing 'a' to add when list is empty)
        if (action) {
          const row = rows[ctx.state.cursor];
          if (row && row.status !== 'inactive') {
            ctx.onAction?.(action.key, row.id, ctx.currentPanelId);
          } else if (action.key === 'a') {
            // 'add' works even on inactive/empty rows
            ctx.onAction?.(action.key, '', ctx.currentPanelId);
          }
          return true;
        }
      }
      return false;
    }
  }
}

/** Handle key events in detail view mode. Returns true if consumed. */
export function handleDetailKey(ctx: ConfigPaneContext, key: string): boolean {
  const config = ctx.getDetailConfig();
  if (!config) {
    if (key === 'back' || key === 'escape') { ctx.state.detailOpen = false; return true; }
    return true;
  }

  const fields = config.fields.filter(f => f.type !== 'readonly');
  const allItems = [...fields, ...(config.actions ?? []).map(a => ({ ...a, type: 'action' as const }))];
  const itemCount = allItems.length;

  const activeRow = getActiveDetailRow(ctx);

  if (ctx.state.detailEditing) {
    if (key === 'enter' || key === 'escape') {
      if (key === 'enter') {
        const field = fields[ctx.state.detailCursor];
        if (field && field.type === 'text') {
          field.value = ctx.state.detailEditBuffer;
          ctx.markDirty();
          emitChange(ctx, field.key, field.value, activeRow);
        }
      }
      ctx.state.detailEditing = false;
      ctx.state.detailEditBuffer = '';
      return true;
    }
    if (key === 'backspace') {
      ctx.state.detailEditBuffer = ctx.state.detailEditBuffer.slice(0, -1);
      return true;
    }
    if (key.length === 1 && key.charCodeAt(0) >= 32) {
      ctx.state.detailEditBuffer += key;
      return true;
    }
    return true;
  }

  switch (key) {
    case 'back':
    case 'escape':
      ctx.state.detailOpen = false;
      ctx.state.detailCursor = 0;
      return true;

    case 'up':
      ctx.state.detailCursor = ctx.state.detailCursor > 0 ? ctx.state.detailCursor - 1 : itemCount - 1;
      return true;

    case 'down':
      ctx.state.detailCursor = ctx.state.detailCursor < itemCount - 1 ? ctx.state.detailCursor + 1 : 0;
      return true;

    case 'arrowleft':
    case 'arrowright': {
      const item = allItems[ctx.state.detailCursor];
      if (!item) return true;
      if (item.type === 'toggle') {
        const f = item as DetailField;
        f.value = !f.value;
        if (activeRow && f.key) activeRow.cells[f.key] = f.value ? 'on' : 'off';
        ctx.markDirty();
        emitChange(ctx, f.key, f.value, activeRow);
        return true;
      }
      if (item.type === 'choice') {
        const f = item as DetailField;
        if (f.choices && f.choices.length > 0) {
          const idx = f.choices.findIndex(c => c.id === f.value);
          const delta = key === 'arrowright' ? 1 : -1;
          const next = (idx + delta + f.choices.length) % f.choices.length;
          f.value = f.choices[next].id;
          if (activeRow && f.key) activeRow.cells[f.key] = f.value;
          ctx.markDirty();
          emitChange(ctx, f.key, f.value, activeRow);
        }
        return true;
      }
      return true;
    }

    case 'enter': {
      const item = allItems[ctx.state.detailCursor];
      if (!item) return true;
      if (item.type === 'toggle' || item.type === 'choice') {
        // Toggle/choice use arrow keys only. Enter is a no-op to avoid
        // the confusing "some things change on Enter, others on arrows" UX.
        return true;
      }
      if (item.type === 'text') {
        ctx.state.detailEditing = true;
        ctx.state.detailEditBuffer = String((item as DetailField).value ?? '');
        return true;
      }
      // Handle action buttons (e.g. [delete], [save]) in detail view
      if (item.type === 'action') {
        ctx.onAction?.((item as any).key, activeRow?.id ?? '', ctx.currentPanelId);
        return true;
      }
      return true;
    }

    default:
      return true;
  }
}

/** Handle key events when the inline filter is active. Returns true if consumed. */
export function handleFilterKey(ctx: ConfigPaneContext, key: string): boolean {
  if (key === 'enter' || key === 'escape') {
    ctx.state.filterActive = false;
    if (key === 'escape') ctx.state.filterText = '';
    ctx.state.cursor = 0;
    ctx.state.listScroll = 0;
    return true;
  }
  if (key === 'backspace') {
    ctx.state.filterText = ctx.state.filterText.slice(0, -1);
    return true;
  }
  if (key.length === 1 && key.charCodeAt(0) >= 32) {
    ctx.state.filterText += key;
    ctx.state.cursor = 0;
    return true;
  }
  return true;
}

/** Handle key events when editing a text field inline. Returns true if consumed. */
export function handleEditKey(ctx: ConfigPaneContext, key: string): boolean {
  if (key === 'enter' || key === 'escape') {
    if (key === 'enter') {
      const item = findItem(ctx, ctx.state.editing!);
      if (item) {
        item.value = ctx.state.editBuffer;
        ctx.markDirty();
      }
    }
    ctx.state.editing = null;
    ctx.state.editBuffer = '';
    return true;
  }
  if (key === 'backspace') {
    ctx.state.editBuffer = ctx.state.editBuffer.slice(0, -1);
    return true;
  }
  if (key.length === 1 && key.charCodeAt(0) >= 32) {
    ctx.state.editBuffer += key;
    return true;
  }
  return true;
}

function getActiveDetailRow(ctx: ConfigPaneContext): ListRow | undefined {
  const lv = ctx.listView;
  if (!lv) return undefined;
  return ctx.filteredRows[ctx.state.cursor];
}

function emitChange(ctx: ConfigPaneContext, fieldKey: string, value: any, row?: ListRow): void {
  if (!ctx.onChange) return;
  const panelId = ctx.currentPanelId;
  const rowId = row?.id ?? '';
  const path = rowId ? `${panelId}.${rowId}.${fieldKey}` : `${panelId}.${fieldKey}`;
  ctx.onChange(path, value, row);
}

function ensureVisible(ctx: ConfigPaneContext): void {
  if (ctx.state.cursor < ctx.state.listScroll) {
    ctx.state.listScroll = ctx.state.cursor;
  }
}

function findItem(ctx: ConfigPaneContext, id: string): MenuItem | undefined {
  for (const panel of ctx.panels.values()) {
    const item = panel.items.find(i => i.id === id);
    if (item) return item;
  }
  return undefined;
}
