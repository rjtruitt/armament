/**
 * UserConfig — Tests for model resolution, provider defaults, config persistence,
 * and the remove/rebuild flow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserConfig } from '../config/UserConfig.js';

// Mock fs to prevent actual disk writes during tests
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  let store: Record<string, string> = {};
  return {
    ...actual,
    existsSync: (path: string) => path in store,
    readFileSync: (path: string) => {
      if (path in store) return store[path];
      throw new Error('ENOENT');
    },
    writeFileSync: (path: string, content: string) => { store[path] = content; },
    mkdirSync: () => {},
    __resetStore: () => { store = {}; },
    __getStore: () => store,
  };
});

function resetUserConfig() {
  // Force singleton reset for test isolation
  (UserConfig as any)._instance = null;
}

describe('UserConfig — Model Resolution', () => {
  beforeEach(() => {
    resetUserConfig();
  });

  it('resolveModel returns provider+model when both specified', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'bedrock', models: ['sonnet-4', 'opus-4'], defaultModel: 'sonnet-4', region: 'us-west-2' },
    ]);
    const result = config.resolveModel({ provider: 'bedrock', model: 'opus-4' });
    expect(result).toEqual({ provider: 'bedrock', model: 'opus-4' });
  });

  it('resolveModel uses provider defaultModel when only provider given', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'bedrock', models: ['sonnet-4', 'opus-4'], defaultModel: 'sonnet-4', region: 'us-west-2' },
    ]);
    const result = config.resolveModel({ provider: 'bedrock' });
    expect(result).toEqual({ provider: 'bedrock', model: 'sonnet-4' });
  });

  it('resolveModel falls back to first model if no provider defaultModel', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'anthropic', models: ['haiku', 'sonnet'] },
    ]);
    const result = config.resolveModel({ provider: 'anthropic' });
    expect(result).toEqual({ provider: 'anthropic', model: 'haiku' });
  });

  it('resolveModel finds provider by model name when only model given', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'bedrock', models: ['sonnet-4'], region: 'us-west-2' },
      { type: 'anthropic', models: ['opus-4'] },
    ]);
    const result = config.resolveModel({ model: 'opus-4' });
    expect(result).toEqual({ provider: 'anthropic', model: 'opus-4' });
  });

  it('resolveModel uses session defaults when nothing specified', () => {
    const config = UserConfig.instance();
    config.set('defaultProvider', 'bedrock');
    config.set('defaultModel', 'sonnet-4');
    config.set('providers', [
      { type: 'bedrock', models: ['sonnet-4', 'opus-4'], region: 'us-west-2' },
    ]);
    const result = config.resolveModel();
    expect(result).toEqual({ provider: 'bedrock', model: 'sonnet-4' });
  });

  it('resolveModel returns null when no providers configured', () => {
    const config = UserConfig.instance();
    config.set('providers', []);
    config.set('defaultProvider', undefined);
    config.set('defaultModel', undefined);
    const result = config.resolveModel();
    expect(result).toBeNull();
  });

  it('getProviderDefaultModel returns defaultModel from provider config', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'bedrock', models: ['a', 'b', 'c'], defaultModel: 'b' },
    ]);
    expect(config.getProviderDefaultModel('bedrock')).toBe('b');
  });

  it('getProviderDefaultModel returns first model if no defaultModel set', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'openai', models: ['gpt-4', 'gpt-3.5'] },
    ]);
    expect(config.getProviderDefaultModel('openai')).toBe('gpt-4');
  });
});

describe('UserConfig — Provider Defaults', () => {
  beforeEach(() => {
    resetUserConfig();
  });

  it('getProviderDefaultModel returns defaultModel from provider config', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'bedrock', models: ['a', 'b', 'c'], defaultModel: 'b' },
    ]);
    expect(config.getProviderDefaultModel('bedrock')).toBe('b');
  });

  it('getProviderDefaultModel returns first model if no defaultModel set', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'openai', models: ['gpt-4', 'gpt-3.5'] },
    ]);
    expect(config.getProviderDefaultModel('openai')).toBe('gpt-4');
  });
});
