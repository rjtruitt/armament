import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigPane, registerSchema } from '../tui/index.js';
import { UserConfig } from '../config/index.js';
import { armaDataDir } from './ChannelPaths.js';

/** Register all TUI config panel schemas for a given pane ID.
 * @param {ConfigPane} pane - The ConfigPane instance to register schemas on.
 * @param {string} paneId - Identifier of the config panel (e.g., 'config', 'settings', 'scheduler', 'mcp', 'providers').
 * @param {(target: string) => void} onNavigate - Callback invoked when navigating to a submenu target.
 * @param {() => Array<{ name: string; config: any }> | undefined} [getMcpConfigs] - Optional callback to retrieve current MCP server configs; each config value is of any type.
 */
export function registerConfigPanelSchemas(
  pane: ConfigPane,
  paneId: string,
  onNavigate: (target: string) => void,
  getMcpConfigs?: () => Array<{ name: string; config: any }> | undefined,
): void {
  if (paneId === 'config') {
    const configPanel = { id: 'config', title: 'Configuration', items: [
      { id: '@settings', label: 'Settings', description: 'Session, context, workspace, agents, display, outputs', type: 'submenu' as const },
      { id: '@scheduler', label: 'Scheduler', description: 'Workflow automation & scheduling', type: 'submenu' as const },
      { id: '@mcp', label: 'MCP Servers', description: 'Model Context Protocol connections', type: 'submenu' as const },
      { id: '@providers', label: 'Providers', description: 'AI provider connections & auth', type: 'submenu' as const },
    ]};
    pane['panels'].set('config', configPanel);
    pane.onNavigate = onNavigate;
    return;
  }

  if (paneId === 'settings') {
    const settingsPanel = { id: 'settings', title: 'Settings', items: [
      { id: '@session', label: 'Session', description: 'Budget, retries, streaming, timeouts', type: 'submenu' as const },
      { id: '@context', label: 'Context', description: 'Context window, compaction & snapshots', type: 'submenu' as const },
      { id: '@workspace', label: 'Workspace', description: 'File access, paths, encoding', type: 'submenu' as const },
      { id: '@display', label: 'Display', description: 'Theme, colors, verbosity', type: 'submenu' as const },
      { id: '@history', label: 'History', description: 'Nudge intervals & scribe triggers', type: 'submenu' as const },
    ]};
    pane['panels'].set('settings', settingsPanel);
    pane.onNavigate = onNavigate;
    return;
  }

  if (paneId === 'scheduler') registerSchedulerSchemas(pane);
  if (paneId === 'mcp') registerMcpSchemas(pane, getMcpConfigs?.() ?? []);
  if (paneId === 'providers') registerProviderSchemas(pane);
}

