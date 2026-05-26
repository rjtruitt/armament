/** Interface that all mock MCP servers must implement. */
export interface MockMCPServer {
  getTools(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
/**
 * Mock server entry interface.
 */
/** Registered mock server entry in the registry. */
/** Registered mock server entry in the registry. */
export interface MockServerEntry {
  name: string;
  category: string;
  instance: MockMCPServer;
  tools: string[];
}
/**
 * Tool call result interface.
 */
/** Result of a tool call routed through the registry. */
/** Result of a tool call routed through the registry. */
export interface ToolCallResult {
  server: string;
  tool: string;
  result: unknown;
  duration_ms: number;
  error?: string;
}
/**
 * Registry config interface.
 */
/** Configuration for the MockMCPRegistry. */
/** Configuration for the MockMCPRegistry. */
export interface RegistryConfig {
  /** If true, logs all tool calls to an internal history */
  enableHistory?: boolean;
  /** Maximum history entries to keep */
  maxHistory?: number;
}
/**
 * History entry interface.
 */
/** An entry in the tool call history log. */
/** An entry in the tool call history log. */
export interface HistoryEntry {
  timestamp: number;
  server: string;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration_ms: number;
}
/**
 * Mock m c p registry class.
 */
/**
 * Registry holding all mock MCP servers for simulating tool execution.
 * Provides tool routing, call history, and server management.
 */
/**
 * Registry holding all mock MCP servers for simulating tool execution.
 * Provides tool routing, call history, and server management.
 */
export class MockMCPRegistry {
  private servers: Map<string, MockServerEntry> = new Map();
  private toolIndex: Map<string, string> = new Map(); // tool_name -> server_name
  private history: HistoryEntry[] = [];
  private config: Required<RegistryConfig>;
  constructor(config?: RegistryConfig) {
    this.config = {
      enableHistory: config?.enableHistory ?? true,
      maxHistory: config?.maxHistory ?? 1000,
    };
  }
  /**
   * Register a mock server with the registry.
   */
  register(name: string, category: string, instance: MockMCPServer): void {
    if (this.servers.has(name)) {
      throw new Error(`Server already registered: ${name}`);
    }
    const tools = instance.getTools();
    const toolNames = tools.map((t) => t.name);
    for (const toolName of toolNames) {
      const existing = this.toolIndex.get(toolName);
      if (existing) {
        const namespacedOld = `${existing}__${toolName}`;
        const namespacedNew = `${name}__${toolName}`;
        this.toolIndex.delete(toolName);
        this.toolIndex.set(namespacedOld, existing);
        this.toolIndex.set(namespacedNew, name);
      } else {
        this.toolIndex.set(toolName, name);
      }
    }
    this.servers.set(name, {
      name,
      category,
      instance,
      tools: toolNames,
    });
  }
  /**
   * Unregister a server from the registry.
   */
  unregister(name: string): void {
    const entry = this.servers.get(name);
    if (!entry) return;
    for (const [toolName, serverName] of this.toolIndex) {
      if (serverName === name || toolName.startsWith(`${name}__`)) {
        this.toolIndex.delete(toolName);
      }
    }
    this.servers.delete(name);
  }
  /**
   * Call a tool by name. Automatically routes to the correct server.
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const startTime = Date.now();
    let serverName = this.toolIndex.get(toolName);
    let actualToolName = toolName;
    if (!serverName) {
      const parts = toolName.split('__');
      if (parts.length === 2) {
        serverName = parts[0];
        actualToolName = parts[1];
      }
    }
    if (!serverName) {
      const error = `No server found for tool: ${toolName}. Available tools: ${Array.from(this.toolIndex.keys()).join(', ')}`;
      if (this.config.enableHistory) {
        this.addHistory(toolName, 'unknown', args, undefined, error, Date.now() - startTime);
      }
      return { server: 'unknown', tool: toolName, result: null, duration_ms: Date.now() - startTime, error };
    }
    const entry = this.servers.get(serverName);
    if (!entry) {
      const error = `Server not found: ${serverName}`;
      return { server: serverName, tool: actualToolName, result: null, duration_ms: Date.now() - startTime, error };
    }
    try {
      const result = await entry.instance.callTool(actualToolName, args);
      const duration = Date.now() - startTime;
      if (this.config.enableHistory) {
        this.addHistory(actualToolName, serverName, args, result, undefined, duration);
      }
      return { server: serverName, tool: actualToolName, result, duration_ms: duration };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      if (this.config.enableHistory) {
        this.addHistory(actualToolName, serverName, args, undefined, error, duration);
      }
      return { server: serverName, tool: actualToolName, result: null, duration_ms: duration, error };
    }
  }
  /**
   * Get all tools from all registered servers.
   */
  getAllTools(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    server: string;
    category: string;
  }> {
    const tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      server: string;
      category: string;
    }> = [];
    for (const [, entry] of this.servers) {
      const serverTools = entry.instance.getTools();
      for (const tool of serverTools) {
        tools.push({
          ...tool,
          server: entry.name,
          category: entry.category,
        });
      }
    }
    return tools;
  }
  /**
   * Get tools from a specific server.
   */
  getServerTools(name: string): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    const entry = this.servers.get(name);
    if (!entry) {
      throw new Error(`Server not found: ${name}`);
    }
    return entry.instance.getTools();
  }
  /**
   * Get all registered servers.
   */
  getServers(): Array<{ name: string; category: string; toolCount: number }> {
    return Array.from(this.servers.values()).map((entry) => ({
      name: entry.name,
      category: entry.category,
      toolCount: entry.tools.length,
    }));
  }
  /**
   * Get servers by category.
   */
  getServersByCategory(category: string): MockServerEntry[] {
    return Array.from(this.servers.values()).filter((e) => e.category === category);
  }
  /**
   * Get the server instance directly (for direct method calls in tests).
   */
  getServerInstance<T extends MockMCPServer>(name: string): T {
    const entry = this.servers.get(name);
    if (!entry) {
      throw new Error(`Server not found: ${name}`);
    }
    return entry.instance as T;
  }
  /**
   * Get call history (if enabled).
   */
  getHistory(filter?: { server?: string; tool?: string; limit?: number }): HistoryEntry[] {
    let result = [...this.history];
    if (filter?.server) {
      result = result.filter((h) => h.server === filter.server);
    }
    if (filter?.tool) {
      result = result.filter((h) => h.tool === filter.tool);
    }
    if (filter?.limit) {
      result = result.slice(-filter.limit);
    }
    return result;
  }
  /**
   * Clear call history.
   */
  clearHistory(): void {
    this.history = [];
  }
  /**
   * Reset all servers (useful between test cases).
   */
  reset(): void {
    this.servers.clear();
    this.toolIndex.clear();
    this.history = [];
  }
  private addHistory(
    tool: string,
    server: string,
    args: Record<string, unknown>,
    result: unknown,
    error: string | undefined,
    duration_ms: number
  ): void {
    this.history.push({
      timestamp: Date.now(),
      server,
      tool,
      args,
      result,
      error,
      duration_ms,
    });
    if (this.history.length > this.config.maxHistory) {
      this.history = this.history.slice(-this.config.maxHistory);
    }
  }
}
/** Create a pre-configured mock registry. */
/**
 * Create a pre-configured mock registry.
 * @param config - Optional configuration
 * @returns A new MockMCPRegistry instance
 */
/**
 * Create a pre-configured mock registry.
 * @param config - Optional configuration
 * @returns A new MockMCPRegistry instance
 */
export function createMockRegistry(config?: RegistryConfig): MockMCPRegistry {
  return new MockMCPRegistry(config);
}