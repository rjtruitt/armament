import { z } from 'zod';
import type { ITool, ToolResult } from 'iteratio';
import type { McpServer, McpManagerCallbacks } from './McpManager.js';

/**
 * Handles MCP tool building, execution, schema conversion, and injection into agents.
 */
export class McpToolExecution {
  private mcpServers: Map<string, McpServer>;
  private callbacks: McpManagerCallbacks;
  private reconnectAuth: (serverName: string) => Promise<void>;

  constructor(
    mcpServers: Map<string, McpServer>,
    callbacks: McpManagerCallbacks,
    reconnectAuth: (serverName: string) => Promise<void>,
  ) {
    this.mcpServers = mcpServers;
    this.callbacks = callbacks;
    this.reconnectAuth = reconnectAuth;
  }

  /** Get ITool wrappers for all connected MCP servers. */
  getConnectedMcpITools(): ITool[] {
    const all: ITool[] = [];
    for (const [name, server] of this.mcpServers) {
      if (server.status === 'connected') {
        all.push(...this.buildMcpITools(name, server.tools, server.config));
      }
    }
    return all;
  }

  /** Build ITool array for a specific server's tools. */
  buildMcpITools(serverName: string, tools: Array<{ name: string; description: string; inputSchema?: any }>, _config: any): ITool[] {
    return tools.map(t => ({
      name: `mcp__${serverName}__${t.name}`,
      description: `[${serverName}] ${t.description}`,
      schema: this.mcpInputToZod(t.inputSchema),
      execute: async (args: unknown): Promise<ToolResult> => {
        const server = this.mcpServers.get(serverName);
        if (server?.client) {
          try {
            const result = await server.client.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> });
            return { success: true, data: result };
          } catch (err: any) {
            if (err.constructor?.name === 'UnauthorizedError' || err.message?.includes('401')) {
              try {
                await this.reconnectAuth(serverName);
                const refreshed = this.mcpServers.get(serverName);
                if (refreshed?.client) {
                  const result = await refreshed.client.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> });
                  return { success: true, data: result };
                }
              } catch {}
              server.status = 'auth_expired';
              this.callbacks.writeMessage('system', 'mcp',
                `${serverName} auth expired — run /mcp auth ${serverName}`, '#control');
              return { success: false, error: { message: `Auth expired for ${serverName}. Run: /mcp auth ${serverName}`, code: 'AUTH_EXPIRED' } };
            }
            return { success: false, error: { message: err.message, code: 'MCP_ERROR' } };
          }
        }
        return { success: false, error: { message: `No active connection to ${serverName}. Run: /mcp auth ${serverName}`, code: 'NOT_CONNECTED' } };
      },
    }));
  }

  /** Inject MCP tools into all running channel agents. */
  injectMcpToolsIntoAgents(name: string, tools: Array<{ name: string; description: string; inputSchema?: any }>, config: any): void {
    const itools = this.buildMcpITools(name, tools, config);
    for (const [chName, agent] of this.callbacks.getChannelAgents().entries()) {
      try {
        agent.registerTools(itools);
        this.callbacks.writeMessage('system', 'mcp',
          `Injected ${itools.length} tools into ${chName}`, '#logs');
      } catch (e: any) {
        this.callbacks.writeMessage('system', 'mcp',
          `Failed to inject tools into ${chName}: ${e.message}`, '#logs');
      }
    }
  }

  /** Discover tools for a server based on known server names. */
  discoverToolsForServer(name: string, config: any): Array<{ name: string; description: string; inputSchema?: any }> {
    const querySchema = { type: 'object', properties: { query: { type: 'string', description: 'Search query or question' } }, required: ['query'] };
    const knownServers: Record<string, Array<{ name: string; description: string; inputSchema?: any }>> = {
      glean: [
        { name: 'search', description: 'Search internal knowledge base', inputSchema: querySchema },
        { name: 'chat', description: 'Ask questions across company data', inputSchema: querySchema },
        { name: 'read_document', description: 'Read a document by URL', inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'Document URL to read' } }, required: ['url'] } },
        { name: 'meeting_lookup', description: 'Find calendar meetings', inputSchema: querySchema },
        { name: 'outlook_search', description: 'Search Outlook emails', inputSchema: querySchema },
      ],
      github: [
        { name: 'search_code', description: 'Search code across repos', inputSchema: querySchema },
        { name: 'create_pr', description: 'Create a pull request', inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, repo: { type: 'string' } }, required: ['title', 'repo'] } },
        { name: 'list_issues', description: 'List repository issues', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, state: { type: 'string' } }, required: ['repo'] } },
        { name: 'get_file_contents', description: 'Read file from repo', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, path: { type: 'string' } }, required: ['repo', 'path'] } },
      ],
      atlassian: [
        { name: 'search', description: 'Search Jira and Confluence', inputSchema: querySchema },
        { name: 'getJiraIssue', description: 'Get Jira issue details', inputSchema: { type: 'object', properties: { issueKey: { type: 'string', description: 'Issue key (e.g. PROJ-123)' } }, required: ['issueKey'] } },
        { name: 'createJiraIssue', description: 'Create a Jira issue', inputSchema: { type: 'object', properties: { project: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' } }, required: ['project', 'summary'] } },
        { name: 'getConfluencePage', description: 'Read a Confluence page', inputSchema: { type: 'object', properties: { pageId: { type: 'string' } }, required: ['pageId'] } },
      ],
    };
    const lcName = name.toLowerCase();
    for (const [key, tools] of Object.entries(knownServers)) {
      if (lcName.includes(key)) return tools;
    }
    if (config.url) {
      return [{ name: `${name}_query`, description: `Query ${name} server`, inputSchema: querySchema }];
    }
    return [{ name: `${name}_tool`, description: `Tool from ${name}`, inputSchema: querySchema }];
  }

  /** Convert MCP input schema JSON to zod schema. */
  mcpInputToZod(inputSchema?: any): z.ZodType<any> {
    if (!inputSchema || !inputSchema.properties) {
      return z.object({}).passthrough();
    }
    const shape: Record<string, z.ZodType<any>> = {};
    const required = new Set(inputSchema.required ?? []);
    for (const [key, prop] of Object.entries(inputSchema.properties as Record<string, any>)) {
      let field: z.ZodType<any>;
      switch (prop.type) {
        case 'number': case 'integer': field = z.number(); break;
        case 'boolean': field = z.boolean(); break;
        case 'array': field = z.array(z.any()); break;
        default: field = z.string(); break;
      }
      if (prop.description) field = field.describe(prop.description);
      if (!required.has(key)) field = field.optional();
      shape[key] = field;
    }
    return z.object(shape).passthrough();
  }
}
