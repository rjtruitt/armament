/** Core module: interfaces, event bus, agent/channel/command managers, plugins, logging, and health monitoring. */
export * from './interfaces/index.js';

export { EventBus } from './EventBus.js';
export { HookSystem } from './HookSystem.js';
export { AgentManager } from './AgentManager.js';
export { AgentController } from './AgentController.js';
export { ChannelManager } from './ChannelManager.js';
export { CommandHandler } from './CommandHandler.js';
export { ContextManager } from './ContextManager.js';
export { ArmaHome } from './ArmaHome.js';
export { BudgetManager } from './BudgetManager.js';
export { createPluginSystem, createScriptRegistry, createSDK, createConfigLoader } from './ExtensibilityPlugin.js';
export { logInfo, logError, logWarn, logDebug, flushLog } from './FileLogger.js';
export { createWatchdog, createDependencyGraph, createBottleneckDetector, createRateLimitCoordinator } from './HealthMonitor.js';
export { InputHandler } from './InputHandler.js';
export { createKeyboardNav } from './KeyboardNav.js';
export type { FocusTarget, FocusState, Binding } from './KeyboardNav.js';
export { KeyboardNavController } from './KeyboardNavController.js';
export { LoadingBarController } from './LoadingBarController.js';
export { NotificationChannel } from './NotificationChannel.js';
export { createServiceRegistry, createExtensionPoint } from './PluginRegistry.js';
export { createPromptSystem, createControlChannel } from './PromptSystem.js';
export { ScriptEngine } from './ScriptEngine.js';
export { createSessionConfigManager, createPermissionManager, createBudgetManager } from './SessionConfigManager.js';
export { createStatusBar } from './StatusBar.js';
export { BaseRepl } from './base/BaseRepl.js';
