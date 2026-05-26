/**
 * Debug mode singleton providing the test seam for Armament.
 *
 * When active, substitutes real providers with canned responses, replaces
 * MCP servers with mocks, and exposes hooks for test assertions. This is
 * the primary mechanism for running the TUI without live API keys.
 */

import type { HookPoint } from '../core/index.js';
import { MockDriftManager } from './MockDriftManager.js';
import { MockSessionPersistence } from './MockSessionPersistence.js';
import { MockCompletionManager } from './MockCompletionManager.js';

/** A pattern-matched canned response for debug mode. */
export interface CannedResponse {
  match: string | RegExp;
  reply: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; args: Record<string, any>; result: string }>;
  delay?: number;
  tokens?: { input: number; output: number };
}

/** A simulated MCP server with tool handlers. */
export interface MockMcpServer {
  name: string;
  tools: Array<{ name: string; description: string; handler: (args: any) => string }>;
  status: 'connected' | 'disconnected' | 'crashed';
}

/** Handler invoked when a test hook fires. */
export type TestHookHandler = (context: {
  point: HookPoint | string;
  data: Record<string, any>;
  timestamp: number;
}) => void;

/** Configuration for the debug mode environment. */
export interface DebugConfig {
  responses: CannedResponse[];
  mcpServers: MockMcpServer[];
  providers: string[];
  workspace: string;
  failAuth: boolean;
  simulateLatency: number;
  theme: string;
}

const DEFAULT_RESPONSES: CannedResponse[] = [
  {
    match: /.*/,
    reply: 'I am running in debug mode. This is a canned response.',
    thinking: 'Analyzing the user request in debug mode...',
    tokens: { input: 25, output: 15 },
  },
];

const DEFAULT_MCP_SERVERS: MockMcpServer[] = [
  {
    name: 'filesystem',
    tools: [
      { name: 'read_file', description: 'Read a file', handler: (args) => `[debug] contents of ${args.path}` },
      { name: 'write_file', description: 'Write a file', handler: (args) => `[debug] wrote ${args.path}` },
      { name: 'list_directory', description: 'List dir', handler: (args) => `[debug] file1.ts\nfile2.ts` },
    ],
    status: 'connected',
  },
  {
    name: 'github',
    tools: [
      { name: 'search_code', description: 'Search code', handler: () => '[debug] 3 results found' },
      { name: 'create_pr', description: 'Create PR', handler: () => '[debug] PR #42 created' },
    ],
    status: 'connected',
  },
];

/**
 * Singleton providing the test seam for the entire application.
 *
 * When activated, all provider calls return canned responses, MCP tool
 * calls route to mock handlers, and lifecycle events are logged for
 * test assertions. The mock subsystem managers (drift, session, completion)
 * are lazily created and can be accessed for verification.
 */
export class DebugMode {
  private static _instance: DebugMode | null = null;
  private _active = false;
  private _config: DebugConfig;
  private _hooks: Map<string, TestHookHandler[]> = new Map();
  private _eventLog: Array<{ point: string; data: any; timestamp: number }> = [];
  private _inputQueue: string[] = [];
  private _outputCapture: string[] = [];

  private constructor() {
    this._config = {
      responses: [...DEFAULT_RESPONSES],
      mcpServers: [...DEFAULT_MCP_SERVERS],
      providers: ['anthropic', 'openai', 'ollama'],
      workspace: process.cwd(),
      failAuth: false,
      simulateLatency: 0,
      theme: 'red',
    };
  }

  /** Returns the singleton instance. */
  static instance(): DebugMode {
    if (!DebugMode._instance) {
      DebugMode._instance = new DebugMode();
    }
    return DebugMode._instance;
  }

  /** Destroys the singleton for test isolation. */
  static reset(): void {
    DebugMode._instance = null;
  }

  /**
   * Activate.
   */
  activate(): void {
    this._active = true;
  }

  /**
   * Deactivate.
   */
  deactivate(): void {
    this._active = false;
  }

  /**
   * Checks whether active.
   */
  isActive(): boolean {
    return this._active;
  }


  /**
   * Sets the responses.
   */
  setResponses(responses: CannedResponse[]): void {
    this._config.responses = responses;
  }

  /**
   * Add response.
   */
  addResponse(response: CannedResponse): void {
    this._config.responses.unshift(response);
  }

  /**
   * Clear responses.
   */
  clearResponses(): void {
    this._config.responses = [...DEFAULT_RESPONSES];
  }

  /** Finds the first canned response matching the input text. */
  getResponse(input: string): CannedResponse {
    for (const r of this._config.responses) {
      if (typeof r.match === 'string') {
        if (input.includes(r.match)) return r;
      } else {
        if (r.match.test(input)) return r;
      }
    }
    return this._config.responses[this._config.responses.length - 1];
  }


  /**
   * Gets the mcp servers.
   */
  getMcpServers(): MockMcpServer[] {
    return this._config.mcpServers;
  }

