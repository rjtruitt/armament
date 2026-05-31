/** Per-channel agent context powered by iteratio AgentLoop. */

import { AgentLoopBuilder } from 'iteratio';
import type { IAgentLoop, LoopState, UsageData } from 'iteratio';
import type { ITool, ToolResult } from 'iteratio';
import type { ILLMProvider as IIteratioLLMProvider, IMessageManager, ContextWindowConfig, ContextUsage, RewindSnapshot, CompactionResult, MessageManagerState } from 'iteratio';
import type { ILLMProvider, IChannelAgent, IChannelAgentConfig, StickyNote, StickyPosition } from '../core/index.js';
import { extractNick } from './ProviderPool.js';
import { UserConfig } from '../config/index.js';
import { runStreamingLoop, sanitizeOrphanedToolCalls } from './ChannelAgentStreaming.js';
import type { StreamEvent } from './ChannelAgentStreaming.js';
import type { IteratioSidecar, SidecarChunk } from '../app/IteratioSidecar.js';

export type { StreamEvent } from './ChannelAgentStreaming.js';
export type { StickyPosition, StickyNote } from '../core/index.js';

/** Full configuration for a ChannelAgent instance including callbacks. */
export interface ChannelAgentConfig extends IChannelAgentConfig {
  onUsage?: (usage: UsageData) => void;
  /** Optional Go sidecar for LLM calls with TS fallback. */
  goEngine?: IteratioSidecar | null;
  /** Called when Go sidecar fails and we fall back to TS. */
  onGoFallback?: (error: string) => void;
  /** Returns active tool names for the sidecar request. */
  getToolNames?: () => string[];
  /** Returns the channel workspace directory for sidecar tool execution. */
  getCwd?: () => string;
  /** Returns the system context to inject (notes.md, stickies, armadebug). */
  getSystemContext?: () => string;
}

/** Per-channel agent wrapping an iteratio AgentLoop with streaming, compaction, and file tracking. */
export class ChannelAgent implements IChannelAgent {
  private _loop: IAgentLoop;
  private _config: ChannelAgentConfig;
  private _turnCount = 0;
  private _totalTokens = 0;
  private _cacheRead = 0;
  private _cacheWrite = 0;
  private _status: 'idle' | 'thinking' | 'tool_use' | 'complete' | 'error' = 'idle';
  private _pinnedFiles: Set<string> = new Set();
  private _recentFiles: Map<string, { timestamp: number; lines: number }> = new Map();
  private _stickyNotes: StickyNote[] = [];
  private _injectedMessages: string[] = [];
  private _toolFailCounts: Map<string, { count: number; lastFailure: number }> = new Map();
  private _interrupted = false;
  private static readonly MAX_RECENT_FILES = 10;

  constructor(config: ChannelAgentConfig) {
    this._config = config;
    if (config.stickyNotes) this._stickyNotes = [...config.stickyNotes];

    const llmProvider = config.provider as unknown as IIteratioLLMProvider;

    const builder = AgentLoopBuilder.create()
      .withLLM(llmProvider)
      .name(config.name);

    if (config.systemPrompt) {
      builder.withSystemPrompt(config.systemPrompt);
    }

    if (config.tools && config.tools.length > 0) {
      builder.withTools(config.tools);
    }

    builder.withContextWindow(config.contextWindow ?? {
      maxTokens: UserConfig.instance().settings.context.maxTokens ?? 200_000,
      compactThreshold: UserConfig.instance().settings.context.compactThreshold ?? 0.75,
      recentMessagesToKeep: UserConfig.instance().settings.context.recentMessages ?? 12,
      summaryTargetRatio: 0.15,
    });

    if (config.onToolCall || config.onToolResult) {
      builder.onToolEvents({
        onToolCall: config.onToolCall,
        onToolResult: config.onToolResult,
      });
    }

    if (config.onUsage) {
      const onUsage = config.onUsage;
      builder.onUsage((usage: UsageData) => {
        this._totalTokens += usage.total_tokens;
        this.addCacheTokens(0, 0);
        onUsage(usage);
      });
    } else {
      builder.onUsage((usage: UsageData) => {
        this._totalTokens += usage.total_tokens;
        this.addCacheTokens(0, 0);
      });
    }

    this._loop = builder.build();
  }

