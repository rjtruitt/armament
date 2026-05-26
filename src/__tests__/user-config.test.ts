/**
 * UserConfig — Tests for model resolution, provider defaults, config persistence,
 * and the remove/rebuild flow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserConfig } from '../config/UserConfig.js';
import { SessionMenu } from '../tui/SessionMenu.js';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';

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

describe('SessionMenu — Remove & Rebuild', () => {
  function createMenu(opts = {}) {
    const screen = new ScreenBuffer(120, 40);
    const menu = new SessionMenu(screen, {
      providers: [{ type: 'bedrock', models: ['sonnet-4', 'opus-4'] }],
      ...opts,
    });
    menu.show();
    return { menu, screen };
  }

  it('rebuildPanels removes deleted provider from panels', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers');
    let panel = menu.getCurrentPanel()!;
    const hasBedrock = panel.items.some(i => i.label === 'bedrock');
    expect(hasBedrock).toBe(true);

    // Simulate provider removal + rebuild
    menu.rebuildPanels({
      providers: [],
      providerConfigs: [],
    });
    menu.navigateTo('providers');
    panel = menu.getCurrentPanel()!;
    const stillHasBedrock = panel.items.some(i => i.label === 'bedrock');
    expect(stillHasBedrock).toBe(false);
  });

  it('rebuildPanels removes deleted model from provider models panel', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.bedrock.models');
    let panel = menu.getCurrentPanel()!;
    expect(panel.items.some(i => i.id.includes('opus-4'))).toBe(true);

    // Remove opus-4 from models
    menu.rebuildPanels({
      providers: ['bedrock'],
      providerConfigs: [{ type: 'bedrock', models: ['sonnet-4'] }],
    });
    menu.navigateTo('providers.bedrock.models');
    panel = menu.getCurrentPanel()!;
    expect(panel.items.some(i => i.id.includes('opus-4'))).toBe(false);
    expect(panel.items.some(i => i.id.includes('sonnet-4'))).toBe(true);
  });

  it('rebuildPanels clamps selection index if it exceeds new panel length', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers');
    // Move to last item
    for (let i = 0; i < 10; i++) menu.handleKey('down');

    // Should not crash when panels shrink
    expect(() => {
      menu.rebuildPanels({ providers: [], providerConfigs: [] });
    }).not.toThrow();
    const panel = menu.getCurrentPanel()!;
    expect(panel).toBeDefined();
  });
});

describe('SessionMenu — Budget Toggle', () => {
  function createMenu() {
    const screen = new ScreenBuffer(120, 40);
    const menu = new SessionMenu(screen, { budget: '$5.00' });
    menu.show();
    return { menu, screen };
  }

  it('session.budget panel has enabled toggle and amount text field', () => {
    const { menu } = createMenu();
    menu.navigateTo('session.budget');
    const panel = menu.getCurrentPanel()!;
    expect(panel).toBeDefined();
    expect(panel.items.length).toBe(2);
    expect(panel.items[0].type).toBe('toggle');
    expect(panel.items[0].id).toBe('session.budget.enabled');
    expect(panel.items[1].type).toBe('text');
    expect(panel.items[1].id).toBe('session.budget.amount');
  });

  it('budget toggle emits config:change with path session.budget.enabled', () => {
    const { menu } = createMenu();
    menu.navigateTo('session.budget');
    const events: any[] = [];
    menu.on('config:change', (d: any) => events.push(d));
    menu.handleKey('enter'); // toggle (first item is selected)
    expect(events.length).toBe(1);
    expect(events[0].path).toBe('session.budget.enabled');
    expect(events[0].value).toBe(false); // toggled from true to false
  });
});

describe('SessionMenu — Session Default Model', () => {
  function createMenu() {
    const screen = new ScreenBuffer(120, 40);
    const menu = new SessionMenu(screen, {
      providers: [{ type: 'bedrock', models: ['sonnet-4', 'haiku', 'opus-4'] }],
      model: 'sonnet-4',
    });
    menu.show();
    return { menu, screen };
  }

  it('models panel has session default choice item', () => {
    const { menu } = createMenu();
    menu.navigateTo('models');
    const panel = menu.getCurrentPanel()!;
    const defaultItem = panel.items.find(i => i.id === 'models.default');
    expect(defaultItem).toBeDefined();
    expect(defaultItem!.type).toBe('choice');
    expect(defaultItem!.value).toBe('sonnet-4');
    expect(defaultItem!.choices!.length).toBe(3);
  });

  it('cycling session default emits config:change with models.default path', () => {
    const { menu } = createMenu();
    menu.navigateTo('models');
    const events: any[] = [];
    menu.on('config:change', (d: any) => events.push(d));
    // First item should be models.default, right arrow enters choice edit mode
    menu.handleKey('right'); // enter choice edit mode
    menu.handleKey('right'); // cycle to next
    menu.handleKey('enter'); // confirm
    expect(events.length).toBe(1);
    expect(events[0].path).toBe('models.default');
    expect(events[0].value).toBe('haiku'); // next after sonnet-4
  });

  it('provider settings has defaultModel choice', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.bedrock.settings');
    const panel = menu.getCurrentPanel()!;
    const defaultItem = panel.items.find(i => i.id.endsWith('.defaultModel'));
    expect(defaultItem).toBeDefined();
    expect(defaultItem!.type).toBe('choice');
    expect(defaultItem!.choices!.length).toBe(3);
  });
});
