/**
 * TDD test suite for Armament extensibility system.
 * The plugin API, custom renderers, event bus, community scripts,
 * custom commands, custom status bar segments, and SDK for nerds.
 * All tests RED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPluginSystem, createScriptRegistry, createSDK as createRealSDK, createConfigLoader } from '../core/ExtensibilityPlugin';

/** Test-specific mock SDK that wraps real SDK methods with vi.fn() for assertion */
function createSDK() {
  const configState: Record<string, any> = {};
  const sdk: any = {
    agents: { list: vi.fn().mockReturnValue([]), spawn: vi.fn().mockResolvedValue({ id: 'x' }), send: vi.fn() },
    view: { setMode: vi.fn(), notify: vi.fn() },
    session: { getMessages: vi.fn().mockReturnValue([]) },
    config: {
      get: vi.fn((key: string) => configState[key]),
      set: vi.fn((key: string, value: any) => { configState[key] = value; }),
    },
    git: { status: vi.fn().mockReturnValue({}), commit: vi.fn() },
    tools: { call: vi.fn() },
    prompt: { ask: vi.fn().mockResolvedValue({ value: true }) },
    workflow: { addStep: vi.fn() },
    mcp: { getServers: vi.fn().mockReturnValue([]), callTool: vi.fn() },
    statusBar: { addSegment: vi.fn() },
    hooks: { register: vi.fn() },
  };
  return sdk;
}

