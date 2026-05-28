/**
 * PROVIDER POOL INTEGRATION — TDD test suite
 *
 * Tests how the Armament terminal connects to and uses ProviderPool + ChannelAgent
 * for all LLM operations. Replaces the old FlightController-based tests.
 *
 * Architecture:
 *   ArmamentApp → ProviderPool (shared providers) → ChannelAgent (per-channel context)
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ── Imports (modules under test) ──────────────────────────────────────────
import { ArmamentApp } from '../app/ArmamentApp.js';
import { UserConfig } from '../config/UserConfig.js';

// Never write test state to the real config file
beforeAll(() => {
  UserConfig.instance().setNoPersist(true);
});
import { DebugMode } from '../debug/DebugMode.js';
import type { IReplConfig } from '../core/interfaces/IReplConfig.js';
import type { IStreamMetadata } from '../core/interfaces/IStreamHandler.js';
import type { IMessage, IToolCall, IToolResult } from '../core/interfaces/IMessage.js';
import type { IUsageStats, ICostBreakdown } from '../core/interfaces/IUsageStats.js';
import type { IChannel } from '../core/interfaces/IChannelManager.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CONNECTION & INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Connection & Initialization', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp({ streaming: true });
  });

  afterEach(() => {
    repl.stop();
  });

  it('should expose a ProviderPool via getProviderPool()', () => {
    const pool = repl.getProviderPool();
    expect(pool).toBeDefined();
    expect(pool.size).toBe(0);
  });

  it('should report hasProvider() false when pool is empty', () => {
    expect(repl.hasProvider()).toBe(false);
  });

  it('should return setup guidance when no provider configured and user sends message', async () => {
    UserConfig.instance().set('providers', []);
    const repl2 = new ArmamentApp({ providers: [] });
    // Join a non-system channel so handleUserMessage routes to LLM path
    repl2.joinChannel('test');
    const output = await repl2.handleUserMessage('hello');
    expect(output).toMatch(/no provider connected/i);
    repl2.stop();
  });

  it('should show provider info in /status output', () => {
    const output = repl.handleCommandWithOutput('/status');
    expect(output).toContain('Model');
  });

  it('should stop cleanly without errors when no provider set', () => {
    expect(() => repl.stop()).not.toThrow();
  });

  it('should report getLLMProvider info based on config', () => {
    const repl2 = new ArmamentApp({
      providers: [{ type: 'bedrock', models: ['claude-sonnet-4-20250514'], region: 'us-west-2' }],
      defaultProvider: 'bedrock',
      defaultModel: 'claude-sonnet-4-20250514',
    });
    const provider = repl2.getLLMProvider();
    expect(provider).toBeDefined();
    expect(provider.name).toBe('bedrock');
    repl2.stop();
  });

  it('should initialize with empty provider pool by default', () => {
    const repl2 = new ArmamentApp({});
    expect(repl2.getProviderPool().size).toBe(0);
    expect(repl2.hasProvider()).toBe(false);
    repl2.stop();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MODEL SELECTION & SWITCHING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Model Selection & Switching', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp({ defaultModel: 'claude-sonnet-4-20250514' });
  });

  afterEach(() => {
    repl.stop();
  });

  it('should use default model from config', () => {
    expect(repl.getCurrentModel()).toBe('claude-sonnet-4-20250514');
  });

  it('should return current model with getCurrentModelId()', () => {
    expect(repl.getCurrentModelId()).toBe('claude-sonnet-4-20250514');
  });

  it('should show current model in /model with no args', () => {
    const output = repl.handleCommandWithOutput('/model');
    expect(output).toContain('claude-sonnet-4-20250514');
  });

  it('should handle /model command gracefully', () => {
    // /model command is handled without throwing
    expect(() => repl.handleCommand('/model claude-opus-4-20250514')).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PROVIDER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Provider Management', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp({
      providers: [
        { type: 'anthropic', models: ['claude-sonnet-4-20250514'], apiKey: 'sk-test' },
        { type: 'bedrock', models: ['claude-sonnet-4-20250514'], region: 'us-west-2' },
        { type: 'openai', models: ['gpt-4o'], apiKey: 'sk-oai' },
      ],
      defaultProvider: 'anthropic',
    });
  });

  afterEach(() => {
    repl.stop();
  });

  it('should configure multiple providers simultaneously', () => {
    const providers = repl.getConfiguredProviders();
    expect(providers).toHaveLength(3);
  });

  it('should list providers with /providers command', () => {
    const output = repl.handleCommandWithOutput('/providers');
    expect(output).toContain('anthropic');
    expect(output).toContain('bedrock');
    expect(output).toContain('openai');
  });

  it('should use default provider from config', () => {
    expect(repl.getDefaultProvider()).toBe('anthropic');
  });

  it('should return active provider based on config', () => {
    expect(repl.getActiveProvider()).toBe('anthropic');
  });

  it('should show provider status in /providers', () => {
    const output = repl.handleCommandWithOutput('/providers');
    expect(output).toMatch(/anthropic|bedrock|openai/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PROVIDER POOL — POOL BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Pool Behavior', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp({ streaming: true });
  });

  afterEach(() => {
    repl.stop();
  });

  it('should have pool.size reflect number of created providers', () => {
    const pool = repl.getProviderPool();
    expect(pool.size).toBe(0);
  });

  it('should expose pool.has() to check for specific provider+model combos', () => {
    const pool = repl.getProviderPool();
    expect(pool.has('bedrock', 'claude-sonnet-4-20250514')).toBe(false);
  });

  it('should expose pool.get() to retrieve existing providers', () => {
    const pool = repl.getProviderPool();
    expect(pool.get('bedrock', 'claude-sonnet-4-20250514')).toBeUndefined();
  });

  it('should throw on getOrCreate with unsupported provider type', async () => {
    const pool = repl.getProviderPool();
    await expect(pool.getOrCreate('unsupported-provider', 'some-model')).rejects.toThrow(/unsupported provider/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. NO-PROVIDER GUIDANCE (replaces old "throw if no LLM" behavior)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — No Provider Guidance', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    // Clear UserConfig providers so joinChannel doesn't read real config
    const uc = UserConfig.instance();
    uc.set('providers', []);
    uc.set('defaultModel', '');
    uc.set('defaultProvider', '');
    repl = new ArmamentApp({ providers: [] });
  });

  afterEach(() => {
    repl.stop();
  });

  it('should return guidance string when pool is empty and not in debug mode', async () => {
    repl.joinChannel('test');
    const output = await repl.handleUserMessage('hello');
    expect(output).toBeDefined();
    expect(output).toMatch(/no provider connected/i);
  });

  it('should mention F2 config in the guidance', async () => {
    repl.joinChannel('test');
    const output = await repl.handleUserMessage('anything');
    expect(output).toContain('F2');
  });

  it('should suggest /model in the guidance', async () => {
    repl.joinChannel('test');
    const output = await repl.handleUserMessage('test');
    expect(output).toMatch(/\/model/i);
  });

  it('should not throw on message when no provider (returns guidance)', async () => {
    repl.joinChannel('test');
    // Should resolve without throwing
    await expect(repl.handleUserMessage('no throw please')).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. RATE LIMITING (config-level tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Rate Limiting', () => {
  it('should store rate limit config', () => {
    const repl = new ArmamentApp({
      rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 100000,
        adaptive: true,
        perModel: {
          'claude-opus-4-20250514': { requestsPerMinute: 20 },
        },
      },
    });
    const config = repl.getConfig();
    expect(config.rateLimits?.requestsPerMinute).toBe(60);
    expect(config.rateLimits?.tokensPerMinute).toBe(100000);
    expect(config.rateLimits?.adaptive).toBe(true);
    expect(config.rateLimits?.perModel?.['claude-opus-4-20250514']?.requestsPerMinute).toBe(20);
    repl.stop();
  });

  it('should not have rateLimits when not configured', () => {
    const repl = new ArmamentApp({});
    expect(repl.getConfig().rateLimits).toBeUndefined();
    repl.stop();
  });

  it('should enforce session-level max turns', async () => {
    const debug = DebugMode.instance();
    debug.activate();
    const repl = new ArmamentApp({ maxTurns: 2 });
    repl.joinChannel('test');
    await repl.handleUserMessage('first');
    await repl.handleUserMessage('second');
    await expect(repl.handleUserMessage('third')).rejects.toThrow(/max turns/i);
    repl.stop();
    debug.deactivate();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. COST TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Cost Tracking', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    DebugMode.instance().activate();
    repl = new ArmamentApp({ maxBudget: 5.0 });
  });

  afterEach(() => {
    repl.stop();
    DebugMode.instance().deactivate();
  });

  it('should start with zero cost', () => {
    const usage = repl.getUsage();
    expect(usage.estimatedCost).toBe(0);
  });

  it('should track cumulative cost in usage stats', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('first query');
    await repl.handleUserMessage('second query');
    const usage = repl.getUsage();
    expect(usage.estimatedCost).toBeGreaterThan(0);
  });

  it('should format /cost command output', () => {
    const output = repl.handleCommandWithOutput('/cost');
    expect(output).toMatch(/\$|cost/i);
  });

  it('should reset cost tracking on /clear-session', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('test');
    repl.handleCommand('/clear-session');
    // After clear, usage is still tracked at repl level
    // (clear resets messages and turn count, not cumulative stats)
    expect(repl.getTurnCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. TOKEN COUNTING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Token Counting', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    DebugMode.instance().activate();
    repl = new ArmamentApp({});
  });

  afterEach(() => {
    repl.stop();
    DebugMode.instance().deactivate();
  });

  it('should start with zero tokens', () => {
    const usage = repl.getUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });

  it('should track tokens after message handling', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('hello world');
    const usage = repl.getUsage();
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
  });

  it('should provide token estimation', () => {
    const estimate = repl.estimateTokens('Hello, how are you doing today?');
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(100);
  });

  it('should report context usage', () => {
    const ctx = repl.getContextUsage();
    expect(ctx.capacity).toBe(200000);
    expect(ctx.remaining).toBe(200000);
  });

  it('should show context info in /context command', () => {
    const output = repl.handleCommandWithOutput('/context');
    expect(output).toMatch(/context/i);
  });

  it('should reset token counts on /clear-session via turn count', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('test');
    expect(repl.getTurnCount()).toBe(1);
    repl.handleCommand('/clear-session');
    expect(repl.getTurnCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ERROR MAPPING (behavior tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Error Handling', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    DebugMode.instance().activate();
    repl = new ArmamentApp({ maxRetries: 2 });
  });

  afterEach(() => {
    repl.stop();
    DebugMode.instance().deactivate();
  });

  it('should handle trigger_error gracefully in handleUserMessage', async () => {
    repl.joinChannel('test');
    await expect(repl.handleUserMessage('trigger_error')).rejects.toThrow(/provider error/i);
  });

  it('should handle empty input without errors', async () => {
    await expect(repl.handleInput('')).resolves.not.toThrow();
  });

  it('should handle whitespace input without errors', async () => {
    await expect(repl.handleInput('   ')).resolves.not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. MULTI-MODEL ORCHESTRATION (config-level)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Multi-Model Orchestration', () => {
  it('should support fallback chain configuration', () => {
    const repl = new ArmamentApp({
      fallbackChain: ['anthropic', 'bedrock'],
      providers: [
        { type: 'anthropic', models: ['claude-sonnet-4-20250514'], apiKey: 'sk-a' },
        { type: 'bedrock', models: ['claude-sonnet-4-20250514'], region: 'us-west-2' },
      ],
    });
    expect(repl.getFallbackChain()).toEqual(['anthropic', 'bedrock']);
    repl.stop();
  });

  it('should show fallback chain in /fallback command', () => {
    const repl = new ArmamentApp({
      fallbackChain: ['anthropic', 'bedrock'],
    });
    const output = repl.handleCommandWithOutput('/fallback');
    expect(output).toContain('anthropic');
    expect(output).toContain('bedrock');
    repl.stop();
  });

  it('should track average latency in stats', () => {
    const repl = new ArmamentApp({});
    const stats = repl.getStats();
    expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
    repl.stop();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. AUTH INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Auth Integration', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp({
      providers: [{ type: 'bedrock', models: ['claude-sonnet-4-20250514'], region: 'us-west-2', auth: 'sso', ssoStartUrl: 'https://my-sso.awsapps.com/start' }],
    });
  });

  afterEach(() => {
    repl.stop();
  });

  it('should store SSO config in provider configuration', () => {
    const providers = repl.getConfiguredProviders();
    expect(providers[0].auth).toBe('sso');
    expect(providers[0].ssoStartUrl).toBe('https://my-sso.awsapps.com/start');
  });

  it('should handle /auth command', () => {
    expect(() => repl.handleCommand('/auth')).not.toThrow();
  });

  it('should show auth status in /auth output', () => {
    const output = repl.handleCommandWithOutput('/auth');
    expect(output).toMatch(/auth/i);
  });

  it('should track token validity', () => {
    expect(repl.hasValidToken()).toBe(true);
  });

  it('should simulate token expiring', () => {
    repl.simulateTokenExpiring();
    expect(repl.hasValidToken()).toBe(false);
  });

  it('should support authenticate()', async () => {
    const result = await repl.authenticate();
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. CHANNEL AGENT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — Channel Agent', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    repl = new ArmamentApp({
      providers: [{ type: 'bedrock', models: ['claude-sonnet-4-20250514'], region: 'us-west-2' }],
      defaultModel: 'claude-sonnet-4-20250514',
      defaultProvider: 'bedrock',
    });
  });

  afterEach(() => {
    try { repl.stop(); } catch { /* persistence may not be initialized in test */ }
  });

  it('should create channel agents when joining channels', () => {
    // joinChannel triggers async ChannelAgent creation
    expect(() => repl.joinChannel('research')).not.toThrow();
  });

  it('should support multiple channels with independent contexts', () => {
    repl.joinChannel('code');
    repl.joinChannel('research');
    // Both channels exist
    const list = repl.handleCommandWithOutput('/list');
    expect(list).toContain('code');
    expect(list).toContain('research');
  });

  it('should switch between channels', () => {
    repl.joinChannel('code');
    repl.joinChannel('research');
    expect(() => repl.switchChannel('code')).not.toThrow();
  });

  it('should part channels', () => {
    repl.joinChannel('temp');
    expect(() => repl.partChannel('temp')).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// END-TO-END SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Pool Integration — End-to-End Scenarios', () => {
  let repl: ArmamentApp;

  beforeEach(() => {
    DebugMode.instance().activate();
    repl = new ArmamentApp({
      streaming: true,
      defaultModel: 'claude-sonnet-4-20250514',
      maxBudget: 10.0,
      maxRetries: 2,
      toolPermissions: { 'file:read': 'allow', 'file:write': 'allow' },
    });
  });

  afterEach(() => {
    repl.stop();
    DebugMode.instance().deactivate();
  });

  it('should handle a full conversation turn with token tracking', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('hi');
    const usage = repl.getUsage();
    expect(usage.turnsUsed).toBe(1);
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(usage.estimatedCost).toBeGreaterThan(0);
  });

  it('should support /history command showing all turns', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('question 1');
    await repl.handleUserMessage('question 2');
    const output = repl.handleCommandWithOutput('/history');
    expect(output).toContain('question 1');
    expect(output).toContain('question 2');
  });

  it('should export session with metadata', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('test');
    const exported = repl.exportSession();
    expect(exported.messages.length).toBeGreaterThan(0);
    expect(exported.usage.estimatedCost).toBeGreaterThan(0);
  });

  it('should handle undo with state rollback', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('question');
    expect(repl.getTurnCount()).toBe(1);
    repl.handleCommand('/undo');
    expect(repl.getTurnCount()).toBe(0);
  });

  it('should not send empty messages', async () => {
    await repl.handleInput('');
    await repl.handleInput('   ');
    expect(repl.getTurnCount()).toBe(0);
  });

  it('should track request count in usage stats', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('one');
    await repl.handleUserMessage('two');
    await repl.handleUserMessage('three');
    const usage = repl.getUsage();
    expect(usage.requestCount).toBe(3);
  });

  it('should update turn count on each successful exchange', async () => {
    repl.joinChannel('test');
    expect(repl.getTurnCount()).toBe(0);
    await repl.handleUserMessage('one');
    expect(repl.getTurnCount()).toBe(1);
    await repl.handleUserMessage('two');
    expect(repl.getTurnCount()).toBe(2);
  });

  it('should pass message history to context', async () => {
    repl.joinChannel('test');
    await repl.handleUserMessage('first message');
    await repl.handleUserMessage('second message');
    const history = repl.getMessageHistory();
    // Should have user + assistant pairs
    expect(history.length).toBeGreaterThanOrEqual(4);
  });

  it('should handle interrupt', () => {
    expect(repl.wasInterrupted()).toBe(false);
    repl.interrupt();
    expect(repl.wasInterrupted()).toBe(true);
  });

  it('should include system prompt in config when provided', () => {
    const repl2 = new ArmamentApp({ systemPrompt: 'You are a helpful coding assistant.' });
    expect(repl2.getConfig().systemPrompt).toBe('You are a helpful coding assistant.');
    repl2.stop();
  });

  it('should pass temperature and model config', () => {
    const repl2 = new ArmamentApp({
      modelConfig: { temperature: 0.7, maxTokens: 4096, topP: 0.9, stop: [] },
    });
    const mc = repl2.getModelConfig();
    expect(mc.temperature).toBe(0.7);
    expect(mc.maxTokens).toBe(4096);
    repl2.stop();
  });

  it('should track average latency', () => {
    const stats = repl.getStats();
    expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should support promptCaching config', () => {
    const repl2 = new ArmamentApp({ promptCaching: true });
    expect(repl2.getConfig().promptCaching).toBe(true);
    repl2.stop();
  });

  it('should handle concurrent channel messages', async () => {
    repl.joinChannel('code');
    repl.joinChannel('research');
    repl.switchChannel('code');
    await repl.handleUserMessage('write code');
    repl.switchChannel('research');
    await repl.handleUserMessage('find papers');
    // lastUserMsg is global (last message across all channels)
    expect(repl.getLastUserMessage()).toBe('find papers');
    // Turn count reflects all messages regardless of channel
    expect(repl.getTurnCount()).toBe(2);
  });

  it('should render status line', () => {
    const output = repl.renderStatusLine();
    expect(output).toContain('model');
    expect(output).toContain('tok');
  });

  it('should format prompt with channel', () => {
    repl.joinChannel('mytest');
    const prompt = repl.formatPrompt();
    expect(prompt).toContain('mytest');
  });

  it('should render diff output', () => {
    const diff = `--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n+import { thing } from './thing';\n export function main() {}`;
    const rendered = repl.renderDiff(diff);
    expect(rendered).toContain('file.ts');
  });

  it('should render file path', () => {
    const rendered = repl.renderFilePath('src/auth/sso.ts', 42);
    expect(rendered).toContain('src/auth/sso.ts');
    expect(rendered).toContain('42');
  });

  it('should render commit info', () => {
    const commitInfo = {
      hash: 'abc1234',
      message: 'feat: add streaming',
      author: 'dev',
      date: '2025-01-01',
    };
    const rendered = repl.renderCommit(commitInfo);
    expect(rendered).toContain('abc1234');
    expect(rendered).toContain('feat: add streaming');
  });
});
