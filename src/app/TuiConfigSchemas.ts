import { ConfigPane } from '../tui/index.js';
import { registerSchedulerSchemas } from './config/SchedulerSchemas.js';
import { registerMcpSchemas } from './config/McpSchemas.js';
import { registerProviderSchemas } from './config/ProviderSchemas.js';

/** Register all TUI config panel schemas for a given pane ID.
 * @param {ConfigPane} pane - The ConfigPane instance to register schemas on.
 * @param {string} paneId - Identifier of the config panel (e.g., 'config', 'settings', 'scheduler', 'mcp', 'providers').
 * @param {(target: string) => void} onNavigate - Callback invoked when navigating to a submenu target.
 * @param {() => Array<{ name: string; config: any }> | undefined} [getMcpConfigs] - Optional callback to retrieve current MCP server configs.
 */
export function registerConfigPanelSchemas(
  pane: ConfigPane,
  paneId: string,
  onNavigate: (target: string) => void,
  getMcpConfigs?: () => Array<{ name: string; config: any }> | undefined,
): void {
  if (paneId === 'config') {
    const configPanel = { id: 'config', title: 'Configuration', items: [
      { id: '@settings', label: 'Settings', description: 'Session, context, workspace, agents, display, outputs', type: 'submenu' as const },
      { id: '@scheduler', label: 'Scheduler', description: 'Workflow automation & scheduling', type: 'submenu' as const },
      { id: '@mcp', label: 'MCP Servers', description: 'Model Context Protocol connections', type: 'submenu' as const },
      { id: '@providers', label: 'Providers', description: 'AI provider connections & auth', type: 'submenu' as const },
    ]};
    pane['panels'].set('config', configPanel);
    pane.onNavigate = onNavigate;
    return;
  }

  if (paneId === 'settings') {
    const settingsPanel = { id: 'settings', title: 'Settings', items: [
      { id: '@session', label: 'Session', description: 'Budget, retries, streaming, timeouts', type: 'submenu' as const },
      { id: '@context', label: 'Context', description: 'Context window, compaction & snapshots', type: 'submenu' as const },
      { id: '@workspace', label: 'Workspace', description: 'File access, paths, encoding', type: 'submenu' as const },
      { id: '@display', label: 'Display', description: 'Theme, colors, verbosity', type: 'submenu' as const },
      { id: '@history', label: 'History', description: 'Nudge intervals & scribe triggers', type: 'submenu' as const },
    ]};
    pane['panels'].set('settings', settingsPanel);
    pane.onNavigate = onNavigate;
    return;
  }

  if (paneId === 'scheduler') registerSchedulerSchemas(pane);
  if (paneId === 'mcp') registerMcpSchemas(pane, getMcpConfigs?.() ?? []);
  if (paneId === 'providers') registerProviderSchemas(pane);
}
