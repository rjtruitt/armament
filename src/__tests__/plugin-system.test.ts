import { describe, it, expect, beforeEach } from 'vitest';
import { createServiceRegistry, createExtensionPoint, createPluginSystem } from '../core/PluginRegistry';

describe('Service Registry', () => {
  let registry: ReturnType<typeof createServiceRegistry>;

  beforeEach(() => {
    registry = createServiceRegistry();
  });

  describe('Registration', () => {
    it('should register a service by name', () => {
      registry.register('renderer', { renderBox: () => [] });
      expect(registry.has('renderer')).toBe(true);
    });

    it('should unregister a service', () => {
      registry.register('renderer', {});
      registry.unregister('renderer');
      expect(registry.has('renderer')).toBe(false);
    });

    it('should retrieve a registered service', () => {
      const svc = { id: 'test' };
      registry.register('myService', svc);
      expect(registry.get('myService')).toBe(svc);
    });

    it('should return undefined for unregistered service', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should throw on require when service missing', () => {
      expect(() => registry.require('missing')).toThrow();
    });

    it('should list all registered services', () => {
      registry.register('a', {});
      registry.register('b', {});
      registry.register('c', {});
      expect(registry.list()).toContain('a');
      expect(registry.list()).toContain('b');
      expect(registry.list()).toContain('c');
    });

    it('should overwrite existing service on re-register', () => {
      registry.register('svc', { v: 1 });
      registry.register('svc', { v: 2 });
      expect((registry.get('svc') as any).v).toBe(2);
    });

    it('should notify on service registration', () => {
      let notified: any = null;
      registry.onRegistered('late', (svc) => { notified = svc; });
      registry.register('late', { hello: true });
      expect(notified).not.toBeNull();
      expect(notified.hello).toBe(true);
    });

    it('should return unsubscribe from onRegistered', () => {
      const unsub = registry.onRegistered('x', () => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should fire immediately if service already registered', () => {
      registry.register('early', { val: 42 });
      let fired = false;
      registry.onRegistered('early', () => { fired = true; });
      expect(fired).toBe(true);
    });
  });
});

