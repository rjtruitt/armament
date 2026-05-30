/**
 * Interactive config pane rendered in the main content area.
 * Supports: hierarchical menu navigation, CRM-style list views with
 * sortable columns, row selection, inline search/filter, detail split,
 * and bulk actions.
 */

/** A menu item for panel-based navigation (config submenus, etc.). */
export interface MenuItem {
  id: string;
  label?: string;
  type?: 'submenu' | 'toggle' | 'choice' | 'text' | 'action' | 'display' | 'json';
  value?: any;
  hidden?: boolean;
  readonly?: boolean;
  description?: string;
  choices?: Array<{ id: string; label: string }>;
}

/** A navigation panel containing menu items. */
export interface MenuPanel {
  id: string;
  title?: string;
  items: MenuItem[];
}

import {
  handleListKey,
  handleDetailKey,
  handleFilterKey,
  handleEditKey,
  type ConfigPaneContext,
} from './ConfigPaneRenderer.js';

/** Column definition for list view mode. */
export interface ListColumn {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
}

/** A row in a list view. */
export interface ListRow {
  id: string;
  cells: Record<string, string>;
  status?: 'active' | 'inactive' | 'error' | 'warning' | 'pending';
  selected?: boolean;
  badge?: string;
}

/** List view configuration attached to a panel. */
export interface ListView {
  columns: ListColumn[];
  rows: ListRow[];
  sortColumn?: string;
  sortAsc?: boolean;
  filter?: string;
  multiSelect?: boolean;
}

/** Actions available in a list view. */
export interface ListAction {
  key: string;
  label: string;
  bulk?: boolean;
}

/** A field in the detail form view. */
export interface DetailField {
  key: string;
  label: string;
  type: 'text' | 'toggle' | 'choice' | 'readonly' | 'action';
  value?: string | boolean;
  choices?: { id: string; label: string }[];
  description?: string;
}

/** Detail view configuration for a row. */
export interface DetailConfig {
  fields: DetailField[];
  actions?: { key: string; label: string; danger?: boolean }[];
}

/**
 * Config pane state interface.
 */
export interface ConfigPaneState {
  panelStack: string[];
  cursor: number;
  editing: string | null;
  editBuffer: string;
  listScroll: number;
  filterActive: boolean;
  filterText: string;
  detailOpen: boolean;
  detailCursor: number;
  detailEditing: boolean;
  detailEditBuffer: string;
  selectedRows: Set<string>;
}

/**
 * PaneViewMode type definition.
 */
export type PaneViewMode = 'menu' | 'list' | 'detail';

/**
 * Config pane class.
 */
export class ConfigPane {
  private panels: Map<string, MenuPanel>;
  private state: ConfigPaneState;
  private _dirty = false;
  private _listViews: Map<string, ListView> = new Map();
  private _listActions: Map<string, ListAction[]> = new Map();
  private _defaultActions: Map<string, string> = new Map();

  /** Get the default action key for the current panel (e.g. 'm' for models). */
  getDefaultAction(): string | undefined {
    return this._defaultActions.get(this.currentPanelId);
  }

  private _detailConfigs: Map<string, (row: ListRow) => DetailConfig> = new Map();
  /**
   * onNavigate property.
   */
  onNavigate: ((target: string) => void) | null = null;
  /**
   * onChange property.
   */
  onChange: ((path: string, value: any, row?: ListRow) => void) | null = null;
  /**
   * onAction property.
   */
  onAction: ((action: string, rowId: string, panelId: string) => void) | null = null;

  constructor(panels: Map<string, MenuPanel>, rootPanel: string) {
    this.panels = panels;
    this.state = {
      panelStack: [rootPanel],
      cursor: 0,
      editing: null,
      editBuffer: '',
      listScroll: 0,
      filterActive: false,
      filterText: '',
      detailOpen: false,
      detailCursor: 0,
      detailEditing: false,
      detailEditBuffer: '',
      selectedRows: new Set(),
    };
  }

  /**
   * Gets the current panel id.
   */
  get currentPanelId(): string {
    return this.state.panelStack[this.state.panelStack.length - 1];
  }

  /**
   * Gets the current panel.
   */
  get currentPanel(): MenuPanel | undefined {
    return this.panels.get(this.currentPanelId);
  }

  /**
   * Gets the view mode.
   */
  get viewMode(): PaneViewMode {
    if (this.state.detailOpen) return 'detail';
    if (this._listViews.has(this.currentPanelId)) return 'list';
    return 'menu';
  }

  /**
   * Gets the list view.
   */
  get listView(): ListView | undefined {
    return this._listViews.get(this.currentPanelId);
  }

  /**
   * Gets the list actions.
   */
  get listActions(): ListAction[] {
    return this._listActions.get(this.currentPanelId) ?? [];
  }

