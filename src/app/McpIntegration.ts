import type { McpManager, McpServer } from './McpManager.js';
import type { TuiRenderer } from './TuiRenderer.js';

/** Interface for McpIntegrationDeps.
 * @property {McpManager} mcpManager - Description of mcpManager.
 */
export interface McpIntegrationDeps {
  mcpManager: McpManager;
  getTui: () => TuiRenderer | null;
  getConfig: () => any;
  getActiveProvider: () => string;
}

/** Class representing McpIntegration. */
export class McpIntegration {
  private deps: McpIntegrationDeps;

  constructor(deps: McpIntegrationDeps) {
    this.deps = deps;
  }

  private get mcpServers(): Map<string, McpServer> {
    return this.deps.mcpManager.getServers();
  }

  /**
   * Gets the mcp transport type.
   */
  getMcpTransportType(config: any): string {
    return this.deps.mcpManager.getMcpTransportType(config);
  }

  /**
   * Gets the configured mcp server entries.
   */
  getConfiguredMcpServerEntries(): Array<{ name: string; config: any }> {
    return [];
  }

  /**
   * Show mcp picker.
   */
  showMcpPicker(): void {
    const tui = this.deps.getTui();
    if (!tui) return;
    this.deps.mcpManager.showMcpPicker((title, items, onSelect) => {
      tui.showPicker(title, items, onSelect);
    });
  }

  /**
   * Trigger mcp auth.
   */
  triggerMcpAuth(serverName: string): void {
    this.deps.mcpManager.triggerMcpAuth(serverName);
  }

  /**
   * Connect mcp.
   */
  async connectMcp(name: string, config: any, opts?: { nonInteractive?: boolean }): Promise<void> {
    return this.deps.mcpManager.connectMcp(name, config, opts);
  }

  /**
   * Load mcp config.
   */
  loadMcpConfig(): Array<{ name: string; config: any }> {
    return this.deps.mcpManager.loadMcpConfig();
  }

  /**
   * Disconnect mcp.
   */
  async disconnectMcp(name: string): Promise<void> {
    return this.deps.mcpManager.disconnectMcp(name);
  }

  /**
   * Gets the mcp server names.
   */
  getMcpServerNames(): string[] {
    return [...this.mcpServers.keys()];
  }

  /**
   * Gets the mcp tools.
   */
  getMcpTools(serverName: string): any[] {
    const server = this.mcpServers.get(serverName);
    return server?.tools ?? [];
  }

  /**
   * Gets the mcp server status.
   */
  getMcpServerStatus(serverName: string): string {
    const server = this.mcpServers.get(serverName);
    return server?.status ?? 'disconnected';
  }

  /**
   * Simulate mcp crash.
   */
  simulateMcpCrash(serverName: string): void {
    const server = this.mcpServers.get(serverName);
    if (server) {
      server.status = 'crashed';
    }
  }

