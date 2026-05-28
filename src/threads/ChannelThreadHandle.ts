/**
 * ChannelThreadHandle — proxy that looks like a ChannelAgent to the rest of the system.
 * Delegates to a worker thread via ThreadCoordinator.
 */

import type { ThreadCoordinator } from './ThreadCoordinator.js';
import type { ThreadInfo, StreamChunk } from './ThreadProtocol.js';
import type { ContextUsage } from 'iteratio';

/**
 * Provides the same external interface as ChannelAgent but delegates
 * all work to a worker thread. Used by ChannelLifecycle/ArmamentApp
 * as a drop-in replacement.
 */
export class ChannelThreadHandle {
  private coordinator: ThreadCoordinator;
  private channelName: string;
  private _model: string;
  private _providerType: string;
  private _parentChannel?: string;
  private _onChunk?: (chunk: StreamChunk) => void;

  constructor(
    coordinator: ThreadCoordinator,
    channelName: string,
    model: string,
    providerType: string,
    parentChannel?: string,
  ) {
    this.coordinator = coordinator;
    this.channelName = channelName;
    this._model = model;
    this._providerType = providerType;
    this._parentChannel = parentChannel;
  }

  /**
   * Gets the name.
   */
  get name(): string { return this.channelName; }
  /**
   * Gets the model.
   */
  get model(): string { return this._model; }
  /**
   * Gets the provider type.
   */
  get providerType(): string { return this._providerType; }
  /**
   * Gets the parent channel.
   */
  get parentChannel(): string | undefined { return this._parentChannel; }

  /**
   * Gets the nick.
   */
  get nick(): string {
    const match = this._model.match(/claude-(\w+)/i);
    if (match) return match[1];
    if (this._model.includes('gpt')) return 'gpt';
    return this._model.split('/').pop()?.split('-')[0] ?? 'ai';
  }

  private get info(): ThreadInfo | undefined {
    return this.coordinator.getThreadInfo(this.channelName);
  }

  /**
   * Gets the turn count.
   */
  get turnCount(): number { return this.info?.turnCount ?? 0; }
  /**
   * Gets the max turns.
   */
  get maxTurns(): number { return 250; }
  /**
   * Gets the total tokens.
   */
  get totalTokens(): number { return this.info?.totalTokens ?? 0; }
  /**
   * Gets the cache read.
   */
  get cacheRead(): number { return this.info?.cacheRead ?? 0; }
  /**
   * Gets the cache write.
   */
  get cacheWrite(): number { return this.info?.cacheWrite ?? 0; }
  /**
   * Gets the status.
   */
  get status(): string { return this.info?.status ?? 'idle'; }

  /**
   * Gets the context usage.
   */
  getContextUsage(): ContextUsage {
    const info = this.info;
    return {
      current: info?.contextTokens ?? 0,
      max: 200_000,
      percent: info?.contextPercent ?? 0,
      headroom: 200_000 - (info?.contextTokens ?? 0),
    };
  }

  /**
   * Add tokens.
   */
  addTokens(count: number): void {
    const info = this.info;
    if (info) info.totalTokens += count;
  }

  /**
   * Add cache tokens.
   */
  addCacheTokens(read: number, write: number): void {
    const info = this.info;
    if (info) {
      info.cacheRead += read;
      info.cacheWrite += write;
    }
  }

  /**
   * Send message.
   */
  sendMessage(input: string): Promise<string> {
    return new Promise((resolve) => {
      let fullText = '';
      const origOnChunk = this._onChunk;

      this._onChunk = (chunk) => {
        if (chunk.kind === 'text') fullText += chunk.text;
        if (chunk.kind === 'done') {
          this._onChunk = origOnChunk;
          resolve(fullText);
        }
      };

      this.coordinator.sendMessage(this.channelName, input);
    });
  }

  /** Adds a system message and triggers processing. */
  sendSystemMessage(content: string, trigger?: string): Promise<string> {
    this.coordinator.addSystemMessage(this.channelName, content);
    return this.sendMessage(trigger ?? `Scheduled: ${content.slice(0, 80)}`);
  }

  /**
   * Send message streaming.
   */
  async *sendMessageStreaming(input: string): AsyncGenerator<{ type: string; text?: string; toolName?: string; toolCall?: any; result?: any; durationMs?: number; bytes?: number }> {
    const chunks: Array<{ type: string; text?: string; toolName?: string; toolCall?: any; result?: any; durationMs?: number; bytes?: number }> = [];
    let done = false;
    let resolve: (() => void) | null = null;

    this._onChunk = (chunk) => {
      const mapped = this.mapChunkToLegacy(chunk);
      if (mapped) chunks.push(mapped);
      if (chunk.kind === 'done') done = true;
      if (resolve) { resolve(); resolve = null; }
    };

    this.coordinator.sendMessage(this.channelName, input);

    while (!done) {
      if (chunks.length === 0) {
        await new Promise<void>(r => { resolve = r; });
      }
      while (chunks.length > 0) {
        yield chunks.shift()!;
      }
    }

    this._onChunk = undefined;
  }