  /**
   * Gets the name.
   */
  get name(): string { return this._config.name; }
  /**
   * Gets the model.
   */
  get model(): string { return this._config.model; }
  /**
   * Gets the provider type.
   */
  get providerType(): string { return this._config.providerType; }
  /**
   * Gets the provider name (human-readable, e.g. "Claude Sonnet").
   */
  get providerName(): string | undefined { return this._config.providerName; }
  /**
   * Gets the nick.
   */
  get nick(): string { return extractNick(this._config.model); }
  /**
   * Gets the parent channel.
   */
  get parentChannel(): string | undefined { return this._config.parentChannel; }
  /**
   * Gets the turn count.
   */
  get turnCount(): number { return this._turnCount; }
  /**
   * Sets the turn count.
   */
  set turnCount(value: number) { this._turnCount = value; }
  /**
   * Gets the max turns.
   */
  get maxTurns(): number { return this._config.maxTurns ?? 200; }
  /**
   * Gets the total tokens.
   */
  get totalTokens(): number { return this._totalTokens; }
  /**
   * Gets the cache read.
   */
  get cacheRead(): number { return this._cacheRead; }
  /**
   * Gets the cache write.
   */
  get cacheWrite(): number { return this._cacheWrite; }
  /**
   * Add tokens.
   */
  addTokens(count: number): void { this._totalTokens += count; }
  /**
   * Add cache tokens.
   */
  addCacheTokens(read: number, write: number): void { this._cacheRead += read; this._cacheWrite += write; }
  /**
   * Gets the status.
   */
  get status(): 'idle' | 'thinking' | 'tool_use' | 'complete' | 'error' { return this._status; }

  /**
   * Sets the workspace.
   */
  setWorkspace(dir: string): void {
    const tools = this._loop.getTools();
    for (const t of tools) {
      if ('workspace' in t) (t as { workspace: string }).workspace = dir;
      if ('channel' in t) (t as { channel: string }).channel = this._config.name;
    }
  }

  /** Queue a user message to inject into the conversation at the next tool-loop boundary. */
  injectMessage(content: string): void {
    this._injectedMessages.push(content);
  }

  /** Abort the current streaming session. Called on user interrupt. */
  interrupt(): void {
    this._interrupted = true;
  }

  /** Returns true if the given content string is already queued for injection. */
  hasPendingInjection(content: string): boolean {
    return this._injectedMessages.some(m => m === content);
  }