  /**
   * Sets the mcp servers.
   */
  setMcpServers(servers: MockMcpServer[]): void {
    this._config.mcpServers = servers;
  }

  /**
   * Gets the mcp server.
   */
  getMcpServer(name: string): MockMcpServer | undefined {
    return this._config.mcpServers.find(s => s.name === name);
  }

  /** Executes a mock MCP tool, returning its handler result or an error string. */
  executeMcpTool(serverName: string, toolName: string, args: any): string {
    const server = this.getMcpServer(serverName);
    if (!server) return `[debug-error] server ${serverName} not found`;
    if (server.status !== 'connected') return `[debug-error] server ${serverName} is ${server.status}`;
    const tool = server.tools.find(t => t.name === toolName);
    if (!tool) return `[debug-error] tool ${toolName} not found on ${serverName}`;
    return tool.handler(args);
  }


  /**
   * Gets the providers.
   */
  getProviders(): string[] {
    return this._config.providers;
  }

  /**
   * Sets the fail auth.
   */
  setFailAuth(fail: boolean): void {
    this._config.failAuth = fail;
  }

  /**
   * Should fail auth.
   */
  shouldFailAuth(): boolean {
    return this._config.failAuth;
  }


  /** Registers a test hook handler for a specific hook point (or '*' for all). */
  onHook(point: string, handler: TestHookHandler): void {
    if (!this._hooks.has(point)) {
      this._hooks.set(point, []);
    }
    this._hooks.get(point)!.push(handler);
  }

  /**
   * Clear hooks.
   */
  clearHooks(): void {
    this._hooks.clear();
  }

  /** Fires a hook point, logging the event and notifying all matching handlers. */
  fireHook(point: string, data: Record<string, any> = {}): void {
    const entry = { point, data, timestamp: Date.now() };
    this._eventLog.push(entry);

    const handlers = this._hooks.get(point) ?? [];
    for (const handler of handlers) {
      handler(entry);
    }
    const wildcardHandlers = this._hooks.get('*') ?? [];
    for (const handler of wildcardHandlers) {
      handler(entry);
    }
  }


  /**
   * Gets the event log.
   */
  getEventLog(): Array<{ point: string; data: any; timestamp: number }> {
    return this._eventLog;
  }

  /**
   * Gets the events.
   */
  getEvents(point?: string): Array<{ point: string; data: any; timestamp: number }> {
    if (!point) return this._eventLog;
    return this._eventLog.filter(e => e.point === point);
  }

  /**
   * Clear event log.
   */
  clearEventLog(): void {
    this._eventLog = [];
  }


  /** Queues synthetic user inputs for deterministic test scenarios. */
  queueInput(...inputs: string[]): void {
    this._inputQueue.push(...inputs);
  }

  /**
   * Next input.
   */
  nextInput(): string | undefined {
    return this._inputQueue.shift();
  }

  /**
   * Checks whether queued input exists.
   */
  hasQueuedInput(): boolean {
    return this._inputQueue.length > 0;
  }

  /**
   * Clear input queue.
   */
  clearInputQueue(): void {
    this._inputQueue = [];
  }


  /**
   * Capture output.
   */
  captureOutput(line: string): void {
    this._outputCapture.push(line);
  }

  /**
   * Gets the output.
   */
  getOutput(): string[] {
    return this._outputCapture;
  }

  /**
   * Gets the output text.
   */
  getOutputText(): string {
    return this._outputCapture.join('\n');
  }

  /**
   * Clear output.
   */
  clearOutput(): void {
    this._outputCapture = [];
  }


  /**
   * Gets the config.
   */
  getConfig(): DebugConfig {
    return this._config;
  }

  /**
   * Sets the config.
   */
  setConfig(partial: Partial<DebugConfig>): void {
    Object.assign(this._config, partial);
  }

  /**
   * Gets the workspace.
   */
  getWorkspace(): string {
    return this._config.workspace;
  }

  /**
   * Gets the theme.
   */
  getTheme(): string {
    return this._config.theme;
  }


  private _mockDrift: MockDriftManager | null = null;
  private _mockSession: MockSessionPersistence | null = null;
  private _mockCompletion: MockCompletionManager | null = null;

  /** Returns the mock drift manager, creating it lazily. */
  getDriftManager(): MockDriftManager {
    if (!this._mockDrift) this._mockDrift = new MockDriftManager();
    return this._mockDrift;
  }

  /** Returns the mock session persistence, creating it lazily. */
  getSessionPersistence(): MockSessionPersistence {
    if (!this._mockSession) this._mockSession = new MockSessionPersistence();
    return this._mockSession;
  }

  /** Returns the mock completion manager, creating it lazily. */
  getCompletionManager(): MockCompletionManager {
    if (!this._mockCompletion) this._mockCompletion = new MockCompletionManager();
    return this._mockCompletion;
  }

  /**
   * Reset mocks.
   */
  resetMocks(): void {
    this._mockDrift = null;
    this._mockSession = null;
    this._mockCompletion = null;
  }
}
