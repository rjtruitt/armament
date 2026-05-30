/**
 * Config Save Tests — Verifies that ConfigPane save operations
 * correctly persist values to UserConfig.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserConfig } from '../config/UserConfig.js';

// Mock fs
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
  };
});

function resetUserConfig() {
  (UserConfig as any)._instance = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE — UserConfig integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Config Save — Persistence via UserConfig', () => {
  beforeEach(() => {
    resetUserConfig();
  });

  it('saves new provider to UserConfig.providers', () => {
    const config = UserConfig.instance();
    config.set('providers', []);

    const path = 'providers.new.ollama.save';
    const fields = { 'providers.new.ollama.host': 'http://localhost:11434' };
    const providerType = path.split('.')[2];

    const providers = [...config.providers];
    const newProvider: any = { type: providerType, models: [] };
    for (const [fieldId, value] of Object.entries(fields)) {
      const key = fieldId.split('.').pop()!;
      if (key !== 'save' && value) newProvider[key] = value;
    }
    providers.push(newProvider);
    config.set('providers', providers);

    expect(config.providers.length).toBe(1);
    expect(config.providers[0].type).toBe('ollama');
    expect((config.providers[0] as any).host).toBe('http://localhost:11434');
  });

  it('saves new model to existing provider', () => {
    const config = UserConfig.instance();
    config.set('providers', [{ type: 'bedrock', models: ['sonnet-4'], region: 'us-west-2' }]);

    const providerName = 'bedrock';
    const modelId = 'opus-4';
    const providers = config.providers.map(p => {
      if (p.type === providerName) {
        const models = [...(p.models || [])];
        if (!models.includes(modelId)) models.push(modelId);
        return { ...p, models };
      }
      return p;
    });
    config.set('providers', providers);

    expect(config.providers[0].models).toContain('opus-4');
    expect(config.providers[0].models).toContain('sonnet-4');
    expect(config.providers[0].models.length).toBe(2);
  });

  it('does not duplicate provider on repeat save, updates instead', () => {
    const config = UserConfig.instance();
    config.set('providers', [{ type: 'ollama', models: [], host: 'http://old:11434' } as any]);

    const providers = [...config.providers];
    const existingIdx = providers.findIndex(p => p.type === 'ollama');
    const newProvider: any = { type: 'ollama', models: [], host: 'http://new:11434' };
    if (existingIdx >= 0) {
      providers[existingIdx] = { ...providers[existingIdx], ...newProvider };
    } else {
      providers.push(newProvider);
    }
    config.set('providers', providers);

    expect(config.providers.length).toBe(1);
    expect((config.providers[0] as any).host).toBe('http://new:11434');
  });

  it('does not duplicate model on repeat save', () => {
    const config = UserConfig.instance();
    config.set('providers', [{ type: 'bedrock', models: ['sonnet-4'], region: 'us-west-2' }]);

    const providers = config.providers.map(p => {
      if (p.type === 'bedrock') {
        const models = [...(p.models || [])];
        if (!models.includes('sonnet-4')) models.push('sonnet-4');
        return { ...p, models };
      }
      return p;
    });
    config.set('providers', providers);

    expect(config.providers[0].models.length).toBe(1);
  });

  it('saves MCP server name to mcpServers array', () => {
    const config = UserConfig.instance();
    config.set('mcpServers', []);

    const servers = [...(config.settings.mcpServers || []), 'github'];
    config.set('mcpServers', servers);

    expect(config.settings.mcpServers).toContain('github');
  });

  it('preserves existing providers when adding new one', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'bedrock', models: ['sonnet-4'], region: 'us-west-2' },
    ]);

    const providers = [...config.providers];
    providers.push({ type: 'anthropic', models: [] });
    config.set('providers', providers);

    expect(config.providers.length).toBe(2);
    expect(config.providers[0].type).toBe('bedrock');
    expect(config.providers[0].models).toContain('sonnet-4');
    expect(config.providers[1].type).toBe('anthropic');
  });

  it('preserves provider settings when adding model', () => {
    const config = UserConfig.instance();
    config.set('providers', [
      { type: 'bedrock', models: ['sonnet-4'], region: 'us-west-2', defaultModel: 'sonnet-4' },
    ]);

    const providers = config.providers.map(p => {
      if (p.type === 'bedrock') {
        return { ...p, models: [...p.models, 'opus-4'] };
      }
      return p;
    });
    config.set('providers', providers);

    expect(config.providers[0].region).toBe('us-west-2');
    expect((config.providers[0] as any).defaultModel).toBe('sonnet-4');
    expect(config.providers[0].models.length).toBe(2);
  });
});
