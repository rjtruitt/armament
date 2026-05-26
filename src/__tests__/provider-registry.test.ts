/**
 * PROVIDER REGISTRY TEST SUITE — AI provider configuration management service.
 * Manages unlimited simultaneous providers with per-agent assignment,
 * rate limiting, health tracking, and queryable model selection.
 *
 * Covers:
 * - Registration & removal
 * - Default provider management
 * - Provider queries (by type, model, capability, cost, latency)
 * - Enable/disable lifecycle
 * - Status tracking (requests, tokens, cost, errors)
 * - Rate limit enforcement
 * - Serialization (toJSON, fromJSON, import/export)
 * - Events (provider lifecycle notifications)
 * - Agent assignment (agent → provider mapping)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry, ProviderConfig, ProviderStatus } from '../providers/ProviderRegistry.js';

let registry: ProviderRegistry;

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-anthropic-1',
    type: 'anthropic',
    name: 'Anthropic Primary',
    endpoint: 'https://api.anthropic.com',
    credentials: {
      apiKey: 'sk-ant-api03-XXXXXXXXXXXXXXXXXXXX-YYYYYYYY',
    },
    models: ['opus-4', 'sonnet-4', 'haiku-3.5'],
    rateLimit: { rpm: 60, tpm: 100000 },
    isDefault: false,
    enabled: true,
    metadata: {},
    ...overrides,
  };
}

function makeOpenAIProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-openai-1',
    type: 'openai',
    name: 'OpenAI Primary',
    endpoint: 'https://api.openai.com/v1',
    credentials: {
      apiKey: 'sk-proj-XXXXXXXXXXXXXXXXXX-ZZZZZZZZ',
    },
    models: ['gpt-4o', 'gpt-4o-mini', 'o3'],
    rateLimit: { rpm: 500, tpm: 200000 },
    isDefault: false,
    enabled: true,
    metadata: { capabilities: ['streaming', 'function-calling'] },
    ...overrides,
  };
}

function makeBedrockProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-bedrock-1',
    type: 'bedrock',
    name: 'AWS Bedrock',
    credentials: {
      awsProfile: 'production',
      awsRegion: 'us-east-1',
      roleArn: 'arn:aws:iam::123456789:role/BedrockAccess',
    },
    models: ['anthropic.claude-opus-4', 'anthropic.claude-sonnet-4'],
    rateLimit: { rpm: 120, tpm: 500000 },
    isDefault: false,
    enabled: true,
    metadata: { capabilities: ['streaming'] },
    ...overrides,
  };
}

function makeOllamaProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-ollama-1',
    type: 'ollama',
    name: 'Local Ollama',
    endpoint: 'http://localhost:11434',
    credentials: {},
    models: ['llama3', 'codellama', 'mistral'],
    enabled: true,
    metadata: { capabilities: ['local', 'streaming'] },
    ...overrides,
  };
}

beforeEach(() => {
  registry = new ProviderRegistry();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. REGISTRATION & REMOVAL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Registration & Removal', () => {
  it('register(config) adds a provider to the registry', () => {
    const config = makeProvider();
    registry.register(config);
    expect(registry.has(config.id)).toBe(true);
  });

  it('register(config) returns the registered provider config', () => {
    const config = makeProvider();
    const result = registry.register(config);
    expect(result).toEqual(config);
  });

  it('register() with duplicate ID throws an error', () => {
    const config = makeProvider();
    registry.register(config);
    expect(() => registry.register(config)).toThrow();
  });

  it('register() with duplicate ID throws descriptive error message', () => {
    const config = makeProvider();
    registry.register(config);
    expect(() => registry.register(config)).toThrow(/already registered|duplicate/i);
  });

  it('unregister(id) removes a provider from the registry', () => {
    const config = makeProvider();
    registry.register(config);
    registry.unregister(config.id);
    expect(registry.has(config.id)).toBe(false);
  });

  it('unregister() with non-existent ID throws an error', () => {
    expect(() => registry.unregister('nonexistent-id')).toThrow();
  });

  it('unregister() with non-existent ID throws descriptive error', () => {
    expect(() => registry.unregister('ghost-provider')).toThrow(/not found|not registered|does not exist/i);
  });

  it('has(id) returns true for registered provider', () => {
    registry.register(makeProvider());
    expect(registry.has('test-anthropic-1')).toBe(true);
  });

  it('has(id) returns false for unregistered provider', () => {
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('get(id) returns the config for a registered provider', () => {
    const config = makeProvider();
    registry.register(config);
    expect(registry.get(config.id)).toEqual(config);
  });

  it('get(id) returns undefined for non-existent provider', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('getAll() returns all registered providers', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.register(makeBedrockProvider());
    const all = registry.getAll();
    expect(all).toHaveLength(3);
  });

  it('getAll() returns empty array when no providers registered', () => {
    expect(registry.getAll()).toEqual([]);
  });

  it('count() returns the number of registered providers', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    expect(registry.count()).toBe(2);
  });

  it('count() returns 0 when registry is empty', () => {
    expect(registry.count()).toBe(0);
  });

  it('registering the first provider auto-sets it as default', () => {
    const config = makeProvider();
    registry.register(config);
    expect(registry.getDefault()).toEqual(config);
  });

  it('registering subsequent providers does not change default', () => {
    const first = makeProvider();
    const second = makeOpenAIProvider();
    registry.register(first);
    registry.register(second);
    expect(registry.getDefault()).toEqual(first);
  });

  it('can register multiple providers of the same type', () => {
    const primary = makeProvider({ id: 'anthropic-primary', name: 'Anthropic Primary' });
    const secondary = makeProvider({
      id: 'anthropic-secondary',
      name: 'Anthropic Secondary',
      credentials: { apiKey: 'sk-ant-different-key-XXXXXXXX' },
    });
    registry.register(primary);
    registry.register(secondary);
    expect(registry.count()).toBe(2);
    expect(registry.has('anthropic-primary')).toBe(true);
    expect(registry.has('anthropic-secondary')).toBe(true);
  });

  it('register() validates required fields are present', () => {
    expect(() => registry.register({ id: '', type: 'anthropic', name: '', credentials: {}, models: [], enabled: true })).toThrow();
  });

  it('unregister followed by re-register with same ID works', () => {
    const config = makeProvider();
    registry.register(config);
    registry.unregister(config.id);
    expect(() => registry.register(config)).not.toThrow();
    expect(registry.has(config.id)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DEFAULT PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

describe('Default Provider', () => {
  it('setDefault(id) sets the default provider', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.setDefault('test-openai-1');
    expect(registry.getDefault()?.id).toBe('test-openai-1');
  });

  it('setDefault() with non-existent ID throws', () => {
    expect(() => registry.setDefault('nonexistent')).toThrow();
  });

  it('setDefault() with non-existent ID throws descriptive error', () => {
    expect(() => registry.setDefault('ghost')).toThrow(/not found|not registered|does not exist/i);
  });

  it('getDefault() returns the default provider config', () => {
    const config = makeProvider({ isDefault: true });
    registry.register(config);
    const def = registry.getDefault();
    expect(def).toBeDefined();
    expect(def?.id).toBe(config.id);
  });

  it('getDefault() returns undefined when no providers registered', () => {
    expect(registry.getDefault()).toBeUndefined();
  });

  it('removing the default provider clears the default', () => {
    registry.register(makeProvider());
    registry.unregister('test-anthropic-1');
    expect(registry.getDefault()).toBeUndefined();
  });

  it('removing the default provider falls back to next available', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.unregister('test-anthropic-1');
    expect(registry.getDefault()?.id).toBe('test-openai-1');
  });

  it('registering with isDefault: true sets it as default regardless of order', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider({ isDefault: true }));
    expect(registry.getDefault()?.id).toBe('test-openai-1');
  });

  it('setDefault changes isDefault flag on configs', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.setDefault('test-openai-1');
    expect(registry.get('test-openai-1')?.isDefault).toBe(true);
    expect(registry.get('test-anthropic-1')?.isDefault).toBe(false);
  });

  it('only one provider can be default at a time', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.register(makeBedrockProvider());
    registry.setDefault('test-bedrock-1');
    const all = registry.getAll();
    const defaults = all.filter(p => p.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe('test-bedrock-1');
  });

  it('cannot set disabled provider as default', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.disable('test-openai-1');
    expect(() => registry.setDefault('test-openai-1')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PROVIDER QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Queries', () => {
  beforeEach(() => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.register(makeBedrockProvider());
    registry.register(makeOllamaProvider());
  });

  it('findByType("anthropic") returns all anthropic providers', () => {
    const results = registry.findByType('anthropic');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('anthropic');
  });

  it('findByType returns multiple providers of same type', () => {
    registry.register(makeProvider({ id: 'anthropic-2', name: 'Anthropic Backup' }));
    const results = registry.findByType('anthropic');
    expect(results).toHaveLength(2);
  });

  it('findByType returns empty array for type with no providers', () => {
    const results = registry.findByType('replicate');
    expect(results).toEqual([]);
  });

  it('findByModel("opus-4") returns providers that have that model', () => {
    const results = registry.findByModel('opus-4');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every(p => p.models.includes('opus-4'))).toBe(true);
  });

  it('findByModel returns empty array for model no one offers', () => {
    const results = registry.findByModel('nonexistent-model-99');
    expect(results).toEqual([]);
  });

  it('findByModel matches partial model names across providers', () => {
    const results = registry.findByModel('gpt-4o');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('test-openai-1');
  });

  it('findAvailable() returns only enabled providers', () => {
    registry.disable('test-ollama-1');
    const available = registry.findAvailable();
    expect(available.every(p => p.enabled)).toBe(true);
    expect(available.find(p => p.id === 'test-ollama-1')).toBeUndefined();
  });

  it('findAvailable() excludes unhealthy providers by default', () => {
    registry.healthCheck('test-openai-1', false);
    const available = registry.findAvailable();
    expect(available.find(p => p.id === 'test-openai-1')).toBeUndefined();
  });

  it('findAvailable({ includeUnhealthy: true }) includes unhealthy providers', () => {
    registry.healthCheck('test-openai-1', false);
    const available = registry.findAvailable({ includeUnhealthy: true });
    expect(available.find(p => p.id === 'test-openai-1')).toBeDefined();
  });

  it('findCheapest(model) returns provider with lowest cost for model', () => {
    // Set up cost data via status recording
    registry.recordRequest('test-anthropic-1', { tokens: 1000, latencyMs: 200, cost: 0.05 });
    registry.recordRequest('test-openai-1', { tokens: 1000, latencyMs: 150, cost: 0.02 });
    const cheapest = registry.findCheapest('gpt-4o');
    expect(cheapest).toBeDefined();
    expect(cheapest?.id).toBe('test-openai-1');
  });

  it('findFastest() returns provider with lowest latency', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 500, latencyMs: 300, cost: 0.01 });
    registry.recordRequest('test-openai-1', { tokens: 500, latencyMs: 100, cost: 0.01 });
    registry.recordRequest('test-bedrock-1', { tokens: 500, latencyMs: 200, cost: 0.01 });
    const fastest = registry.findFastest();
    expect(fastest).toBeDefined();
    expect(fastest?.id).toBe('test-openai-1');
  });

  it('findByCapability("streaming") returns providers supporting that feature', () => {
    const results = registry.findByCapability('streaming');
    expect(results.length).toBeGreaterThanOrEqual(1);
    // OpenAI, Bedrock, and Ollama all have streaming in metadata.capabilities
    const ids = results.map(p => p.id);
    expect(ids).toContain('test-openai-1');
  });

  it('findByCapability returns empty for unsupported capability', () => {
    const results = registry.findByCapability('quantum-computing');
    expect(results).toEqual([]);
  });

  it('getModels(providerId) returns available models for a provider', () => {
    const models = registry.getModels('test-anthropic-1');
    expect(models).toEqual(['opus-4', 'sonnet-4', 'haiku-3.5']);
  });

  it('getModels(providerId) returns empty array for non-existent provider', () => {
    const models = registry.getModels('nonexistent');
    expect(models).toEqual([]);
  });

  it('getAllModels() returns deduplicated list of all models across providers', () => {
    const allModels = registry.getAllModels();
    expect(allModels.length).toBeGreaterThan(0);
    // Should have no duplicates
    const unique = [...new Set(allModels)];
    expect(allModels).toEqual(unique);
  });

  it('getAllModels() includes models from all providers', () => {
    const allModels = registry.getAllModels();
    expect(allModels).toContain('opus-4');
    expect(allModels).toContain('gpt-4o');
    expect(allModels).toContain('llama3');
  });

  it('findIdle() returns providers under their rate limits', () => {
    const idle = registry.findIdle();
    // All providers should be idle initially (no requests made)
    expect(idle.length).toBe(4);
  });

  it('findForTask(requirements) returns best match based on requirements', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 1000, latencyMs: 150, cost: 0.03 });
    registry.recordRequest('test-openai-1', { tokens: 1000, latencyMs: 100, cost: 0.02 });
    const result = registry.findForTask({ model: 'gpt-4o', maxLatency: 200, maxCost: 0.05 });
    expect(result).toBeDefined();
    expect(result?.id).toBe('test-openai-1');
  });

  it('findForTask returns undefined if no provider meets requirements', () => {
    const result = registry.findForTask({ model: 'nonexistent-model', maxLatency: 10, maxCost: 0.001 });
    expect(result).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ENABLE / DISABLE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Enable / Disable', () => {
  beforeEach(() => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
  });

  it('enable(id) enables a previously disabled provider', () => {
    registry.disable('test-anthropic-1');
    registry.enable('test-anthropic-1');
    expect(registry.isEnabled('test-anthropic-1')).toBe(true);
  });

  it('disable(id) disables a provider without removing it', () => {
    registry.disable('test-anthropic-1');
    expect(registry.isEnabled('test-anthropic-1')).toBe(false);
    expect(registry.has('test-anthropic-1')).toBe(true);
  });

  it('disabled providers excluded from findAvailable()', () => {
    registry.disable('test-anthropic-1');
    const available = registry.findAvailable();
    expect(available.find(p => p.id === 'test-anthropic-1')).toBeUndefined();
  });

  it('disabled providers still returned by get(id)', () => {
    registry.disable('test-anthropic-1');
    const config = registry.get('test-anthropic-1');
    expect(config).toBeDefined();
    expect(config?.enabled).toBe(false);
  });

  it('isEnabled(id) returns true for enabled provider', () => {
    expect(registry.isEnabled('test-anthropic-1')).toBe(true);
  });

  it('isEnabled(id) returns false for disabled provider', () => {
    registry.disable('test-anthropic-1');
    expect(registry.isEnabled('test-anthropic-1')).toBe(false);
  });

  it('cannot set disabled provider as default', () => {
    registry.disable('test-openai-1');
    expect(() => registry.setDefault('test-openai-1')).toThrow();
  });

  it('disabling the current default provider clears default and falls back', () => {
    registry.setDefault('test-anthropic-1');
    registry.disable('test-anthropic-1');
    const def = registry.getDefault();
    expect(def?.id).not.toBe('test-anthropic-1');
  });

  it('enable/disable on non-existent provider throws', () => {
    expect(() => registry.enable('ghost')).toThrow();
    expect(() => registry.disable('ghost')).toThrow();
  });

  it('enabling an already-enabled provider is a no-op', () => {
    expect(() => registry.enable('test-anthropic-1')).not.toThrow();
    expect(registry.isEnabled('test-anthropic-1')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. STATUS TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Status Tracking', () => {
  beforeEach(() => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
  });

  it('getStatus(id) returns ProviderStatus object', () => {
    const status = registry.getStatus('test-anthropic-1');
    expect(status).toBeDefined();
    expect(status).toHaveProperty('id');
    expect(status).toHaveProperty('healthy');
    expect(status).toHaveProperty('lastCheck');
    expect(status).toHaveProperty('latencyMs');
    expect(status).toHaveProperty('errorCount');
    expect(status).toHaveProperty('requestCount');
    expect(status).toHaveProperty('tokenCount');
    expect(status).toHaveProperty('costAccumulated');
  });

  it('getStatus(id) returns initial zeroed status for new provider', () => {
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.requestCount).toBe(0);
    expect(status?.tokenCount).toBe(0);
    expect(status?.errorCount).toBe(0);
    expect(status?.costAccumulated).toBe(0);
  });

  it('recordRequest(id, { tokens, latencyMs, cost }) updates request count', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 500, latencyMs: 150, cost: 0.01 });
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.requestCount).toBe(1);
  });

  it('recordRequest updates token count', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 500, latencyMs: 150, cost: 0.01 });
    registry.recordRequest('test-anthropic-1', { tokens: 300, latencyMs: 100, cost: 0.005 });
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.tokenCount).toBe(800);
  });

  it('recordRequest updates cost accumulated', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 1000, latencyMs: 200, cost: 0.03 });
    registry.recordRequest('test-anthropic-1', { tokens: 500, latencyMs: 100, cost: 0.015 });
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.costAccumulated).toBeCloseTo(0.045);
  });

  it('recordRequest updates latency (uses latest or rolling average)', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 500, latencyMs: 200, cost: 0.01 });
    registry.recordRequest('test-anthropic-1', { tokens: 500, latencyMs: 100, cost: 0.01 });
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.latencyMs).toBeLessThanOrEqual(200);
    expect(status?.latencyMs).toBeGreaterThan(0);
  });

  it('recordError(id, error) increments error count', () => {
    registry.recordError('test-anthropic-1', new Error('Rate limited'));
    registry.recordError('test-anthropic-1', new Error('Timeout'));
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.errorCount).toBe(2);
  });

  it('resetStatus(id) clears all counters', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 1000, latencyMs: 200, cost: 0.05 });
    registry.recordError('test-anthropic-1', new Error('oops'));
    registry.resetStatus('test-anthropic-1');
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.requestCount).toBe(0);
    expect(status?.tokenCount).toBe(0);
    expect(status?.errorCount).toBe(0);
    expect(status?.costAccumulated).toBe(0);
  });

  it('healthCheck(id, true) marks provider as healthy', () => {
    registry.healthCheck('test-anthropic-1', true);
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.healthy).toBe(true);
  });

  it('healthCheck(id, false) marks provider as unhealthy', () => {
    registry.healthCheck('test-anthropic-1', false);
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.healthy).toBe(false);
  });

  it('healthCheck updates lastCheck timestamp', () => {
    const before = Date.now();
    registry.healthCheck('test-anthropic-1', true);
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.lastCheck).toBeGreaterThanOrEqual(before);
  });

  it('getHealthy() returns only healthy providers', () => {
    registry.healthCheck('test-anthropic-1', true);
    registry.healthCheck('test-openai-1', false);
    const healthy = registry.getHealthy();
    expect(healthy.find(p => p.id === 'test-anthropic-1')).toBeDefined();
    expect(healthy.find(p => p.id === 'test-openai-1')).toBeUndefined();
  });

  it('newly registered providers start as healthy', () => {
    const status = registry.getStatus('test-anthropic-1');
    expect(status?.healthy).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. RATE LIMIT ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Rate Limit Enforcement', () => {
  beforeEach(() => {
    registry.register(makeProvider({ rateLimit: { rpm: 3, tpm: 1000 } }));
    registry.register(makeOpenAIProvider({ rateLimit: { rpm: 5, tpm: 5000 } }));
  });

  it('isRateLimited(id) returns false when under limits', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    expect(registry.isRateLimited('test-anthropic-1')).toBe(false);
  });

  it('isRateLimited(id) returns true when at RPM limit', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    expect(registry.isRateLimited('test-anthropic-1')).toBe(true);
  });

  it('isRateLimited(id) returns true when at TPM limit', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 1000, latencyMs: 50, cost: 0.01 });
    expect(registry.isRateLimited('test-anthropic-1')).toBe(true);
  });

  it('getRemaining(id) returns remaining RPM and TPM capacity', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 200, latencyMs: 50, cost: 0.001 });
    const remaining = registry.getRemaining('test-anthropic-1');
    expect(remaining).toHaveProperty('rpm');
    expect(remaining).toHaveProperty('tpm');
    expect(remaining.rpm).toBe(2);
    expect(remaining.tpm).toBe(800);
  });

  it('getRemaining(id) returns full capacity when no requests made', () => {
    const remaining = registry.getRemaining('test-anthropic-1');
    expect(remaining.rpm).toBe(3);
    expect(remaining.tpm).toBe(1000);
  });

  it('waitTime(id) returns 0 when not rate limited', () => {
    expect(registry.waitTime('test-anthropic-1')).toBe(0);
  });

  it('waitTime(id) returns positive ms when rate limited', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    const wait = registry.waitTime('test-anthropic-1');
    expect(wait).toBeGreaterThan(0);
  });

  it('rate limits reset after the window passes', () => {
    vi.useFakeTimers();
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    expect(registry.isRateLimited('test-anthropic-1')).toBe(true);
    // Advance past the 1-minute window
    vi.advanceTimersByTime(61_000);
    expect(registry.isRateLimited('test-anthropic-1')).toBe(false);
    vi.useRealTimers();
  });

  it('providers at rate limit excluded from findIdle()', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    const idle = registry.findIdle();
    expect(idle.find(p => p.id === 'test-anthropic-1')).toBeUndefined();
    expect(idle.find(p => p.id === 'test-openai-1')).toBeDefined();
  });

  it('providers without rateLimit config are never rate limited', () => {
    registry.register(makeOllamaProvider()); // no rateLimit set
    registry.recordRequest('test-ollama-1', { tokens: 999999, latencyMs: 50, cost: 0 });
    expect(registry.isRateLimited('test-ollama-1')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Serialization', () => {
  beforeEach(() => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.register(makeBedrockProvider());
  });

  it('toJSON() returns a serializable object', () => {
    const json = registry.toJSON();
    expect(json).toBeDefined();
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  it('toJSON() masks API keys (shows last 4 chars)', () => {
    const json = registry.toJSON();
    const serialized = JSON.stringify(json);
    // Original key should not appear in full
    expect(serialized).not.toContain('sk-ant-api03-XXXXXXXXXXXXXXXXXXXX-YYYYYYYY');
    // Should contain masked version with last 4 chars
    expect(serialized).toContain('YYYY');
  });

  it('toJSON() masks all credential types', () => {
    const json = registry.toJSON();
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain('sk-proj-XXXXXXXXXXXXXXXXXX-ZZZZZZZZ');
  });

  it('fromJSON(data) static method restores registry', () => {
    const json = registry.toJSON();
    // fromJSON won't have full credentials since they're masked,
    // but the structure should be restorable
    const restored = ProviderRegistry.fromJSON(json);
    expect(restored.count()).toBe(3);
  });

  it('export() includes full unmasked credentials', () => {
    const exported = registry.export();
    const serialized = JSON.stringify(exported);
    expect(serialized).toContain('sk-ant-api03-XXXXXXXXXXXXXXXXXXXX-YYYYYYYY');
    expect(serialized).toContain('sk-proj-XXXXXXXXXXXXXXXXXX-ZZZZZZZZ');
  });

  it('import(configs) bulk registers multiple providers', () => {
    const freshRegistry = new ProviderRegistry();
    const configs = [makeProvider(), makeOpenAIProvider(), makeOllamaProvider()];
    freshRegistry.import(configs);
    expect(freshRegistry.count()).toBe(3);
  });

  it('import(configs) skips duplicates and reports them', () => {
    // Registry already has test-anthropic-1
    const configs = [makeProvider(), makeOllamaProvider()];
    const result = registry.import(configs);
    // Should have imported only ollama (anthropic was duplicate)
    expect(registry.has('test-ollama-1')).toBe(true);
    expect(result.skipped).toContain('test-anthropic-1');
  });

  it('round-trip export/import preserves all data', () => {
    registry.setDefault('test-openai-1');
    const exported = registry.export();
    const freshRegistry = new ProviderRegistry();
    freshRegistry.import(exported);
    expect(freshRegistry.count()).toBe(3);
    expect(freshRegistry.getDefault()?.id).toBe('test-openai-1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Events', () => {
  it('emits "provider:registered" on register', () => {
    const handler = vi.fn();
    registry.on('provider:registered', handler);
    registry.register(makeProvider());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-anthropic-1' }));
  });

  it('emits "provider:unregistered" on unregister', () => {
    registry.register(makeProvider());
    const handler = vi.fn();
    registry.on('provider:unregistered', handler);
    registry.unregister('test-anthropic-1');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-anthropic-1' }));
  });

  it('emits "provider:default-changed" on setDefault', () => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    const handler = vi.fn();
    registry.on('provider:default-changed', handler);
    registry.setDefault('test-openai-1');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-openai-1' }));
  });

  it('emits "provider:enabled" when enabling a provider', () => {
    registry.register(makeProvider());
    registry.disable('test-anthropic-1');
    const handler = vi.fn();
    registry.on('provider:enabled', handler);
    registry.enable('test-anthropic-1');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-anthropic-1' }));
  });

  it('emits "provider:disabled" when disabling a provider', () => {
    registry.register(makeProvider());
    const handler = vi.fn();
    registry.on('provider:disabled', handler);
    registry.disable('test-anthropic-1');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-anthropic-1' }));
  });

  it('emits "provider:error" on recordError', () => {
    registry.register(makeProvider());
    const handler = vi.fn();
    registry.on('provider:error', handler);
    const error = new Error('Connection refused');
    registry.recordError('test-anthropic-1', error);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      id: 'test-anthropic-1',
      error,
    }));
  });

  it('emits "provider:rate-limited" when hitting rate limit', () => {
    registry.register(makeProvider({ rateLimit: { rpm: 2, tpm: 10000 } }));
    const handler = vi.fn();
    registry.on('provider:rate-limited', handler);
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    registry.recordRequest('test-anthropic-1', { tokens: 100, latencyMs: 50, cost: 0.001 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-anthropic-1' }));
  });

  it('emits "provider:healthy" when health check passes', () => {
    registry.register(makeProvider());
    registry.healthCheck('test-anthropic-1', false); // make unhealthy first
    const handler = vi.fn();
    registry.on('provider:healthy', handler);
    registry.healthCheck('test-anthropic-1', true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-anthropic-1' }));
  });

  it('emits "provider:unhealthy" when health check fails', () => {
    registry.register(makeProvider());
    const handler = vi.fn();
    registry.on('provider:unhealthy', handler);
    registry.healthCheck('test-anthropic-1', false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-anthropic-1' }));
  });

  it('on(event, handler) subscribes to events', () => {
    const handler = vi.fn();
    registry.on('provider:registered', handler);
    registry.register(makeProvider());
    expect(handler).toHaveBeenCalled();
  });

  it('off(event, handler) unsubscribes from events', () => {
    const handler = vi.fn();
    registry.on('provider:registered', handler);
    registry.off('provider:registered', handler);
    registry.register(makeProvider());
    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple handlers can subscribe to same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    registry.on('provider:registered', handler1);
    registry.on('provider:registered', handler2);
    registry.register(makeProvider());
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('off only removes the specified handler', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    registry.on('provider:registered', handler1);
    registry.on('provider:registered', handler2);
    registry.off('provider:registered', handler1);
    registry.register(makeProvider());
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. AGENT ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Agent Assignment', () => {
  beforeEach(() => {
    registry.register(makeProvider());
    registry.register(makeOpenAIProvider());
    registry.register(makeBedrockProvider());
  });

  it('assignToAgent(agentId, providerId) maps agent to provider', () => {
    registry.assignToAgent('agent-alpha', 'test-anthropic-1');
    expect(registry.getAgentProvider('agent-alpha')).toBeDefined();
  });

  it('getAgentProvider(agentId) returns assigned provider config', () => {
    registry.assignToAgent('agent-alpha', 'test-openai-1');
    const provider = registry.getAgentProvider('agent-alpha');
    expect(provider?.id).toBe('test-openai-1');
  });

  it('getAgentProvider() returns default if no assignment exists', () => {
    registry.setDefault('test-bedrock-1');
    const provider = registry.getAgentProvider('unassigned-agent');
    expect(provider?.id).toBe('test-bedrock-1');
  });

  it('getAgentProvider() returns undefined if no assignment and no default', () => {
    const freshRegistry = new ProviderRegistry();
    expect(freshRegistry.getAgentProvider('any-agent')).toBeUndefined();
  });

  it('unassignAgent(agentId) removes the agent mapping', () => {
    registry.assignToAgent('agent-alpha', 'test-anthropic-1');
    registry.unassignAgent('agent-alpha');
    // Should now fall back to default
    const provider = registry.getAgentProvider('agent-alpha');
    expect(provider?.id).toBe(registry.getDefault()?.id);
  });

  it('getAgentsByProvider(providerId) returns agents using that provider', () => {
    registry.assignToAgent('agent-alpha', 'test-anthropic-1');
    registry.assignToAgent('agent-beta', 'test-anthropic-1');
    registry.assignToAgent('agent-gamma', 'test-openai-1');
    const agents = registry.getAgentsByProvider('test-anthropic-1');
    expect(agents).toContain('agent-alpha');
    expect(agents).toContain('agent-beta');
    expect(agents).not.toContain('agent-gamma');
  });

  it('getAgentsByProvider returns empty array for provider with no agents', () => {
    const agents = registry.getAgentsByProvider('test-bedrock-1');
    expect(agents).toEqual([]);
  });

  it('removing a provider clears its agent assignments', () => {
    registry.assignToAgent('agent-alpha', 'test-openai-1');
    registry.assignToAgent('agent-beta', 'test-openai-1');
    registry.unregister('test-openai-1');
    const agents = registry.getAgentsByProvider('test-openai-1');
    expect(agents).toEqual([]);
    // Agents now fall back to default
    const provider = registry.getAgentProvider('agent-alpha');
    expect(provider?.id).not.toBe('test-openai-1');
  });

  it('assignToAgent with non-existent provider throws', () => {
    expect(() => registry.assignToAgent('agent-alpha', 'nonexistent')).toThrow();
  });

  it('assignToAgent overwrites existing assignment', () => {
    registry.assignToAgent('agent-alpha', 'test-anthropic-1');
    registry.assignToAgent('agent-alpha', 'test-openai-1');
    expect(registry.getAgentProvider('agent-alpha')?.id).toBe('test-openai-1');
  });

  it('suggestForAgent(agentId, requirements) returns best provider', () => {
    registry.recordRequest('test-anthropic-1', { tokens: 1000, latencyMs: 200, cost: 0.03 });
    registry.recordRequest('test-openai-1', { tokens: 1000, latencyMs: 100, cost: 0.02 });
    registry.recordRequest('test-bedrock-1', { tokens: 1000, latencyMs: 150, cost: 0.01 });
    const suggestion = registry.suggestForAgent('agent-alpha', { model: 'anthropic.claude-opus-4', maxLatency: 300, maxCost: 0.05 });
    expect(suggestion).toBeDefined();
    expect(suggestion?.id).toBe('test-bedrock-1');
  });

  it('suggestForAgent returns undefined when no provider satisfies requirements', () => {
    const suggestion = registry.suggestForAgent('agent-alpha', { model: 'impossible-model', maxLatency: 1, maxCost: 0.0001 });
    expect(suggestion).toBeUndefined();
  });
});
