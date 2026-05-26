import { describe, it, expect } from 'vitest';
import {
  ContextManager,
  type ContextState,
  type CompactionResult,
  type MemoryEntry,
  type ContextWindow,
} from '../core/ContextManager';

function createContextManager(): ContextManager {
  return new ContextManager();
}

describe('ContextManager', () => {
  describe('Context State Tracking', () => {
    it('should return total token count across all categories', () => {
      const cm = createContextManager();
      const state = cm.getState();
      expect(state.totalTokens).toBeGreaterThanOrEqual(0);
      expect(state.totalTokens).toBe(
        state.systemPromptTokens +
          state.toolDefinitionTokens +
          state.conversationTokens +
          state.pinnedTokens
      );
    });

    it('should calculate usage percentage relative to max tokens', () => {
      const cm = createContextManager();
      cm.setMaxTokens(100_000);
      const state = cm.getState();
      expect(state.usagePercent).toBe(
        Math.round((state.totalTokens / state.maxTokens) * 100)
      );
    });

    it('should break down tokens by category', () => {
      const cm = createContextManager();
      const state = cm.getState();
      expect(state).toHaveProperty('systemPromptTokens');
      expect(state).toHaveProperty('toolDefinitionTokens');
      expect(state).toHaveProperty('conversationTokens');
      expect(state).toHaveProperty('pinnedTokens');
      expect(state).toHaveProperty('compressible');
    });

    it('should detect overflow when tokens exceed max', () => {
      const cm = createContextManager();
      cm.setMaxTokens(10);
      const window = cm.getWindow();
      expect(window.overflow).toBe(true);
    });

    it('should allow configuring max tokens', () => {
      const cm = createContextManager();
      cm.setMaxTokens(200_000);
      const state = cm.getState();
      expect(state.maxTokens).toBe(200_000);
    });

    it('should track message count', () => {
      const cm = createContextManager();
      const state = cm.getState();
      expect(state.messageCount).toBeGreaterThanOrEqual(0);
    });

    it('should count compressible tokens (non-pinned, non-system)', () => {
      const cm = createContextManager();
      const state = cm.getState();
      expect(state.compressible).toBeLessThanOrEqual(state.conversationTokens);
    });

    it('should update state in real-time as context changes', () => {
      const cm = createContextManager();
      const before = cm.getState();
      cm.addMemory({ type: 'short-term', content: 'test memory', metadata: {} });
      const after = cm.getState();
      expect(after.totalTokens).toBeGreaterThan(before.totalTokens);
    });
  });

  describe('Compaction', () => {
    it('should compact using summarize strategy via LLM', () => {
      const cm = createContextManager();
      const result = cm.compact('summarize');
      expect(result.strategy).toBe('summarize');
      expect(result.after.tokens).toBeLessThan(result.before.tokens);
      expect(result.summary).toBeTruthy();
    });

    it('should compact using truncate strategy removing oldest first', () => {
      const cm = createContextManager();
      const result = cm.compact('truncate');
      expect(result.strategy).toBe('truncate');
      expect(result.after.messages).toBeLessThan(result.before.messages);
    });

    it('should compact using smart strategy based on relevance', () => {
      const cm = createContextManager();
      const result = cm.compact('smart');
      expect(result.strategy).toBe('smart');
      expect(result.after.tokens).toBeLessThan(result.before.tokens);
    });

    it('should use smart strategy by default when no strategy specified', () => {
      const cm = createContextManager();
      const result = cm.compact();
      expect(result.strategy).toBe('smart');
    });

    it('should trigger auto-compact when approaching token limit', () => {
      const cm = createContextManager();
      cm.setMaxTokens(100);
      cm.autoCompact();
      const state = cm.getState();
      expect(state.usagePercent).toBeLessThan(90);
    });

    it('should record compaction in history', () => {
      const cm = createContextManager();
      cm.compact('summarize');
      const history = cm.getCompressionHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].strategy).toBe('summarize');
    });

    it('should preserve pinned messages during compaction', () => {
      const cm = createContextManager();
      cm.pinMessage(0);
      cm.compact('truncate');
      const window = cm.getWindow();
      const pinned = window.messages.filter((m) => m.pinned);
      expect(pinned.length).toBeGreaterThanOrEqual(1);
    });

    it('should track compression ratio', () => {
      const cm = createContextManager();
      const result = cm.compact('summarize');
      const ratio = result.after.tokens / result.before.tokens;
      expect(ratio).toBeLessThan(1);
      expect(ratio).toBeGreaterThan(0);
    });

    it('should provide a human-readable summary of what was compacted', () => {
      const cm = createContextManager();
      const result = cm.compact('summarize');
      expect(result.summary.length).toBeGreaterThan(10);
    });
  });

  describe('Message Pinning', () => {
    it('should pin a message by index', () => {
      const cm = createContextManager();
      cm.pinMessage(2);
      const window = cm.getWindow();
      expect(window.messages[2].pinned).toBe(true);
    });

    it('should unpin a message by index', () => {
      const cm = createContextManager();
      cm.pinMessage(2);
      cm.unpinMessage(2);
      const window = cm.getWindow();
      expect(window.messages[2].pinned).toBe(false);
    });

    it('should ensure pinned messages survive compaction', () => {
      const cm = createContextManager();
      cm.pinMessage(1);
      const beforeWindow = cm.getWindow();
      const pinnedContent = beforeWindow.messages[1];
      cm.compact('truncate');
      const afterWindow = cm.getWindow();
      const stillPinned = afterWindow.messages.find(
        (m) => m.pinned && m.tokens === pinnedContent.tokens
      );
      expect(stillPinned).toBeDefined();
    });

    it('should allow pinning system prompt messages', () => {
      const cm = createContextManager();
      cm.pinMessage(0); // system prompt is typically first
      const window = cm.getWindow();
      expect(window.messages[0].pinned).toBe(true);
    });

    it('should enforce a pin limit to prevent excessive memory usage', () => {
      const cm = createContextManager();
      // Pin more messages than the limit allows
      for (let i = 0; i < 50; i++) {
        cm.pinMessage(i);
      }
      const window = cm.getWindow();
      const pinnedCount = window.messages.filter((m) => m.pinned).length;
      expect(pinnedCount).toBeLessThanOrEqual(20); // reasonable limit
    });
  });

  describe('Memory System', () => {
    it('should add a short-term memory entry', () => {
      const cm = createContextManager();
      const entry = cm.addMemory({
        type: 'short-term',
        content: 'User prefers TypeScript',
        metadata: { source: 'conversation' },
      });
      expect(entry.id).toBeTruthy();
      expect(entry.type).toBe('short-term');
      expect(entry.createdAt).toBeGreaterThan(0);
      expect(entry.accessedAt).toBeGreaterThan(0);
    });

    it('should add a long-term memory entry', () => {
      const cm = createContextManager();
      const entry = cm.addMemory({
        type: 'long-term',
        content: 'Project uses monorepo architecture',
        metadata: { confidence: 0.95 },
      });
      expect(entry.type).toBe('long-term');
    });

    it('should add an entity memory entry', () => {
      const cm = createContextManager();
      const entry = cm.addMemory({
        type: 'entity',
        content: 'ContextManager handles token counting and compaction',
        metadata: { entity: 'ContextManager' },
      });
      expect(entry.type).toBe('entity');
    });

    it('should store and retrieve project memory (CLAUDE.md equivalent)', () => {
      const cm = createContextManager();
      cm.setProjectMemory('This project uses vitest for testing. All stubs throw Not implemented.');
      const projectMemories = cm.getProjectMemory();
      expect(projectMemories.length).toBeGreaterThan(0);
      expect(projectMemories[0].type).toBe('project');
      expect(projectMemories[0].content).toContain('vitest');
    });

    it('should search memories by relevance to a query', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'short-term', content: 'User likes dark themes', metadata: {} });
      cm.addMemory({ type: 'short-term', content: 'Project uses TypeScript', metadata: {} });
      cm.addMemory({ type: 'long-term', content: 'Testing framework is vitest', metadata: {} });
      const results = cm.searchMemories('testing framework');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('vitest');
    });

    it('should track memory access timestamps', () => {
      const cm = createContextManager();
      const entry = cm.addMemory({
        type: 'short-term',
        content: 'some memory',
        metadata: {},
      });
      const before = entry.accessedAt;
      cm.searchMemories('some memory');
      const memories = cm.getMemories({ type: 'short-term' });
      const found = memories.find((m) => m.id === entry.id);
      expect(found!.accessedAt).toBeGreaterThanOrEqual(before);
    });

    it('should expire short-term memories after a configured duration', () => {
      const cm = createContextManager();
      cm.addMemory({
        type: 'short-term',
        content: 'ephemeral thought',
        metadata: { expiresIn: 0 },
      });
      const memories = cm.getMemories({ type: 'short-term' });
      const expired = memories.filter((m) => m.content === 'ephemeral thought');
      expect(expired.length).toBe(0);
    });

    it('should deduplicate memories with substantially similar content', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'long-term', content: 'Project uses TypeScript', metadata: {} });
      cm.addMemory({ type: 'long-term', content: 'The project uses TypeScript', metadata: {} });
      const memories = cm.getMemories({ type: 'long-term' });
      const tsMemories = memories.filter((m) => m.content.toLowerCase().includes('typescript'));
      expect(tsMemories.length).toBe(1);
    });

    it('should persist memories across sessions (serialization)', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'long-term', content: 'cross session data', metadata: {} });
      const exported = cm.exportContext('json');
      const cm2 = createContextManager();
      cm2.importContext(exported);
      const memories = cm2.getMemories({ type: 'long-term' });
      expect(memories.some((m) => m.content === 'cross session data')).toBe(true);
    });

    it('should extract entities from conversation and create entity memories', () => {
      const cm = createContextManager();
      const entities = cm.getEntityMemory('ContextManager');
      expect(entities).toBeInstanceOf(Array);
      expect(entities.every((e) => e.type === 'entity')).toBe(true);
    });
  });

  describe('Context Export/Import', () => {
    it('should export context as JSON', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'short-term', content: 'export test', metadata: {} });
      const json = cm.exportContext('json');
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('memories');
      expect(parsed).toHaveProperty('state');
    });

    it('should export context as markdown', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'long-term', content: 'markdown export test', metadata: {} });
      const md = cm.exportContext('markdown');
      expect(md).toContain('markdown export test');
      expect(md).toContain('#'); // markdown heading
    });

    it('should import and restore full state from exported JSON', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'long-term', content: 'restore me', metadata: {} });
      cm.setMaxTokens(150_000);
      const exported = cm.exportContext('json');

      const cm2 = createContextManager();
      cm2.importContext(exported);
      const state = cm2.getState();
      expect(state.maxTokens).toBe(150_000);
      const memories = cm2.getMemories();
      expect(memories.some((m) => m.content === 'restore me')).toBe(true);
    });

    it('should validate import data format and reject invalid input', () => {
      const cm = createContextManager();
      expect(() => cm.importContext('not valid json {')).toThrow();
    });

    it('should maintain round-trip fidelity (export then import produces same state)', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'long-term', content: 'fidelity check', metadata: { key: 'value' } });
      cm.setMaxTokens(120_000);
      const exported = cm.exportContext('json');

      const cm2 = createContextManager();
      cm2.importContext(exported);
      const reExported = cm2.exportContext('json');

      expect(JSON.parse(reExported)).toEqual(JSON.parse(exported));
    });
  });

  describe('Relevant Context Retrieval', () => {
    it('should return relevant memories and message indices for a query', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'long-term', content: 'database uses PostgreSQL', metadata: {} });
      const result = cm.getRelevantContext('what database do we use');
      expect(result.memories.length).toBeGreaterThan(0);
      expect(result.messages).toBeInstanceOf(Array);
    });

    it('should score relevance of returned memories', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'long-term', content: 'API uses REST', metadata: {} });
      cm.addMemory({ type: 'long-term', content: 'frontend uses React', metadata: {} });
      const result = cm.getRelevantContext('what API style');
      expect(result.memories[0].relevanceScore).toBeDefined();
      expect(result.memories[0].relevanceScore!).toBeGreaterThan(0);
    });

    it('should weight recent messages higher in relevance', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'short-term', content: 'old context about testing', metadata: {} });
      cm.addMemory({ type: 'short-term', content: 'recent context about testing', metadata: {} });
      const result = cm.getRelevantContext('testing');
      // Most recent should rank higher when content is equally relevant
      expect(result.memories[0].content).toContain('recent');
    });

    it('should retrieve entity-specific context', () => {
      const cm = createContextManager();
      cm.addMemory({
        type: 'entity',
        content: 'DiffViewer renders colored terminal output',
        metadata: { entity: 'DiffViewer' },
      });
      const result = cm.getRelevantContext('DiffViewer rendering');
      expect(result.memories.some((m) => m.content.includes('DiffViewer'))).toBe(true);
    });

    it('should include tool results in relevance matching', () => {
      const cm = createContextManager();
      cm.addMemory({
        type: 'short-term',
        content: 'tool:read_file returned package.json contents',
        metadata: { source: 'tool-result' },
      });
      const result = cm.getRelevantContext('package.json');
      expect(result.memories.length).toBeGreaterThan(0);
    });

    it('should prioritize code context when query is code-related', () => {
      const cm = createContextManager();
      cm.addMemory({ type: 'short-term', content: 'user said hello', metadata: {} });
      cm.addMemory({
        type: 'short-term',
        content: 'function getState() returns ContextState interface',
        metadata: { source: 'code' },
      });
      const result = cm.getRelevantContext('getState function signature');
      expect(result.memories[0].content).toContain('getState');
    });
  });
});
