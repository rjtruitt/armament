import { ConfigPane, registerSchema } from '../../tui/index.js';
import { UserConfig } from '../../config/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { armaDataDir } from '../ChannelPaths.js';

function loadFlowRows(): Array<{ id: string; status: 'active' | 'inactive' | 'pending' | 'warning' | 'error'; cells: Record<string, string> }> {
  const candidates = [
    path.join(armaDataDir(), 'flows'),
    path.join(process.cwd(), '.arma', 'flows'),
    path.join(process.cwd(), 'armament', '.arma', 'flows'),
  ];
  let flowsDir: string | null = null;
  for (const dir of candidates) {
    if (fs.existsSync(dir)) { flowsDir = dir; break; }
  }
  if (!flowsDir) return [];
  const files = fs.readdirSync(flowsDir).filter(f => f.endsWith('.armaflow'));
  return files.map(f => {
    const name = f.replace('.armaflow', '');
    const content = fs.readFileSync(path.join(flowsDir!, f), 'utf-8');
    const triggerMatch = content.match(/^\/trigger\s+(.+)/m);
    const budgetMatch = content.match(/^\/budget\s+(.+)/m);
    const schedule = triggerMatch ? triggerMatch[1].trim() : 'manual';
    const budget = budgetMatch ? `$${budgetMatch[1].trim()}` : '—';
    return {
      id: name,
      status: 'active' as const,
      cells: { name, status: 'idle', schedule, lastRun: 'never', nextRun: '—', runs: '0', cost: budget },
    };
  });
}

export function registerSchedulerSchemas(pane: ConfigPane): void {
  const cfg = UserConfig.instance();
  registerSchema(pane, 'scheduler.workflows', {
    id: 'scheduler.workflows',
    title: 'Workflows',
    fields: [
      { key: 'name', label: 'Workflow', width: 20, sortable: true, detailType: 'readonly' },
      { key: 'status', label: 'Status', width: 10, sortable: true, detailType: 'readonly' },
      { key: 'schedule', label: 'Schedule', width: 14, sortable: true, detailType: 'text', description: 'cron expression or interval (e.g. "every 5m", "0 9 * * 1")' },
      { key: 'lastRun', label: 'Last Run', width: 18, sortable: true, detailType: 'readonly' },
      { key: 'nextRun', label: 'Next Run', width: 18, sortable: true, detailType: 'readonly' },
      { key: 'runs', label: 'Runs', width: 6, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'cost', label: 'Cost', width: 8, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'enabled', label: 'Enabled', listVisible: false, detailType: 'toggle', defaultValue: true },
      { key: 'provider', label: 'Provider', listVisible: false, detailType: 'text', description: 'Provider name (from configured providers)' },
      { key: 'model', label: 'Model', listVisible: false, detailType: 'text', description: 'Model name (from configured models)' },
      { key: 'maxTokens', label: 'Max Tokens', listVisible: false, detailType: 'text', defaultValue: '∞', description: 'Token budget per run (∞ = unlimited)' },
      { key: 'timeout', label: 'Timeout (s)', listVisible: false, detailType: 'text', defaultValue: '30', description: 'Kill run after this many seconds' },
      { key: 'retries', label: 'Retry on Error', listVisible: false, detailType: 'toggle', defaultValue: true },
      { key: 'notify', label: 'Notify on Failure', listVisible: false, detailType: 'toggle', defaultValue: true },
    ],
    actions: [
      { key: 'r', label: 'run' },
    ],
    rows: loadFlowRows(),
    sortColumn: 'name',
    sortAsc: true,
    multiSelect: true,
  });

  registerSchema(pane, 'scheduler.history', {
    id: 'scheduler.history',
    title: 'Run History',
    fields: [
      { key: 'workflow', label: 'Workflow', width: 18, sortable: true, detailType: 'readonly' },
      { key: 'started', label: 'Started', width: 18, sortable: true, detailType: 'readonly' },
      { key: 'duration', label: 'Duration', width: 10, sortable: true, detailType: 'readonly' },
      { key: 'result', label: 'Result', width: 10, sortable: true, detailType: 'readonly' },
      { key: 'tokens', label: 'Tokens', width: 10, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'cost', label: 'Cost', width: 8, align: 'right', sortable: true, detailType: 'readonly' },
    ],
    actions: [],
    rows: [],
    sortColumn: 'started',
    sortAsc: false,
  });

  registerSchema(pane, 'scheduler.triggers', {
    id: 'scheduler.triggers',
    title: 'Triggers',
    fields: [
      { key: 'name', label: 'Trigger', width: 18, sortable: true, detailType: 'readonly' },
      { key: 'type', label: 'Type', width: 10, sortable: true, detailType: 'choice', choices: [{ id: 'webhook', label: 'Webhook' }, { id: 'event', label: 'Event' }, { id: 'cron', label: 'Cron' }, { id: 'interval', label: 'Interval' }] },
      { key: 'source', label: 'Source', width: 14, sortable: true, detailType: 'text' },
      { key: 'workflow', label: 'Workflow', width: 16, sortable: true, detailType: 'text', description: 'Target workflow to trigger' },
      { key: 'fires', label: 'Fires', width: 6, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'last', label: 'Last', width: 10, sortable: true, detailType: 'readonly' },
      { key: 'enabled', label: 'Enabled', listVisible: false, detailType: 'toggle', defaultValue: true },
      { key: 'filter', label: 'Filter', listVisible: false, detailType: 'text', description: 'Regex or jq expression to filter events' },
      { key: 'debounce', label: 'Debounce (s)', listVisible: false, detailType: 'text', defaultValue: '0', description: 'Ignore duplicate fires within window' },
    ],
    actions: [],
    rows: [],
    sortColumn: 'name',
    sortAsc: true,
    multiSelect: true,
  });

  registerSchema(pane, 'scheduler.defaults', {
    id: 'scheduler.defaults',
    title: 'Defaults',
    fields: [
      { key: 'setting', label: 'Setting', width: 22, sortable: true, detailType: 'readonly' },
      { key: 'value', label: 'Value', width: 20, detailType: 'text' },
      { key: 'scope', label: 'Scope', width: 10, detailType: 'choice', choices: [{ id: 'global', label: 'Global' }, { id: 'workflow', label: 'Per-workflow' }] },
      { key: 'description', label: 'Description', listVisible: false, detailType: 'readonly' },
    ],
    actions: [],
    rows: [
      { id: 'def-provider', status: 'active', cells: { setting: 'Default Provider', value: cfg.defaultProvider ?? '(not set)', scope: 'global' } },
      { id: 'def-model', status: 'active', cells: { setting: 'Default Model', value: cfg.defaultModel ?? '(not set)', scope: 'global' } },
      { id: 'def-timeout', status: 'active', cells: { setting: 'Timeout', value: '30s', scope: 'global' } },
      { id: 'def-retries', status: 'active', cells: { setting: 'Max Retries', value: '3', scope: 'global' } },
      { id: 'def-tokens', status: 'active', cells: { setting: 'Max Tokens', value: '∞', scope: 'global' } },
      { id: 'def-concurrency', status: 'active', cells: { setting: 'Concurrency', value: '5', scope: 'global' } },
      { id: 'def-notify', status: 'active', cells: { setting: 'Notify on Failure', value: 'true', scope: 'global' } },
      { id: 'def-cost-alert', status: 'active', cells: { setting: 'Cost Alert ($)', value: '10.00', scope: 'global' } },
    ],
    sortColumn: 'setting',
    sortAsc: true,
    multiSelect: false,
  });
}
