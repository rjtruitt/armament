import { ConfigPane, registerSchema } from '../../tui/index.js';
import { UserConfig } from '../../config/index.js';

export function registerSessionSchemas(pane: ConfigPane): void {
  const cfg = UserConfig.instance();
  const s = cfg.settings.session;
  registerSchema(pane, 'session', {
    id: 'session',
    title: 'Session',
    fields: [
      { key: 'setting', label: 'Setting', width: 24, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 16, detailType: 'text' },
      { key: 'type', label: 'Type', width: 8, detailType: 'readonly' },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'streaming', status: 'active', cells: { setting: 'Streaming', value: s.streaming ? 'on' : 'off', type: 'toggle' } },
      { id: 'autoSave', status: 'active', cells: { setting: 'Auto-save', value: s.autoSave ? 'on' : 'off', type: 'toggle' } },
      { id: 'showThinkingInBuffer', status: 'active', cells: { setting: 'Show Thinking (buffer)', value: s.showThinkingInBuffer ? 'on' : 'off', type: 'toggle', description: 'Show thinking/reasoning line in chat buffer' } },
      { id: 'showThinkingOverlay', status: 'active', cells: { setting: 'Show Thinking (overlay)', value: s.showThinkingOverlay ? 'on' : 'off', type: 'toggle', description: 'Show scrolling thinking overlay in status line' } },
      { id: 'promptCaching', status: 'active', cells: { setting: 'Prompt Caching', value: s.promptCaching ? 'on' : 'off', type: 'toggle' } },
      { id: 'maxTurns', status: 'active', cells: { setting: 'Max Turns', value: String(s.maxTurns), type: 'number' } },
      { id: 'timeout', status: 'active', cells: { setting: 'Conversation Timeout', value: `${s.conversationTimeout}m`, type: 'text' } },
      { id: 'braveApiKey', status: 'active', cells: { setting: 'Brave API Key', value: cfg.getPath('web.braveApiKey') ?? '', type: 'text', description: 'API key for Brave search engine (set via web.braveApiKey in config)' } },
      { id: 'driftMaxSize', status: 'active', cells: { setting: 'Drift Max Size (MB)', value: String((cfg.getPath('drift.maxSizeBytes') as number ?? 50) / (1024 * 1024)), type: 'number', description: 'Max size of drift snapshot store in MB (oldest pruned first when exceeded). Default 50MB.' } },
      { id: 'summarizationModel', status: 'active', cells: { setting: 'Summary Model', value: cfg.getPath('web.summarizationModel') ?? '', type: 'text', description: 'Model to use for page summarization in deep_research (empty = use channel model)' } },
      { id: 'armadebug', status: 'active', cells: { setting: 'Arma Debug', value: s.armadebug ? 'on' : 'off', type: 'toggle', description: 'Inject full stack traces of errors into LLM context' } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });

  pane.registerDetailConfig('session', (row) => {
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

  registerSchema(pane, 'session.budget', {
    id: 'session.budget',
    title: 'Budget',
    fields: [
      { key: 'setting', label: 'Setting', width: 20, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 14, detailType: 'text' },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'enabled', status: 'active', cells: { setting: 'Enabled', value: s.budgetEnabled ? 'on' : 'off' } },
      { id: 'amount', status: 'active', cells: { setting: 'Spending Limit ($)', value: s.budgetAmount.toFixed(2) } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });
}
