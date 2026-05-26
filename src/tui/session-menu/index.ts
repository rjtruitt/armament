/**
 * Session menu module - hierarchical floating TUI configuration system.
 */

export type {
  ProviderInfo,
  SessionMenuConfig,
  McpServerConfig,
  SessionMenuOptions,
  MenuItemType,
  MenuItem,
  MenuPanel,
  LegacyMenuItemDef,
  RGB,
} from './types.js';

export { DEFAULT_CONFIG, LEGACY_MENU_ITEMS } from './constants.js';
export { getThemeColors, dimColor, sineGradientChar, sineGradientHLine, gradientText } from './theme-utils.js';
export { registerAllPanels } from './panels/index.js';
export { renderFloatingPanel, renderLegacyPanel, renderHelp, renderMenuItem, type RenderState } from './rendering.js';
export { handleJsonEditorKey, resolveJsonContent, validateBudget, validateWorkspace, validateConfig } from './input-handling.js';
export {
  type MenuInternals,
  handleJsonClick,
  handleMenuClick,
  handleMenuInput,
  activateItem,
  moveSelection,
  calculatePanelHeight,
  getMaxVisibleItems,
  isFormPanel,
  openFormPanel,
  openJsonEditor,
} from './menu-actions.js';
export {
  handleLegacyEditKey,
  handleFieldEditKey,
  handleChoiceEditKey,
  handleNavigationKey,
  handleDetailKey,
} from './menu-key-handlers.js';
