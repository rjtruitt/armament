/** Aggregates all panel registration into a single entry point. */

import type { MenuPanel, SessionMenuConfig, McpServerConfig } from '../types.js';
import { registerProviderPanels, registerModelPanels } from './providers.js';
import { registerMcpPanels } from './mcp.js';
import { registerWorkspacePanels } from './workspace.js';
import { registerAgentPanels } from './agents.js';
import { registerDisplayPanels } from './display.js';
import { registerSessionPanels } from './session.js';
import { registerSchedulerPanels } from './scheduler.js';
import { registerOutputPanels } from './outputs.js';

/** Registers the root panel and all sub-panels based on the current config. */
export function registerAllPanels(
  panels: Map<string, MenuPanel>,
  config: SessionMenuConfig,
  mcpConfigs: McpServerConfig[],
): void {
  panels.set('root', {
    id: 'root',
    title: 'COMMAND CENTER',
    items: [
      { id: 'providers', label: 'Providers', description: 'Configure AI providers & API keys', type: 'submenu' },
      { id: 'models', label: 'Models', description: 'Select default model & fallbacks', type: 'submenu' },
      { id: 'mcp', label: 'MCP Servers', description: 'Connected servers & tools', type: 'submenu' },
      { id: 'scheduler', label: 'Scheduler', description: 'Workflows, pollers, triggers & cron', type: 'submenu' },
      { id: 'workspace', label: 'Workspace', description: 'File access & deny paths', type: 'submenu' },
      { id: 'agents', label: 'Agents', description: 'Distributed nodes & agent config', type: 'submenu' },
      { id: 'context', label: 'Context', description: 'Context window, compaction & snapshots', type: 'submenu' },
      { id: 'outputs', label: 'Outputs', description: 'Slack, SMS, email & tool chains', type: 'submenu' },
      { id: 'display', label: 'Display', description: 'Theme, compact mode, verbosity', type: 'submenu' },
      { id: 'session', label: 'Session', description: 'Budget, retries, streaming', type: 'submenu' },
    ],
  });

  registerProviderPanels(panels, config);
  registerModelPanels(panels, config);
  registerMcpPanels(panels, config, mcpConfigs);
  registerWorkspacePanels(panels, config);
  registerAgentPanels(panels);
  registerDisplayPanels(panels, config);
  registerSessionPanels(panels, config);
  registerSchedulerPanels(panels);
  registerOutputPanels(panels);
}
