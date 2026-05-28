import { ConfigPane, registerSchema } from '../tui/index.js';
import { UserConfig } from '../config/index.js';

/** Register the session configuration panel (streaming, auto-save, prompt caching, etc.).
 * @param {ConfigPane} pane - The ConfigPane instance to register schemas on.
 */
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
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });

  // Custom detail config: uses row's 'type' cell to decide field type
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

/** Register the context window configuration panel (max tokens, compaction, snapshots).
 * @param {ConfigPane} pane - The ConfigPane instance to register schemas on.
 */
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
      { id: 'autoCompact', status: 'active', cells: { setting: 'Auto-compact', value: c.autoCompact ? 'on' : 'off' } },
      { id: 'strategy', status: 'active', cells: { setting: 'Compaction Strategy', value: c.strategy } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });
}

/** Register the workspace configuration panel (paths, git auto-commit, file watcher, encoding).
 * @param {ConfigPane} pane - The ConfigPane instance to register schemas on.
 */
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

/** Register the display configuration panel (theme, thinking/tool visibility, compact mode, fonts).
 * @param {ConfigPane} pane - The ConfigPane instance to register schemas on.
 */
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
      { id: 'verbose', status: 'active', cells: { setting: 'Verbose', value: d.verbose ? 'on' : 'off' } },
      { id: 'timestamps', status: 'active', cells: { setting: 'Timestamps', value: d.timestamps ? 'on' : 'off' } },
      { id: 'syntaxHighlighting', status: 'active', cells: { setting: 'Syntax Highlighting', value: d.syntaxHighlighting ? 'on' : 'off' } },
      { id: 'maxOutputLines', status: 'active', cells: { setting: 'Max Output Lines', value: String(d.maxOutputLines) } },
      { id: 'renderInterval', status: 'active', cells: { setting: 'Render Interval (ms)', value: String(d.renderInterval) } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
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

/** Register the History Management configuration panel (auto-nudge, HistoryScribe triggers, intervals).
 * @param {ConfigPane} pane - The ConfigPane instance to register schemas on.
 */
export function registerHistorySchemas(pane: ConfigPane): void {
  const cfg = UserConfig.instance();
  const s = cfg.settings.session;
  registerSchema(pane, 'history', {
    id: 'history',
    title: 'History',
    fields: [
      { key: 'setting', label: 'Setting', width: 26, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 18, detailType: 'text' },
      { key: 'type', label: 'Type', width: 8, detailType: 'readonly' },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'recurringPromptEnabled', status: 'active', cells: { setting: 'Recurring Prompt', value: s.recurringPromptEnabled ? 'on' : 'off', type: 'toggle', description: 'Recurring prompt from reminder_prompt.md (adjusts timing live)' } },
      { id: 'recurringPromptInterval', status: s.recurringPromptEnabled ? 'active' : 'inactive', cells: { setting: '  Prompt Interval (min)', value: `${s.recurringPromptInterval}m`, type: 'text', description: 'Minutes between recurring prompt firings' } },
      { id: 'historyScribeEnabled', status: 'active', cells: { setting: 'Scribe Worker', value: s.historyScribeEnabled ? 'on' : 'off', type: 'toggle', description: 'Enable HistoryScribe background worker' } },
      { id: 'scribeOnPrune', status: s.historyScribeEnabled ? 'active' : 'inactive', cells: { setting: '  Scribe on Prune', value: s.scribeOnPrune ? 'on' : 'off', type: 'toggle', description: 'Fire scribe when state file rolls 5500→4500' } },
      { id: 'scribeOnIdle', status: s.historyScribeEnabled ? 'active' : 'inactive', cells: { setting: '  Scribe on Idle', value: s.scribeOnIdle ? 'on' : 'off', type: 'toggle', description: 'Fire scribe after channel idle timeout' } },
      { id: 'historyScribeTimeout', status: (s.historyScribeEnabled && s.scribeOnIdle) ? 'active' : 'inactive', cells: { setting: '    Idle Timeout (min)', value: `${s.historyScribeTimeout}m`, type: 'text', description: 'Minutes idle before scribe fires' } },
      { id: 'scribeIntervalEnabled', status: s.historyScribeEnabled ? 'active' : 'inactive', cells: { setting: '  Scribe on Timer', value: s.scribeIntervalEnabled ? 'on' : 'off', type: 'toggle', description: '⚠ Fire scribe on timer (full state injection, expensive!)' } },
      { id: 'scribeIntervalMinutes', status: (s.historyScribeEnabled && s.scribeIntervalEnabled) ? 'active' : 'inactive', cells: { setting: '    Timer Interval (min)', value: `${s.scribeIntervalMinutes}m`, type: 'text', description: 'How often to run timer-based scribe' } },
      { id: 'historyScribeMaxMessages', status: s.historyScribeEnabled ? 'active' : 'inactive', cells: { setting: '  Max Messages', value: String(s.historyScribeMaxMessages), type: 'number', description: '0 = all messages, N = last N messages' } },
      { id: 'historyScribeModel', status: s.historyScribeEnabled ? 'active' : 'inactive', cells: { setting: '  Scribe Model', value: s.historyScribeModel || '(default)', type: 'choice', description: 'Model for scribe worker. Left/right arrow to cycle. (default) = use channel model.' } },
    ],
    sortColumn: undefined,
    sortAsc: false,
    multiSelect: false,
  });

  // Detail config — make scribe model a choice picker with all configured models
  pane.registerDetailConfig('history', (row) => {
    const cellVal = row.cells['value'] ?? '';
    const rowType = row.cells['type'] ?? 'text';
    const rowDesc = row.cells['description'] ?? '';

    if (row.id === 'historyScribeModel') {
      // Build model choices from configured providers
      const modelChoices: Array<{ id: string; label: string }> = [
        { id: '', label: '(default)' },
      ];
      const providers = UserConfig.instance().providers;
      for (const p of providers) {
        const providerName = p.name || p.type;
        for (const m of (p.models || [])) {
          const modelName = typeof m === 'string' ? m : m.name;
          modelChoices.push({ id: `${providerName}:${modelName}`, label: `${providerName}:${modelName}` });
        }
      }
      const currentVal = cellVal || '';
      return {
        fields: [
          { key: 'setting', label: 'Setting', type: 'readonly', value: row.cells['setting'] ?? '' },
          { key: 'value', label: 'Model', type: 'choice', value: currentVal, choices: modelChoices, description: rowDesc },
        ],
      };
    }

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
