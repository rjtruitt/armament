/**
 * Manages channel content state: message buffers, scroll positions,
 * streaming messages, and tool block rendering.
 */

import { LayoutManager, Sidebar, ScrollBuffer, createIrcChatRenderer, type ChatMessage } from '../tui/index.js';
import type { ToolBlock, TuiRendererOptions } from './TuiTypes.js';
import {
  renderToolBlockLines,
  blockLineCount,
  reRenderStreamMessage,
  renderStagingLines,
  reRenderAllChannels as reRenderAllChannelsHelper,
  type CachedRendererState,
} from './TuiChannelHelpers.js';

/**
 * Strip terminal-hostile characters from text before it enters the TUI display buffer.
 * Catches what stripAllAnsi misses:
 *   - 8-bit C1 control codes (\�-\�) — interpreted as escape sequences
 *   - Unicode formatting/control chars — zero-width spaces, bidirectional overrides
 *   - ASCII control chars except \	, \
, \
 */
function sanitizeDisplayText(text: string): string {
  return text
    .replace(/[\x80-\x9F]/g, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}


export class TuiChannelManager {
  private layout: LayoutManager;
  private sidebar: Sidebar;
  private opts: TuiRendererOptions;

  private _channelLines: Map<string, string[]> = new Map();
  private _channelMessages: Map<string, ChatMessage[]> = new Map();
  private _scrollBuffers: Map<string, ScrollBuffer> = new Map();
  private _toolBlocks: Map<string, ToolBlock[]> = new Map();
  private _toolBlockIdCounter = 0;

  /** Per-channel streaming state — each channel gets its own entry to avoid cross-channel corruption. */
  private _streamStates: Map<string, {
    sender: string; content: string; contentParts: string[];
    lineStart: number; thinkingContent: string; thinkingParts: string[];
  }> = new Map();

  private _stagingMessages: Map<string, Array<{ sender: string; content: string; rendered: string[] }>> = new Map();
  private _stagingScrollOffset: Map<string, number> = new Map();

  private _rendererCache: CachedRendererState = { renderer: null, width: 0, theme: '' };

  /**
   * Gets the is streaming.
   */
  get isStreaming(): boolean { return this._streamStates.size > 0; }
  /**
   * Checks whether channel streaming.
   */
  isChannelStreaming(channel: string): boolean { return this._streamStates.has(channel); }

  constructor(layout: LayoutManager, sidebar: Sidebar, opts: TuiRendererOptions) {
    this.layout = layout;
    this.sidebar = sidebar;
    this.opts = opts;
  }

  /** Get or create a scroll buffer for a channel. */
  getScrollBuffer(channel: string): ScrollBuffer {
    if (!this._scrollBuffers.has(channel)) {
      const layoutInfo = this.layout.getLayout();
      const mainHeight = layoutInfo.main.height - 2;
      const mainWidth = layoutInfo.main.width - 2;
      this._scrollBuffers.set(channel, new ScrollBuffer({ viewportHeight: mainHeight, viewportWidth: mainWidth }));
    }
    return this._scrollBuffers.get(channel)!;
  }

  /** Get raw line buffer for a channel. */
  getChannelLines(channel?: string): string[] {
    const ch = channel ?? this.sidebar.getActive() ?? '#control';
    return this._channelLines.get(ch) ?? [];
  }

  /** Get parsed messages for a channel. */
  getChannelMessages(channel?: string): ChatMessage[] {
    const ch = channel ?? this.sidebar.getActive() ?? '#control';
    return this._channelMessages.get(ch) ?? [];
  }

  /** Get tool blocks for a channel. */
  getToolBlocks(channel: string): ToolBlock[] | undefined {
    return this._toolBlocks.get(channel);
  }

  /** Re-render any pending tool blocks so shimmer animates. */
  refreshPendingBlocks(): void {
    for (const [channel, blocks] of this._toolBlocks) {
      const channelBuf = this._channelLines.get(channel);
      if (!channelBuf) continue;
      let dirty = false;
      for (const block of blocks) {
        if (!block.pending) continue;
        const newLines = renderToolBlockLines(block, this.opts);
        const oldCount = blockLineCount(block);
        channelBuf.splice(block.lineIndex, oldCount, ...newLines);
        dirty = true;
      }
      if (dirty) {
        this.getScrollBuffer(channel).replaceFrom(0, channelBuf);
      }
    }
  }

  /** Whether there is any channel content at all. */
  get hasContent(): boolean {
    return this._channelLines.size > 0;
  }

  /** Append plain text lines to a channel. */
  writeToMain(text: string, channel: string, activeChannel: string): void {
    const lines = text.split('\n');
    if (!this._channelLines.has(channel)) this._channelLines.set(channel, []);
    this._channelLines.get(channel)!.push(...lines);
    this.getScrollBuffer(channel).append(...lines);
  }

  /** Maximum chat messages to keep in the TUI display buffer. Older ones are pruned automatically. */
  private static MAX_DISPLAY_MESSAGES = 500;

  /** Append a formatted chat message to a channel. */
  writeMessage(type: 'user' | 'agent' | 'system', sender: string, content: string, channel: string, activeChannel: string): void {
    if (!this._channelLines.has(channel)) this._channelLines.set(channel, []);
    if (!this._channelMessages.has(channel)) this._channelMessages.set(channel, []);

    const msg: ChatMessage = { type, sender, content, timestamp: new Date() };
    this._channelMessages.get(channel)!.push(msg);

    const layoutInfo = this.layout.getLayout();
    const chatWidth = layoutInfo.main.width - 2;
    const renderer = createIrcChatRenderer({
      width: chatWidth,
      noColor: this.opts.noColor,
      theme: this.opts.theme ?? 'red',
      indent: 0,
      showAgentHeader: this.opts.showAgentHeader,
    });
    const rendered = renderer.renderMessage(msg);
    const channelBuf = this._channelLines.get(channel)!;

    channelBuf.push(...rendered);

    if (channel !== activeChannel) {
      this.sidebar.incrementUnread(channel);
    }
    this.getScrollBuffer(channel).append(...rendered);

    // Auto-prune: keep only the last MAX_DISPLAY_MESSAGES chat messages
    this._pruneChannel(channel);
  }

  /** Begin streaming an agent response (shows cursor). */
  beginStreamMessage(sender: string, channel: string): void {
    if (!this._channelLines.has(channel)) this._channelLines.set(channel, []);
    if (!this._channelMessages.has(channel)) this._channelMessages.set(channel, []);
    const channelBuf = this._channelLines.get(channel)!;
    this._streamStates.set(channel, { sender, content: '', contentParts: [], lineStart: channelBuf.length, thinkingContent: '', thinkingParts: [] });
  }

  /** Append a text chunk to the current streaming message for a channel. */
  appendStreamChunk(text: string, channel: string): void {
    const state = this._streamStates.get(channel);
    if (!state) return;
    state.contentParts.push(text);
    state.content += text;
    this.scheduleStreamRender(channel);
  }

  /** Append thinking/reasoning content to the current streaming message for a channel. */
  appendStreamThinking(text: string, channel: string): void {
    const state = this._streamStates.get(channel);
    if (!state) return;
    state.thinkingParts.push(text);
    state.thinkingContent += text;
    this.scheduleStreamRender(channel);
  }

  /** Cancel the current streaming message for a channel -- discard partial content without committing. */
  cancelStreamMessage(channel?: string): void {
    const ch = channel ?? (this._streamStates.size === 1 ? [...this._streamStates.keys()][0] : undefined);
    if (!ch) return;
    const state = this._streamStates.get(ch);
    if (!state) return;
    if (this._streamRenderTimer) {
      clearTimeout(this._streamRenderTimer);
      this._streamRenderTimer = null;
    }
    const { lineStart } = state;
    this._streamStates.delete(ch);

    const channelBuf = this._channelLines.get(ch);
    if (channelBuf) {
      channelBuf.splice(lineStart, channelBuf.length - lineStart);
      this.getScrollBuffer(ch).replaceFrom(lineStart, []);
    }
  }

  /** Finalize the current streaming message for a channel (remove cursor, store as message). */
  finalizeStreamMessage(channel: string): void {
    const state = this._streamStates.get(channel);
    if (!state) return;
    if (this._streamRenderTimer) {
      clearTimeout(this._streamRenderTimer);
      this._streamRenderTimer = null;
    }
    const { sender, content, lineStart } = state;
    this._streamStates.delete(channel);

    const channelBuf = this._channelLines.get(channel)!;
    const layoutInfo = this.layout.getLayout();
    const chatWidth = layoutInfo.main.width - 2;
    const renderer = createIrcChatRenderer({
      width: chatWidth,
      noColor: this.opts.noColor,
      theme: this.opts.theme ?? 'red',
      indent: 0,
      showAgentHeader: this.opts.showAgentHeader,
    });

    const msg: ChatMessage = { type: 'agent', sender, content, timestamp: new Date() };
    const rendered = renderer.renderMessage(msg);

    channelBuf.splice(lineStart, channelBuf.length - lineStart, ...rendered);
    this.getScrollBuffer(channel).replaceFrom(lineStart, rendered);

    this._channelMessages.get(channel)!.push(msg);
  }

  /** Write a pending tool block (shows spinner). Returns blockId for later completion. */
  beginToolBlock(toolName: string, description: string, channel: string): number {
    if (!this._channelLines.has(channel)) this._channelLines.set(channel, []);
    if (!this._toolBlocks.has(channel)) this._toolBlocks.set(channel, []);

    const channelBuf = this._channelLines.get(channel)!;
    const blockId = this._toolBlockIdCounter++;
    const block: ToolBlock = {
      id: blockId, toolName, description,
      result: { success: true, data: '' },
      durationMs: 0, expanded: false,
      lineIndex: channelBuf.length,
      pending: true, startedAt: Date.now(),
    };
    this._toolBlocks.get(channel)!.push(block);

    const lines = renderToolBlockLines(block, this.opts);
    channelBuf.push(...lines);
    this.getScrollBuffer(channel).append(...lines);
    return blockId;
  }

  /** Update description on a pending tool block. */
  updateToolBlockDescription(channel: string, blockId: number, description: string): void {
    const blocks = this._toolBlocks.get(channel);
    if (!blocks) return;
    const block = blocks.find(b => b.id === blockId);
    if (!block || !block.pending) return;

    block.description = description;
    const oldCount = blockLineCount(block);
    const newLines = renderToolBlockLines(block, this.opts);
    const channelBuf = this._channelLines.get(channel);
    if (channelBuf) {
      channelBuf.splice(block.lineIndex, oldCount, ...newLines);
      this.getScrollBuffer(channel).replaceLinesAt(block.lineIndex, oldCount, newLines);
    }
  }

  /** Complete a pending tool block with result and status. */
  completeToolBlock(channel: string, blockId: number, result: { success: boolean; data?: string; error?: string }, durationMs?: number): void {
    const blocks = this._toolBlocks.get(channel);
    if (!blocks) return;
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    block.pending = false;
    block.result = result;
    block.durationMs = durationMs ?? (block.startedAt ? Date.now() - block.startedAt : 0);

    const oldCount = blockLineCount(block);
    const newLines = renderToolBlockLines(block, this.opts);
    const channelBuf = this._channelLines.get(channel);
    if (!channelBuf) return;
    channelBuf.splice(block.lineIndex, oldCount, ...newLines);

    const delta = newLines.length - oldCount;
    for (const b of blocks) {
      if (b.lineIndex > block.lineIndex) b.lineIndex += delta;
    }

    this.getScrollBuffer(channel).replaceFrom(0, channelBuf);
  }

  /** Write a collapsible tool execution block to a channel. */
  writeToolBlock(toolName: string, description: string, result: { success: boolean; data?: string; error?: string }, durationMs: number, channel: string): void {
    if (!this._channelLines.has(channel)) this._channelLines.set(channel, []);
    if (!this._toolBlocks.has(channel)) this._toolBlocks.set(channel, []);

    const channelBuf = this._channelLines.get(channel)!;
    const blockId = this._toolBlockIdCounter++;
    const block: ToolBlock = {
      id: blockId, toolName, description, result, durationMs,
      expanded: false,
      lineIndex: channelBuf.length,
    };
    this._toolBlocks.get(channel)!.push(block);

    const lines = renderToolBlockLines(block, this.opts);
    channelBuf.push(...lines);
    this.getScrollBuffer(channel).append(...lines);
  }

  /** Toggle a tool block between collapsed and expanded states. */
  toggleToolBlock(channel: string, lineIndex: number): void {
    const blocks = this._toolBlocks.get(channel);
    if (!blocks) return;
    const block = blocks.find(b => !b.pending && lineIndex >= b.lineIndex && lineIndex < b.lineIndex + blockLineCount(b));
    if (!block) return;

    const oldCount = blockLineCount(block);
    block.expanded = !block.expanded;
    const newLines = renderToolBlockLines(block, this.opts);

    const channelBuf = this._channelLines.get(channel);
    if (!channelBuf) return;
    channelBuf.splice(block.lineIndex, oldCount, ...newLines);

    const delta = newLines.length - oldCount;
    for (const b of blocks) {
      if (b.lineIndex > block.lineIndex) b.lineIndex += delta;
    }

    this.getScrollBuffer(channel).replaceFrom(0, channelBuf);
  }

  /** Re-render all channels after a layout resize. */
  reRenderAllChannels(activeChannel?: string): void {
    reRenderAllChannelsHelper(
      this._channelMessages,
      this._channelLines,
      (ch) => this.getScrollBuffer(ch),
      this.layout,
      this.opts,
    );
  }

  /** Add a user message to the staging area for a channel. */
  stageMessage(sender: string, content: string, channel: string): void {
    if (!this._stagingMessages.has(channel)) this._stagingMessages.set(channel, []);

    const layoutInfo = this.layout.getLayout();
    const chatWidth = layoutInfo.main.width - 4;
    const renderer = createIrcChatRenderer({
      width: chatWidth,
      noColor: this.opts.noColor,
      theme: this.opts.theme ?? 'red',
      indent: 0,
      showAgentHeader: this.opts.showAgentHeader,
    });
    const msg: ChatMessage = { type: 'user', sender, content, timestamp: new Date() };
    const rendered = renderer.renderMessage(msg);
    this._stagingMessages.get(channel)!.push({ sender, content, rendered });

    const totalLines = this.getStagingLines(channel).length;
    const mainHeight = layoutInfo.main.height - 2;
    const maxStagingHeight = Math.floor(mainHeight / 3);
    if (totalLines > maxStagingHeight) {
      this._stagingScrollOffset.set(channel, totalLines - maxStagingHeight);
    }
  }

  /** Get all rendered staging lines for a channel. */
  getStagingLines(channel: string): string[] { return renderStagingLines(this._stagingMessages.get(channel)); }

  /** Whether a channel has staged messages. */
  hasStaging(channel: string): boolean { return !!(this._stagingMessages.get(channel)?.length); }

  /** Get number of staged messages (not lines) for a channel. */
  getStagingMessageCount(channel: string): number { return this._stagingMessages.get(channel)?.length ?? 0; }

  /** Get staging scroll offset for a channel. */
  getStagingScrollOffset(channel: string): number { return this._stagingScrollOffset.get(channel) ?? 0; }

  /** Scroll the staging area. */
  scrollStaging(channel: string, delta: number, maxHeight: number): void {
    const lines = this.getStagingLines(channel);
    if (lines.length <= maxHeight) return;
    const current = this._stagingScrollOffset.get(channel) ?? 0;
    const maxOffset = Math.max(0, lines.length - maxHeight);
    const newOffset = Math.min(maxOffset, Math.max(0, current + delta));
    this._stagingScrollOffset.set(channel, newOffset);
  }

  /** Flush staging: merge staged messages into the main chat, clear staging buffer. */
  flushStaging(channel: string, activeChannel: string): Array<{ sender: string; content: string }> {
    const msgs = this._stagingMessages.get(channel);
    if (!msgs || msgs.length === 0) return [];

    const flushed = msgs.map(m => ({ sender: m.sender, content: m.content }));
    this._stagingMessages.delete(channel);
    this._stagingScrollOffset.delete(channel);
    return flushed;
  }

  /** Delete channel data when a channel is removed. */
  removeChannel(channel: string): void {
    this._channelMessages.delete(channel);
    this._channelLines.delete(channel);
    this._scrollBuffers.delete(channel);
    this._toolBlocks.delete(channel);
    this._streamStates.delete(channel);
    this._stagingMessages.delete(channel);
    this._stagingScrollOffset.delete(channel);
  }

  /** Flush pending render timer. */
  flushRender(channel: string): void {
    if (this._streamRenderTimer) {
      clearTimeout(this._streamRenderTimer);
      this._streamRenderTimer = null;
    }
  }

  /** Trim channel buffer — keeps system msgs + last N non-system + compaction summary. */
  /** Clear display buffer for a channel without touching messages or state. */
  clearDisplay(channel: string): void {
    this.flushRender(channel);
    this._channelLines.set(channel, []);
    const sb = this._scrollBuffers.get(channel);
    if (sb) sb.clear();
    const staging = this._stagingMessages.get(channel);
    if (staging) staging.length = 0;
  }

  /** Auto-prune old messages: keep only the last MAX_DISPLAY_MESSAGES.
   *  Only trims _channelMessages — display lines and scroll buffer are untouched. */
  private _pruneChannel(channel: string): void {
    const msgs = this._channelMessages.get(channel);
    if (!msgs || msgs.length <= TuiChannelManager.MAX_DISPLAY_MESSAGES) return;
    this._channelMessages.set(channel, msgs.slice(-TuiChannelManager.MAX_DISPLAY_MESSAGES));
  }

  trimChannelBuffer(channel: string, summary: string, keepCount: number): void {
    this.flushRender(channel);
    this._streamStates.delete(channel);
    this._toolBlocks.delete(channel);

    const msgs = this._channelMessages.get(channel);
    if (!msgs || msgs.length === 0) return;

    const systemMsgs = msgs.filter(m => m.type === 'system');
    const nonSystem = msgs.filter(m => m.type !== 'system');
    const kept = nonSystem.slice(-keepCount);
    const summaryMsg: ChatMessage = { type: 'system', sender: '*', content: `[Compacted — ${summary}]`, timestamp: new Date() };
    this._channelMessages.set(channel, [summaryMsg, ...systemMsgs, ...kept]);

    // Rebuild lines from trimmed messages
    const layoutInfo = this.layout.getLayout();
    const chatWidth = layoutInfo.main.width - 2;
    const renderer = createIrcChatRenderer({
      width: chatWidth,
      noColor: this.opts.noColor,
      theme: this.opts.theme ?? 'red',
      indent: 0,
      showAgentHeader: this.opts.showAgentHeader,
    });
    const rendered: string[] = [];
    for (const msg of this._channelMessages.get(channel)!) {
      const lines = renderer.renderMessage(msg);
      rendered.push(...lines);
    }
    this._channelLines.set(channel, rendered);

    const scrollBuf = this.getScrollBuffer(channel);
    const mainHeight = layoutInfo.main.height - 2;
    scrollBuf.resize(chatWidth, mainHeight);
    scrollBuf.setLines(rendered);
  }

  private _streamRenderTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastStreamRender = 0;
  private static STREAM_RENDER_INTERVAL = 100;

  private scheduleStreamRender(channel: string): void {
    const now = Date.now();
    const elapsed = now - this._lastStreamRender;
    if (elapsed >= TuiChannelManager.STREAM_RENDER_INTERVAL) {
      this._lastStreamRender = now;
      this.reRenderStream(channel);
    } else if (!this._streamRenderTimer) {
      this._streamRenderTimer = setTimeout(() => {
        this._streamRenderTimer = null;
        this._lastStreamRender = Date.now();
        this.reRenderStream(channel);
      }, TuiChannelManager.STREAM_RENDER_INTERVAL - elapsed);
    }
  }

  private reRenderStream(channel: string): void {
    const state = this._streamStates.get(channel);
    if (!state) return;
    reRenderStreamMessage(
      channel,
      state,
      this._channelLines,
      this._scrollBuffers,
      this.layout,
      this._rendererCache,
      this.opts,
      (ch) => this.getScrollBuffer(ch),
    );
  }
}
