import { ConfigPane, registerSchema } from '../../tui/index.js';
import { UserConfig } from '../../config/index.js';

export function registerProviderSchemas(pane: ConfigPane): void {
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
    const cfg2 = UserConfig.instance();
    const providerName = row.cells['name'] || '';
    const provider = cfg2.providers.find(p => (p.name ?? p.type) === providerName);
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