  /**
   * Format mcp status.
   */
  formatMcpStatus(args: string[]): string {
    if (args.length > 0) {
      const subCmd = args[0].toLowerCase();

      if (subCmd === 'add' && args[1]) {
        try {
          const rest = args.slice(1);
          let name: string;
          let config: any;
          if (rest[0].startsWith('{')) {
            config = JSON.parse(rest.join(' '));
            name = config.name ?? new URL(config.url).hostname.split('.')[0];
          } else {
            name = rest[0];
            config = rest.length > 1 ? JSON.parse(rest.slice(1).join(' ')) : {};
          }
          const transport = config.transport ?? (config.url ? 'streamable-http' : 'stdio');
          config.transport = transport;
          this.connectMcp(name, config).then(() => {
            this.deps.getTui()?.writeMessage('system', '*',
              `MCP server "${name}" connected (${this.mcpServers.get(name)?.tools.length ?? 0} tools)`);
          }).catch((err: Error) => {
            this.deps.getTui()?.writeMessage('system', '*',
              `MCP server "${name}" failed: ${err.message}`);
          });
          return `Adding MCP server "${name}" (${transport})...`;
        } catch (e: any) {
          return `Error: invalid config — usage: /mcp add <name> {"url":"..."}`;
        }
      }

      if (subCmd === 'list') {
        this.showMcpPicker();
        return '';
      }

      if (subCmd === 'restart' && args[1]) {
        const name = args[1];
        const server = this.mcpServers.get(name);
        if (!server) {
          return `MCP server "${name}" not found`;
        }
        this.connectMcp(name, server.config).then(() => {
          this.deps.getTui()?.writeMessage('system', '*',
            `MCP server "${name}" reconnected (${this.mcpServers.get(name)?.tools.length ?? 0} tools)`);
        }).catch((err: Error) => {
          this.deps.getTui()?.writeMessage('system', '*',
            `MCP server "${name}" restart failed: ${err.message}`);
        });
        return `Restarting MCP server "${name}"...`;
      }

      if (subCmd === 'auth' && args[1]) {
        const name = args[1];
        const server = this.mcpServers.get(name);
        if (!server) {
          return `MCP server "${name}" not found`;
        }
        this.connectMcp(name, server.config).catch((e: Error) => {
          this.deps.getTui()?.writeMessage('system', 'auth',
            `${name} auth failed: ${e.message}`, '#logs');
        });
        return `Authenticating "${name}"...`;
      }

      if (subCmd === 'tools' && args[1]) {
        const name = args[1];
        const server = this.mcpServers.get(name);
        if (!server) {
          return `MCP server "${name}" not found`;
        }
        if (server.tools.length === 0) {
          return `No tools available from "${name}"`;
        }
        const lines = [`── tools from ${name} ──`];
        for (const tool of server.tools) {
          lines.push(`  ${tool.name}${tool.description ? `  ${tool.description}` : ''}`);
        }
        return lines.join('\n');
      }
    }

    const connectedServers = [...this.mcpServers.values()];
    const configuredServers = this.deps.getConfig().providers
      ? this.getConfiguredMcpServerEntries()
      : [];

    if (connectedServers.length === 0 && configuredServers.length === 0) {
      return '── MCP servers ──────────────────────────\n  (none configured)';
    }

    const lines = ['── MCP servers ──────────────────────────'];
    const fileConfigs = this.loadMcpConfig();

    for (const server of connectedServers) {
      const transport = this.getMcpTransportType(server.config);
      const state = server.status === 'connected' ? 'connected'
        : server.status === 'auth_pending' ? 'auth pending'
        : server.status === 'auth_expired' ? 'auth expired'
        : server.status === 'crashed' ? 'error' : 'disconnected';
      const indicator = state === 'connected' ? '●' : '○';
      const toolCount = server.tools.length > 0 ? `${server.tools.length} tools` : '';
      let authPart = '';
      if (transport === 'streamable-http' || transport === 'sse' || transport === 'http') {
        const fileAuth = fileConfigs.find(c => c.name === server.name)?.config?.auth;
        const authConf = fileAuth || server.config?.auth;
        if (authConf?.expiresAt) {
          const expired = Date.now() > authConf.expiresAt;
          authPart = expired ? '  auth:expired' : '  auth:ok';
        } else if (authConf?.accessToken) {
          authPart = '  auth:ok';
        } else if (server.status === 'auth_pending') {
          authPart = '  auth:pending';
        } else {
          authPart = '  auth:none';
        }
      }
      lines.push(`  ${indicator} ${server.name.padEnd(14)} ${transport.padEnd(9)} ${state}${authPart}  ${toolCount}`);
    }

    for (const entry of configuredServers) {
      if (!this.mcpServers.has(entry.name)) {
        const transport = this.getMcpTransportType(entry.config);
        let authPart = '';
        if (transport === 'streamable-http' || transport === 'sse' || transport === 'http') {
          const fileAuth = fileConfigs.find(c => c.name === entry.name)?.config?.auth;
          if (fileAuth?.expiresAt && Date.now() > fileAuth.expiresAt) {
            authPart = '  auth:expired';
          } else if (fileAuth?.accessToken) {
            authPart = '  auth:ok';
          } else {
            authPart = '  auth:none';
          }
        }
        lines.push(`  ○ ${entry.name.padEnd(14)} ${transport.padEnd(9)} disconnected${authPart}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format providers status.
   */
  formatProvidersStatus(): string {
    const config = this.deps.getConfig();
    const providers = config.providers;

    if (!providers || providers.length === 0) {
      return '── providers ────────────────────────────\n  (none configured)';
    }

    const lines = ['── providers ────────────────────────────'];
    const activeProvider = this.deps.getActiveProvider();

    for (const p of providers) {
      const isActive = p.type === activeProvider;
      const indicator = isActive ? '●' : '○';
      const state = isActive ? 'connected' : 'configured';
      const models = p.models && p.models.length > 0
        ? `  models: ${p.models.map((m: any) => typeof m === 'string' ? m : m.name).join(', ')}`
        : '';

      lines.push(`  ${indicator} ${p.type.padEnd(12)} ${state}${models}`);
    }

    return lines.join('\n');
  }
}
