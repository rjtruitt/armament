import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { UserConfig } from '../config/index.js';
import { logError } from '../core/index.js';
import type { ITool } from 'iteratio';
import { McpToolExecution } from './McpToolExecution.js';

/**
 * MCP server connection state.
 */
export interface McpServer {
  name: string;
  config: any;
  status: string;
  tools: any[];
  client?: import('@modelcontextprotocol/sdk/client/index.js').Client;
  transport?: import('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport;
}

/**
 * Callbacks for MCP events that the host (ArmamentApp) provides.
 */
export interface McpManagerCallbacks {
  writeMessage(type: string, sender: string, text: string, channel?: string): void;
  startThinking(channel?: string): void;
  stopThinking(): void;
  rebuildMcpMenu(names: string[], configs: Array<{ name: string; config: any }>): void;
  getChannelAgents(): Map<string, { registerTools(tools: ITool[]): void; deregisterTool(name: string): boolean }>;
}

/**
 * Manages MCP server connections, tool discovery, config persistence, and auth flows.
 */
export class McpManager {
  private mcpServers: Map<string, McpServer> = new Map();
  private callbacks: McpManagerCallbacks;
  private toolExec: McpToolExecution;

  constructor(callbacks: McpManagerCallbacks) {
    this.callbacks = callbacks;
    this.toolExec = new McpToolExecution(
      this.mcpServers,
      callbacks,
      (name: string) => this.reconnectMcpAuth(name),
    );
  }

  /** Get the internal server map (read-only access for iteration). */
  getServers(): Map<string, McpServer> {
    return this.mcpServers;
  }

  /** Get a single server entry by name. */
  getServer(name: string): McpServer | undefined {
    return this.mcpServers.get(name);
  }

  /** Set or replace a server entry. */
  setServer(name: string, server: McpServer): void {
    this.mcpServers.set(name, server);
  }

  /** Delete a server entry. */
  deleteServer(name: string): void {
    this.mcpServers.delete(name);
  }

  /** Check if a server exists by name. */
  hasServer(name: string): boolean {
    return this.mcpServers.has(name);
  }

  /** Get all server names. */
  getServerNames(): string[] {
    return [...this.mcpServers.keys()];
  }

  /** Get all servers as an array. */
  getServerValues(): McpServer[] {
    return [...this.mcpServers.values()];
  }

  /** Get status array for all servers. */
  getStatusList(): Array<{ name: string; status: string }> {
    return [...this.mcpServers.values()].map(s => ({
      name: s.name,
      status: s.status,
    }));
  }

