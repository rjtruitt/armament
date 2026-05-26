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
    actions: [
      { key: 'r', label: 'reset defaults' },
    ],
    rows: [
      { id: 'streaming', status: 'active', cells: { setting: 'Streaming', value: s.streaming ? 'on' : 'off', type: 'toggle' } },
      { id: 'autoSave', status: 'active', cells: { setting: 'Auto-save', value: s.autoSave ? 'on' : 'off', type: 'toggle' } },
      { id: 'promptCaching', status: 'active', cells: { setting: 'Prompt Caching', value: s.promptCaching ? 'on' : 'off', type: 'toggle' } },
      { id: 'useThreads', status: 'active', cells: { setting: 'Use Threads', value: s.useThreads ? 'on' : 'off', type: 'toggle' } },
      { id: 'maxTurns', status: 'active', cells: { setting: 'Max Turns', value: String(s.maxTurns), type: 'number' } },
      { id: 'timeout', status: 'active', cells: { setting: 'Conversation Timeout', value: `${s.conversationTimeout}m`, type: 'text' } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
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
    actions: [
      { key: 'c', label: 'compact now' },
      { key: 'r', label: 'reset defaults' },
    ],
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
    actions: [
      { key: 'r', label: 'reset defaults' },
    ],
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
    actions: [
      { key: 'p', label: 'preview theme' },
    ],
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
