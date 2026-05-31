import { ConfigPane, registerSchema } from '../../tui/index.js';
import { UserConfig } from '../../config/index.js';

export function registerWorkspaceSchemas(pane: ConfigPane): void {
  const cfg = UserConfig.instance();
  const w = cfg.settings.workspace;
  registerSchema(pane, 'workspace', {
    id: 'workspace',
    title: 'Workspace',
    fields: [
      { key: 'setting', label: 'Setting', width: 22, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 20, detailType: 'text' },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'mode', status: 'active', cells: { setting: 'Mode', value: w.mode } },
      { id: 'allowedPaths', status: 'active', cells: { setting: 'Allowed Paths', value: w.allowedPaths.join(', ') } },
      { id: 'denyPaths', status: 'active', cells: { setting: 'Deny Paths', value: w.denyPaths.join(', ') } },
      { id: 'gitAutoCommit', status: 'active', cells: { setting: 'Git Auto-commit', value: w.gitAutoCommit ? 'on' : 'off' } },
      { id: 'fileWatcher', status: 'active', cells: { setting: 'File Watcher', value: w.fileWatcher ? 'on' : 'off' } },
      { id: 'maxFileSize', status: 'active', cells: { setting: 'Max File Size (KB)', value: String(w.maxFileSize) } },
      { id: 'encoding', status: 'active', cells: { setting: 'Encoding', value: w.encoding } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });
}
