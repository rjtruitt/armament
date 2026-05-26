/**
 * Panel definitions for MCP server and tool configuration.
 */

import type { MenuItem, MenuPanel, SessionMenuConfig, McpServerConfig } from '../types.js';

/** Registers all MCP-related panels into the given map. */
export function registerMcpPanels(
  panels: Map<string, MenuPanel>,
  config: SessionMenuConfig,
  mcpConfigs: McpServerConfig[],
): void {
  panels.set('tools', {
    id: 'tools',
    title: 'Tool Settings',
    parent: 'mcp',
    items: [
      {
        id: 'tools.permissions', label: 'Tool permissions', type: 'choice', value: 'ask',
        choices: [
          { id: 'allow-all', label: 'allow-all', description: 'Auto-approve all' },
          { id: 'ask', label: 'ask', description: 'Prompt for each' },
          { id: 'deny-all', label: 'deny-all', description: 'Block all' },
        ],
      },
      { id: 'tools.autoApprove', label: 'Auto-approve patterns', description: 'Regex patterns', type: 'text', value: '' },
      { id: 'tools.timeout', label: 'Tool timeout', description: 'Seconds', type: 'text', value: '30' },
      { id: 'tools.maxCallsPerTurn', label: 'Max tool calls per turn', description: 'Per LLM turn', type: 'text', value: '25' },
    ],
  });

  const configuredMcp = config.mcpServers ?? [];
  const mcpItems: MenuItem[] = [];
  for (const s of configuredMcp) {
    mcpItems.push({ id: `mcp.${s}`, label: s, description: 'Configured', type: 'submenu' });
  }
  if (configuredMcp.length === 0) {
    mcpItems.push({ id: 'mcp.none', label: '(none configured)', description: '', type: 'display', readonly: true });
  }
  mcpItems.push({ id: 'mcp.new', label: '+ Add MCP server', description: 'Configure a new server', type: 'submenu' });
  mcpItems.push({ id: 'tools', label: 'Tool Settings', description: 'Permissions, timeouts, limits', type: 'submenu' });
  mcpItems.push({ id: 'mcp.json', label: '{ } Edit JSON', description: 'Edit MCP config directly', type: 'json' });
  panels.set('mcp', {
    id: 'mcp',
    title: 'MCP Servers',
    parent: 'root',
    items: mcpItems,
  });

  panels.set('mcp.new', {
    id: 'mcp.new',
    title: 'Add MCP Server',
    parent: 'mcp',
    items: [
      { id: 'mcp.new.name', label: 'Name', description: 'e.g. github, filesystem', type: 'text', value: '' },
      { id: 'mcp.new.transport', label: 'Transport', description: '', type: 'choice', value: 'stdio',
        choices: [
          { id: 'stdio', label: 'stdio', description: 'Command-based (local process)' },
          { id: 'sse', label: 'sse', description: 'Server-Sent Events (legacy)' },
          { id: 'streamable-http', label: 'streamable-http', description: 'HTTP Streamable (recommended)' },
        ],
      },
      { id: 'mcp.new.command', label: 'Command', description: 'npx @mcp/server-github', type: 'text', value: '',
        showWhen: { field: 'transport', values: ['stdio'] } },
      { id: 'mcp.new.args', label: 'Args', description: 'Command arguments, space-separated', type: 'text', value: '',
        showWhen: { field: 'transport', values: ['stdio'] } },
      { id: 'mcp.new.url', label: 'URL', description: 'https://host/mcp/default', type: 'text', value: '',
        showWhen: { field: 'transport', values: ['sse', 'streamable-http'] } },
      { id: 'mcp.new.auth', label: 'Auth', description: '', type: 'submenu',
        showWhen: { field: 'transport', values: ['sse', 'streamable-http'] } },
      { id: 'mcp.new.env', label: 'Env vars', description: 'KEY=value, comma-separated', type: 'text', value: '' },
      { id: 'mcp.new.headers', label: 'Custom headers', description: 'key:value, comma-separated', type: 'text', value: '',
        showWhen: { field: 'transport', values: ['sse', 'streamable-http'] } },
      { id: 'mcp.new.timeout', label: 'Timeout', description: 'Seconds', type: 'text', value: '30' },
      { id: 'mcp.new.retries', label: 'Retries', description: 'On connection failure', type: 'text', value: '3' },
      { id: 'mcp.new.save', label: '✓ Save server', description: '', type: 'submenu' },
    ],
  });

  panels.set('mcp.new.auth', {
    id: 'mcp.new.auth',
    title: 'MCP Auth',
    parent: 'mcp.new',
    items: [
      { id: 'mcp.new.auth.type', label: 'Auth type', description: '', type: 'choice', value: 'none',
        choices: [
          { id: 'none', label: 'none', description: 'No authentication' },
          { id: 'api-key', label: 'api-key', description: 'Static API key in header' },
          { id: 'bearer', label: 'bearer', description: 'Bearer token' },
          { id: 'oauth2-code', label: 'oauth2-code', description: 'OAuth2 auth code + PKCE' },
          { id: 'oauth2-client', label: 'oauth2-client', description: 'OAuth2 client credentials' },
          { id: 'oauth2-device', label: 'oauth2-device', description: 'OAuth2 device code flow' },
        ],
      },
      { id: 'mcp.new.auth.apiKey', label: 'API Key', description: 'Static key value', type: 'text', value: '',
        showWhen: { field: 'type', values: ['api-key'] } },
      { id: 'mcp.new.auth.headerName', label: 'Header name', description: 'Default: Authorization', type: 'text', value: 'Authorization',
        showWhen: { field: 'type', values: ['api-key'] } },
      { id: 'mcp.new.auth.token', label: 'Token', description: 'Bearer/access token', type: 'text', value: '',
        showWhen: { field: 'type', values: ['bearer'] } },
      { id: 'mcp.new.auth.clientName', label: 'Client name', description: 'For registration (default: Armament)', type: 'text', value: 'Armament',
        showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
      { id: 'mcp.new.auth.clientId', label: 'Client ID', description: 'Blank = dynamic registration', type: 'text', value: '',
        showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
      { id: 'mcp.new.auth.clientSecret', label: 'Client secret', description: 'For confidential clients', type: 'text', value: '',
        showWhen: { field: 'type', values: ['oauth2-client'] } },
      { id: 'mcp.new.auth.scopes', label: 'Scopes', description: 'Space-separated', type: 'text', value: '',
        showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
      { id: 'mcp.new.auth.resource', label: 'Resource', description: 'OAuth resource identifier', type: 'text', value: '',
        showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client'] } },
      { id: 'mcp.new.auth.authUrl', label: 'Auth URL', description: 'Override discovery endpoint', type: 'text', value: '',
        showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-device'] } },
      { id: 'mcp.new.auth.tokenUrl', label: 'Token URL', description: 'Override discovery endpoint', type: 'text', value: '',
        showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
      { id: 'mcp.new.auth.pkce', label: 'PKCE', description: 'Required by MCP spec', type: 'toggle', value: true,
        showWhen: { field: 'type', values: ['oauth2-code'] } },
    ],
  });

  for (const s of configuredMcp) {
    const mcpCfg = mcpConfigs.find(c => c.name === s);
    const cfg = mcpCfg?.config ?? {};
    const auth = cfg.auth ?? {};

    panels.set(`mcp.${s}`, {
      id: `mcp.${s}`,
      title: s,
      parent: 'mcp',
      items: [
        { id: `mcp.${s}.settings`, label: 'Settings', description: 'Connection & config', type: 'submenu' },
        { id: `mcp.${s}.auth`, label: 'Auth', description: 'Authentication config', type: 'submenu' },
        { id: `mcp.${s}.status`, label: 'Status', description: 'Connection status', type: 'display', readonly: true },
        { id: `mcp.${s}.remove`, label: '✗ Remove server', description: '', type: 'submenu' },
      ],
    });
    panels.set(`mcp.${s}.settings`, {
      id: `mcp.${s}.settings`,
      title: `${s} Settings`,
      parent: `mcp.${s}`,
      items: [
        { id: `mcp.${s}.settings.name`, label: 'Name', description: '', type: 'text', value: s },
        { id: `mcp.${s}.settings.enabled`, label: 'Enabled', description: '', type: 'toggle', value: true },
        { id: `mcp.${s}.settings.transport`, label: 'Transport', description: '', type: 'choice', value: cfg.transport || 'stdio',
          choices: [
            { id: 'stdio', label: 'stdio', description: 'Command-based (local process)' },
            { id: 'sse', label: 'sse', description: 'Server-Sent Events (legacy)' },
            { id: 'streamable-http', label: 'streamable-http', description: 'HTTP Streamable (recommended)' },
          ],
        },
        { id: `mcp.${s}.settings.command`, label: 'Command', description: 'For stdio transport', type: 'text', value: cfg.command || '',
          showWhen: { field: 'transport', values: ['stdio'] } },
        { id: `mcp.${s}.settings.args`, label: 'Args', description: 'Command arguments', type: 'text', value: cfg.args || '',
          showWhen: { field: 'transport', values: ['stdio'] } },
        { id: `mcp.${s}.settings.url`, label: 'URL', description: 'Server endpoint', type: 'text', value: cfg.url || '',
          showWhen: { field: 'transport', values: ['sse', 'streamable-http'] } },
        { id: `mcp.${s}.settings.env`, label: 'Env vars', description: 'KEY=value, comma-separated', type: 'text', value: cfg.env || '' },
        { id: `mcp.${s}.settings.headers`, label: 'Custom headers', description: 'key:value, comma-separated', type: 'text', value: cfg.headers || '',
          showWhen: { field: 'transport', values: ['sse', 'streamable-http'] } },
        { id: `mcp.${s}.settings.timeout`, label: 'Timeout', description: 'Seconds', type: 'text', value: '30' },
        { id: `mcp.${s}.settings.retries`, label: 'Retries', description: 'On connection failure', type: 'text', value: '3' },
        { id: `mcp.${s}.settings.json`, label: '{ } Edit JSON', description: 'Edit server config directly', type: 'json' },
      ],
    });
    panels.set(`mcp.${s}.auth`, {
      id: `mcp.${s}.auth`,
      title: `${s} Auth`,
      parent: `mcp.${s}`,
      items: [
        { id: `mcp.${s}.auth.type`, label: 'Auth type', description: '', type: 'choice', value: auth.type || 'none',
          choices: [
            { id: 'none', label: 'none', description: 'No authentication' },
            { id: 'api-key', label: 'api-key', description: 'Static API key in header' },
            { id: 'bearer', label: 'bearer', description: 'Bearer token' },
            { id: 'oauth2-code', label: 'oauth2-code', description: 'OAuth2 auth code + PKCE' },
            { id: 'oauth2-client', label: 'oauth2-client', description: 'OAuth2 client credentials' },
            { id: 'oauth2-device', label: 'oauth2-device', description: 'OAuth2 device code flow' },
          ],
        },
        { id: `mcp.${s}.auth.apiKey`, label: 'API Key', description: 'Static key value', type: 'text', value: auth.apiKey || '',
          showWhen: { field: 'type', values: ['api-key'] } },
        { id: `mcp.${s}.auth.headerName`, label: 'Header name', description: 'Default: Authorization', type: 'text', value: auth.headerName || 'Authorization',
          showWhen: { field: 'type', values: ['api-key'] } },
        { id: `mcp.${s}.auth.token`, label: 'Token', description: 'Bearer/access token', type: 'text', value: auth.token || '',
          showWhen: { field: 'type', values: ['bearer'] } },
        { id: `mcp.${s}.auth.clientName`, label: 'Client name', description: 'For registration (default: Armament)', type: 'text', value: auth.clientName || config.mcpClientName || 'Armament',
          showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
        { id: `mcp.${s}.auth.clientId`, label: 'Client ID', description: 'Blank = dynamic registration', type: 'text', value: auth.clientId || '',
          showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
        { id: `mcp.${s}.auth.clientSecret`, label: 'Client secret', description: 'For confidential clients', type: 'text', value: auth.clientSecret || '',
          showWhen: { field: 'type', values: ['oauth2-client'] } },
        { id: `mcp.${s}.auth.scopes`, label: 'Scopes', description: 'Space-separated', type: 'text', value: auth.scopes || '',
          showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
        { id: `mcp.${s}.auth.resource`, label: 'Resource', description: 'OAuth resource identifier', type: 'text', value: auth.resource || '',
          showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client'] } },
        { id: `mcp.${s}.auth.authUrl`, label: 'Auth URL', description: 'Override discovery', type: 'text', value: auth.authUrl || '',
          showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-device'] } },
        { id: `mcp.${s}.auth.tokenUrl`, label: 'Token URL', description: 'Override discovery', type: 'text', value: auth.tokenUrl || '',
          showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
        { id: `mcp.${s}.auth.pkce`, label: 'PKCE', description: 'Required by MCP spec', type: 'toggle', value: auth.pkce !== false,
          showWhen: { field: 'type', values: ['oauth2-code'] } },
        { id: `mcp.${s}.auth.reauth`, label: '↻ Re-authenticate', description: 'Trigger auth flow now', type: 'submenu',
          showWhen: { field: 'type', values: ['oauth2-code', 'oauth2-client', 'oauth2-device'] } },
      ],
    });
  }

  panels.set('mcp.github', panels.get('mcp.github') ?? {
    id: 'mcp.github',
    title: 'GitHub MCP',
    parent: 'mcp',
    items: [
      { id: 'mcp.github.token', label: 'Token', description: 'ghp_***', type: 'text', value: '' },
      { id: 'mcp.github.defaultOrg', label: 'Default org', type: 'text', value: '' },
      { id: 'mcp.github.allowedRepos', label: 'Allowed repos', description: 'Comma-separated', type: 'text', value: '' },
      { id: 'mcp.github.deniedRepos', label: 'Denied repos', description: 'Comma-separated', type: 'text', value: '' },
    ],
  });
  panels.set('mcp.glean', panels.get('mcp.glean') ?? {
    id: 'mcp.glean',
    title: 'Glean MCP',
    parent: 'mcp',
    items: [
      { id: 'mcp.glean.endpoint', label: 'API endpoint', type: 'text', value: '' },
      { id: 'mcp.glean.authToken', label: 'Auth token', description: '••••••••', type: 'text', value: '' },
      {
        id: 'mcp.glean.indexScope', label: 'Index scope', type: 'choice', value: 'all',
        choices: [
          { id: 'all', label: 'all', description: 'All indexed content' },
          { id: 'engineering', label: 'engineering', description: 'Engineering docs only' },
          { id: 'docs', label: 'docs', description: 'Documentation only' },
        ],
      },
    ],
  });
}
