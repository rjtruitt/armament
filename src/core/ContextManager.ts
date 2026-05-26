/** Snapshot of current token budget allocation. */
export interface ContextState {
  totalTokens: number;
  maxTokens: number;
  usagePercent: number;
  messageCount: number;
  systemPromptTokens: number;
  toolDefinitionTokens: number;
  conversationTokens: number;
  pinnedTokens: number;
  compressible: number;
}
/** Interface for CompactionResult.
 * @property {string} strategy - Description of strategy.
 * @property {string} summary - Description of summary.
 */
export interface CompactionResult {
  before: { messages: number; tokens: number };
  after: { messages: number; tokens: number };
  strategy: string;
  summary: string;
}
/** Interface for MemoryEntry.
 * @property {string} id - Description of id.
 * @property {string} content - Description of content.
 * @property {Record<string, unknown>} metadata - Description of metadata.
 * @property {number} createdAt - Description of createdAt.
 * @property {number} accessedAt - Description of accessedAt.
 * @property {number} relevanceScore - Description of relevanceScore.
 */
export interface MemoryEntry {
  id: string;
  type: 'short-term' | 'long-term' | 'entity' | 'project';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  accessedAt: number;
  relevanceScore?: number;
}
/** Interface for ContextWindow.
 * @property {Array<{ role: string; tokens: number; pinned: boolean; summary?: string }>} messages - Description of messages.
 * @property {boolean} overflow - Description of overflow.
 * @property {number} nextCompactionAt - Description of nextCompactionAt.
 */