  /**
   * Gets the visible items.
   */
  get visibleItems(): MenuItem[] {
    const panel = this.currentPanel;
    if (!panel) return [];
    return panel.items.filter(item => !item.hidden);
  }

  /**
   * Gets the filtered rows.
   */
  get filteredRows(): ListRow[] {
    const lv = this.listView;
    if (!lv) return [];
    let rows = lv.rows;
    if (this.state.filterText) {
      const term = this.state.filterText.toLowerCase();
      rows = rows.filter(r =>
        Object.values(r.cells).some(v => v.toLowerCase().includes(term))
      );
    }
    if (lv.sortColumn) {
      const col = lv.sortColumn;
      const asc = lv.sortAsc !== false;
      rows = [...rows].sort((a, b) => {
        const av = a.cells[col] ?? '';
        const bv = b.cells[col] ?? '';
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return asc ? cmp : -cmp;
      });
    }
    return rows;
  }

  /**
   * Gets the cursor.
   */
  get cursor(): number { return this.state.cursor; }
  /**
   * Gets the editing.
   */
  get editing(): string | null { return this.state.editing; }
  /**
   * Gets the edit buffer.
   */
  get editBuffer(): string { return this.state.editBuffer; }
  /**
   * Gets the depth.
   */
  get depth(): number { return this.state.panelStack.length; }
  /**
   * Gets the dirty.
   */
  get dirty(): boolean { return this._dirty; }
  /**
   * Gets the list scroll.
   */
  get listScroll(): number { return this.state.listScroll; }
  /**
   * Gets the filter active.
   */
  get filterActive(): boolean { return this.state.filterActive; }
  /**
   * Gets the filter text.
   */
  get filterText(): string { return this.state.filterText; }
  /**
   * Gets the detail open.
   */
  get detailOpen(): boolean { return this.state.detailOpen; }
  /**
   * Gets the detail cursor.
   */
  get detailCursor(): number { return this.state.detailCursor; }
  /**
   * Gets the detail editing.
   */
  get detailEditing(): boolean { return this.state.detailEditing; }
  /**
   * Gets the detail edit buffer.
   */
  get detailEditBuffer(): string { return this.state.detailEditBuffer; }
  /**
   * Gets the selected rows.
   */
  get selectedRows(): Set<string> { return this.state.selectedRows; }

  /**
   * Gets the breadcrumb.
   */
  get breadcrumb(): string[] {
    return this.state.panelStack.map(id => {
      const panel = this.panels.get(id);
      return panel?.title ?? id;
    });
  }

  /**
   * Register list view.
   */
  registerListView(panelId: string, listView: ListView, actions?: ListAction[], defaultAction?: string): void {
    this._listViews.set(panelId, listView);
    if (actions) this._listActions.set(panelId, actions);
    if (defaultAction) this._defaultActions.set(panelId, defaultAction);
  }

  /**
   * Register detail config.
   */
  registerDetailConfig(panelId: string, configFn: (row: ListRow) => DetailConfig): void {
    this._detailConfigs.set(panelId, configFn);
  }

  /**
   * Gets the detail config.
   */
  getDetailConfig(): DetailConfig | undefined {
    const fn = this._detailConfigs.get(this.currentPanelId);
    if (!fn) return undefined;
    const rows = this.filteredRows;
    const row = rows[this.state.cursor];
    if (!row) return undefined;
    return fn(row);
  }

  /**
   * Toggle sort.
   */
  toggleSort(columnKey: string): void {
    const lv = this.listView;
    if (!lv) return;
    if (lv.sortColumn === columnKey) {
      lv.sortAsc = !lv.sortAsc;
    } else {
      lv.sortColumn = columnKey;
      lv.sortAsc = true;
    }
  }

  /**
   * Toggle row select.
   */
  toggleRowSelect(rowId: string): void {
    if (this.state.selectedRows.has(rowId)) {
      this.state.selectedRows.delete(rowId);
    } else {
      this.state.selectedRows.add(rowId);
    }
  }

  /**
   * Select all.
   */
  selectAll(): void {
    const rows = this.filteredRows;
    for (const r of rows) this.state.selectedRows.add(r.id);
  }

  /**
   * Clear selection.
   */
  clearSelection(): void {
    this.state.selectedRows.clear();
  }

  /**
   * Handle key.
   */
  handleKey(key: string): boolean {
    const ctx = this.buildContext();

    if (this.state.filterActive) {
      return handleFilterKey(ctx, key);
    }
    if (this.state.editing) {
      return handleEditKey(ctx, key);
    }

    const mode = this.viewMode;
    if (mode === 'list') return handleListKey(ctx, key);
    if (mode === 'detail') return handleDetailKey(ctx, key);
    return this.handleMenuKey(key);
  }