  /** Connect to an MCP server via streamable-http or stdio. */
  async connectMcp(name: string, config: any, opts?: { nonInteractive?: boolean }): Promise<void> {
    const transport = this.getMcpTransportType(config);
    this.callbacks.writeMessage('system', 'mcp',
      `Connecting to ${name} (${transport})...`, '#logs');

    const existing = this.mcpServers.get(name);
    if (existing?.client) {
      try { await existing.client.close(); } catch (e) { logError('mcp', 'Failed to close existing client', e); }
    }

    let mcpClient: import('@modelcontextprotocol/sdk/client/index.js').Client | undefined;
    let mcpTransport: import('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport | undefined;
    let tools: any[] = [];

    if ((transport === 'streamable-http' || transport === 'sse') && config.url) {
      try {
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
        const { McpOAuthProvider } = await import('./McpOAuthProvider.js');

        const auth = config.auth ?? {};
        const userConfig = UserConfig.instance();
        const authProvider = new McpOAuthProvider({
          serverName: name,
          serverUrl: config.url,
          clientName: auth.clientName || userConfig.mcpClientName,
          scopes: auth.scopes ? (Array.isArray(auth.scopes) ? auth.scopes : auth.scopes.split(' ')) : [],
          onMessage: (msg: string) => this.callbacks.writeMessage('system', 'auth', msg, '#control'),
        });

        const existingTokens = await authProvider.tokens();
        if (!existingTokens) {
          await authProvider.ensureCallbackReady();
        }

        mcpTransport = new StreamableHTTPClientTransport(
          new URL(config.url),
          { authProvider },
        );

        mcpClient = new Client({ name: 'armament', version: '1.0.0' });

        try {
          await mcpClient.connect(mcpTransport);
        } catch (authErr: unknown) {
          this.callbacks.writeMessage('system', 'mcp',
            `${name} connect error: [${authErr instanceof Error ? authErr.constructor?.name : typeof authErr}] ${authErr instanceof Error ? authErr.message : String(authErr)}`, '#logs');
          const isAuthErr = authErr instanceof Error
            && (authErr.constructor?.name === 'UnauthorizedError'
            || authErr.constructor?.name === 'StreamableHTTPError'
            || authErr.message?.includes('Unauthorized')
            || authErr.message?.includes('401')
            || (authErr as any).code === 401);
          if (isAuthErr && opts?.nonInteractive) {
            throw new Error(`${name} requires authentication`);
          } else if (isAuthErr) {
            await authProvider.ensureCallbackReady();

            this.callbacks.writeMessage('system', 'mcp',
              `${name} requires auth — waiting for browser...`, '#logs');
            this.mcpServers.set(name, { name, config, status: 'auth_pending', tools: [] });
            this.persistMcpConfig();
            const cfgs = this.loadMcpConfig();
            this.callbacks.rebuildMcpMenu(cfgs.map(c => c.name), cfgs);

            const code = await authProvider.waitForAuthCode();
            await mcpTransport.finishAuth(code);

            mcpTransport = new StreamableHTTPClientTransport(
              new URL(config.url),
              { authProvider },
            );
            mcpClient = new Client({ name: 'armament', version: '1.0.0' });
            await mcpClient.connect(mcpTransport);
          } else {
            throw authErr;
          }
        }

        const toolsResult = await mcpClient.listTools();
        tools = (toolsResult.tools ?? []).map((t: any) => ({
          name: t.name,
          description: t.description ?? `${t.name} tool`,
          inputSchema: t.inputSchema,
        }));
        this.callbacks.writeMessage('system', 'mcp',
          `Discovered ${tools.length} tools from ${name}`, '#logs');

        const postConnectTokens = await authProvider.tokens();
        if (!postConnectTokens) {
          this.callbacks.writeMessage('system', 'mcp',
            `${name} connected but needs auth — use /mcp auth ${name}`, '#logs');
          this.mcpServers.set(name, { name, config, status: 'needs_auth', tools, client: mcpClient, transport: mcpTransport });
          this.persistMcpConfig();
          const cfgs = this.loadMcpConfig();
          this.callbacks.rebuildMcpMenu(cfgs.map(c => c.name), cfgs);
          return;
        }
      } catch (e: unknown) {
        this.callbacks.writeMessage('system', 'mcp',
          `SDK connect failed: ${e instanceof Error ? e.message : String(e)}`, '#logs');
        tools = this.toolExec.discoverToolsForServer(name, config);
      }
    } else {
      tools = config.tools ?? this.toolExec.discoverToolsForServer(name, config);
    }

    this.mcpServers.set(name, {
      name,
      config,
      status: 'connected',
      tools,
      client: mcpClient,
      transport: mcpTransport,
    });

    this.toolExec.injectMcpToolsIntoAgents(name, tools, config);

    this.callbacks.writeMessage('system', 'mcp',
      `✓ ${name} connected (${tools.length} tools)`, '#logs');

    this.persistMcpConfig();
    const configs = this.loadMcpConfig();
    this.callbacks.rebuildMcpMenu(configs.map(c => c.name), configs);
  }

  /** Disconnect and remove an MCP server. */
  async disconnectMcp(name: string): Promise<void> {
    const server = this.mcpServers.get(name);
    if (server) {
      const toolPrefix = `mcp__${name}__`;
      for (const [chName, agent] of this.callbacks.getChannelAgents().entries()) {
        for (const tool of server.tools) {
          agent.deregisterTool(`${toolPrefix}${tool.name}`);
        }
        this.callbacks.writeMessage('system', 'mcp',
          `Removed ${server.tools.length} tools from ${chName}`, '#logs');
      }
      if (server.client) {
        try { await server.client.close(); } catch (e) { logError("mcp", "Error", e); }
      }
      this.mcpServers.delete(name);
    }
  }

  /** Re-authenticate an MCP server (re-trigger OAuth/SSO). */
  async reconnectMcpAuth(name: string): Promise<void> {
    const server = this.mcpServers.get(name);
    if (!server) return;
    try {
      const { McpOAuthProvider } = await import('./McpOAuthProvider.js');
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const auth = server.config.auth ?? {};
      const userConfig = UserConfig.instance();
      const authProvider = new McpOAuthProvider({
        serverName: name,
        serverUrl: server.config.url,
        clientName: auth.clientName || userConfig.mcpClientName,
        scopes: auth.scopes ? (Array.isArray(auth.scopes) ? auth.scopes : auth.scopes.split(' ')) : [],
        onMessage: (msg: string) => this.callbacks.writeMessage('system', 'auth', msg, '#control'),
      });

      await authProvider.ensureCallbackReady();

      this.callbacks.writeMessage('system', 'mcp',
        `${name} needs auth — opening browser...`, '#logs');

      const transport = new StreamableHTTPClientTransport(
        new URL(server.config.url),
        { authProvider },
      );
      const client = new Client({ name: 'armament', version: '1.0.0' });

      try {
        await client.connect(transport);
      } catch (authErr: unknown) {
        if (authErr instanceof Error && authErr.constructor?.name === 'UnauthorizedError') {
          const code = await authProvider.waitForAuthCode();
          await transport.finishAuth(code);
          const freshTransport = new StreamableHTTPClientTransport(
            new URL(server.config.url),
            { authProvider },
          );
          const freshClient = new Client({ name: 'armament', version: '1.0.0' });
          await freshClient.connect(freshTransport);
          const toolsResult = await freshClient.listTools();
          const tools = (toolsResult.tools ?? []).map((t: any) => ({
            name: t.name,
            description: t.description ?? `${t.name} tool`,
            inputSchema: t.inputSchema,
          }));
          this.mcpServers.set(name, { ...server, status: 'connected', tools, client: freshClient, transport: freshTransport });
          this.toolExec.injectMcpToolsIntoAgents(name, tools, server.config);
          this.persistMcpConfig();
          return;
        }
        throw authErr;
      }
      const toolsResult = await client.listTools();
      const tools = (toolsResult.tools ?? []).map((t: any) => ({
        name: t.name,
        description: t.description ?? `${t.name} tool`,
        inputSchema: t.inputSchema,
      }));
      this.mcpServers.set(name, { ...server, status: 'connected', tools, client, transport });
      this.toolExec.injectMcpToolsIntoAgents(name, tools, server.config);
      this.persistMcpConfig();
    } catch (e: unknown) {
      await this.connectMcp(name, server.config);
    }
  }

  /** Trigger authentication flow for an MCP server via the picker/widget. */
  triggerMcpAuth(serverName: string): void {
    const server = this.mcpServers.get(serverName);
    if (!server) return;
    this.mcpServers.set(serverName, { ...server, status: 'auth_pending' });
    this.callbacks.startThinking(undefined);
    this.callbacks.writeMessage('system', 'auth',
      `Authenticating ${serverName}...`, '#control');
    this.reconnectMcpAuth(serverName).then(() => {
      this.callbacks.stopThinking();
      this.callbacks.writeMessage('system', '*',
        `"${serverName}" authenticated (${this.mcpServers.get(serverName)?.tools.length ?? 0} tools)`);
    }).catch((err: unknown) => {
      this.callbacks.stopThinking();
      this.mcpServers.set(serverName, { ...server, status: 'needs_auth' });
      this.callbacks.writeMessage('system', 'error',
        `Auth failed for ${serverName}: ${err instanceof Error ? err.message : String(err)}`, '#control');
    });
  }

  /** Show the MCP server picker in the TUI. */
  showMcpPicker(showPicker: (title: string, items: any[], onSelect: (item: any) => void) => void): void {
    const items = [...this.mcpServers.values()].map(s => {
      const transport = this.getMcpTransportType(s.config);
      const authStatus = s.status === 'connected' ? 'auth:ok' : 'auth:expired';
      const indicator = s.status === 'connected' ? '●' : '○';
      return {
        name: s.name,
        description: `${indicator} ${transport}  ${authStatus}  ${s.tools.length} tools`,
        category: 'config' as const,
      };
    });
    if (items.length === 0) {
      this.callbacks.writeMessage('system', '*', 'No MCP servers configured. Use /mcp add <name> {...} to add one.');
      return;
    }
    showPicker('MCP servers — select to re-auth', items, (selected: any) => {
      this.triggerMcpAuth(selected.name);
    });
  }

  /** Get ITool wrappers for all connected MCP servers. */
  getConnectedMcpITools(): ITool[] {
    return this.toolExec.getConnectedMcpITools();
  }

  /** Determine transport type from config. */
  getMcpTransportType(config: any): string {
    if (!config) return 'stdio';
    if (config.url || config.baseUrl) {
      if (config.transport === 'sse') return 'sse';
      return 'streamable-http';
    }
    if (config.command) return 'stdio';
    if (config.transport) return config.transport;
    return 'stdio';
  }

  /** Persist MCP server configs to ~/.armament/mcp.json. */
  persistMcpConfig(): void {
    const dir = path.join(homedir(), '.arma');
    const file = path.join(dir, 'mcp.json');
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let existing: Array<{ name: string; config: any }> = [];
      try {
        if (fs.existsSync(file)) {
          existing = JSON.parse(fs.readFileSync(file, 'utf8'));
        }
      } catch (e) { logError("mcp", "Error", e); }
      const data = [...this.mcpServers.entries()].map(([n, s]) => {
        const prev = existing.find(e => e.name === n);
        const config = prev ? { ...prev.config, ...s.config } : s.config;
        // Deep-merge auth: file-persisted tokens/clientId must survive in-memory config overlay
        if (prev?.config?.auth) {
          config.auth = { ...prev.config.auth, ...(s.config.auth || {}) };
        }
        return { name: n, config };
      });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch {
      // best-effort
    }
  }

  /** Load MCP server configs from ~/.armament/mcp.json. */
  loadMcpConfig(): Array<{ name: string; config: any }> {
    const file = path.join(homedir(), '.arma', 'mcp.json');
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch {
      // best-effort
    }
    return [];
  }
}
