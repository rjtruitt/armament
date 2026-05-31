import { ConfigPane, registerSchema } from '../../tui/index.js';

export function registerMcpSchemas(
  pane: ConfigPane,
  mcpConfigs: Array<{ name: string; config: any }>,
): void {
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