describe('Extension Point', () => {
  let ep: ReturnType<typeof createExtensionPoint<{ id: string; name: string }>>;

  beforeEach(() => {
    ep = createExtensionPoint<{ id: string; name: string }>('test-ep');
  });

  describe('Contributions', () => {
    it('should register a contribution', () => {
      ep.register({ id: 'c1', name: 'First' });
      expect(ep.getAll().length).toBe(1);
    });

    it('should retrieve contribution by id', () => {
      ep.register({ id: 'c1', name: 'First' });
      expect(ep.getById('c1')).toBeDefined();
      expect(ep.getById('c1')!.name).toBe('First');
    });

    it('should return undefined for missing contribution', () => {
      expect(ep.getById('nope')).toBeUndefined();
    });

    it('should unregister via returned function', () => {
      const unsub = ep.register({ id: 'temp', name: 'Temp' });
      unsub();
      expect(ep.getById('temp')).toBeUndefined();
    });

    it('should list all contributions', () => {
      ep.register({ id: 'a', name: 'A' });
      ep.register({ id: 'b', name: 'B' });
      ep.register({ id: 'c', name: 'C' });
      expect(ep.getAll().length).toBe(3);
    });

    it('should notify on change', () => {
      let received: any[] = [];
      ep.onChange((contribs) => { received = contribs; });
      ep.register({ id: 'new', name: 'New' });
      expect(received.length).toBe(1);
    });

    it('should return unsubscribe from onChange', () => {
      const unsub = ep.onChange(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should notify on removal too', () => {
      let count = 0;
      ep.onChange(() => { count++; });
      const unsub = ep.register({ id: 'x', name: 'X' });
      unsub();
      expect(count).toBe(2);
    });
  });
});

describe('Plugin System', () => {
  let system: ReturnType<typeof createPluginSystem>;

  beforeEach(() => {
    system = createPluginSystem();
  });

  describe('Plugin lifecycle', () => {
    it('should install a plugin', async () => {
      await system.install({
        manifest: { id: 'test-plugin', name: 'Test', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(system.getPlugin('test-plugin')).toBeDefined();
    });

    it('should activate plugin on install', async () => {
      let activated = false;
      await system.install({
        manifest: { id: 'p1', name: 'P1', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => { activated = true; },
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(activated).toBe(true);
      expect(system.getState('p1')).toBe('active');
    });

    it('should uninstall a plugin', async () => {
      await system.install({
        manifest: { id: 'p2', name: 'P2', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await system.uninstall('p2');
      expect(system.getPlugin('p2')).toBeUndefined();
    });

    it('should call deactivate on uninstall', async () => {
      let deactivated = false;
      await system.install({
        manifest: { id: 'p3', name: 'P3', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => { deactivated = true; },
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await system.uninstall('p3');
      expect(deactivated).toBe(true);
    });

    it('should disable a plugin without removing', async () => {
      await system.install({
        manifest: { id: 'p4', name: 'P4', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await system.disable('p4');
      expect(system.getState('p4')).toBe('disabled');
      expect(system.getPlugin('p4')).toBeDefined();
    });

    it('should re-enable a disabled plugin', async () => {
      await system.install({
        manifest: { id: 'p5', name: 'P5', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await system.disable('p5');
      await system.enable('p5');
      expect(system.getState('p5')).toBe('active');
    });

    it('should list all installed plugins', async () => {
      await system.install({
        manifest: { id: 'a', name: 'A', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await system.install({
        manifest: { id: 'b', name: 'B', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(system.listPlugins().length).toBe(2);
    });

    it('should set state to error on failed activate', async () => {
      await system.install({
        manifest: { id: 'bad', name: 'Bad', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => { throw new Error('boom'); },
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(system.getState('bad')).toBe('error');
    });

    it('should return unloaded for unknown plugin', () => {
      expect(system.getState('ghost')).toBe('unloaded');
    });
  });

  describe('Plugin dependencies', () => {
    it('should reject plugin with missing dependency', async () => {
      const result = system.install({
        manifest: { id: 'child', name: 'Child', version: '1.0.0', dependencies: ['parent'] },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await expect(result).rejects.toThrow();
    });

    it('should accept plugin when dependencies satisfied', async () => {
      await system.install({
        manifest: { id: 'parent', name: 'Parent', version: '1.0.0', provides: ['parent'] },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await system.install({
        manifest: { id: 'child', name: 'Child', version: '1.0.0', dependencies: ['parent'] },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(system.getState('child')).toBe('active');
    });

    it('should not uninstall plugin with dependents', async () => {
      await system.install({
        manifest: { id: 'base', name: 'Base', version: '1.0.0', provides: ['base'] },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await system.install({
        manifest: { id: 'dep', name: 'Dep', version: '1.0.0', dependencies: ['base'] },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      await expect(system.uninstall('base')).rejects.toThrow();
    });
  });

  describe('Extension points', () => {
    it('should create an extension point', () => {
      const ep = system.createExtensionPoint<{ id: string }>('loading-screens');
      expect(ep).toBeDefined();
      expect(ep.id).toBe('loading-screens');
    });

    it('should retrieve existing extension point', () => {
      system.createExtensionPoint('menus');
      const retrieved = system.getExtensionPoint('menus');
      expect(retrieved).toBeDefined();
    });

    it('should return undefined for missing extension point', () => {
      expect(system.getExtensionPoint('nonexistent')).toBeUndefined();
    });

    it('should allow plugins to contribute to extension points', async () => {
      const ep = system.createExtensionPoint<{ id: string; name: string }>('themes');
      await system.install({
        manifest: { id: 'theme-plugin', name: 'Theme', version: '1.0.0' },
        state: 'unloaded',
        activate: async (ctx) => {
          const themeEp = ctx.registry.require<typeof ep>('ep:themes');
          themeEp.register({ id: 'fire', name: 'Fire Red' });
        },
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(ep.getAll().length).toBe(1);
    });
  });

  describe('Plugin context', () => {
    it('should provide registry to plugins', async () => {
      let receivedRegistry = false;
      await system.install({
        manifest: { id: 'ctx-test', name: 'Ctx', version: '1.0.0' },
        state: 'unloaded',
        activate: async (ctx) => { receivedRegistry = ctx.registry !== undefined; },
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(receivedRegistry).toBe(true);
    });

    it('should provide hooks to plugins', async () => {
      let receivedHooks = false;
      await system.install({
        manifest: { id: 'hook-test', name: 'H', version: '1.0.0' },
        state: 'unloaded',
        activate: async (ctx) => { receivedHooks = ctx.hooks !== undefined; },
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(receivedHooks).toBe(true);
    });

    it('should provide events to plugins', async () => {
      let receivedEvents = false;
      await system.install({
        manifest: { id: 'ev-test', name: 'E', version: '1.0.0' },
        state: 'unloaded',
        activate: async (ctx) => { receivedEvents = ctx.events !== undefined; },
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(receivedEvents).toBe(true);
    });

    it('should provide storage to plugins', async () => {
      let receivedStorage = false;
      await system.install({
        manifest: { id: 'stor-test', name: 'S', version: '1.0.0' },
        state: 'unloaded',
        activate: async (ctx) => { receivedStorage = ctx.storage !== undefined; },
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(receivedStorage).toBe(true);
    });

    it('should provide logger to plugins', async () => {
      let receivedLogger = false;
      await system.install({
        manifest: { id: 'log-test', name: 'L', version: '1.0.0' },
        state: 'unloaded',
        activate: async (ctx) => { receivedLogger = typeof ctx.logger.info === 'function'; },
        deactivate: async () => {},
        getConfig: () => ({}),
        setConfig: () => {},
      });
      expect(receivedLogger).toBe(true);
    });

    it('should provide config to plugins', async () => {
      let receivedConfig = false;
      await system.install({
        manifest: { id: 'cfg-test', name: 'C', version: '1.0.0', configSchema: { color: { type: 'string', default: 'cyan', label: 'Color' } } },
        state: 'unloaded',
        activate: async (ctx) => { receivedConfig = ctx.config.color === 'cyan'; },
        deactivate: async () => {},
        getConfig: () => ({ color: 'cyan' }),
        setConfig: () => {},
      });
      expect(receivedConfig).toBe(true);
    });
  });

  describe('Plugin config', () => {
    it('should get plugin config', async () => {
      await system.install({
        manifest: { id: 'cfgp', name: 'C', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => ({ theme: 'dark' }),
        setConfig: () => {},
      });
      expect(system.getPlugin('cfgp')!.getConfig().theme).toBe('dark');
    });

    it('should set plugin config', async () => {
      const cfg: Record<string, any> = { theme: 'dark' };
      await system.install({
        manifest: { id: 'cfgp2', name: 'C2', version: '1.0.0' },
        state: 'unloaded',
        activate: async () => {},
        deactivate: async () => {},
        getConfig: () => cfg,
        setConfig: (k, v) => { cfg[k] = v; },
      });
      system.getPlugin('cfgp2')!.setConfig('theme', 'light');
      expect(cfg.theme).toBe('light');
    });
  });
});

describe('Loading Screen Extension Point', () => {
  let ep: ReturnType<typeof createExtensionPoint<{ id: string; name: string; render: (ctx: any) => string[]; weight?: number }>>;

  beforeEach(() => {
    ep = createExtensionPoint('loading-screens');
  });

  it('should register a loading screen', () => {
    ep.register({ id: 'monolith', name: 'Monolith', render: () => ['ART'] });
    expect(ep.getAll().length).toBe(1);
  });

  it('should register multiple screens', () => {
    ep.register({ id: 'a', name: 'A', render: () => [] });
    ep.register({ id: 'b', name: 'B', render: () => [] });
    ep.register({ id: 'c', name: 'C', render: () => [] });
    expect(ep.getAll().length).toBe(3);
  });

  it('should support weighted selection', () => {
    ep.register({ id: 'common', name: 'Common', render: () => [], weight: 10 });
    ep.register({ id: 'rare', name: 'Rare', render: () => [], weight: 1 });
    const all = ep.getAll();
    expect(all.find(s => s.id === 'common')!.weight).toBe(10);
  });

  it('should unregister a screen', () => {
    const unsub = ep.register({ id: 'temp', name: 'Temp', render: () => [] });
    unsub();
    expect(ep.getById('temp')).toBeUndefined();
  });

  it('should render a specific screen', () => {
    ep.register({ id: 'test', name: 'Test', render: (ctx) => [`width:${ctx.width}`] });
    const screen = ep.getById('test');
    const lines = screen!.render({ width: 80, height: 24 });
    expect(lines[0]).toBe('width:80');
  });
});

describe('Menu Extension Point', () => {
  let ep: ReturnType<typeof createExtensionPoint<{ id: string; name: string; render: (ctx: any) => string[]; bindings?: Record<string, () => void> }>>;

  beforeEach(() => {
    ep = createExtensionPoint('menus');
  });

  it('should register a custom menu', () => {
    ep.register({ id: 'bbs-menu', name: 'BBS Style', render: () => ['menu art'] });
    expect(ep.getAll().length).toBe(1);
  });

  it('should support custom keybindings per menu', () => {
    let called = false;
    ep.register({
      id: 'custom',
      name: 'Custom',
      render: () => [],
      bindings: { 'X': () => { called = true; } },
    });
    const menu = ep.getById('custom');
    menu!.bindings!['X']();
    expect(called).toBe(true);
  });

  it('should render menu with config context', () => {
    ep.register({
      id: 'cfg-menu',
      name: 'Config',
      render: (ctx) => [`model: ${ctx.config.defaultModel}`],
    });
    const menu = ep.getById('cfg-menu');
    const lines = menu!.render({ width: 80, config: { defaultModel: 'opus' }, theme: {} });
    expect(lines[0]).toContain('opus');
  });
});

describe('Theme Extension Point', () => {
  let ep: ReturnType<typeof createExtensionPoint<{ id: string; name: string; colors: Record<string, string> }>>;

  beforeEach(() => {
    ep = createExtensionPoint('themes');
  });

  it('should register a custom theme', () => {
    ep.register({ id: 'fire', name: 'Fire Red', colors: { c1: '#ff0000', c2: '#cc0000' } });
    expect(ep.getById('fire')).toBeDefined();
  });

  it('should list all available themes', () => {
    ep.register({ id: 'fire', name: 'Fire', colors: {} });
    ep.register({ id: 'ocean', name: 'Ocean', colors: {} });
    ep.register({ id: 'forest', name: 'Forest', colors: {} });
    expect(ep.getAll().length).toBe(3);
  });

  it('should provide color palette', () => {
    ep.register({ id: 'neon', name: 'Neon', colors: { c1: '#ff00ff', c2: '#cc00cc', c3: '#aa00aa' } });
    const theme = ep.getById('neon');
    expect(theme!.colors.c1).toBe('#ff00ff');
  });
});

describe('Layout Extension Point', () => {
  let ep: ReturnType<typeof createExtensionPoint<{ id: string; name: string; positions: string[] }>>;

  beforeEach(() => {
    ep = createExtensionPoint('layouts');
  });

  it('should register a custom layout', () => {
    ep.register({ id: 'classic', name: 'Classic IRC', positions: ['sidebar', 'main', 'status'] });
    expect(ep.getById('classic')).toBeDefined();
  });

  it('should define available positions', () => {
    ep.register({ id: 'wide', name: 'Wide', positions: ['main', 'status'] });
    const layout = ep.getById('wide');
    expect(layout!.positions).toContain('main');
    expect(layout!.positions).not.toContain('sidebar');
  });

  it('should support focus-mode layout', () => {
    ep.register({ id: 'focus', name: 'Focus', positions: ['main'] });
    expect(ep.getById('focus')!.positions.length).toBe(1);
  });

  it('should support split layout', () => {
    ep.register({ id: 'split', name: 'Split', positions: ['left-main', 'right-main', 'status'] });
    expect(ep.getById('split')!.positions.length).toBe(3);
  });
});

describe('Border Style Extension Point', () => {
  let ep: ReturnType<typeof createExtensionPoint<{ name: string; chars: { tl: string; tr: string; bl: string; br: string; h: string; v: string } }>>;

  beforeEach(() => {
    ep = createExtensionPoint('border-styles');
  });

  it('should register custom border style', () => {
    ep.register({ name: 'blocks', chars: { tl: '▄', tr: '▄', bl: '▀', br: '▀', h: '▄', v: '█' } });
    expect(ep.getAll().length).toBe(1);
  });

  it('should provide chars for rendering', () => {
    ep.register({ name: 'pipe', chars: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' } });
    const style = ep.getAll()[0];
    expect(style.chars.tl).toBe('╔');
    expect(style.chars.v).toBe('║');
  });
});

describe('Provider Extension Point', () => {
  let ep: ReturnType<typeof createExtensionPoint<{ id: string; name: string; type: string; factory: (config: any) => any }>>;

  beforeEach(() => {
    ep = createExtensionPoint('providers');
  });

  it('should register a custom provider', () => {
    ep.register({ id: 'ollama', name: 'Ollama', type: 'local', factory: () => ({}) });
    expect(ep.getById('ollama')).toBeDefined();
  });

  it('should call factory with config', () => {
    let receivedConfig: any;
    ep.register({
      id: 'custom',
      name: 'Custom',
      type: 'remote',
      factory: (cfg) => { receivedConfig = cfg; return {}; },
    });
    const provider = ep.getById('custom');
    provider!.factory({ apiKey: 'test', baseUrl: 'http://localhost' });
    expect(receivedConfig.apiKey).toBe('test');
  });

  it('should list all providers', () => {
    ep.register({ id: 'a', name: 'A', type: 'cloud', factory: () => ({}) });
    ep.register({ id: 'b', name: 'B', type: 'local', factory: () => ({}) });
    expect(ep.getAll().length).toBe(2);
  });
});

describe('Command Extension Point', () => {
  let ep: ReturnType<typeof createExtensionPoint<{ name: string; aliases?: string[]; description: string; execute: (args: string[]) => Promise<any> }>>;

  beforeEach(() => {
    ep = createExtensionPoint('commands');
  });

  it('should register a command', () => {
    ep.register({ name: '/deploy', description: 'Deploy the project', execute: async () => {} });
    expect(ep.getAll().length).toBe(1);
  });

  it('should support aliases', () => {
    ep.register({ name: '/model', aliases: ['/m', '/mod'], description: 'Switch model', execute: async () => {} });
    const cmd = ep.getAll()[0];
    expect(cmd.aliases).toContain('/m');
  });

  it('should execute a command', async () => {
    let ran = false;
    ep.register({ name: '/test', description: 'Test', execute: async () => { ran = true; } });
    await ep.getAll()[0].execute([]);
    expect(ran).toBe(true);
  });

  it('should pass args to command', async () => {
    let received: string[] = [];
    ep.register({ name: '/echo', description: 'Echo', execute: async (args) => { received = args; } });
    await ep.getAll()[0].execute(['hello', 'world']);
    expect(received).toEqual(['hello', 'world']);
  });
});
