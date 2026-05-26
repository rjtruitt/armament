/**
 * Default values and static configuration for the SessionMenu.
 */

import type { SessionMenuConfig, LegacyMenuItemDef } from './types.js';

/** Legacy menu items.
 */
export const LEGACY_MENU_ITEMS: LegacyMenuItemDef[] = [
  { key: 'W', label: 'workspace', configKey: 'workspace' },
  { key: 'B', label: 'budget', configKey: 'budget' },
  { key: 'M', label: 'model', configKey: 'model' },
  { key: 'P', label: 'providers', configKey: 'providers' },
  { key: 'S', label: 'MCP servers', configKey: 'mcpServers' },
  { key: 'D', label: 'deny paths', configKey: 'denyPaths' },
  { key: 'N', label: 'nodes', configKey: 'nodes' },
  { key: 'T', label: 'theme', configKey: 'theme' },
];

/** Default config.
 */
export const DEFAULT_CONFIG: SessionMenuConfig = {
  workspace: 'allow all',
  budget: '$5.00',
  model: '',
  providers: [],
  providerConfigs: [],
  mcpServers: [],
  denyPaths: ['.env', 'secrets/', 'node_modules/'],
  nodes: 'local only',
  theme: 'red',
};
