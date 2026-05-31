import { ConfigPane, registerSchema } from '../../tui/index.js';
import { UserConfig } from '../../config/index.js';

export function registerDisplaySchemas(pane: ConfigPane): void {
  const cfg = UserConfig.instance();
  const d = cfg.settings.display;
  registerSchema(pane, 'display', {
    id: 'display',
    title: 'Display',
    fields: [
      { key: 'setting', label: 'Setting', width: 22, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 14, detailType: 'text' },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'theme', status: 'active', cells: { setting: 'Theme', value: d.theme } },
      { id: 'showThinking', status: 'active', cells: { setting: 'Show Thinking', value: d.showThinking ? 'on' : 'off' } },
      { id: 'showToolCalls', status: 'active', cells: { setting: 'Show Tool Calls', value: d.showToolCalls ? 'on' : 'off' } },
      { id: 'compact', status: 'active', cells: { setting: 'Compact Mode', value: d.compact ? 'on' : 'off' } },
      { id: 'showAgentHeader', status: 'active', cells: { setting: 'Show Agent Header', value: UserConfig.instance().settings.session.showAgentHeader ? 'on' : 'off', type: 'toggle', description: 'Show agent name/timestamp header (off = minimal, no header)' } },
      { id: 'timestamps', status: 'active', cells: { setting: 'Timestamps', value: d.timestamps ? 'on' : 'off' } },
      { id: 'syntaxHighlighting', status: 'active', cells: { setting: 'Syntax Highlighting', value: d.syntaxHighlighting ? 'on' : 'off' } },
      { id: 'maxOutputLines', status: 'active', cells: { setting: 'Max Output Lines', value: String(d.maxOutputLines) } },
      { id: 'renderInterval', status: 'active', cells: { setting: 'Render Interval (ms)', value: String(d.renderInterval) } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });

  pane.registerDetailConfig('display', (row) => {
    const rowType = row.cells['type'] || 'text';
    const cellVal = row.cells['value'];
    const rowDesc = row.cells['description'] || '';
    const isToggle = rowType === 'toggle';
    const value = isToggle
      ? (cellVal === 'on' ? true : false)
      : (cellVal ?? '');
    return {
      fields: [
        { key: 'setting', label: 'Setting', type: 'readonly', value: row.cells['setting'] ?? '' },
        { key: 'value', label: 'Value', type: isToggle ? 'toggle' : 'text', value, description: rowDesc },
      ],
    };
  });

  registerSchema(pane, 'display.font', {
    id: 'display.font',
    title: 'Font & Accessibility',
    fields: [
      { key: 'setting', label: 'Setting', width: 18, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 14, detailType: 'text' },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'size', status: 'active', cells: { setting: 'Font Size', value: String(d.fontSize) } },
      { id: 'family', status: 'active', cells: { setting: 'Font Family', value: d.fontFamily } },
      { id: 'weight', status: 'active', cells: { setting: 'Font Weight', value: d.fontWeight } },
      { id: 'lineHeight', status: 'active', cells: { setting: 'Line Height', value: String(d.lineHeight) } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });
}
