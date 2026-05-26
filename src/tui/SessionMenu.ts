import { ScreenBuffer } from './ScreenBuffer.js';
import { TextInput } from './widgets/TextInput.js';
import {
  type ProviderInfo,
  type SessionMenuConfig,
  type McpServerConfig,
  type SessionMenuOptions,
  type MenuItemType,
  type MenuItem,
  type MenuPanel,
  type MenuInternals,
  DEFAULT_CONFIG,
  getThemeColors,
  registerAllPanels,
  renderFloatingPanel,
  renderLegacyPanel,
  renderHelp,
  type RenderState,
  handleLegacyEditKey as _handleLegacyEditKey,
  handleFieldEditKey as _handleFieldEditKey,
  handleChoiceEditKey as _handleChoiceEditKey,
  handleNavigationKey as _handleNavigationKey,
  handleDetailKey as _handleDetailKey,
  handleMenuClick as _handleMenuClick,
  handleMenuInput as _handleMenuInput,
  calculatePanelHeight as _calculatePanelHeight,
  getMaxVisibleItems as _getMaxVisibleItems,
} from './session-menu/index.js';

export type {
  ProviderInfo,
  SessionMenuConfig,
  McpServerConfig,
  SessionMenuOptions,
  MenuItemType,
  MenuItem,
  MenuPanel,
};

/** Class representing SessionMenu. */
export class SessionMenu implements MenuInternals {
  /**
   * _panels property.
   */
  _panels: Map<string, MenuPanel> = new Map();
  /**
   * _panelStack property.
   */
  _panelStack: string[] = [];
  /**
   * _selectedIndex property.
   */
  _selectedIndex: number = 0;
  /**
   * _scrollOffset property.
   */
  _scrollOffset: number = 0;
  /**
   * _editingField property.
   */
  _editingField: string | null = null;
  /**
   * _editingChoice property.
   */
  _editingChoice: boolean = false;
  /**
   * _choiceOriginalValue property.
   */
  _choiceOriginalValue: string = '';
  /**
   * _textInput property.
   */
  _textInput: TextInput = new TextInput();
  /**
   * _editBuffer property.
   */
  _editBuffer: string = '';
  /**
   * _visible property.
   */
  _visible: boolean = false;
  /**
   * _detailMode property.
   */
  _detailMode: 'none' | 'form' | 'json' = 'none';
  /**
   * _detailPanelId property.
   */
  _detailPanelId: string | null = null;
  /**
   * _detailFocused property.
   */
  _detailFocused: boolean = false;
  /**
   * _detailSelectedIndex property.
   */
  _detailSelectedIndex: number = 0;
  /**
   * _jsonBuffer property.
   */
  _jsonBuffer: string[] = [];
  /**
   * _jsonCursorRow property.
   */
  _jsonCursorRow: number = 0;
  /**
   * _jsonCursorCol property.
   */
  _jsonCursorCol: number = 0;
  /**
   * _jsonSection property.
   */
  _jsonSection: string = '';
  /**
   * _config property.
   */
  _config: SessionMenuConfig;
  private _defaults: SessionMenuConfig;
  /**
   * _mcpConfigs property.
   */
  _mcpConfigs: McpServerConfig[] = [];
  /**
   * _editing property.
   */
  _editing = false;
  /**
   * _editingItem property.
   */
  _editingItem: string | null = null;
  private _helpVisible = false;
  /**
   * _launched property.
   */
  _launched = false;
  private _debugMode: boolean;
  /**
   * _modified property.
   */
  _modified = false;
  /**
   * _preEditKey property.
   */
  _preEditKey: keyof SessionMenuConfig | null = null;
  /**
   * _preEditValue property.
   */
  _preEditValue: any = undefined;
  /**
   * screen property.
   */
  screen: ScreenBuffer;
  private _theme: string;
  /**
   * _maxWidth property.
   */
  _maxWidth: number = 70;
  private listeners: Map<string, Array<(data?: any) => void>> = new Map();

  constructor(screen: ScreenBuffer, options: SessionMenuOptions = {}) {
    if (!screen) {
      throw new Error('ScreenBuffer is required');
    }
    this.screen = screen;
    this._debugMode = options.debug ?? false;
    this._theme = options.theme ?? DEFAULT_CONFIG.theme;

    this._defaults = { ...DEFAULT_CONFIG };
    const providerConfigs = options.providers ?? [];
    this._mcpConfigs = options.mcpConfigs ?? [];
    this._config = {
      workspace: options.workspace ?? DEFAULT_CONFIG.workspace,
      budget: options.budget ?? DEFAULT_CONFIG.budget,
      model: options.model ?? DEFAULT_CONFIG.model,
      providers: providerConfigs.map(p => p.type),
      providerConfigs,
      mcpServers: options.mcpServers ?? [...DEFAULT_CONFIG.mcpServers],
      denyPaths: options.denyPaths ?? [...DEFAULT_CONFIG.denyPaths],
      nodes: options.nodes ?? DEFAULT_CONFIG.nodes,
      theme: options.theme ?? DEFAULT_CONFIG.theme,
      mcpClientName: options.mcpClientName,
    };

    this.registerDefaultPanels();
  }