  private handleMenuKey(key: string): boolean {
    const items = this.visibleItems;

    switch (key) {
      case 'up':
        this.state.cursor = this.state.cursor > 0 ? this.state.cursor - 1 : items.length - 1;
        return true;

      case 'down':
        this.state.cursor = this.state.cursor < items.length - 1 ? this.state.cursor + 1 : 0;
        return true;

      case 'enter': {
        const item = items[this.state.cursor];
        if (!item || item.readonly) return true;
        if (item.type === 'submenu') {
          const targetPanel = this.panels.get(item.id);
          if (targetPanel) {
            this.state.panelStack.push(item.id);
            this.state.cursor = 0;
            this.state.listScroll = 0;
          } else if (this.onNavigate) {
            this.onNavigate(item.id);
          }
          return true;
        }
        if (item.type === 'toggle') {
          item.value = !item.value;
          this._dirty = true;
          return true;
        }
        if (item.type === 'choice') {
          if (item.choices && item.choices.length > 0) {
            const currentIdx = item.choices.findIndex(c => c.id === item.value);
            const nextIdx = (currentIdx + 1) % item.choices.length;
            item.value = item.choices[nextIdx].id;
            this._dirty = true;
          }
          return true;
        }
        if (item.type === 'text') {
          this.state.editing = item.id;
          this.state.editBuffer = String(item.value ?? '');
          return true;
        }
        return true;
      }

      case 'back':
        if (this.state.panelStack.length > 1) {
          this.state.panelStack.pop();
          this.state.cursor = 0;
          this.state.listScroll = 0;
          return true;
        }
        return false;

      case 'e':
        this.state.detailOpen = true;
        this.state.detailCursor = 0;
        this.state.detailEditing = false;
        return true;

      default:
        return false;
    }
  }

  /** Set visible height so scroll logic can page properly. */
  setViewportHeight(h: number): void {
    if (this.state.cursor >= this.state.listScroll + h) {
      this.state.listScroll = this.state.cursor - h + 1;
    }
  }

  /** Navigate to a sub-panel as a child of the current root. */
  navigateToSubPanel(parentId: string, subPanelId: string): void {
    this.state.panelStack = [parentId, subPanelId];
    this.state.cursor = 0;
    this.state.listScroll = 0;
    this.state.detailOpen = false;
  }

  /** Push a panel onto the navigation stack. */
  pushPanel(panelId: string): void {
    this.state.panelStack.push(panelId);
    this.state.cursor = 0;
    this.state.listScroll = 0;
  }

  /** Pop the top panel from the navigation stack. */
  popPanel(): void {
    if (this.state.panelStack.length > 1) {
      this.state.panelStack.pop();
      this.state.cursor = 0;
      this.state.listScroll = 0;
    }
  }

  /** Reset the navigation stack to a single root panel. */
  resetPanelStack(panelId: string): void {
    this.state.panelStack = [panelId];
    this.state.cursor = 0;
    this.state.listScroll = 0;
  }

  /** Get the top panel's ID from the stack. */
  get panelStackTop(): string {
    return this.state.panelStack[this.state.panelStack.length - 1];
  }

  /**
   * Sets the cursor.
   */
  setCursor(n: number): void { this.state.cursor = n; }

  /**
   * Sets the list scroll.
   */
  setListScroll(n: number): void { this.state.listScroll = n; }

  /**
   * Open detail.
   */
  openDetail(): void {
    this.state.detailOpen = true;
    this.state.detailCursor = 0;
  }

  /**
   * Close detail.
   */
  closeDetail(): void {
    this.state.detailOpen = false;
    this.state.detailCursor = 0;
  }

  /**
   * Sets the detail cursor.
   */
  setDetailCursor(n: number): void { this.state.detailCursor = n; }

  /** Register a menu panel definition. */
  registerPanel(panelId: string, panel: MenuPanel): void {
    this.panels.set(panelId, panel);
  }

  /** Unregister a menu panel definition. */
  unregisterPanel(panelId: string): void {
    this.panels.delete(panelId);
  }

  /** Check if a panel is registered. */
  hasPanel(panelId: string): boolean {
    return this.panels.has(panelId);
  }

  private buildContext(): ConfigPaneContext {
    return {
      state: this.state,
      currentPanelId: this.currentPanelId,
      visibleItems: this.visibleItems,
      filteredRows: this.filteredRows,
      listView: this.listView,
      listActions: this.listActions,
      defaultAction: this._defaultActions.get(this.currentPanelId),
      getDetailConfig: () => this.getDetailConfig(),
      panels: this.panels,
      onNavigate: this.onNavigate,
      onChange: this.onChange,
      onAction: this.onAction,
      markDirty: () => { this._dirty = true; },
      toggleSort: (col: string) => this.toggleSort(col),
      toggleRowSelect: (id: string) => this.toggleRowSelect(id),
      selectAll: () => this.selectAll(),
      clearSelection: () => this.clearSelection(),
    };
  }
}
