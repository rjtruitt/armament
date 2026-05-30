/**
 * Terminal UI library — a self-contained set of primitives for building
 * interactive full-screen terminal applications.
 *
 * Core rendering: ScreenBuffer, ScrollBuffer, TextEngine
 * Layout: LayoutManager, FocusManager
 * Input: InputBar, MouseHandler, CommandPalette
 * Display: Sidebar, StatusBar, ChatRenderer
 * Widgets: ApprovalWidget, TextInput, ChoiceSelector, Toggle, NumberInput, JsonEditor, MenuBox
 */

export { ScreenBuffer, type Cell, type Region, type DirtyCell } from './ScreenBuffer.js';
export { ScrollBuffer, type ScrollBufferConfig } from './ScrollBuffer.js';

export {
  visibleWidth,
  wrapText,
  sliceText,
  truncate,
  padRight,
  padCenter,
  stringWidth,
  wrapAnsi,
  sliceAnsi,
} from './TextEngine.js';

export { LayoutManager, type LayoutRegionDef, type LayoutOptions } from './LayoutManager.js';
export {
  FocusManager,
  type FocusableRegion,
  type FocusManagerOptions,
  type FocusChangeEvent,
} from './FocusManager.js';

export { InputBar, type InputBarRegion, type InputBarOptions } from './InputBar.js';
export {
  MouseHandler,
  type MouseEvent,
  type ClickableRegion,
  type MouseHandlerOptions,
} from './MouseHandler.js';
export {
  CommandPalette,
  ALL_COMMANDS,
  type CommandDef,
  type CommandPaletteOptions,
} from './CommandPalette.js';

export {
  Sidebar,
  type SidebarRegion,
  type SidebarTheme,
  type SidebarStats,
  type ChannelInfo,
  type ChannelChild,
  type ModelStats,
  type ProviderEntry,
} from './Sidebar.js';
export {
  StatusBar,
  type StatusBarRegion,
  type StatusBarValues,
  type StatusBarData,
} from './StatusBar.js';
export {
  createIrcChatRenderer,
  type ChatMessage,
  type ToolCallBlock,
  type AgentContextHeader,
  type SwitchingIndicator,
  type ChatLine,
} from './ChatRenderer.js';

export {
  ApprovalWidget,
  type ApprovalRequest,
  type ApprovalWidgetOptions,
  type ApprovalInputType,
} from './widgets/ApprovalWidget.js';
export { TextInput, type TextInputOptions } from './widgets/TextInput.js';
export { ChoiceSelector, type Choice, type ChoiceSelectorOptions } from './widgets/ChoiceSelector.js';
export { Toggle } from './widgets/Toggle.js';
export { NumberInput, type NumberInputOptions } from './widgets/NumberInput.js';
export { JsonEditor } from './widgets/JsonEditor.js';
export { MenuBox, type MenuBoxOptions } from './widgets/MenuBox.js';

export {
  ConfigPane,
  type ListColumn,
  type ListRow,
  type ListView,
  type ListAction,
  type DetailField,
  type DetailConfig,
  type ConfigPaneState,
  type PaneViewMode,
} from './ConfigPane.js';
export {
  registerSchema,
  schemaToListView,
  schemaToListActions,
  schemaToDetailConfig,
  type ConfigSchema,
  type SchemaField,
  type SchemaAction,
  type SchemaTarget,
} from './ConfigSchema.js';

export { renderMarkdown } from './MarkdownRenderer.js';

export { LoadingAnimator, type AnimationSpeed } from './LoadingAnimator.js';
export { PhaseManager, type Phase } from './PhaseManager.js';