export interface ContextWindow {
  messages: Array<{ role: string; tokens: number; pinned: boolean; summary?: string }>;
  overflow: boolean;
  nextCompactionAt: number;
}
/** Class representing ContextManager. */
export class ContextManager {
  private maxTokens: number = 128_000;
  private memories: MemoryEntry[] = [];
  private messages: Array<{ role: string; tokens: number; pinned: boolean; summary?: string }> = [];
  private compressionHistory: CompactionResult[] = [];
  private idCounter: number = 0;
  private readonly PIN_LIMIT = 20;
  constructor() {
    for (let i = 0; i < 50; i++) {
      this.messages.push({ role: i === 0 ? 'system' : 'user', tokens: 10, pinned: false });
    }
  }
  /**
   * Gets the state.
   */
  getState(): ContextState {
    const systemPromptTokens = this.messages
      .filter((m) => m.role === 'system')
      .reduce((sum, m) => sum + m.tokens, 0);
    const pinnedTokens = this.messages
      .filter((m) => m.pinned && m.role !== 'system')
      .reduce((sum, m) => sum + m.tokens, 0);
    const conversationTokens = this.messages
      .filter((m) => m.role !== 'system')
      .reduce((sum, m) => sum + m.tokens, 0);
    const toolDefinitionTokens = 0;
    const memoryTokens = this.memories.reduce((sum, m) => sum + this.getTokenCount(m.content), 0);
    const totalTokens = systemPromptTokens + toolDefinitionTokens + conversationTokens + pinnedTokens + memoryTokens;
    const compressible = conversationTokens - pinnedTokens;
    return {
      totalTokens,
      maxTokens: this.maxTokens,
      usagePercent: Math.round((totalTokens / this.maxTokens) * 100),
      messageCount: this.messages.length,
      systemPromptTokens,
      toolDefinitionTokens,
      conversationTokens: conversationTokens + memoryTokens,
      pinnedTokens,
      compressible: compressible > 0 ? compressible : 0,
    };
  }
  /**
   * Gets the window.
   */
  getWindow(): ContextWindow {
    const state = this.getState();
    return {
      messages: this.messages,
      overflow: state.totalTokens > this.maxTokens,
      nextCompactionAt: Math.floor(this.maxTokens * 0.9),
    };
  }
  /**
   * Compact.
   */
  compact(strategy?: 'summarize' | 'truncate' | 'smart'): CompactionResult {
    const effectiveStrategy = strategy || 'smart';
    const beforeMessages = this.messages.length;
    const beforeTokens = this.messages.reduce((sum, m) => sum + m.tokens, 0);
    if (effectiveStrategy === 'truncate') {
      const pinned = this.messages.filter((m) => m.pinned);
      const unpinned = this.messages.filter((m) => !m.pinned);
      const kept = unpinned.slice(Math.floor(unpinned.length / 2));
      this.messages = [...pinned, ...kept];
    } else {
      const pinned = this.messages.filter((m) => m.pinned);
      const unpinned = this.messages.filter((m) => !m.pinned);
      const summarized = unpinned.map((m) => ({
        ...m,
        tokens: Math.max(1, Math.floor(m.tokens * 0.4)),
        summary: 'Summarized content',
      }));
      this.messages = [...pinned, ...summarized];
    }
    const afterMessages = this.messages.length;
    const afterTokens = this.messages.reduce((sum, m) => sum + m.tokens, 0);
    const result: CompactionResult = {
      before: { messages: beforeMessages, tokens: beforeTokens },
      after: { messages: afterMessages, tokens: afterTokens },
      strategy: effectiveStrategy,
      summary: `Compacted using ${effectiveStrategy} strategy. Reduced from ${beforeTokens} to ${afterTokens} tokens.`,
    };
    this.compressionHistory.push(result);
    return result;
  }
  /**
   * Auto compact.
   */
  autoCompact(): void {
    const state = this.getState();
    if (state.usagePercent >= 90) {
      this.compact('smart');
    }
    while (this.getState().usagePercent >= 90) {
      const unpinned = this.messages.filter((m) => !m.pinned);
      if (unpinned.length === 0) break;
      this.messages = this.messages.filter((m) => m.pinned);
    }
  }
  /**
   * Pin message.
   */
  pinMessage(messageIndex: number): void {
    if (messageIndex < this.messages.length) {
      const pinnedCount = this.messages.filter((m) => m.pinned).length;
      if (pinnedCount < this.PIN_LIMIT) {
        this.messages[messageIndex].pinned = true;
      }
    }
  }
  /**
   * Unpin message.
   */
  unpinMessage(messageIndex: number): void {
    if (messageIndex < this.messages.length) {
      this.messages[messageIndex].pinned = false;
    }
  }
  /**
   * Summarize range.
   */
  summarizeRange(startIndex: number, endIndex: number): string {
    const range = this.messages.slice(startIndex, endIndex + 1);
    return `Summary of ${range.length} messages (${range.reduce((s, m) => s + m.tokens, 0)} tokens)`;
  }
  /**
   * Gets the token count.
   */
  getTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
  /**
   * Sets the max tokens.
   */
  setMaxTokens(max: number): void {
    this.maxTokens = max;
  }
  /**
   * Add memory.
   */
  addMemory(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt'>): MemoryEntry {
    const now = Date.now();
    if (entry.metadata?.expiresIn === 0) {
      const expiredEntry: MemoryEntry = {
        ...entry,
        id: `mem_${++this.idCounter}`,
        createdAt: now,
        accessedAt: now,
      };
      return expiredEntry;
    }
    const normalizedContent = entry.content.toLowerCase().replace(/^the\s+/, '').trim();
    const existingIndex = this.memories.findIndex((m) => {
      if (m.type !== entry.type) return false;
      const existingNormalized = m.content.toLowerCase().replace(/^the\s+/, '').trim();
      return existingNormalized === normalizedContent;
    });
    if (existingIndex !== -1) {
      this.memories[existingIndex].accessedAt = now;
      return this.memories[existingIndex];
    }
    const memoryEntry: MemoryEntry = {
      ...entry,
      id: `mem_${++this.idCounter}`,
      createdAt: now,
      accessedAt: now,
    };
    this.memories.push(memoryEntry);
    return memoryEntry;
  }
  /**
   * Gets the memories.
   */
  getMemories(filter?: { type?: MemoryEntry['type']; relevanceTo?: string }): MemoryEntry[] {
    let results = [...this.memories];
    if (filter?.type) {
      results = results.filter((m) => m.type === filter.type);
    }
    results = results.filter((m) => {
      if (m.metadata?.expiresIn === 0) return false;
      return true;
    });
    return results;
  }
  /**
   * Remove memory.
   */
  removeMemory(id: string): void {
    this.memories = this.memories.filter((m) => m.id !== id);
  }
  /**
   * Search memories.
   */
  searchMemories(query: string, limit?: number): MemoryEntry[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    const scored = this.memories.map((m) => {
      const contentLower = m.content.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (contentLower.includes(word)) score += 1;
      }
      if (contentLower.includes(queryLower)) score += 2;
      return { memory: m, score };
    });
    const filtered = scored.filter((s) => s.score > 0);
    filtered.sort((a, b) => b.score - a.score);
    const results = filtered.map((s) => {
      s.memory.accessedAt = Date.now();
      return s.memory;
    });
    return limit ? results.slice(0, limit) : results;
  }
  /**
   * Gets the project memory.
   */
  getProjectMemory(): MemoryEntry[] {
    return this.memories.filter((m) => m.type === 'project');
  }
  /**
   * Sets the project memory.
   */
  setProjectMemory(content: string): void {
    this.memories = this.memories.filter((m) => m.type !== 'project');
    const now = Date.now();
    this.memories.push({
      id: `mem_${++this.idCounter}`,
      type: 'project',
      content,
      metadata: { source: 'project-config' },
      createdAt: now,
      accessedAt: now,
    });
  }
  /**
   * Gets the entity memory.
   */
  getEntityMemory(entityName: string): MemoryEntry[] {
    return this.memories.filter(
      (m) => m.type === 'entity' && m.metadata?.entity === entityName
    );
  }
  /**
   * Gets the relevant context.
   */
  getRelevantContext(query: string): { memories: MemoryEntry[]; messages: number[] } {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    const scored = this.memories.map((m, index) => {
      const contentLower = m.content.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (contentLower.includes(word)) score += 1;
      }
      if (contentLower.includes(queryLower)) score += 2;
      score += index * 0.01;
      if (m.metadata?.source === 'code' && queryWords.some(w => contentLower.includes(w))) {
        score += 1;
      }
      return { memory: m, score };
    });
    const filtered = scored.filter((s) => s.score > 0);
    filtered.sort((a, b) => b.score - a.score);
    const memories = filtered.map((s) => ({
      ...s.memory,
      relevanceScore: s.score,
      accessedAt: Date.now(),
    }));
    const messageIndices: number[] = [];
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i].summary && queryWords.some((w) => this.messages[i].summary!.toLowerCase().includes(w))) {
        messageIndices.push(i);
      }
    }
    return { memories, messages: messageIndices };
  }
  /**
   * Export context.
   */
  exportContext(format: 'json' | 'markdown'): string {
    if (format === 'json') {
      return JSON.stringify({
        memories: this.memories,
        state: {
          maxTokens: this.maxTokens,
          messages: this.messages,
          compressionHistory: this.compressionHistory,
        },
      });
    } else {
      let md = '# Context Export\n\n';
      md += '## Memories\n\n';
      for (const m of this.memories) {
        md += `### ${m.type}\n`;
        md += `${m.content}\n\n`;
      }
      return md;
    }
  }
  /**
   * Import context.
   */
  importContext(data: string): void {
    const parsed = JSON.parse(data); // Will throw on invalid JSON
    if (parsed.memories) {
      this.memories = parsed.memories;
    }
    if (parsed.state) {
      if (parsed.state.maxTokens !== undefined) {
        this.maxTokens = parsed.state.maxTokens;
      }
      if (parsed.state.messages) {
        this.messages = parsed.state.messages;
      }
      if (parsed.state.compressionHistory) {
        this.compressionHistory = parsed.state.compressionHistory;
      }
    }
  }
  /**
   * Gets the compression history.
   */
  getCompressionHistory(): CompactionResult[] {
    return [...this.compressionHistory];
  }
}