  /**
   * Show.
   */
  show(): void {
    if (this._debugMode) {
      this.emit('menu:complete', { config: this.getConfig() });
      return;
    }
    this._launched = false;
    this._visible = true;
    if (this._panelStack.length === 0) {
      this._panelStack = ['root'];
    }
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    this.emit('menu:show', {});
    this.render();
  }

  /**
   * Hide.
   */
  hide(): void {
    this._visible = false;
    this._panelStack = [];
    if (this._editingField) {
      this._textInput.cancel();
      this._editingField = null;
    }
    this._editBuffer = '';
    this.emit('menu:hide', {});
  }

  /**
   * Checks whether visible.
   */
  isVisible(): boolean { return this._visible; }

  /**
   * Gets the panels.
   */
  getPanels(): Map<string, MenuPanel> {
    return this._panels;
  }

  /**
   * Gets the current panel.
   */
  getCurrentPanel(): MenuPanel | undefined {
    const id = this._panelStack[this._panelStack.length - 1];
    return id ? this._panels.get(id) : undefined;
  }

  /**
   * Register panel.
   */
  registerPanel(panel: MenuPanel): void {
    this._panels.set(panel.id, panel);
  }

  /**
   * Navigate to.
   */
  navigateTo(panelId: string): void {
    if (this._panels.has(panelId)) {
      this._panelStack.push(panelId);
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      this.emit('menu:navigate', { panel: panelId });
    }
  }

  /**
   * Navigate back.
   */
  navigateBack(): void {
    if (this._panelStack.length > 1) {
      this._panelStack.pop();
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      this.emit('menu:navigate', { panel: this._panelStack[this._panelStack.length - 1] });
    } else {
      this.hide();
    }
  }

  /**
   * Gets the value.
   */
  getValue(path: string): any {
    const keys = path.split('.');
    let obj: any = this._config;
    for (const key of keys) {
      if (obj == null) return undefined;
      obj = obj[key];
    }
    return obj;
  }

  /**
   * Sets the value.
   */
  setValue(path: string, value: any): void {
    const keys = path.split('.');
    if (keys.length === 1) {
      const oldValue = (this._config as unknown as Record<string, unknown>)[keys[0]];
      (this._config as unknown as Record<string, unknown>)[keys[0]] = value;
      this._modified = true;
      this.emit('config:change', { path, value, oldValue });
    }
  }

  /**
   * Gets the config.
   */
  getConfig(): SessionMenuConfig {
    return {
      ...this._config,
      providers: [...this._config.providers],
      mcpServers: [...this._config.mcpServers],
      denyPaths: [...this._config.denyPaths],
    };
  }

  /**
   * Gets the defaults.
   */
  getDefaults(): SessionMenuConfig {
    return {
      ...this._defaults,
      providers: [...this._defaults.providers],
      mcpServers: [...this._defaults.mcpServers],
      denyPaths: [...this._defaults.denyPaths],
    };
  }

  /**
   * Update config.
   */
  updateConfig(partial: Partial<SessionMenuConfig>): void {
    for (const [key, value] of Object.entries(partial)) {
      (this._config as unknown as Record<string, unknown>)[key] = value;
      this._modified = true;
      this.emit('config:change', { key, value });
    }
  }

  /**
   * Checks whether modified.
   */
  isModified(): boolean {
    return this._modified;
  }

  /**
   * Reset to defaults.
   */
  resetToDefaults(): void {
    this._config = {
      ...this._defaults,
      providers: [...this._defaults.providers],
      mcpServers: [...this._defaults.mcpServers],
      denyPaths: [...this._defaults.denyPaths],
    };
    this._modified = false;
  }

  /**
   * Checks whether editing.
   */
  isEditing(): boolean {
    return this._editing;
  }

  /**
   * Gets the editing item.
   */
  getEditingItem(): string | null {
    return this._editingItem;
  }

  /**
   * Checks whether help visible.
   */
  isHelpVisible(): boolean {
    return this._helpVisible;
  }