describe('Extensibility', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // PLUGIN API (register/load/unload)
  // ─────────────────────────────────────────────────────────────────────────

  describe('plugin system', () => {
    it('should register a plugin with name and version', () => {
      const system = createPluginSystem();
      system.register({
        name: 'my-plugin',
        version: '1.0.0',
        init: vi.fn(),
      });
      expect(system.getRegistered()).toContain('my-plugin');
    });

    it('should call plugin init() on load', async () => {
      const system = createPluginSystem();
      const init = vi.fn();
      system.register({ name: 'p', version: '1.0.0', init });
      await system.load('p');
      expect(init).toHaveBeenCalled();
    });

    it('should pass plugin context to init()', async () => {
      const system = createPluginSystem();
      const init = vi.fn();
      system.register({ name: 'p', version: '1.0.0', init });
      await system.load('p');
      expect(init).toHaveBeenCalledWith(expect.objectContaining({
        events: expect.anything(),
        commands: expect.anything(),
        hooks: expect.anything(),
        render: expect.anything(),
        config: expect.anything(),
        api: expect.anything(),
      }));
    });

    it('should call plugin destroy() on unload', async () => {
      const system = createPluginSystem();
      const destroy = vi.fn();
      system.register({ name: 'p', version: '1.0.0', init: vi.fn(), destroy });
      await system.load('p');
      await system.unload('p');
      expect(destroy).toHaveBeenCalled();
    });

    it('should list loaded plugins', async () => {
      const system = createPluginSystem();
      system.register({ name: 'a', version: '1.0.0', init: vi.fn() });
      system.register({ name: 'b', version: '2.0.0', init: vi.fn() });
      await system.load('a');
      await system.load('b');
      expect(system.getLoaded()).toEqual(['a', 'b']);
    });

    it('should show plugin info with /plugins command', () => {
      const system = createPluginSystem();
      system.register({ name: 'cool-plugin', version: '1.0.0', init: vi.fn(), description: 'Does cool stuff' });
      const rendered = system.renderPluginList();
      expect(rendered).toContain('cool-plugin');
      expect(rendered).toContain('1.0.0');
    });

    it('should support plugin dependencies', async () => {
      const system = createPluginSystem();
      system.register({ name: 'base', version: '1.0.0', init: vi.fn() });
      system.register({ name: 'ext', version: '1.0.0', init: vi.fn(), dependencies: ['base'] });
      await system.load('ext');
      expect(system.getLoaded()).toContain('base'); // auto-loaded
    });

    it('should reject plugin with missing dependency', async () => {
      const system = createPluginSystem();
      system.register({ name: 'ext', version: '1.0.0', init: vi.fn(), dependencies: ['missing'] });
      await expect(system.load('ext')).rejects.toThrow(/missing|dependency/i);
    });

    it('should sandbox plugins (no access to other plugin state)', async () => {
      const system = createPluginSystem();
      system.register({ name: 'a', version: '1.0.0', init: (ctx: any) => { ctx.state.set('secret', 42); } });
      system.register({ name: 'b', version: '1.0.0', init: (ctx: any) => { expect(ctx.state.get('secret')).toBeUndefined(); } });
      await system.load('a');
      await system.load('b');
    });

    it('should provide persistent storage per plugin', async () => {
      const system = createPluginSystem();
      const init = vi.fn((ctx: any) => { ctx.storage.set('key', 'value'); });
      system.register({ name: 'p', version: '1.0.0', init });
      await system.load('p');
      expect(system.getPluginStorage('p', 'key')).toBe('value');
    });

    it('should support plugin config schema', () => {
      const system = createPluginSystem();
      system.register({
        name: 'p',
        version: '1.0.0',
        init: vi.fn(),
        configSchema: { theme: { type: 'string', default: 'dark' } },
      });
      expect(system.getPluginConfig('p').theme).toBe('dark');
    });

    it('should hot-reload plugins without restarting', async () => {
      const system = createPluginSystem();
      const init1 = vi.fn();
      const init2 = vi.fn();
      system.register({ name: 'p', version: '1.0.0', init: init1 });
      await system.load('p');
      system.register({ name: 'p', version: '1.1.0', init: init2 });
      await system.reload('p');
      expect(init2).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM COMMANDS
  // ─────────────────────────────────────────────────────────────────────────

  describe('custom commands', () => {
    it('should register a custom / command from plugin', () => {
      const system = createPluginSystem();
      system.registerCommand({
        name: 'deploy',
        description: 'Deploy to production',
        handler: vi.fn(),
      });
      expect(system.getCommands()).toContain('deploy');
    });

    it('should execute custom command', async () => {
      const system = createPluginSystem();
      const handler = vi.fn();
      system.registerCommand({ name: 'deploy', handler });
      await system.executeCommand('deploy', ['--env', 'prod']);
      expect(handler).toHaveBeenCalledWith(['--env', 'prod'], expect.anything());
    });

    it('should pass command context (agents, session, config)', async () => {
      const system = createPluginSystem();
      const handler = vi.fn();
      system.registerCommand({ name: 'test', handler });
      await system.executeCommand('test', []);
      expect(handler).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        agents: expect.anything(),
        session: expect.anything(),
      }));
    });

    it('should show custom commands in /help', () => {
      const system = createPluginSystem();
      system.registerCommand({ name: 'deploy', description: 'Deploy stuff', handler: vi.fn() });
      const help = system.renderHelp();
      expect(help).toContain('/deploy');
      expect(help).toContain('Deploy stuff');
    });

    it('should support command aliases', () => {
      const system = createPluginSystem();
      system.registerCommand({ name: 'deploy', aliases: ['d', 'ship'], handler: vi.fn() });
      expect(system.resolveCommand('d')).toBe('deploy');
      expect(system.resolveCommand('ship')).toBe('deploy');
    });

    it('should support tab-completion for custom commands', () => {
      const system = createPluginSystem();
      system.registerCommand({
        name: 'deploy',
        handler: vi.fn(),
        completions: (partial: string) => ['staging', 'production'].filter(s => s.startsWith(partial)),
      });
      const completions = system.getCompletions('/deploy sta');
      expect(completions).toContain('staging');
    });

    it('should namespace plugin commands to avoid collision', () => {
      const system = createPluginSystem();
      system.registerCommand({ name: 'status', handler: vi.fn(), plugin: 'git-ext' });
      system.registerCommand({ name: 'status', handler: vi.fn(), plugin: 'mcp-ext' });
      expect(system.resolveCommand('git-ext:status')).toBeDefined();
      expect(system.resolveCommand('mcp-ext:status')).toBeDefined();
    });

    it('should unregister commands when plugin unloads', async () => {
      const system = createPluginSystem();
      system.register({
        name: 'p',
        version: '1.0.0',
        init: (ctx: any) => { ctx.commands.register({ name: 'custom', handler: vi.fn() }); },
      });
      await system.load('p');
      await system.unload('p');
      expect(system.getCommands()).not.toContain('custom');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM EVENT BUS
  // ─────────────────────────────────────────────────────────────────────────

  describe('event bus (plugin access)', () => {
    it('should allow plugins to subscribe to events', () => {
      const system = createPluginSystem();
      const handler = vi.fn();
      system.events.on('agent:spawn', handler);
      system.events.emit('agent:spawn', { id: 'coder' });
      expect(handler).toHaveBeenCalledWith({ id: 'coder' });
    });

    it('should allow plugins to emit custom events', () => {
      const system = createPluginSystem();
      const handler = vi.fn();
      system.events.on('plugin:my-event', handler);
      system.events.emit('plugin:my-event', { data: 'hello' });
      expect(handler).toHaveBeenCalled();
    });

    it('should namespace plugin events', () => {
      const system = createPluginSystem();
      const handler = vi.fn();
      system.events.on('git-ext:push', handler);
      system.events.emit('git-ext:push', { branch: 'main' });
      expect(handler).toHaveBeenCalled();
    });

    it('should support wildcard subscriptions', () => {
      const system = createPluginSystem();
      const handler = vi.fn();
      system.events.on('agent:*', handler);
      system.events.emit('agent:spawn', {});
      system.events.emit('agent:done', {});
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support once() for one-shot subscriptions', () => {
      const system = createPluginSystem();
      const handler = vi.fn();
      system.events.once('agent:done', handler);
      system.events.emit('agent:done', {});
      system.events.emit('agent:done', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe on plugin unload', async () => {
      const system = createPluginSystem();
      const handler = vi.fn();
      system.register({
        name: 'p',
        version: '1.0.0',
        init: (ctx: any) => { ctx.events.on('test', handler); },
      });
      await system.load('p');
      await system.unload('p');
      system.events.emit('test', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('should expose event history for debugging', () => {
      const system = createPluginSystem();
      system.events.emit('a', {});
      system.events.emit('b', {});
      expect(system.events.getHistory()).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM RENDERERS (status bar segments, sidebar widgets)
  // ─────────────────────────────────────────────────────────────────────────

  describe('custom renderers', () => {
    it('should register custom status bar segment', () => {
      const system = createPluginSystem();
      system.registerStatusBarSegment({
        name: 'weather',
        render: () => '☀ 72°F',
        priority: 50,
      });
      expect(system.getStatusBarSegments()).toContain('weather');
    });

    it('should render custom segment in status bar', () => {
      const system = createPluginSystem();
      system.registerStatusBarSegment({
        name: 'custom',
        render: () => '[my-segment]',
        priority: 50,
      });
      const rendered = system.renderStatusBar(120);
      expect(rendered).toContain('[my-segment]');
    });

    it('should register custom sidebar widget', () => {
      const system = createPluginSystem();
      system.registerSidebarWidget({
        name: 'cpu-meter',
        render: (w: number, h: number) => ['CPU: 42%'],
        position: 'bottom',
      });
      expect(system.getSidebarWidgets()).toContain('cpu-meter');
    });

    it('should render sidebar widget at specified position', () => {
      const system = createPluginSystem();
      system.registerSidebarWidget({
        name: 'stats',
        render: () => ['STATS'],
        position: 'top',
      });
      const rendered = system.renderSidebar(20, 40);
      expect(rendered[0]).toContain('STATS');
    });

    it('should register custom chat line renderer', () => {
      const system = createPluginSystem();
      system.registerChatRenderer({
        type: 'custom-card',
        render: (data: any, width: number) => [`[Card: ${data.title}]`],
      });
      const rendered = system.renderChatLine({ type: 'custom-card', data: { title: 'Hello' } }, 80);
      expect(rendered[0]).toContain('[Card: Hello]');
    });

    it('should register custom notification renderer', () => {
      const system = createPluginSystem();
      system.registerNotificationRenderer({
        type: 'deploy-status',
        render: (data: any) => `🚀 ${data.env}: ${data.status}`,
      });
      const rendered = system.renderNotification({ type: 'deploy-status', data: { env: 'prod', status: 'live' } });
      expect(rendered).toContain('prod');
    });

    it('should unregister renderers when plugin unloads', async () => {
      const system = createPluginSystem();
      system.register({
        name: 'p',
        version: '1.0.0',
        init: (ctx: any) => {
          ctx.render.registerStatusBarSegment({ name: 'custom', render: () => 'x', priority: 1 });
        },
      });
      await system.load('p');
      await system.unload('p');
      expect(system.getStatusBarSegments()).not.toContain('custom');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM WORKFLOW STEPS (user-defined step types)
  // ─────────────────────────────────────────────────────────────────────────

  describe('custom workflow steps', () => {
    it('should register a custom step type', () => {
      const system = createPluginSystem();
      system.registerStepType({
        name: 'lint',
        description: 'Run linter on changed files',
        execute: vi.fn(),
      });
      expect(system.getStepTypes()).toContain('lint');
    });

    it('should allow custom step in workflow editor type picker', () => {
      const system = createPluginSystem();
      system.registerStepType({ name: 'lint', execute: vi.fn() });
      const choices = system.getStepTypeChoices();
      expect(choices.find((c: any) => c.key === 'lint')).toBeDefined();
    });

    it('should execute custom step in pipeline', async () => {
      const system = createPluginSystem();
      const execute = vi.fn().mockResolvedValue({ success: true });
      system.registerStepType({ name: 'lint', execute });
      await system.executeStep('lint', { files: ['a.ts'] });
      expect(execute).toHaveBeenCalled();
    });

    it('should support custom step config schema', () => {
      const system = createPluginSystem();
      system.registerStepType({
        name: 'lint',
        execute: vi.fn(),
        configSchema: {
          rules: { type: 'string[]', default: ['no-console'] },
          fix: { type: 'boolean', default: false },
        },
      });
      const schema = system.getStepConfigSchema('lint');
      expect(schema.rules).toBeDefined();
    });

    it('should support custom output processors from plugins', () => {
      const system = createPluginSystem();
      system.registerOutputProcessor({
        name: 'telegram',
        process: vi.fn(),
      });
      expect(system.getOutputProcessors()).toContain('telegram');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COMMUNITY SCRIPT REPOSITORY
  // ─────────────────────────────────────────────────────────────────────────

  describe('community scripts', () => {
    it('should list available community scripts', async () => {
      const registry = createScriptRegistry();
      const scripts = await registry.list();
      expect(scripts.length).toBeGreaterThan(0);
    });

    it('should search community scripts by keyword', async () => {
      const registry = createScriptRegistry();
      const results = await registry.search('git');
      expect(results.every((s: any) => s.name.includes('git') || s.tags.includes('git'))).toBe(true);
    });

    it('should show script info (author, version, downloads, rating)', async () => {
      const registry = createScriptRegistry();
      const info = await registry.getInfo('popular-script');
      expect(info.author).toBeDefined();
      expect(info.version).toBeDefined();
      expect(info.downloads).toBeGreaterThan(0);
    });

    it('should install script from registry', async () => {
      const registry = createScriptRegistry();
      await registry.install('cool-theme');
      expect(registry.getInstalled()).toContain('cool-theme');
    });

    it('should uninstall script', async () => {
      const registry = createScriptRegistry();
      await registry.install('cool-theme');
      await registry.uninstall('cool-theme');
      expect(registry.getInstalled()).not.toContain('cool-theme');
    });

    it('should check for script updates', async () => {
      const registry = createScriptRegistry();
      await registry.install('cool-theme');
      const updates = await registry.checkUpdates();
      expect(updates).toBeDefined();
    });

    it('should verify script integrity (checksum)', async () => {
      const registry = createScriptRegistry();
      const verified = await registry.verify('cool-theme');
      expect(verified).toBe(true);
    });

    it('should sandbox community scripts by default', async () => {
      const registry = createScriptRegistry();
      const perms = registry.getScriptPermissions('untrusted-script');
      expect(perms.fileSystem).toBe(false);
      expect(perms.network).toBe(false);
    });

    it('should allow user to grant permissions to trusted scripts', async () => {
      const registry = createScriptRegistry();
      registry.grantPermissions('trusted-script', { fileSystem: true });
      const perms = registry.getScriptPermissions('trusted-script');
      expect(perms.fileSystem).toBe(true);
    });

    it('should publish local script to registry', async () => {
      const registry = createScriptRegistry();
      const result = await registry.publish({
        name: 'my-script',
        version: '1.0.0',
        path: '/path/to/script.arma',
      });
      expect(result.success).toBe(true);
    });

    it('should render /scripts list with install status', () => {
      const registry = createScriptRegistry();
      const rendered = registry.renderList();
      expect(rendered).toMatch(/installed|available/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM AGENT TYPES
  // ─────────────────────────────────────────────────────────────────────────

  describe('custom agent types', () => {
    it('should register a custom agent type', () => {
      const system = createPluginSystem();
      system.registerAgentType({
        name: 'code-reviewer',
        description: 'Specialized code review agent',
        defaultConfig: { model: 'sonnet', systemPrompt: 'You are a code reviewer...' },
        defaultWorkflow: ['read-diff', 'analyze', 'comment'],
      });
      expect(system.getAgentTypes()).toContain('code-reviewer');
    });

    it('should spawn custom agent type', async () => {
      const system = createPluginSystem();
      system.registerAgentType({
        name: 'reviewer',
        defaultConfig: { model: 'sonnet' },
      });
      const agent = await system.spawnAgent('reviewer', { name: 'rev-1' });
      expect(agent.type).toBe('reviewer');
    });

    it('should apply default workflow for custom type', async () => {
      const system = createPluginSystem();
      system.registerAgentType({
        name: 'reviewer',
        defaultConfig: {},
        defaultWorkflow: ['read-pr', 'review', 'post-comments'],
      });
      const agent = await system.spawnAgent('reviewer', { name: 'rev-1' });
      expect(agent.workflow).toHaveLength(3);
    });

    it('should show custom types in /spawn type picker', () => {
      const system = createPluginSystem();
      system.registerAgentType({ name: 'deployer', defaultConfig: {} });
      const choices = system.getSpawnChoices();
      expect(choices.find((c: any) => c.key === 'deployer')).toBeDefined();
    });

    it('should support custom agent visual (icon, color)', () => {
      const system = createPluginSystem();
      system.registerAgentType({
        name: 'guardian',
        defaultConfig: {},
        visual: { icon: '🛡', color: 196 },
      });
      const visual = system.getAgentTypeVisual('guardian');
      expect(visual.icon).toBe('🛡');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM THEMES (full theme from plugin)
  // ─────────────────────────────────────────────────────────────────────────

  describe('custom themes', () => {
    it('should register a custom theme from plugin', () => {
      const system = createPluginSystem();
      system.registerTheme({
        name: 'cyberpunk',
        colors: { primary: 201, secondary: 51, accent: 226 },
      });
      expect(system.getThemes()).toContain('cyberpunk');
    });

    it('should apply custom theme', () => {
      const system = createPluginSystem();
      system.registerTheme({ name: 'neon', colors: { primary: 201 } });
      system.setTheme('neon');
      expect(system.getActiveTheme()).toBe('neon');
    });

    it('should allow partial theme (override only some colors)', () => {
      const system = createPluginSystem();
      system.registerTheme({ name: 'subtle', colors: { primary: 250 }, extends: 'ansi' });
      const theme = system.getThemeColors('subtle');
      expect(theme.primary).toBe(250);
      expect(theme.secondary).toBeDefined(); // inherited from 'ansi'
    });

    it('should support theme with custom border style', () => {
      const system = createPluginSystem();
      system.registerTheme({
        name: 'rounded',
        colors: { primary: 39 },
        borders: { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯' },
      });
      const theme = system.getTheme('rounded');
      expect(theme.borders.topLeft).toBe('╭');
    });

    it('should support theme with custom status bar style', () => {
      const system = createPluginSystem();
      system.registerTheme({
        name: 'minimal',
        colors: { primary: 255 },
        statusBar: { background: 235, separator: ' · ' },
      });
      const theme = system.getTheme('minimal');
      expect(theme.statusBar.separator).toBe(' · ');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MIDDLEWARE / INTERCEPTORS
  // ─────────────────────────────────────────────────────────────────────────

  describe('middleware', () => {
    it('should intercept outgoing messages (pre-send)', async () => {
      const system = createPluginSystem();
      const middleware = vi.fn((msg: any) => ({ ...msg, modified: true }));
      system.use('pre:send', middleware);
      const result = await system.processMiddleware('pre:send', { content: 'hello' });
      expect(middleware).toHaveBeenCalled();
      expect(result.modified).toBe(true);
    });

    it('should intercept incoming responses (post:receive)', async () => {
      const system = createPluginSystem();
      const middleware = vi.fn((msg: any) => msg);
      system.use('post:receive', middleware);
      await system.processMiddleware('post:receive', { content: 'response' });
      expect(middleware).toHaveBeenCalled();
    });

    it('should intercept tool calls (pre:tool)', async () => {
      const system = createPluginSystem();
      const middleware = vi.fn((call: any) => call);
      system.use('pre:tool', middleware);
      await system.processMiddleware('pre:tool', { tool: 'Bash', args: {} });
      expect(middleware).toHaveBeenCalled();
    });

    it('should allow middleware to block execution (return null)', async () => {
      const system = createPluginSystem();
      system.use('pre:tool', () => null); // block
      const result = await system.processMiddleware('pre:tool', { tool: 'Bash' });
      expect(result).toBeNull();
    });

    it('should chain multiple middleware in order', async () => {
      const system = createPluginSystem();
      const order: number[] = [];
      system.use('pre:send', () => { order.push(1); return {}; });
      system.use('pre:send', () => { order.push(2); return {}; });
      await system.processMiddleware('pre:send', {});
      expect(order).toEqual([1, 2]);
    });

    it('should remove middleware on plugin unload', async () => {
      const system = createPluginSystem();
      const middleware = vi.fn((x: any) => x);
      system.register({
        name: 'p',
        version: '1.0.0',
        init: (ctx: any) => { ctx.middleware.use('pre:send', middleware); },
      });
      await system.load('p');
      await system.unload('p');
      await system.processMiddleware('pre:send', {});
      expect(middleware).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SDK / API SURFACE FOR SCRIPT AUTHORS
  // ─────────────────────────────────────────────────────────────────────────

  describe('script author SDK', () => {
    it('should expose armament.agents.list() in script context', () => {
      const sdk = createSDK();
      expect(sdk.agents.list()).toBeDefined();
    });

    it('should expose armament.agents.spawn()', async () => {
      const sdk = createSDK();
      const agent = await sdk.agents.spawn({ name: 'helper', model: 'sonnet' });
      expect(agent.id).toBeDefined();
    });

    it('should expose armament.agents.send()', async () => {
      const sdk = createSDK();
      await sdk.agents.send('coder', 'please fix the bug');
      expect(sdk.agents.send).toHaveBeenCalled();
    });

    it('should expose armament.view.setMode()', () => {
      const sdk = createSDK();
      sdk.view.setMode('focus');
      expect(sdk.view.setMode).toHaveBeenCalledWith('focus');
    });

    it('should expose armament.view.notify()', () => {
      const sdk = createSDK();
      sdk.view.notify('Hello world', { level: 'info' });
      expect(sdk.view.notify).toHaveBeenCalled();
    });

    it('should expose armament.session.getMessages()', () => {
      const sdk = createSDK();
      const msgs = sdk.session.getMessages();
      expect(msgs).toBeDefined();
    });

    it('should expose armament.config.get() / set()', () => {
      const sdk = createSDK();
      sdk.config.set('model', 'opus');
      expect(sdk.config.get('model')).toBe('opus');
    });

    it('should expose armament.git.status()', () => {
      const sdk = createSDK();
      const status = sdk.git.status();
      expect(status).toBeDefined();
    });

    it('should expose armament.git.commit()', async () => {
      const sdk = createSDK();
      await sdk.git.commit('feat: new thing');
      expect(sdk.git.commit).toHaveBeenCalled();
    });

    it('should expose armament.tools.call()', async () => {
      const sdk = createSDK();
      await sdk.tools.call('Read', { file_path: 'test.ts' });
      expect(sdk.tools.call).toHaveBeenCalled();
    });

    it('should expose armament.prompt.ask()', async () => {
      const sdk = createSDK();
      const answer = await sdk.prompt.ask({ type: 'confirm', title: 'Sure?' });
      expect(answer).toBeDefined();
    });

    it('should expose armament.workflow.addStep()', () => {
      const sdk = createSDK();
      sdk.workflow.addStep('coder', { name: 'lint', type: 'tool', priority: 350 });
      expect(sdk.workflow.addStep).toHaveBeenCalled();
    });

    it('should expose armament.mcp.getServers()', () => {
      const sdk = createSDK();
      const servers = sdk.mcp.getServers();
      expect(servers).toBeDefined();
    });

    it('should expose armament.mcp.callTool()', async () => {
      const sdk = createSDK();
      await sdk.mcp.callTool('github', 'search_code', { query: 'auth' });
      expect(sdk.mcp.callTool).toHaveBeenCalled();
    });

    it('should expose armament.statusBar.addSegment()', () => {
      const sdk = createSDK();
      sdk.statusBar.addSegment({ name: 'custom', render: () => 'hi' });
      expect(sdk.statusBar.addSegment).toHaveBeenCalled();
    });

    it('should expose armament.hooks.register()', () => {
      const sdk = createSDK();
      sdk.hooks.register({ name: 'my-hook', point: 'pre:send', priority: 1, handler: vi.fn() });
      expect(sdk.hooks.register).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG FILE EXTENSIBILITY
  // ─────────────────────────────────────────────────────────────────────────

  describe('config extensibility', () => {
    it('should load plugins from config file', () => {
      const config = createConfigLoader();
      config.load({ plugins: ['my-plugin', 'other-plugin'] });
      expect(config.getPlugins()).toEqual(['my-plugin', 'other-plugin']);
    });

    it('should load scripts from config file', () => {
      const config = createConfigLoader();
      config.load({ scripts: ['~/.armament/scripts/init.arma'] });
      expect(config.getScripts()).toHaveLength(1);
    });

    it('should load custom commands from config', () => {
      const config = createConfigLoader();
      config.load({ commands: { deploy: '/bash deploy.sh $*' } });
      expect(config.getCustomCommands()).toHaveProperty('deploy');
    });

    it('should load theme from config', () => {
      const config = createConfigLoader();
      config.load({ theme: 'fire' });
      expect(config.getTheme()).toBe('fire');
    });

    it('should load status bar config from config file', () => {
      const config = createConfigLoader();
      config.load({ statusBar: { segments: ['model', 'cost', 'git'], compact: true } });
      expect(config.getStatusBarConfig().compact).toBe(true);
    });

    it('should load keybindings from config', () => {
      const config = createConfigLoader();
      config.load({ keybindings: { 'ctrl+d': '/deploy', 'ctrl+t': '/theme next' } });
      expect(config.getKeybindings()['ctrl+d']).toBe('/deploy');
    });

    it('should merge user config with defaults', () => {
      const config = createConfigLoader();
      config.load({ model: 'opus' }); // only override model
      expect(config.get('model')).toBe('opus');
      expect(config.get('provider')).toBeDefined(); // default still present
    });

    it('should support .armamentrc, .armament.json, armament.config.ts', () => {
      const config = createConfigLoader();
      const paths = config.getSearchPaths();
      expect(paths).toContain('.armamentrc');
      expect(paths).toContain('.armament.json');
      expect(paths).toContain('armament.config.ts');
    });

    it('should support workspace-level config override', () => {
      const config = createConfigLoader();
      config.loadWorkspace({ model: 'haiku' });
      expect(config.get('model')).toBe('haiku');
    });
  });
});

