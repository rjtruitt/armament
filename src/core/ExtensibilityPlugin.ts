/**
 * Plugin system and extensibility layer.
 *
 * Exports createPluginSystem (dependency-aware loading, sandboxed contexts,
 * middleware pipeline, status bar, and delegates to ExtensibilityRenderers
 * for sidebar/chat/step/agent/theme rendering).
 */

import { createRendererSubsystem } from './ExtensibilityRenderers.js';

/** Creates the full plugin system with event bus, commands, renderers, and middleware. */
export function createPluginSystem(config: any = {}) {
  const registered = new Map<string, any>();
  const loaded: string[] = [];
  const pluginStorage = new Map<string, Map<string, any>>();
  const commands = new Map<string, any>();
  const pluginCommands = new Map<string, string[]>();
  const pluginEventHandlers = new Map<string, Array<{ event: string; handler: Function }>>();
  const pluginMiddleware = new Map<string, Array<{ stage: string; handler: Function }>>();
  const pluginStatusBarSegments = new Map<string, string[]>();
  const statusBarSegments = new Map<string, any>();
  const baseThemeColors: any = { primary: 7, secondary: 8, accent: 3 };
  const middleware = new Map<string, Function[]>();
  const eventListeners = new Map<string, Function[]>();
  const eventHistory: any[] = [];

  const renderers = createRendererSubsystem(baseThemeColors);

  const events = {
    on(event: string, handler: Function) {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event)!.push(handler);
    },
    once(event: string, handler: Function) {
      const wrapper = (...args: any[]) => {
        handler(...args);
        const list = eventListeners.get(event);
        if (list) {
          const idx = list.indexOf(wrapper);
          if (idx >= 0) list.splice(idx, 1);
        }
      };
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event)!.push(wrapper);
    },
    emit(event: string, data: any) {
      eventHistory.push({ event, data });
      const exact = eventListeners.get(event);
      if (exact) [...exact].forEach(h => h(data));
      for (const [pattern, handlers] of eventListeners.entries()) {
        if (pattern.endsWith(':*')) {
          const prefix = pattern.slice(0, -1);
          if (event.startsWith(prefix) && pattern !== event) {
            handlers.forEach(h => h(data));
          }
        }
      }
    },
    off(event: string, handler: Function) {
      const list = eventListeners.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    },
    getHistory() { return [...eventHistory]; },
  };

  const system: any = {
    events,

    register(plugin: any) {
      registered.set(plugin.name, plugin);
    },

    async load(name: string) {
      const plugin = registered.get(name);
      if (!plugin) throw new Error(`Plugin ${name} not registered`);
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          if (!registered.has(dep)) {
            throw new Error(`Missing dependency: ${dep}`);
          }
          if (!loaded.includes(dep)) {
            await system.load(dep);
          }
        }
      }
      if (!loaded.includes(name)) loaded.push(name);
      const pluginState = new Map<string, any>();
      const storage = new Map<string, any>();
      pluginStorage.set(name, storage);
      const pluginCmds: string[] = [];
      pluginCommands.set(name, pluginCmds);
      const pluginEvtHandlers: Array<{ event: string; handler: Function }> = [];
      pluginEventHandlers.set(name, pluginEvtHandlers);
      const pluginMw: Array<{ stage: string; handler: Function }> = [];
      pluginMiddleware.set(name, pluginMw);
      const pluginSegments: string[] = [];
      pluginStatusBarSegments.set(name, pluginSegments);

      const ctx = {
        events: {
          on(event: string, handler: Function) {
            pluginEvtHandlers.push({ event, handler });
            events.on(event, handler);
          },
          emit: events.emit,
        },
        commands: {
          register(cmd: any) {
            commands.set(cmd.name, cmd);
            pluginCmds.push(cmd.name);
          },
        },
        hooks: {},
        render: {
          registerStatusBarSegment(seg: any) {
            statusBarSegments.set(seg.name, seg);
            pluginSegments.push(seg.name);
          },
        },
        config: system.getPluginConfig(name),
        api: {},
        state: pluginState,
        storage: {
          set(key: string, value: any) { storage.set(key, value); },
          get(key: string) { return storage.get(key); },
        },
        middleware: {
          use(stage: string, handler: Function) {
            pluginMw.push({ stage, handler });
            if (!middleware.has(stage)) middleware.set(stage, []);
            middleware.get(stage)!.push(handler);
          },
        },
      };
      if (plugin.init) await plugin.init(ctx);
    },

    async unload(name: string) {
      const plugin = registered.get(name);
      if (plugin && plugin.destroy) await plugin.destroy();
      const idx = loaded.indexOf(name);
      if (idx >= 0) loaded.splice(idx, 1);
      const cmds = pluginCommands.get(name) || [];
      for (const cmd of cmds) commands.delete(cmd);
      const evtHandlers = pluginEventHandlers.get(name) || [];
      for (const { event, handler } of evtHandlers) {
        events.off(event, handler);
      }
      const mw = pluginMiddleware.get(name) || [];
      for (const { stage, handler } of mw) {
        const list = middleware.get(stage);
        if (list) {
          const mIdx = list.indexOf(handler);
          if (mIdx >= 0) list.splice(mIdx, 1);
        }
      }
      const segs = pluginStatusBarSegments.get(name) || [];
      for (const seg of segs) statusBarSegments.delete(seg);
    },

    async reload(name: string) {
      await system.unload(name);
      await system.load(name);
    },

    getRegistered() { return [...registered.keys()]; },
    getLoaded() { return [...loaded]; },

    getPluginStorage(pluginName: string, key: string) {
      const storage = pluginStorage.get(pluginName);
      return storage ? storage.get(key) : undefined;
    },

    getPluginConfig(pluginName: string) {
      const plugin = registered.get(pluginName);
      if (plugin && plugin.configSchema) {
        const config: any = {};
        for (const [key, schema] of Object.entries(plugin.configSchema) as Array<[string, { default?: unknown }]>) {
          config[key] = schema.default;
        }
        return config;
      }
      return {};
    },

    renderPluginList() {
      const lines: string[] = [];
      for (const [name, plugin] of registered.entries()) {
        lines.push(`${name} v${plugin.version}${plugin.description ? ' - ' + plugin.description : ''}`);
      }
      return lines.join('\n');
    },

    registerCommand(cmd: any) {
      const key = cmd.plugin ? `${cmd.plugin}:${cmd.name}` : cmd.name;
      commands.set(key, cmd);
      if (cmd.plugin) {
      } else {
        commands.set(cmd.name, cmd);
      }
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          commands.set(alias, { ...cmd, isAlias: true, target: cmd.name });
        }
      }
    },

    getCommands() {
      const names: string[] = [];
      for (const [key, cmd] of commands.entries()) {
        if (!cmd.isAlias) names.push(key);
      }
      return names;
    },

    async executeCommand(name: string, args: string[]) {
      const cmd = commands.get(name);
      if (cmd && cmd.handler) {
        await cmd.handler(args, { agents: {}, session: {} });
      }
    },

    resolveCommand(nameOrAlias: string) {
      const cmd = commands.get(nameOrAlias);
      if (!cmd) return undefined;
      if (cmd.isAlias) return cmd.target;
      return nameOrAlias;
    },

    getCompletions(input: string) {
      const parts = input.split(' ');
      const cmdName = parts[0]?.replace('/', '');
      const partial = parts.slice(1).join(' ');
      const cmd = commands.get(cmdName);
      if (cmd && cmd.completions) {
        return cmd.completions(partial);
      }
      return [];
    },

    renderHelp() {
      const lines: string[] = [];
      for (const [key, cmd] of commands.entries()) {
        if (!cmd.isAlias) {
          lines.push(`/${key} - ${cmd.description || 'No description'}`);
        }
      }
      return lines.join('\n');
    },

    registerStatusBarSegment(seg: any) {
      statusBarSegments.set(seg.name, seg);
    },

    getStatusBarSegments() {
      return [...statusBarSegments.keys()];
    },

    renderStatusBar(width: number) {
      const parts: string[] = [];
      for (const [, seg] of statusBarSegments.entries()) {
        parts.push(seg.render());
      }
      return parts.join(' | ');
    },

    // Delegated renderer methods
    registerSidebarWidget: renderers.registerSidebarWidget,
    getSidebarWidgets: renderers.getSidebarWidgets,
    renderSidebar: renderers.renderSidebar,
    registerChatRenderer: renderers.registerChatRenderer,
    renderChatLine: renderers.renderChatLine,
    registerNotificationRenderer: renderers.registerNotificationRenderer,
    renderNotification: renderers.renderNotification,
    registerStepType: renderers.registerStepType,
    getStepTypes: renderers.getStepTypes,
    getStepTypeChoices: renderers.getStepTypeChoices,
    getStepConfigSchema: renderers.getStepConfigSchema,
    executeStep: renderers.executeStep,
    registerOutputProcessor: renderers.registerOutputProcessor,
    getOutputProcessors: renderers.getOutputProcessors,
    registerAgentType: renderers.registerAgentType,
    getAgentTypes: renderers.getAgentTypes,
    spawnAgent: renderers.spawnAgent,
    getSpawnChoices: renderers.getSpawnChoices,
    getAgentTypeVisual: renderers.getAgentTypeVisual,
    registerTheme: renderers.registerTheme,
    getThemes: renderers.getThemes,
    getTheme: renderers.getTheme,
    getThemeColors: renderers.getThemeColors,
    setTheme: renderers.setTheme,
    getActiveTheme: renderers.getActiveTheme,

    use(stage: string, handler: Function) {
      if (!middleware.has(stage)) middleware.set(stage, []);
      middleware.get(stage)!.push(handler);
    },

    async processMiddleware(stage: string, data: any) {
      const handlers = middleware.get(stage) || [];
      let current = data;
      for (const handler of handlers) {
        current = handler(current);
        if (current === null) return null;
      }
      return current;
    },
  };

  return system;
}

export { createScriptRegistry, createSDK, createConfigLoader } from './ExtensibilityRegistry.js';
