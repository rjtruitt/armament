/**
 * Panel definitions for AI provider configuration.
 */

import type { MenuItem, MenuItemType, MenuPanel, SessionMenuConfig, ProviderInfo } from '../types.js';

/** Generates model settings items for a specific provider/model combination. */
export function getModelSettingsItems(providerId: string, modelId: string): MenuItem[] {
  return [
    { id: `providers.${providerId}.models.${modelId}.id`, label: 'Model ID', description: modelId, type: 'display', readonly: true },
    { id: `providers.${providerId}.models.${modelId}.alias`, label: 'Alias', description: 'Short name for this model', type: 'text', value: '' },
    { id: `providers.${providerId}.models.${modelId}.budget`, label: 'Budget', description: 'Per-model spend limit ($)', type: 'text', value: '' },
    { id: `providers.${providerId}.models.${modelId}.tpm`, label: 'TPM', description: 'Tokens per minute limit', type: 'text', value: '' },
    { id: `providers.${providerId}.models.${modelId}.rpm`, label: 'RPM', description: 'Requests per minute limit', type: 'text', value: '' },
    { id: `providers.${providerId}.models.${modelId}.maxTokens`, label: 'Max tokens', description: 'Max output tokens per request', type: 'text', value: '4096' },
    { id: `providers.${providerId}.models.${modelId}.contextWindow`, label: 'Context window', description: 'Total context size', type: 'text', value: '200000' },
    { id: `providers.${providerId}.models.${modelId}.temperature`, label: 'Temperature', description: '0.0 - 2.0', type: 'text', value: '1.0' },
    { id: `providers.${providerId}.models.${modelId}.topP`, label: 'Top P', description: '0.0 - 1.0', type: 'text', value: '1.0' },
    { id: `providers.${providerId}.models.${modelId}.topK`, label: 'Top K', description: '0 = disabled', type: 'text', value: '0' },
    { id: `providers.${providerId}.models.${modelId}.stopSequences`, label: 'Stop sequences', description: 'Comma-separated', type: 'text', value: '' },
    { id: `providers.${providerId}.models.${modelId}.streaming`, label: 'Streaming', description: 'Stream responses', type: 'toggle', value: true },
    { id: `providers.${providerId}.models.${modelId}.caching`, label: 'Prompt caching', description: 'Cache system prompt', type: 'toggle', value: true },
    { id: `providers.${providerId}.models.${modelId}.costInput`, label: 'Input cost', description: '$/1M tokens', type: 'text', value: '' },
    { id: `providers.${providerId}.models.${modelId}.costOutput`, label: 'Output cost', description: '$/1M tokens', type: 'text', value: '' },
    { id: `providers.${providerId}.models.${modelId}.json`, label: '{ } Edit JSON', description: 'Edit full model config', type: 'json' },
    { id: `providers.${providerId}.models.${modelId}.delete`, label: '✗ Remove model', description: '', type: 'submenu' },
  ];
}

/** Generates settings items for a configured provider. */
export function getProviderSettingsItems(providerId: string, config: SessionMenuConfig): MenuItem[] {
  const pConf = config.providerConfigs.find(c => c.type === providerId);
  const modelList = pConf?.models ?? [];
  const items: MenuItem[] = [
    { id: `providers.${providerId}.settings.name`, label: 'Type', description: providerId, type: 'display', readonly: true },
    { id: `providers.${providerId}.settings.enabled`, label: 'Enabled', description: '', type: 'toggle', value: true },
  ];
  if (modelList.length > 0) {
    const currentDefault = (pConf as ProviderInfo & { defaultModel?: string })?.defaultModel ?? modelList[0];
    items.push({
      id: `providers.${providerId}.settings.defaultModel`,
      label: 'Default model',
      description: 'Used when only provider is specified',
      type: 'choice',
      value: currentDefault,
      choices: modelList.map(m => ({ id: m, label: m })),
    });
  }
  if (providerId === 'bedrock') {
    items.push({ id: `providers.${providerId}.settings.region`, label: 'Region', description: '', type: 'text', value: pConf?.region ?? 'us-west-2' });
    items.push({ id: `providers.${providerId}.settings.profile`, label: 'AWS Profile', description: 'blank = default', type: 'text', value: pConf?.profile ?? '' });
  } else if (providerId === 'ollama') {
    items.push({ id: `providers.${providerId}.settings.baseUrl`, label: 'Host URL', description: '', type: 'text', value: 'http://localhost:11434' });
  } else {
    items.push({ id: `providers.${providerId}.settings.apiKey`, label: 'API Key', description: '', type: 'text', value: '' });
    items.push({ id: `providers.${providerId}.settings.baseUrl`, label: 'Base URL', description: 'Optional', type: 'text', value: '' });
  }
  items.push({ id: `providers.${providerId}.settings.json`, label: '{ } Edit JSON', description: 'Edit provider config directly', type: 'json' });
  return items;
}

