/**
 * ThreadCoordinator — manages worker threads for each channel.
 * Runs on the main thread. Spawns/terminates threads, routes messages.
 */

import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as url from 'node:url';
import type {
  ChannelThreadConfig,
  OutboundMessage,
  InboundMessage,
  StreamChunk,
  ThreadInfo,
} from './ThreadProtocol.js';
import { logInfo, logError, logWarn } from '../core/index.js';
import { handleSubworkerRequest, type ThreadHandle } from './SubworkerManager.js';

const THREAD_ENTRY = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  'AgentThreadEntry.js',
);

const STREAM_TIMEOUT_MS = 120_000;
const INTERRUPT_GRACE_MS = 5_000;


/** Interface for ThreadCoordinatorCallbacks. */
export interface ThreadCoordinatorCallbacks {
  onStreamChunk?: (channel: string, chunk: StreamChunk) => void;
  onTurnStart?: (channel: string, turnNumber: number) => void;
  onTurnComplete?: (channel: string, turnNumber: number, response: string) => void;
  onToolCall?: (channel: string, toolName: string, args: unknown) => void;
  onToolResult?: (channel: string, toolName: string, args: unknown, result: any, durationMs: number) => void;
  onUsage?: (channel: string, usage: any) => void;
  onError?: (channel: string, message: string, fatal?: boolean) => void;
  onStatusChange?: (channel: string, status: string) => void;
  onSessionDirty?: (channel: string) => void;
  onCompaction?: (channel: string, before: number, after: number) => void;
  onContextUsage?: (channel: string, usage: { current: number; max: number; percent: number; headroom: number }) => void;
  onWorkerSpawned?: (parentChannel: string, workerId: string) => void;
  onWorkerProgress?: (parentChannel: string, workerId: string, progress: string, percent?: number) => void;
  onWorkerComplete?: (parentChannel: string, workerId: string, response: string) => void;
  onWorkerError?: (parentChannel: string, workerId: string, error: string) => void;
  onWorkerAsk?: (parentChannel: string, workerId: string, question: string) => void;
  onMcpToolRequest?: (channel: string, requestId: string, server: string, tool: string, args: unknown) => void;
  onAuthRequired?: (channel: string, provider: string, info: any) => void;
  onThreadDied?: (channel: string) => void;
}

/** Manages worker threads for each channel. Spawns, terminates, and routes messages to threads. */
export class ThreadCoordinator {
  private threads: Map<string, ThreadHandle> = new Map();
  private callbacks: ThreadCoordinatorCallbacks;