  /** Pre-populates the message history (e.g. for session restore). */
  seedMessages(messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }>): void {
    const mm = this._loop.getMessageManager();
    for (const msg of messages) {
      mm.addMessage(msg);
    }
  }

  /** Returns the text content of the most recent assistant message. */
  getLastResponse(): string {
    const mm = this._loop.getMessageManager();
    const messages = mm.getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        const content = messages[i].content as string | Array<{ type: string; text?: string }>;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
          const text = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
          if (text) return text;
        }
      }
    }
    return '';
  }

  /**
   * Register tool.
   */
  registerTool(tool: ITool): void {
    this._loop.registerTool(tool);
  }

  /**
   * Register tools.
   */
  registerTools(tools: ITool[]): void {
    this._loop.registerTools(tools);
  }

  /**
   * Deregister tool.
   */
  deregisterTool(name: string): boolean {
    return this._loop.deregisterTool(name);
  }

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

  /** Records a file access for post-compaction context reinjection. */
  trackFileRead(path: string, lines: number): void {
    this._recentFiles.set(path, { timestamp: Date.now(), lines });
    if (this._recentFiles.size > ChannelAgent.MAX_RECENT_FILES) {
      let oldest: string | null = null;
      let oldestTs = Infinity;
      for (const [p, info] of this._recentFiles) {
        if (info.timestamp < oldestTs && !this._pinnedFiles.has(p)) {
          oldest = p;
          oldestTs = info.timestamp;
        }
      }
      if (oldest) this._recentFiles.delete(oldest);
    }
  }

  /** Returns pinned + recently-read files for reinjection after compaction. */
  getFilesForReinjection(): Array<{ path: string; pinned: boolean }> {
    const files: Array<{ path: string; pinned: boolean }> = [];
    for (const p of this._pinnedFiles) {
      files.push({ path: p, pinned: true });
    }
    for (const [p] of this._recentFiles) {
      if (!this._pinnedFiles.has(p)) {
        files.push({ path: p, pinned: false });
      }
    }
    return files;
  }

  /**
   * Mark complete.
   */
  markComplete(): void {
    this._status = 'complete';
  }

  /**
   * Mark error.
   */
  markError(): void {
    this._status = 'error';
  }

  /**
   * Add sticky note.
   */
  addStickyNote(content: string, position: StickyPosition = 'both'): void {
    this._stickyNotes.push({ content, position });
  }

  /**
   * Remove sticky note.
   */
  removeStickyNote(index: number): StickyNote | null {
    if (index < 0 || index >= this._stickyNotes.length) return null;
    return this._stickyNotes.splice(index, 1)[0];
  }

  /**
   * Gets the sticky notes.
   */
  getStickyNotes(): StickyNote[] {
    return [...this._stickyNotes];
  }

  private applyStickies(input: string): string {
    if (this._stickyNotes.length === 0) return input;

    const top: string[] = [];
    const bottom: string[] = [];

    for (const note of this._stickyNotes) {
      if (note.position === 'top' || note.position === 'both') {
        top.push(`- ${note.content}`);
      }
      if (note.position === 'bottom' || note.position === 'both') {
        bottom.push(`- ${note.content}`);
      }
    }

    let result = input;
    if (top.length > 0) {
      result = `[Persistent reminders — appended to every message you receive]\n${top.join('\n')}\n[End reminders]\n\n${result}`;
    }
    if (bottom.length > 0) {
      result = `${result}\n\n[Persistent reminders — appended to every message you receive]\n${bottom.join('\n')}\n[End reminders]`;
    }
    return result;
  }

  /** Adds a system message to context and sends a user message to trigger processing. */
  async sendSystemMessage(content: string, trigger?: string): Promise<string> {
    const mm = this._loop.getMessageManager();
    mm.addMessage({ role: 'system', content });
    return this.sendMessage(trigger ?? content);
  }

  /** Sends a user message and runs the full tool loop until a final response. */
  async sendMessage(input: string | Record<string, unknown>[]): Promise<string> {
    this._turnCount++;
    this._status = 'thinking';
    this._config.onTurnStart?.(this._turnCount);

    const augmented = Array.isArray(input) ? input : this.applyStickies(input);

    try {
      sanitizeOrphanedToolCalls(this._loop.getMessageManager());
      const response = await this._loop.runTurn(augmented as string, this._config.maxTurns);

      const mm = this._loop.getMessageManager();
      mm.takeSnapshot();

      if (mm.shouldCompact()) {
        const result = await mm.autoCompact();
        if (result) {
          this._config.onCompaction?.(result);
          await this._runPostCompact(result, mm);
        }
      }

      this._config.onSessionDirty?.(this._config.name);

      this._status = 'idle';
      this._config.onTurnComplete?.(this._turnCount, response);
      return response;
    } catch (err: unknown) {
      this._status = 'idle';
      this._config.onTurnComplete?.(this._turnCount, '');
      throw err;
    }
  }

  /** Streaming variant of sendMessage; yields incremental text, tool events, and a final 'done'.
   *  If Go sidecar is available, delegates to it; falls back to TS on any failure. */
  async *sendMessageStreaming(input: string | Record<string, unknown>[], onToolCall?: (name: string, args: unknown) => void): AsyncGenerator<StreamEvent> {
    this._turnCount++;
    this._interrupted = false;
    this._status = 'thinking';
    this._config.onTurnStart?.(this._turnCount);

    const augmented = Array.isArray(input) ? input : this.applyStickies(input);
    const inputStr = Array.isArray(augmented) ? JSON.stringify(augmented) : augmented as string;

    // ── Try iteratio sidecar first ────────────────────────────────────
    const goEngine = this._config.goEngine;
    if (goEngine?.ready) {
      try {
        const { text: cleanText, system: systemContext } = extractUserTextAndSystem(inputStr);
        const tools = this._config.getToolNames?.() ?? [];
        goEngine.send({
          type: 'message',
          text: cleanText,
          tools,
          provider: this._config.providerType,
          model: this._config.model,
          cwd: this._config.getCwd?.() ?? undefined,
          system: systemContext || (this._config.getSystemContext?.() ?? undefined),
        });

        // Pull chunks from sidecar via event→promise queue
        let done = false;
        let sidecarError = '';
        const chunkQueue: SidecarChunk[] = [];
        let wakeup: (() => void) | null = null;
        const onChunk = (c: SidecarChunk) => { chunkQueue.push(c); wakeup?.(); };
        const onExit = () => { done = true; sidecarError = sidecarError || 'sidecar exited'; wakeup?.(); };

        goEngine.on('chunk', onChunk);
        goEngine.on('exit', onExit);

        try {
          while (!done) {
            // Drain queue
            while (chunkQueue.length > 0) {
              const c = chunkQueue.shift()!;
              if (c.type === 'done') {
                if (c.usage) {
                  this._totalTokens += c.usage.totalTokens;
                  this._cacheRead += c.usage.cacheReadTokens;
                  this._cacheWrite += c.usage.cacheWriteTokens;
                }
                done = true;
                yield { type: 'done' };
                break;
              }
              if (c.type === 'error') {
                sidecarError = c.error ?? 'sidecar error';
                done = true;
                break;
              }
              yield sidecarChunkToStreamEvent(c);
              if (c.type === 'tool_call' && onToolCall && c.name) {
                onToolCall(c.name, c.args ?? {});
              }
            }
            if (done) break;
            // Wait for next chunk
            if (chunkQueue.length === 0 && !done) {
              await new Promise<void>(r => { wakeup = r; });
            }
          }
        } finally {
          goEngine.off('chunk', onChunk);
          goEngine.off('exit', onExit);
        }

        if (!sidecarError) {
          this._status = 'idle';
          this._config.onTurnComplete?.(this._turnCount, '');
          return;
        }
        // Sidecar failed — fall through to TS
        this._config.onGoFallback?.(sidecarError);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this._config.onGoFallback?.(msg);
      }
    }
    // ── Fall back to TS streaming ────────────────────────────────────

    const state = {
      turnCount: this._turnCount,
      totalTokens: this._totalTokens,
      cacheRead: this._cacheRead,
      cacheWrite: this._cacheWrite,
      status: this._status,
      injectedMessages: this._injectedMessages,
      toolFailCounts: this._toolFailCounts,
    };

    const gen = runStreamingLoop(
      this._loop,
      { ...this._config, isInterrupted: () => this._interrupted },
      state,
      augmented,
      onToolCall,
      (result, mm) => this._runPostCompact(result, mm),
    );

    try {
      for await (const event of gen) {
        this._status = state.status;
        this._totalTokens = state.totalTokens;
        this._cacheRead = state.cacheRead;
        this._cacheWrite = state.cacheWrite;
        yield event;
      }
      this._status = state.status;
      this._totalTokens = state.totalTokens;
      this._cacheRead = state.cacheRead;
      this._cacheWrite = state.cacheWrite;
    } catch (err) {
      this._status = state.status;
      this._totalTokens = state.totalTokens;
      this._cacheRead = state.cacheRead;
      this._cacheWrite = state.cacheWrite;
      throw err;
    }
  }

  /**
   * Shutdown.
   */
  async shutdown(): Promise<void> {
    await this._loop.shutdown();
  }

  /**
   * Gets the state.
   */
  getState(): LoopState {
    return this._loop.getState();
  }

  /**
   * Gets the context usage.
   */
  getContextUsage(): ContextUsage {
    return this._loop.getMessageManager().getContextUsage();
  }

  /** Triggers context compaction, optionally forcing even below threshold. */
  async compact(force = false): Promise<CompactionResult | null> {
    const mm = this._loop.getMessageManager();
    const result = force ? await mm.forceCompact() : await mm.autoCompact();
    if (result) {
      this._config.onCompaction?.(result);
      await this._runPostCompact(result, mm);
    }
    return result;
  }

  /**
   * Gets the snapshots.
   */
  getSnapshots(): RewindSnapshot[] {
    return this._loop.getMessageManager().getSnapshots();
  }

  /**
   * Rewind.
   */
  rewind(snapshotId: number): boolean {
    return this._loop.getMessageManager().rewind(snapshotId);
  }

  /**
   * Rewind to turn.
   */
  rewindToTurn(turn: number): boolean {
    return this._loop.getMessageManager().rewindToTurn(turn);
  }

  /** Serializes the full message history for persistence. */
  exportSession(): MessageManagerState {
    return this._loop.getMessageManager().exportState();
  }

  /** Restores message history from a previously exported state. */
  importSession(state: Partial<MessageManagerState>): void {
    this._loop.getMessageManager().importState(state);
    sanitizeOrphanedToolCalls(this._loop.getMessageManager());
  }

  private async _runPostCompact(result: CompactionResult, mm: IMessageManager): Promise<void> {
    // Compaction may orphan tool responses whose matching assistant message was trimmed
    sanitizeOrphanedToolCalls(mm);
    const summary = mm.getRunningSummary?.() ?? '';

    const files = this.getFilesForReinjection();
    if (files.length > 0) {
      const parts: string[] = [];
      for (const f of files) {
        const info = this._recentFiles.get(f.path);
        const lineNote = info ? ` (${info.lines} lines)` : '';
        const prefix = f.pinned ? 'Pinned file' : 'Referenced file';
        parts.push(`${prefix}: ${f.path}${lineNote}`);
      }
      mm.addMessage({
        role: 'system',
        content: `Compacted — older conversation summarized. Referenced files:\n${parts.join('\n')}`,
      });
    }

    if (this._config.onPostCompact) {
      await this._config.onPostCompact(result, summary);
    }
  }
}