/** Registers all provider-related panels into the given map. */
export function registerProviderPanels(panels: Map<string, MenuPanel>, config: SessionMenuConfig): void {
  const configuredProviders = config.providers ?? [];
  const providerItems: MenuItem[] = [];
  for (const p of configuredProviders) {
    providerItems.push({ id: `providers.${p}`, label: p, description: 'Configured', type: 'submenu' });
  }
  if (configuredProviders.length === 0) {
    providerItems.push({ id: 'providers.none', label: '(none configured)', description: '', type: 'display', readonly: true });
  }
  providerItems.push({ id: 'providers.new', label: '+ Add new provider', description: 'Pick a provider type', type: 'submenu' });
  providerItems.push({ id: 'providers.json', label: '{ } Edit JSON', description: 'Edit providers config directly', type: 'json' });
  panels.set('providers', {
    id: 'providers',
    title: 'Providers',
    parent: 'root',
    items: providerItems,
  });

  panels.set('providers.new', {
    id: 'providers.new',
    title: 'New Provider',
    parent: 'providers',
    items: [
      { id: 'providers.new.anthropic', label: 'anthropic', description: 'Claude models (API key)', type: 'submenu' },
      { id: 'providers.new.openai', label: 'openai', description: 'GPT models (API key)', type: 'submenu' },
      { id: 'providers.new.bedrock', label: 'bedrock', description: 'AWS Bedrock (profile/role)', type: 'submenu' },
      { id: 'providers.new.ollama', label: 'ollama', description: 'Local models (host URL)', type: 'submenu' },
      { id: 'providers.new.gemini', label: 'gemini', description: 'Google Gemini (API key)', type: 'submenu' },
      { id: 'providers.new.openrouter', label: 'openrouter', description: 'OpenRouter (API key)', type: 'submenu' },
      { id: 'providers.new.replicate', label: 'replicate', description: 'Replicate (API key)', type: 'submenu' },
    ],
  });

  panels.set('providers.new.anthropic', {
    id: 'providers.new.anthropic',
    title: 'Configure Anthropic',
    parent: 'providers.new',
    items: [
      { id: 'providers.new.anthropic.apiKey', label: 'API Key', description: 'sk-ant-...', type: 'text', value: '' },
      { id: 'providers.new.anthropic.endpoint', label: 'Endpoint URL', description: 'https://api.anthropic.com', type: 'text', value: 'https://api.anthropic.com' },
      { id: 'providers.new.anthropic.save', label: '✓ Save provider', description: '', type: 'submenu' },
    ],
  });
  panels.set('providers.new.openai', {
    id: 'providers.new.openai',
    title: 'Configure OpenAI',
    parent: 'providers.new',
    items: [
      { id: 'providers.new.openai.apiKey', label: 'API Key', description: 'sk-...', type: 'text', value: '' },
      { id: 'providers.new.openai.orgId', label: 'Organization ID', description: 'Optional', type: 'text', value: '' },
      { id: 'providers.new.openai.endpoint', label: 'Endpoint URL', description: 'https://api.openai.com', type: 'text', value: 'https://api.openai.com' },
      { id: 'providers.new.openai.save', label: '✓ Save provider', description: '', type: 'submenu' },
    ],
  });
  panels.set('providers.new.bedrock', {
    id: 'providers.new.bedrock',
    title: 'Configure Bedrock',
    parent: 'providers.new',
    items: [
      { id: 'providers.new.bedrock.region', label: 'Region', description: 'us-east-1', type: 'text', value: 'us-east-1' },
      { id: 'providers.new.bedrock.profile', label: 'AWS Profile', description: 'default', type: 'text', value: '' },
      { id: 'providers.new.bedrock.credentialSource', label: 'Credential source', type: 'choice', value: 'profile',
        choices: [
          { id: 'profile', label: 'profile', description: 'Named AWS profile' },
          { id: 'environment', label: 'environment', description: 'Env vars (AWS_ACCESS_KEY_ID)' },
          { id: 'sso', label: 'sso', description: 'AWS SSO login' },
        ],
      },
      { id: 'providers.new.bedrock.save', label: '✓ Save provider', description: '', type: 'submenu' },
    ],
  });
  panels.set('providers.new.ollama', {
    id: 'providers.new.ollama',
    title: 'Configure Ollama',
    parent: 'providers.new',
    items: [
      { id: 'providers.new.ollama.host', label: 'Host URL', description: 'http://localhost:11434', type: 'text', value: 'http://localhost:11434' },
      { id: 'providers.new.ollama.save', label: '✓ Save provider', description: '', type: 'submenu' },
    ],
  });
  panels.set('providers.new.gemini', {
    id: 'providers.new.gemini',
    title: 'Configure Gemini',
    parent: 'providers.new',
    items: [
      { id: 'providers.new.gemini.apiKey', label: 'API Key', description: '', type: 'text', value: '' },
      { id: 'providers.new.gemini.projectId', label: 'Project ID', description: 'Optional', type: 'text', value: '' },
      { id: 'providers.new.gemini.location', label: 'Location', description: 'us-central1', type: 'text', value: 'us-central1' },
      { id: 'providers.new.gemini.save', label: '✓ Save provider', description: '', type: 'submenu' },
    ],
  });
  panels.set('providers.new.openrouter', {
    id: 'providers.new.openrouter',
    title: 'Configure OpenRouter',
    parent: 'providers.new',
    items: [
      { id: 'providers.new.openrouter.apiKey', label: 'API Key', description: '', type: 'text', value: '' },
      { id: 'providers.new.openrouter.save', label: '✓ Save provider', description: '', type: 'submenu' },
    ],
  });
  panels.set('providers.new.replicate', {
    id: 'providers.new.replicate',
    title: 'Configure Replicate',
    parent: 'providers.new',
    items: [
      { id: 'providers.new.replicate.apiKey', label: 'API Token', description: '', type: 'text', value: '' },
      { id: 'providers.new.replicate.save', label: '✓ Save provider', description: '', type: 'submenu' },
    ],
  });

  for (const p of configuredProviders) {
    const pConf = config.providerConfigs.find(c => c.type === p);
    const modelList = pConf?.models ?? [];
    panels.set(`providers.${p}`, {
      id: `providers.${p}`,
      title: p.charAt(0).toUpperCase() + p.slice(1),
      parent: 'providers',
      items: [
        { id: `providers.${p}.models`, label: 'Models', description: `${modelList.length} configured`, type: 'submenu' },
        { id: `providers.${p}.settings`, label: 'Settings', description: 'Connection & auth', type: 'submenu' },
        { id: `providers.${p}.remove`, label: '✗ Remove provider', description: '', type: 'submenu' },
      ],
    });

    const modelItems: MenuItem[] = modelList.map(m => ({
      id: `providers.${p}.models.${m}`,
      label: m.length > 40 ? '...' + m.slice(-37) : m,
      description: 'Settings',
      type: 'submenu' as MenuItemType,
    }));
    if (modelItems.length === 0) {
      modelItems.push({ id: `providers.${p}.models.none`, label: '(none configured)', description: '', type: 'display', readonly: true });
    }
    modelItems.push({ id: `providers.${p}.models.new`, label: '+ Add model', description: 'Configure a model', type: 'submenu' });
    panels.set(`providers.${p}.models`, {
      id: `providers.${p}.models`,
      title: `${p} Models`,
      parent: `providers.${p}`,
      items: modelItems,
    });
    panels.set(`providers.${p}.models.new`, {
      id: `providers.${p}.models.new`,
      title: `Add ${p} Model`,
      parent: `providers.${p}.models`,
      items: [
        { id: `providers.${p}.models.new.id`, label: 'Model ID', description: 'Full model identifier', type: 'text', value: '' },
        { id: `providers.${p}.models.new.save`, label: '✓ Add model', description: '', type: 'submenu' },
      ],
    });
    for (const m of modelList) {
      panels.set(`providers.${p}.models.${m}`, {
        id: `providers.${p}.models.${m}`,
        title: m.length > 35 ? '...' + m.slice(-32) : m,
        parent: `providers.${p}.models`,
        items: getModelSettingsItems(p, m),
      });
    }
    panels.set(`providers.${p}.settings`, {
      id: `providers.${p}.settings`,
      title: `${p} Settings`,
      parent: `providers.${p}`,
      items: getProviderSettingsItems(p, config),
    });
  }
}

