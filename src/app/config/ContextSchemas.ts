import { ConfigPane, registerSchema } from '../../tui/index.js';
import { UserConfig } from '../../config/index.js';

export function registerContextSchemas(pane: ConfigPane): void {
  const cfg = UserConfig.instance();
  const c = cfg.settings.context;
  registerSchema(pane, 'context', {
    id: 'context',
    title: 'Context Window',
    fields: [
      { key: 'setting', label: 'Setting', width: 24, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 14, detailType: 'text' },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'maxTokens', status: 'active', cells: { setting: 'Max Tokens', value: String(c.maxTokens) } },
      { id: 'compactThreshold', status: 'active', cells: { setting: 'Compact Threshold', value: String(c.compactThreshold) } },
      { id: 'recentMessages', status: 'active', cells: { setting: 'Recent Messages to Keep', value: String(c.recentMessages) } },
      { id: 'maxSnapshots', status: 'active', cells: { setting: 'Max Snapshots', value: String(c.maxSnapshots) } },
      { id: 'strategy', status: 'active', cells: { setting: 'Compaction Strategy', value: c.strategy } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });
}