function registerSchedulerSchemas(pane: ConfigPane): void {
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
    rows: [], // triggers loaded dynamically from scheduler state
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

function registerMcpSchemas(pane: ConfigPane, mcpConfigs: Array<{ name: string; config: any }>): void {
  const mcpRows = mcpConfigs.length > 0 ? mcpConfigs.map(s => {
    const cfg = s.config || {};
    return {
      id: s.name,
      status: 'active' as const,
      cells: {
        name: s.name,
        status: 'configured',
        transport: cfg.transport || 'stdio',
        tools: '—',
        calls: '0',
        errors: '0',
        uptime: '—',
        lastCall: '—',
        command: cfg.command || '',
        url: cfg.url || '',
        autoStart: cfg.autoStart !== false ? 'on' : 'off',
        timeout: String(cfg.timeout || '60'),
        retries: cfg.retries !== false ? 'on' : 'off',
        env: typeof cfg.env === 'object' ? Object.entries(cfg.env || {}).map(([k, v]) => `${k}=${v}`).join(';') : (cfg.env || ''),
        args: Array.isArray(cfg.args) ? cfg.args.join(' ') : (cfg.args || ''),
        autoApprove: Array.isArray(cfg.autoApprove) ? cfg.autoApprove.join(', ') : (cfg.autoApprove || ''),
        maxConcurrent: String(cfg.maxConcurrent || '10'),
      },
    };
  }) : [];

  registerSchema(pane, 'mcp', {
    id: 'mcp',
    title: 'MCP Servers',
    fields: [
      { key: 'name', label: 'Server', width: 16, sortable: true, detailType: 'text', description: 'Server name (modify and save to rename)' },
      { key: 'status', label: 'Status', width: 10, sortable: true, detailType: 'readonly' },
      { key: 'transport', label: 'Transport', width: 9, sortable: true, detailType: 'choice', choices: [{ id: 'stdio', label: 'stdio' }, { id: 'sse', label: 'SSE' }, { id: 'streamable', label: 'Streamable HTTP' }] },
      { key: 'tools', label: 'Tools', width: 6, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'calls', label: 'Calls', width: 6, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'errors', label: 'Err', width: 5, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'uptime', label: 'Uptime', width: 8, sortable: true, detailType: 'readonly' },
      { key: 'lastCall', label: 'Last Call', width: 10, sortable: true, detailType: 'readonly' },
      { key: 'command', label: 'Command (stdio)', listVisible: false, detailType: 'text', defaultValue: '', description: 'Executable to spawn (e.g. npx, node, python3). Only for stdio transport.' },
      { key: 'url', label: 'URL (HTTP)', listVisible: false, detailType: 'text', defaultValue: '', description: 'Server endpoint URL (e.g. http://localhost:3000/mcp). Only for SSE/Streamable HTTP.' },
      { key: 'args', label: 'Args', listVisible: false, detailType: 'text', defaultValue: '', description: 'Space-separated arguments (e.g. @gongrzhe/image-gen-server)' },
      { key: 'autoStart', label: 'Auto Start', listVisible: false, detailType: 'toggle', defaultValue: true },
      { key: 'timeout', label: 'Timeout (s)', listVisible: false, detailType: 'text', defaultValue: '60', description: 'Connection timeout in seconds' },
      { key: 'retries', label: 'Auto Reconnect', listVisible: false, detailType: 'toggle', defaultValue: true },
      { key: 'env', label: 'Environment Vars', listVisible: false, detailType: 'text', defaultValue: '', description: 'KEY=value pairs separated by semicolons (e.g. API_KEY=abc;MODEL=test). Values with special chars are fine.' },
      { key: 'autoApprove', label: 'Auto-approve Tools', listVisible: false, detailType: 'text', defaultValue: '', description: 'Comma-separated tool names to auto-approve (e.g. generate_image,create_presentation)' },
      { key: 'maxConcurrent', label: 'Max Concurrent', listVisible: false, detailType: 'text', defaultValue: '10', description: 'Max concurrent tool calls to this server' },
    ],
    actions: [
      { key: 'a', label: 'add' },
      { key: 'r', label: 'restart' },
      { key: 'd', label: 'delete', danger: true, bulk: true },
    ],
    rows: mcpRows.length > 0 ? mcpRows : [
      { id: 'none', status: 'inactive' as const, cells: { name: '(no MCP servers configured)', status: '—', transport: '—', tools: '—', calls: '—', errors: '—', uptime: '—', lastCall: '—' } },
    ],
    sortColumn: 'name',
    sortAsc: true,
    multiSelect: true,
  });
}

function registerProviderSchemas(pane: ConfigPane): void {
  const cfg = UserConfig.instance();
  const providerRows = cfg.providers.map(p => ({
    id: p.name ?? p.type,
    status: ('active' as const),
    cells: {
      name: p.name ?? p.type,
      type: p.type,
      status: 'configured',
      models: String(p.models?.length ?? 0),
      tokens: '—',
      cost: '—',
      rpm: '—',
      tpm: '—',
      authType: p.auth ?? (p.apiKey ? 'api_key' : p.profile ? 'profile' : '—'),
      profile: p.profile ?? '',
      region: p.region ?? '',
      // Hidden detail fields — populated so detail view shows current config values
      apiKey: p.apiKey ?? '',
      baseUrl: p.baseUrl ?? '',
      enabled: p.enabled !== false ? 'on' : 'off',
      streaming: p.streaming !== false ? 'on' : 'off',
      rateLimit: p.rateLimit != null ? String(p.rateLimit) : '∞',
      tokenLimit: p.tokenLimit != null ? String(p.tokenLimit) : '∞',
      budget: p.budget != null ? String(p.budget) : '∞',
      summaryModel: p.webpageSummarizationModel ?? '',
    },
  }));
  registerSchema(pane, 'providers', {
    id: 'providers',
    title: 'Providers',
    fields: [
      { key: 'name', label: 'Provider', width: 14, sortable: true, detailType: 'text', description: 'Display name for this provider' },
      { key: 'status', label: 'Status', width: 10, sortable: true, detailType: 'readonly' },
      { key: 'models', label: 'Models', width: 7, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'tokens', label: 'Tokens', width: 10, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'cost', label: 'Cost', width: 8, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'rpm', label: 'RPM', width: 6, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'tpm', label: 'TPM', width: 8, align: 'right', sortable: true, detailType: 'readonly' },
      { key: 'type', label: 'Type', listVisible: false, detailType: 'choice', choices: [{ id: 'bedrock', label: 'Bedrock' }, { id: 'openai', label: 'OpenAI' }, { id: 'anthropic', label: 'Anthropic' }, { id: 'gemini', label: 'Gemini' }, { id: 'ollama', label: 'Ollama' }], description: 'Provider backend type (determines which API driver is used)' },
      { key: 'authType', label: 'Auth Type', listVisible: false, detailType: 'choice', choices: [{ id: 'api_key', label: 'API Key' }, { id: 'profile', label: 'AWS Profile' }, { id: 'role', label: 'IAM Role' }, { id: 'oauth', label: 'OAuth' }], description: 'Authentication method' },
      { key: 'apiKey', label: 'API Key', listVisible: false, detailType: 'text', description: 'API key or env var reference ($ENV_VAR)' },
      { key: 'profile', label: 'AWS Profile', listVisible: false, detailType: 'text', description: 'Named profile from ~/.aws/credentials (blank = default)' },
      { key: 'region', label: 'Region', listVisible: false, detailType: 'choice', choices: [{ id: 'us-east-1', label: 'us-east-1' }, { id: 'us-west-2', label: 'us-west-2' }, { id: 'eu-west-1', label: 'eu-west-1' }, { id: 'eu-central-1', label: 'eu-central-1' }, { id: 'ap-northeast-1', label: 'ap-northeast-1' }] },
      { key: 'baseUrl', label: 'Base URL', listVisible: false, detailType: 'text', description: 'Custom endpoint (leave blank for default)' },
      { key: 'enabled', label: 'Enabled', listVisible: false, detailType: 'toggle', defaultValue: true },
      { key: 'streaming', label: 'Streaming', listVisible: false, detailType: 'toggle', defaultValue: true, description: 'Stream responses' },
      { key: 'rateLimit', label: 'Rate Limit (RPM)', listVisible: false, detailType: 'text', defaultValue: '∞', description: 'Requests per minute (∞ = unlimited)' },
      { key: 'tokenLimit', label: 'Token Limit (TPM)', listVisible: false, detailType: 'text', defaultValue: '∞', description: 'Tokens per minute (∞ = unlimited)' },
      { key: 'budget', label: 'Budget', listVisible: false, detailType: 'text', defaultValue: '∞', description: 'Spend cap per session ($)' },
      { key: 'summaryModel', label: 'Summary Model', listVisible: false, detailType: 'text', description: 'Model used for web page summarization (use left/right arrow to cycle through available models in detail view)' },
    ],
    actions: [
      { key: 'a', label: 'add' },
      { key: 'e', label: 'edit' },
      { key: 'm', label: 'models' },
      { key: 'd', label: 'delete', danger: true, bulk: true },
    ],
    defaultAction: 'm',
    rows: providerRows.length > 0 ? providerRows : [
      { id: 'none', status: 'inactive' as const, cells: { name: '(no providers configured)', status: '—', models: '0', tokens: '—', cost: '—', rpm: '—', tpm: '—' } },
    ],
    sortColumn: 'name',
    sortAsc: true,
    multiSelect: false,
  });

  // Override detail config: summaryModel becomes a choice listing the provider's models
  pane.registerDetailConfig('providers', (row) => {
    const cfg = UserConfig.instance();
    const providerName = row.cells['name'] || '';
    const provider = cfg.providers.find(p => (p.name ?? p.type) === providerName);
    const models = provider?.models ?? [];
    const modelChoices = models.length > 0
      ? models.map(m => ({ id: typeof m === 'string' ? m : m.name, label: typeof m === 'string' ? m : m.name }))
      : [{ id: '', label: '(no models)' }];
    const currentSummary = provider?.webpageSummarizationModel ?? '';
    return {
      fields: [
        { key: 'name', label: 'Provider', type: 'text', value: row.cells['name'] ?? '' },
        { key: 'type', label: 'Type', type: 'choice', value: row.cells['type'] ?? 'openai',
          choices: [{ id: 'bedrock', label: 'Bedrock' }, { id: 'openai', label: 'OpenAI' }, { id: 'anthropic', label: 'Anthropic' }, { id: 'gemini', label: 'Gemini' }, { id: 'ollama', label: 'Ollama' }] },
        { key: 'authType', label: 'Auth Type', type: 'choice', value: row.cells['authType'] ?? 'api_key',
          choices: [{ id: 'api_key', label: 'API Key' }, { id: 'profile', label: 'AWS Profile' }, { id: 'role', label: 'IAM Role' }, { id: 'oauth', label: 'OAuth' }] },
        { key: 'apiKey', label: 'API Key', type: 'text', value: row.cells['apiKey'] ?? '' },
        { key: 'profile', label: 'AWS Profile', type: 'text', value: row.cells['profile'] ?? '' },
        { key: 'region', label: 'Region', type: 'choice', value: row.cells['region'] ?? 'us-east-1',
          choices: [{ id: 'us-east-1', label: 'us-east-1' }, { id: 'us-west-2', label: 'us-west-2' }, { id: 'eu-west-1', label: 'eu-west-1' }, { id: 'eu-central-1', label: 'eu-central-1' }, { id: 'ap-northeast-1', label: 'ap-northeast-1' }] },
        { key: 'baseUrl', label: 'Base URL', type: 'text', value: row.cells['baseUrl'] ?? '' },
        { key: 'enabled', label: 'Enabled', type: 'toggle', value: row.cells['enabled'] === 'on' },
        { key: 'streaming', label: 'Streaming', type: 'toggle', value: row.cells['streaming'] === 'on' },
        { key: 'rateLimit', label: 'Rate Limit (RPM)', type: 'text', value: row.cells['rateLimit'] ?? '∞' },
        { key: 'tokenLimit', label: 'Token Limit (TPM)', type: 'text', value: row.cells['tokenLimit'] ?? '∞' },
        { key: 'budget', label: 'Budget', type: 'text', value: row.cells['budget'] ?? '∞' },
        { key: 'summaryModel', label: 'Summary Model', type: 'choice', value: currentSummary || (modelChoices.length > 0 ? modelChoices[0].id : ''), choices: modelChoices,
          description: 'Model used for web page summarization (left/right arrow to cycle)' },
      ],
    };
  });
}

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
