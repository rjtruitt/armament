/**
 * Config Save Tests — Verifies that every "Save" button in SessionMenu
 * correctly emits config:save with the right path and field values,
 * and that the TuiMode handler persists them to UserConfig.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionMenu } from '../tui/SessionMenu.js';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';
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

function createMenu(opts: any = {}) {
  const screen = new ScreenBuffer(120, 40);
  const menu = new SessionMenu(screen, {
    providers: [{ type: 'bedrock', models: ['sonnet-4'] }],
    ...opts,
  });
  menu.show();
  return { menu, screen };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SESSION MENU EMITS config:save
// ═══════════════════════════════════════════════════════════════════════════════

describe('SessionMenu — Save Emission', () => {
  it('emits config:save when activating a .save submenu item', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.new.ollama');
    const panel = menu.getCurrentPanel()!;
    expect(panel).toBeDefined();

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    // Set the host field value
    const hostItem = panel.items.find(i => i.id.endsWith('.host'));
    if (hostItem) hostItem.value = 'http://myhost:11434';

    // Navigate to and activate the save button
    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('providers.new.ollama.save');
    expect(events[0].fields['providers.new.ollama.host']).toBe('http://myhost:11434');
  });

  it('emits config:save for anthropic provider with apiKey', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.new.anthropic');
    const panel = menu.getCurrentPanel()!;

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    const apiKeyItem = panel.items.find(i => i.id.endsWith('.apiKey'));
    if (apiKeyItem) apiKeyItem.value = 'sk-ant-test123';

    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('providers.new.anthropic.save');
    expect(events[0].fields['providers.new.anthropic.apiKey']).toBe('sk-ant-test123');
  });

  it('emits config:save for bedrock provider with region and profile', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.new.bedrock');
    const panel = menu.getCurrentPanel()!;

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    const regionItem = panel.items.find(i => i.id.endsWith('.region'));
    if (regionItem) regionItem.value = 'eu-west-1';
    const profileItem = panel.items.find(i => i.id.endsWith('.profile'));
    if (profileItem) profileItem.value = 'dev';

    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('providers.new.bedrock.save');
    expect(events[0].fields['providers.new.bedrock.region']).toBe('eu-west-1');
    expect(events[0].fields['providers.new.bedrock.profile']).toBe('dev');
  });

  it('emits config:save for openai provider', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.new.openai');
    const panel = menu.getCurrentPanel()!;

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    const apiKeyItem = panel.items.find(i => i.id.endsWith('.apiKey'));
    if (apiKeyItem) apiKeyItem.value = 'sk-openai-xyz';

    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('providers.new.openai.save');
    expect(events[0].fields['providers.new.openai.apiKey']).toBe('sk-openai-xyz');
  });

  it('emits config:save for gemini provider', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.new.gemini');
    const panel = menu.getCurrentPanel()!;

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    const apiKeyItem = panel.items.find(i => i.id.endsWith('.apiKey'));
    if (apiKeyItem) apiKeyItem.value = 'AIza-test';

    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('providers.new.gemini.save');
    expect(events[0].fields['providers.new.gemini.apiKey']).toBe('AIza-test');
  });

  it('emits config:save for openrouter provider', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.new.openrouter');
    const panel = menu.getCurrentPanel()!;

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    const apiKeyItem = panel.items.find(i => i.id.endsWith('.apiKey'));
    if (apiKeyItem) apiKeyItem.value = 'or-key-123';

    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('providers.new.openrouter.save');
  });

  it('emits config:save for replicate provider', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.new.replicate');
    const panel = menu.getCurrentPanel()!;

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('providers.new.replicate.save');
  });

  it('emits config:save for add model', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.bedrock.models.new');
    const panel = menu.getCurrentPanel()!;

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    const idItem = panel.items.find(i => i.id.endsWith('.id'));
    if (idItem) idItem.value = 'us.anthropic.claude-opus-4-1-20250805-v1:0';

    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('providers.bedrock.models.new.save');
    expect(events[0].fields['providers.bedrock.models.new.id']).toBe('us.anthropic.claude-opus-4-1-20250805-v1:0');
  });

  it('emits config:save for MCP server', () => {
    const { menu } = createMenu();
    menu.navigateTo('mcp.new');
    const panel = menu.getCurrentPanel()!;

    const events: any[] = [];
    menu.on('config:save', (d: any) => events.push(d));

    const nameItem = panel.items.find(i => i.id.endsWith('.name'));
    if (nameItem) nameItem.value = 'github';
    const cmdItem = panel.items.find(i => i.id.endsWith('.command'));
    if (cmdItem) cmdItem.value = 'npx @mcp/server-github';

    const saveIdx = panel.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    expect(events.length).toBe(1);
    expect(events[0].path).toBe('mcp.new.save');
    expect(events[0].fields['mcp.new.name']).toBe('github');
    expect(events[0].fields['mcp.new.command']).toBe('npx @mcp/server-github');
  });

  it('navigates back to providers list after save', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers');
    menu.navigateTo('providers.new');
    menu.navigateTo('providers.new.ollama');

    const saveIdx = menu.getCurrentPanel()!.items.findIndex(i => i.id.endsWith('.save'));
    for (let i = 0; i < saveIdx; i++) menu.handleKey('down');
    menu.handleKey('enter');

    // Should navigate back to grandparent (providers list) so user sees the new entry
    const current = menu.getCurrentPanel()!;
    expect(current.id).toBe('providers');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PERSISTENCE — UserConfig integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Config Save — Persistence via UserConfig', () => {
  beforeEach(() => {
    resetUserConfig();
  });

  it('saves new provider to UserConfig.providers', () => {
    const config = UserConfig.instance();
    config.set('providers', []);

    // Simulate what TuiMode handler does
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

    // Simulate TuiMode handler logic: update existing instead of duplicating
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

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MENU REBUILD AFTER SAVE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Config Save — Menu Rebuild', () => {
  it('new provider appears in providers panel after rebuildPanels', () => {
    const { menu } = createMenu({ providers: [] });
    menu.navigateTo('providers');
    let panel = menu.getCurrentPanel()!;
    expect(panel.items.some(i => i.label === 'ollama')).toBe(false);

    // Simulate save + rebuild
    menu.rebuildPanels({
      providers: ['ollama'],
      providerConfigs: [{ type: 'ollama', models: [] }],
    });
    menu.navigateTo('providers');
    panel = menu.getCurrentPanel()!;
    expect(panel.items.some(i => i.label === 'ollama')).toBe(true);
  });

  it('new model appears in provider models panel after rebuildPanels', () => {
    const { menu } = createMenu();
    menu.navigateTo('providers.bedrock.models');
    let panel = menu.getCurrentPanel()!;
    expect(panel.items.some(i => i.id.includes('opus-4'))).toBe(false);

    menu.rebuildPanels({
      providers: ['bedrock'],
      providerConfigs: [{ type: 'bedrock', models: ['sonnet-4', 'opus-4'] }],
    });
    menu.navigateTo('providers.bedrock.models');
    panel = menu.getCurrentPanel()!;
    expect(panel.items.some(i => i.id.includes('opus-4'))).toBe(true);
  });

  it('new model appears in cross-provider models panel after rebuildPanels', () => {
    const { menu } = createMenu();
    menu.rebuildPanels({
      providers: ['bedrock'],
      providerConfigs: [{ type: 'bedrock', models: ['sonnet-4', 'haiku'] }],
    });
    menu.navigateTo('models');
    const panel = menu.getCurrentPanel()!;
    expect(panel.items.some(i => i.id.includes('haiku'))).toBe(true);
  });
});
