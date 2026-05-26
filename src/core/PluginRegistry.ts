/** Create a typed service locator with registration watch callbacks. */
export function createServiceRegistry() {
  const services: Map<string, any> = new Map();
  const watchers: Map<string, Array<(service: any) => void>> = new Map();
  return {
    register: <T>(name: string, service: T) => {
      services.set(name, service);
      const cbs = watchers.get(name);
      if (cbs) cbs.forEach(cb => cb(service));
    },
    unregister: (name: string) => { services.delete(name); },
    get: <T>(name: string) => services.get(name) as T | undefined,
    require: <T>(name: string) => {
      if (!services.has(name)) throw new Error(`Service not found: ${name}`);
      return services.get(name) as T;
    },
    has: (name: string) => services.has(name),
    list: () => [...services.keys()],
    onRegistered: (name: string, cb: (service: any) => void) => {
      if (services.has(name)) {
        cb(services.get(name));
      }
      if (!watchers.has(name)) watchers.set(name, []);
      watchers.get(name)!.push(cb);
      return () => {
        const cbs = watchers.get(name);
        if (cbs) {
          const idx = cbs.indexOf(cb);
          if (idx !== -1) cbs.splice(idx, 1);
        }
      };
    },
  };
}
/** Create a typed extension point with contribution change notification. */
export function createExtensionPoint<T extends { id?: string }>(_id: string) {
  const contributions: T[] = [];
  const changeCallbacks: Array<(contributions: T[]) => void> = [];
  function notifyChange() {
    changeCallbacks.forEach(cb => cb([...contributions]));
  }
  return {
    id: _id,
    register: (contribution: T) => {
      contributions.push(contribution);
      notifyChange();
      return () => {
        const idx = contributions.indexOf(contribution);
        if (idx !== -1) contributions.splice(idx, 1);
        notifyChange();
      };
    },
    getAll: () => [...contributions],
    getById: (id: string) => contributions.find((c: any) => c.id === id) as T | undefined,
    onChange: (cb: (contributions: T[]) => void) => {
      changeCallbacks.push(cb);
      return () => {
        const idx = changeCallbacks.indexOf(cb);
        if (idx !== -1) changeCallbacks.splice(idx, 1);
      };
    },
  };
}
/** Create a full plugin lifecycle system with install, activate, disable, and dependency checking. */
export function createPluginSystem() {
  const plugins: Map<string, any> = new Map();
  const states: Map<string, string> = new Map();
  const registry = createServiceRegistry();
  const extensionPoints: Map<string, any> = new Map();
  const ctx = {
    registry,
    hooks: { register: () => {}, execute: () => {} },
    events: { on: () => {}, emit: () => {} },
    storage: { get: () => null, set: () => {} },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    config: {} as Record<string, unknown>,
  };
  return {
    install: async (plugin: any) => {
      const id = plugin.manifest.id;
      if (plugin.manifest.dependencies) {
        for (const dep of plugin.manifest.dependencies) {
          let found = false;
          for (const [, p] of plugins) {
            if (p.manifest.provides && p.manifest.provides.includes(dep)) {
              found = true;
              break;
            }
          }
          if (!found) throw new Error(`Missing dependency: ${dep}`);
        }
      }
      plugins.set(id, plugin);
      try {
        const pluginCtx = { ...ctx, config: plugin.getConfig() };
        await plugin.activate(pluginCtx);
        states.set(id, 'active');
      } catch {
        states.set(id, 'error');
      }
    },
    uninstall: async (id: string) => {
      const plugin = plugins.get(id);
      if (plugin && plugin.manifest.provides) {
        for (const [otherId, otherPlugin] of plugins) {
          if (otherId === id) continue;
          if (otherPlugin.manifest.dependencies) {
            for (const dep of otherPlugin.manifest.dependencies) {
              if (plugin.manifest.provides.includes(dep)) {
                throw new Error(`Cannot uninstall: ${otherId} depends on ${id}`);
              }
            }
          }
        }
      }
      if (plugin) {
        await plugin.deactivate();
      }
      plugins.delete(id);
      states.delete(id);
    },
    enable: async (id: string) => {
      const plugin = plugins.get(id);
      if (plugin) {
        const pluginCtx = { ...ctx, config: plugin.getConfig() };
        await plugin.activate(pluginCtx);
        states.set(id, 'active');
      }
    },
    disable: async (id: string) => {
      const plugin = plugins.get(id);
      if (plugin) {
        await plugin.deactivate();
        states.set(id, 'disabled');
      }
    },
    getPlugin: (id: string) => plugins.get(id) || undefined,
    listPlugins: () => [...plugins.values()],
    getState: (id: string) => states.get(id) || 'unloaded',
    getRegistry: () => registry,
    createExtensionPoint: <T extends { id?: string }>(id: string) => {
      const ep = createExtensionPoint<T>(id);
      extensionPoints.set(id, ep);
      registry.register(`ep:${id}`, ep);
      return ep;
    },
    getExtensionPoint: <T extends { id?: string }>(_id: string) => extensionPoints.get(_id) as ReturnType<typeof createExtensionPoint<T>> | undefined,
  };
}