/** Extract clean user text from the augmented input (notes, stickies, armadebug, then "[USER MESSAGE]\nactual text"). */
/** Extract clean user text and system context from augmented input. */
function extractUserTextAndSystem(input: string): { text: string; system: string } {
  const marker = '[USER MESSAGE]';
  const idx = input.lastIndexOf(marker);
  if (idx >= 0) {
    const system = input.slice(0, idx).trim();
    const text = input.slice(idx + marker.length).trim();
    return { text, system };
  }
  return { text: input.trim(), system: '' };
}

function extractUserText(input: string): string {
  return extractUserTextAndSystem(input).text;
}

/** Convert a sidecar chunk to a StreamEvent for the existing TUI rendering pipeline. */
function sidecarChunkToStreamEvent(c: SidecarChunk): StreamEvent {
  switch (c.type) {
    case 'text':
      return { type: 'text', text: c.text };
    case 'thinking':
      return { type: 'thinking', text: c.text };
    case 'tool_call':
      return { type: 'tool_call', toolCall: { id: c.id, name: c.name, arguments: c.args ? JSON.stringify(c.args) : undefined } };
    case 'tool_result':
      return { type: 'tool_result', result: { success: true, data: c.content }, toolName: c.toolName };
    case 'done':
      return { type: 'done' };
    case 'error':
      return { type: 'text', text: `[sidecar error] ${c.error}` };
  }
}