  constructor(callbacks: ThreadCoordinatorCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Spawn channel.
   */
  async spawnChannel(config: ChannelThreadConfig): Promise<void> {
    if (this.threads.has(config.channelName)) {
      logWarn('coordinator', `Thread already exists for ${config.channelName}, terminating old`);
      await this.shutdown(config.channelName);
    }

    logInfo('coordinator', `Spawning thread: ${config.channelName} (${config.provider.type}/${config.provider.model})`);

    let readyResolve!: () => void;
    const ready = new Promise<void>(resolve => { readyResolve = resolve; });

    const worker = new Worker(THREAD_ENTRY, {
      workerData: config,
    });

    const handle: ThreadHandle = {
      worker,
      info: {
        channelName: config.channelName,
        model: config.provider.model,
        providerType: config.provider.type,
        status: 'idle',
        turnCount: 0,
        totalTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        contextPercent: 0,
        contextTokens: 0,
        startedAt: Date.now(),
        lastActivity: Date.now(),
      },
      emitter: new EventEmitter(),
      ready,
      readyResolve,
      pendingRequests: new Map(),
      streamTimeout: null,
      children: new Set(),
    };

    this.threads.set(config.channelName, handle);

    worker.on('message', (msg: OutboundMessage) => {
      handle.info.lastActivity = Date.now();
      this.handleMessage(config.channelName, handle, msg);
    });

    worker.on('error', (err) => {
      logError('coordinator', `Thread error: ${config.channelName}`, err);
      this.callbacks.onError?.(config.channelName, err.message, true);
    });

    worker.on('exit', (code) => {
      logInfo('coordinator', `Thread exited: ${config.channelName} code=${code}`);
      handle.info.status = 'dead';
      this.threads.delete(config.channelName);
      this.callbacks.onThreadDied?.(config.channelName);
    });

    await ready;
  }

  private handleMessage(channel: string, handle: ThreadHandle, msg: OutboundMessage): void {
    switch (msg.type) {
      case 'ready':
        handle.readyResolve();
        break;

      case 'stream_chunk':
        this.resetStreamTimeout(handle);
        this.callbacks.onStreamChunk?.(channel, msg.chunk);
        handle.emitter.emit('chunk', msg.chunk);
        break;

      case 'turn_start':
        handle.info.turnCount = msg.turnNumber;
        this.callbacks.onTurnStart?.(channel, msg.turnNumber);
        break;

      case 'turn_complete':
        this.clearStreamTimeout(handle);
        this.callbacks.onTurnComplete?.(channel, msg.turnNumber, msg.response);
        break;

      case 'tool_call':
        this.callbacks.onToolCall?.(channel, msg.toolName, msg.args);
        break;

      case 'tool_result':
        this.callbacks.onToolResult?.(channel, msg.toolName, msg.args, msg.result, msg.durationMs);
        break;

      case 'usage':
        handle.info.totalTokens += msg.usage.total_tokens;
        handle.info.cacheRead += msg.usage.cache_read_tokens ?? 0;
        handle.info.cacheWrite += msg.usage.cache_write_tokens ?? 0;
        this.callbacks.onUsage?.(channel, msg.usage);
        break;

      case 'error':
        this.callbacks.onError?.(channel, msg.message, msg.fatal);
        break;

      case 'status_change':
        handle.info.status = msg.status as ThreadInfo['status'];
        this.callbacks.onStatusChange?.(channel, msg.status);
        break;

      case 'session_dirty':
        this.callbacks.onSessionDirty?.(channel);
        break;

      case 'compaction':
        this.callbacks.onCompaction?.(channel, msg.before, msg.after);
        break;

      case 'context_usage':
        handle.info.contextPercent = msg.percent;
        handle.info.contextTokens = msg.current;
        this.callbacks.onContextUsage?.(channel, msg);
        break;

      case 'export_session_result':
      case 'compact_result': {
        const req = handle.pendingRequests.get(msg.id);
        if (req) {
          handle.pendingRequests.delete(msg.id);
          req.resolve(msg.type === 'export_session_result' ? msg.state : msg.result);
        }
        break;
      }

      case 'request_subworker':
        this.handleSubworkerRequest(channel, handle, msg.id, msg.config);
        break;

      case 'worker_progress':
        this.callbacks.onWorkerProgress?.(channel, msg.workerId, msg.progress, msg.percent);
        break;

      case 'worker_complete':
        this.callbacks.onWorkerComplete?.(channel, msg.workerId, msg.response);
        handle.children.delete(msg.workerId);
        break;

      case 'worker_error':
        this.callbacks.onWorkerError?.(channel, msg.workerId, msg.error);
        handle.children.delete(msg.workerId);
        break;

      case 'worker_ask':
        this.callbacks.onWorkerAsk?.(channel, msg.workerId, msg.question);
        break;

      case 'mcp_tool_request':
        this.callbacks.onMcpToolRequest?.(channel, msg.requestId, msg.server, msg.tool, msg.args);
        break;

      case 'auth_required':
        this.callbacks.onAuthRequired?.(channel, msg.provider, msg.info);
        break;

      case 'log':
        // Forward thread logs to file logger
        if (msg.level === 'error') logError(`thread:${channel}`, msg.message, msg.data);
        else if (msg.level === 'warn') logWarn(`thread:${channel}`, msg.message);
        else logInfo(`thread:${channel}`, msg.message);
        break;
    }
  }

  private async handleSubworkerRequest(parentChannel: string, parentHandle: ThreadHandle, requestId: string, config: import('./ThreadProtocol.js').SubworkerConfig): Promise<void> {
    await handleSubworkerRequest(parentChannel, parentHandle, requestId, config, {
      spawnChannel: (cfg) => this.spawnChannel(cfg),
      getThread: (name) => this.threads.get(name),
      sendToThread: (name, msg) => this.sendToThread(name, msg),
      shutdown: (name) => this.shutdown(name),
      onWorkerSpawned: this.callbacks.onWorkerSpawned,
      onWorkerComplete: this.callbacks.onWorkerComplete,
      onWorkerError: this.callbacks.onWorkerError,
    });
  }

  // --- Public API ---

  /**
   * Send message.
   */
  sendMessage(channelName: string, input: string): void {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const handle = this.threads.get(channelName);
    if (!handle) {
      this.callbacks.onError?.(channelName, 'Thread not found');
      return;
    }
    this.startStreamTimeout(handle);
    this.sendToThread(channelName, { type: 'send_message', id, input });
  }

  /**
   * Interrupt.
   */
  interrupt(channelName: string): void {
    const handle = this.threads.get(channelName);
    if (!handle) return;
    this.sendToThread(channelName, { type: 'interrupt' });

    // If thread doesn't respond, force terminate
    setTimeout(() => {
      if (handle.info.status !== 'idle' && handle.info.status !== 'dead') {
        logWarn('coordinator', `Force-terminating stuck thread: ${channelName}`);
        handle.worker.terminate();
      }
    }, INTERRUPT_GRACE_MS);
  }

  /**
   * Export session.
   */
  async exportSession(channelName: string): Promise<any> {
    return this.requestResponse(channelName, 'export_session');
  }

  /**
   * Import session.
   */
  async importSession(channelName: string, state: any): Promise<void> {
    this.sendToThread(channelName, { type: 'import_session', state });
  }

  /**
   * Compact.
   */
  async compact(channelName: string, force = false): Promise<any> {
    return this.requestResponse(channelName, 'compact', { force });
  }

  /**
   * Add sticky.
   */
  addSticky(channelName: string, content: string, position: 'top' | 'bottom' | 'both'): void {
    this.sendToThread(channelName, { type: 'add_sticky', content, position });
  }

  /**
   * Add system message.
   */
  addSystemMessage(channelName: string, content: string): void {
    this.sendToThread(channelName, { type: 'add_system_message', content });
  }

  /**
   * Remove sticky.
   */
  removeSticky(channelName: string, index: number): void {
    this.sendToThread(channelName, { type: 'remove_sticky', index });
  }

  /**
   * Respond mcp tool.
   */
  respondMcpTool(channelName: string, requestId: string, result: any): void {
    this.sendToThread(channelName, { type: 'mcp_tool_result', requestId, result });
  }

  /**
   * Shutdown.
   */
  async shutdown(channelName: string): Promise<void> {
    const handle = this.threads.get(channelName);
    if (!handle) return;
    this.clearStreamTimeout(handle);
    this.sendToThread(channelName, { type: 'shutdown' });
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        handle.worker.terminate();
        resolve();
      }, 5_000);
      handle.worker.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    this.threads.delete(channelName);
  }

  /**
   * Shutdown all.
   */
  async shutdownAll(): Promise<void> {
    const names = [...this.threads.keys()];
    await Promise.all(names.map(n => this.shutdown(n)));
  }

  /**
   * Gets the thread info.
   */
  getThreadInfo(channelName: string): ThreadInfo | undefined {
    return this.threads.get(channelName)?.info;
  }

  /**
   * Gets the all thread info.
   */
  getAllThreadInfo(): Map<string, ThreadInfo> {
    const result = new Map<string, ThreadInfo>();
    for (const [name, handle] of this.threads) {
      result.set(name, handle.info);
    }
    return result;
  }

  /**
   * Checks whether thread exists.
   */
  hasThread(channelName: string): boolean {
    return this.threads.has(channelName);
  }

  /**
   * Update workspace for all tools in a thread.
   */
  setWorkspace(channelName: string, workspace: string): void {
    this.sendToThread(channelName, { type: 'set_workspace', workspace });
  }

  // --- Internal helpers ---

  private sendToThread(channelName: string, msg: InboundMessage): void {
    const handle = this.threads.get(channelName);
    if (!handle || handle.info.status === 'dead') return;
    handle.worker.postMessage(msg);
  }

  private requestResponse(channelName: string, type: string, extra: any = {}): Promise<any> {
    const handle = this.threads.get(channelName);
    if (!handle) return Promise.reject(new Error(`Thread not found: ${channelName}`));
    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      handle.pendingRequests.set(id, { resolve, reject });
      handle.worker.postMessage({ type, id, ...extra });
      setTimeout(() => {
        if (handle.pendingRequests.has(id)) {
          handle.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${type} on ${channelName}`));
        }
      }, 30_000);
    });
  }

  private startStreamTimeout(handle: ThreadHandle): void {
    this.clearStreamTimeout(handle);
    handle.streamTimeout = setTimeout(() => {
      logWarn('coordinator', `Stream timeout on ${handle.info.channelName}, interrupting`);
      this.interrupt(handle.info.channelName);
    }, STREAM_TIMEOUT_MS);
  }

  private resetStreamTimeout(handle: ThreadHandle): void {
    if (handle.streamTimeout) {
      this.startStreamTimeout(handle);
    }
  }

  private clearStreamTimeout(handle: ThreadHandle): void {
    if (handle.streamTimeout) {
      clearTimeout(handle.streamTimeout);
      handle.streamTimeout = null;
    }
  }
}