  /**
   * Handle chunk.
   */
  handleChunk(chunk: StreamChunk): void {
    this._onChunk?.(chunk);
  }

  private mapChunkToLegacy(chunk: StreamChunk): any {
    switch (chunk.kind) {
      case 'text': return { type: 'text', text: chunk.text };
      case 'thinking': return { type: 'thinking', text: chunk.text };
      case 'tool_start': return { type: 'tool_start', toolName: chunk.toolName };
      case 'tool_progress': return { type: 'tool_progress', toolName: chunk.toolName, bytes: chunk.bytes };
      case 'tool_call': return { type: 'tool_call', toolCall: chunk.toolCall };
      case 'tool_result': return { type: 'tool_result', toolName: chunk.toolName, toolCall: chunk.toolCall, result: chunk.result, durationMs: chunk.durationMs };
      case 'done': return { type: 'done' };
    }
  }

  /**
   * Add sticky note.
   */
  addStickyNote(content: string, position: 'top' | 'bottom' | 'both' = 'both'): void {
    this.coordinator.addSticky(this.channelName, content, position);
  }

  /**
   * Remove sticky note.
   */
  removeStickyNote(index: number): void {
    this.coordinator.removeSticky(this.channelName, index);
  }

  /**
   * Compact.
   */
  async compact(force = false): Promise<any> {
    return this.coordinator.compact(this.channelName, force);
  }

  /**
   * Export session.
   */
  async exportSession(): Promise<any> {
    return this.coordinator.exportSession(this.channelName);
  }

  /**
   * Import session.
   */
  async importSession(state: any): Promise<void> {
    return this.coordinator.importSession(this.channelName, state);
  }

  /**
   * Shutdown.
   */
  async shutdown(): Promise<void> {
    return this.coordinator.shutdown(this.channelName);
  }

  // Pinned/recent files — managed locally for quick access
  private _pinnedFiles: Set<string> = new Set();
  /**
   * Pin file.
   */
  pinFile(path: string): void { this._pinnedFiles.add(path); }
  /**
   * Unpin file.
   */
  unpinFile(path: string): boolean { return this._pinnedFiles.delete(path); }
  /**
   * Gets the pinned files.
   */
  get pinnedFiles(): string[] { return [...this._pinnedFiles]; }
  /**
   * Track file read.
   */
  trackFileRead(_path: string, _lines: number): void {}
  /**
   * Gets the files for reinjection.
   */
  getFilesForReinjection(): Array<{ path: string; pinned: boolean }> {
    return [...this._pinnedFiles].map(p => ({ path: p, pinned: true }));
  }

  /**
   * Gets the sticky notes.
   */
  getStickyNotes(): Array<{ content: string; position: string }> { return []; }
  /**
   * Gets the snapshots.
   */
  getSnapshots(): any[] { return []; }
  /**
   * Rewind.
   */
  rewind(_snapshotId: number): boolean { return false; }
  /**
   * Rewind to turn.
   */
  rewindToTurn(_turn: number): boolean { return false; }
  /**
   * Register tool.
   */
  registerTool(tool: any): void {
    const def: any = {
      name: tool.name || tool.definition?.name,
      description: tool.description || tool.definition?.description || '',
      inputSchema: tool.inputSchema || tool.definition?.inputSchema || { type: 'object', properties: {} },
      isMcp: tool.isMcp || false,
      mcpServer: tool.mcpServer || undefined,
    };
    if (def.name) this.coordinator.registerTool(this.channelName, def);
  }
  /**
   * Register tools.
   */
  registerTools(tools: any[]): void {
    for (const tool of tools) {
      if (typeof tool === 'string') {
        // If it's just a name, register with minimal info
        this.coordinator.registerTool(this.channelName, { name: tool, description: '', inputSchema: { type: 'object', properties: {} } });
      } else {
        this.registerTool(tool);
      }
    }
  }
  /**
   * Deregister tool.
   */
  deregisterTool(name: string): boolean {
    this.coordinator.deregisterTool(this.channelName, name);
    return true;
  }
  /**
   * Gets the state.
   */
  getState(): any { return { running: false, turn: 0 }; }
  /**
   * Mark complete.
   */
  markComplete(): void {
    this.coordinator.markComplete(this.channelName);
  }
  /**
   * Mark error.
   */
  markError(): void {
    this.coordinator.markError(this.channelName);
  }

  /**
   * Update workspace for all tools in the thread.
   */
  setWorkspace(dir: string): void {
    this.coordinator.setWorkspace(this.channelName, dir);
  }
}