  /**
   * Handle key.
   */
  handleKey(key: string): void {
    if (this._launched) {
      throw new Error('Already launched');
    }

    if (this._helpVisible) {
      this._helpVisible = false;
      this.render();
      return;
    }

    if (this._editing) {
      _handleLegacyEditKey(this, key);
      return;
    }

    const normalizedKey = key.toLowerCase();

    if (this._detailMode !== 'none') {
      _handleDetailKey(this, normalizedKey, key);
      return;
    }

    if (this._editingField) {
      _handleFieldEditKey(this, normalizedKey, key);
      return;
    }

    if (this._editingChoice) {
      _handleChoiceEditKey(this, normalizedKey);
      return;
    }

    _handleNavigationKey(this, normalizedKey, key);
  }

  /**
   * Handle click.
   */
  handleClick(row: number, col: number): void {
    _handleMenuClick(this, row, col);
  }

  /**
   * Handle input.
   */
  handleInput(text: string): void {
    _handleMenuInput(this, text);
  }

  /**
   * Show help.
   */
  showHelp(): void {
    this._helpVisible = true;
    this.screen.clear();
    renderHelp(this.buildRenderState());
    this.emit('help:show', {});
  }

  /**
   * Launch.
   */
  launch(): SessionMenuConfig {
    if (this._debugMode) {
      return this.getDefaults();
    }
    this._launched = true;
    this.emit('menu:complete', { config: this.getConfig() });
    return this.getConfig();
  }

  /**
   * On.
   */
  on(event: string, handler: (data?: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  /**
   * Emit.
   */
  emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(data);
    }
  }

  /**
   * Render.
   */
  render(): void {
    if (this._debugMode) return;

    this.screen.clear();

    if (this._visible && this._panelStack.length > 0) {
      renderFloatingPanel(this.buildRenderState());
      return;
    }

    renderLegacyPanel(this.buildRenderState());
  }

  /**
   * Rebuild panels.
   */
  rebuildPanels(updatedConfig?: Partial<SessionMenuConfig>): void {
    if (updatedConfig) {
      Object.assign(this._config, updatedConfig);
    }
    this._panels.clear();
    this.registerDefaultPanels();
    this._panelStack = this._panelStack.filter(id => this._panels.has(id));
    if (this._panelStack.length === 0) {
      this._panelStack = ['root'];
    }
    const panel = this.getCurrentPanel();
    if (panel) {
      const filtered = this.getFilteredItems(panel);
      if (this._selectedIndex >= filtered.length) {
        this._selectedIndex = Math.max(0, filtered.length - 1);
      }
    }
    if (this._visible) this.render();
  }

  /**
   * Close detail panel.
   */
  closeDetailPanel(): void {
    this._detailMode = 'none';
    this._detailPanelId = null;
    this._detailFocused = false;
    this._detailSelectedIndex = 0;
    this._jsonBuffer = [];
    this.render();
  }

  /**
   * Checks whether detail open.
   */
  isDetailOpen(): boolean { return this._detailMode !== 'none'; }

  /**
   * Calculate panel height.
   */
  calculatePanelHeight(panel: MenuPanel): number { return _calculatePanelHeight(this, panel); }

  /**
   * Gets the filtered items.
   */
  getFilteredItems(panel: MenuPanel): MenuItem[] {
    return panel.items.filter(item => {
      if (item.hidden) return false;
      if (!item.showWhen) return true;
      const { field, values } = item.showWhen;
      const targetItem = panel.items.find(i => i.id.endsWith(`.${field}`) || i.id === field);
      if (!targetItem) return true;
      const current = String(targetItem.value ?? '');
      return values.includes(current);
    });
  }

  private registerDefaultPanels(): void {
    registerAllPanels(this._panels, this._config, this._mcpConfigs);
  }

  private buildRenderState(): RenderState {
    return {
      screen: this.screen,
      config: this._config,
      theme: this._theme,
      themeColors: getThemeColors(this._theme),
      panels: this._panels,
      panelStack: this._panelStack,
      selectedIndex: this._selectedIndex,
      scrollOffset: this._scrollOffset,
      editingField: this._editingField,
      editingChoice: this._editingChoice,
      editing: this._editing,
      editingItem: this._editingItem,
      textInput: this._textInput,
      detailMode: this._detailMode,
      detailPanelId: this._detailPanelId,
      detailFocused: this._detailFocused,
      detailSelectedIndex: this._detailSelectedIndex,
      jsonBuffer: this._jsonBuffer,
      jsonCursorRow: this._jsonCursorRow,
      jsonCursorCol: this._jsonCursorCol,
      maxWidth: this._maxWidth,
      getFilteredItems: (panel) => this.getFilteredItems(panel),
      getMaxVisibleItems: () => _getMaxVisibleItems(this),
      calculatePanelHeight: (panel) => _calculatePanelHeight(this, panel),
    };
  }
}
