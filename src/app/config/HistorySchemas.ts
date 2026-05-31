import { ConfigPane, registerSchema } from '../../tui/index.js';
import { UserConfig } from '../../config/index.js';

export function registerHistorySchemas(pane: ConfigPane): void {
  const cfg = UserConfig.instance();
  const s = cfg.settings.session;
  registerSchema(pane, 'history', {
    id: 'history',
    title: 'Nudges',
    fields: [
      { key: 'setting', label: 'Setting', width: 26, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 18, detailType: 'text' },
      { key: 'type', label: 'Type', width: 8, detailType: 'readonly' },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'recurringPromptEnabled', status: 'active', cells: { setting: 'Recurring Prompt', value: s.recurringPromptEnabled ? 'on' : 'off', type: 'toggle', description: 'Nudge from reminder_prompt.md (adjusts timing live)' } },
      { id: 'recurringPromptInterval', status: s.recurringPromptEnabled ? 'active' : 'inactive', cells: { setting: '  Prompt Interval (min)', value: `${s.recurringPromptInterval}m`, type: 'text', description: 'Minutes between recurring nudges' } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });

  pane.registerDetailConfig('history', (row) => {
    const cellVal = row.cells['value'] ?? '';
    const rowType = row.cells['type'] ?? 'text';
    const rowDesc = row.cells['description'] ?? '';
    const isToggle = rowType === 'toggle';
    const value = isToggle ? (cellVal === 'on' ? true : false) : (cellVal ?? '');
    return {
      fields: [
        { key: 'setting', label: 'Setting', type: 'readonly', value: row.cells['setting'] ?? '' },
        { key: 'value', label: 'Value', type: isToggle ? 'toggle' : 'text', value, description: rowDesc },
      ],
    };
  });
}