/** Registers model cross-provider panels. */
export function registerModelPanels(panels: Map<string, MenuPanel>, config: SessionMenuConfig): void {
  const configuredProviders = config.providers ?? [];
  const allModelItems: MenuItem[] = [];
  const allModels: { id: string; label: string }[] = [];
  for (const p of configuredProviders) {
    const pConf = config.providerConfigs.find(c => c.type === p);
    for (const m of pConf?.models ?? []) {
      allModels.push({ id: m, label: m });
    }
  }
  if (allModels.length > 0) {
    allModelItems.push({
      id: 'models.default',
      label: 'Session default',
      description: 'Model for new agents',
      type: 'choice',
      value: config.model || allModels[0].label,
      choices: allModels,
    });
  }
  for (const p of configuredProviders) {
    const pConf = config.providerConfigs.find(c => c.type === p);
    for (const m of pConf?.models ?? []) {
      allModelItems.push({
        id: `providers.${p}.models.${m}`,
        label: m.length > 40 ? '...' + m.slice(-37) : m,
        description: `via ${p}`,
        type: 'submenu' as MenuItemType,
      });
    }
  }
  if (allModels.length === 0) {
    allModelItems.push({ id: 'models.none', label: '(none configured)', description: 'Add models via provider config', type: 'display', readonly: true });
  }
  if (configuredProviders.length > 0) {
    allModelItems.push({ id: 'models.new', label: '+ Add model', description: 'Pick a provider first', type: 'submenu' });
  } else {
    allModelItems.push({ id: 'models.needProvider', label: '(configure a provider first)', description: '', type: 'display', readonly: true });
  }
  allModelItems.push({ id: 'models.json', label: '{ } Edit JSON', description: 'Edit models config directly', type: 'json' });
  panels.set('models', {
    id: 'models',
    title: 'Models',
    parent: 'root',
    items: allModelItems,
  });

  if (configuredProviders.length > 0) {
    const providerChoices: MenuItem[] = configuredProviders.map(p => {
      const pConf = config.providerConfigs.find(c => c.type === p);
      const count = pConf?.models?.length ?? 0;
      return {
        id: `models.new.${p}`,
        label: p,
        description: count > 0 ? `${count} available` : 'Add a model',
        type: 'submenu' as MenuItemType,
      };
    });
    panels.set('models.new', {
      id: 'models.new',
      title: 'Add Model — Pick Provider',
      parent: 'models',
      items: providerChoices,
    });

    for (const p of configuredProviders) {
      const pConf = config.providerConfigs.find(c => c.type === p);
      const availableModels = pConf?.models ?? [];
      const items: MenuItem[] = availableModels.map(m => ({
        id: `models.new.${p}.select.${m}`,
        label: m.length > 45 ? '...' + m.slice(-42) : m,
        description: 'Select as active model',
        type: 'submenu' as MenuItemType,
      }));
      items.push({ id: `models.new.${p}.custom`, label: '+ Custom model ID', description: 'Enter a model ID manually', type: 'text', value: '' });
      panels.set(`models.new.${p}`, {
        id: `models.new.${p}`,
        title: `${p} Models`,
        parent: 'models.new',
        items,
      });
    }
  }
}
