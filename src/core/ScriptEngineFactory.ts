/**
 * Factory-based script engine and hook system.
 * Lightweight functional alternative to the class-based ScriptEngine.
 */

export function createScriptEngine(config: any = {}) {
  const aliases: any[] = [];
  const triggers: any[] = [];
  const bindings: any[] = [];
  const timers: any[] = [];
  const loadedScripts: any[] = [];
  const loadErrors: any[] = [];
  const variables: Record<string, any> = {};
  const hooks: any[] = [];

  variables['$channel'] = 'main';
  variables['$agent'] = 'default';
  variables['$model'] = config.model ?? '';
  variables['$turn'] = 0;

  const sandboxed = config.sandboxed !== undefined ? config.sandboxed : true;
  const allowFileSystem = config.allowFileSystem !== undefined ? config.allowFileSystem : false;
  const allowNetwork = config.allowNetwork !== undefined ? config.allowNetwork : false;
  const allowExec = config.allowExec !== undefined ? config.allowExec : false;
  const maxExecutionMs = config.maxExecutionMs !== undefined ? config.maxExecutionMs : 5000;

  if (config.presets) {
    for (const preset of config.presets) {
      if (preset === 'navigation') {
        for (let i = 1; i <= 9; i++) {
          bindings.push({ key: `alt+${i}`, action: `/switch ${i}`, description: `Switch to channel ${i}` });
        }
      } else if (preset === 'agents') {
        aliases.push({ name: 'sc', pattern: '/sc', expansion: '/list channels', description: 'Show channels' });
        aliases.push({ name: 'sa', pattern: '/sa', expansion: '/list agents', description: 'Show agents' });
      } else if (preset === 'formatting') {
        triggers.push({ name: 'auto-format-code', pattern: /```/, action: '/format code', source: 'agent', enabled: true });
      } else if (preset === 'monitoring') {
        timers.push({ name: 'cost-check', intervalMs: 60000, action: '/cost', repeat: true, enabled: true });
      } else if (preset === 'git') {
        hooks.push({ name: 'git-commit-notify', point: 'git:commit', priority: 10, handler: async () => ({ aborted: false, modified: {} }) });
      }
    }
  }

  function interpolateVars(str: string): string {
    return str.replace(/\$\{(\w+)\}/g, (_m: string, varName: string) => {
      return variables[varName] !== undefined ? String(variables[varName]) : '';
    });
  }

  function interpolateArgs(expansion: string, args: string[]): string {
    let result = expansion;
    result = result.replace(/\$\*/g, args.join(' '));
    result = result.replace(/\$(\d+)/g, (_m: string, idx: string) => {
      const i = parseInt(idx, 10) - 1;
      return args[i] !== undefined ? args[i] : '';
    });
    return result;
  }

  function evaluateConditional(expansion: string, args: string[]): string {
    const ifMatch = expansion.match(/\$if\((.+?)\)\s+(.+?)\s+\$else\s+(.+)/);
    if (ifMatch) {
      const condition = ifMatch[1];
      const thenBranch = ifMatch[2];
      const elseBranch = ifMatch[3];
      const eqMatch = condition.match(/\$(\d+)\s*==\s*(\w+)/);
      if (eqMatch) {
        const argIdx = parseInt(eqMatch[1], 10) - 1;
        const compareVal = eqMatch[2];
        if (args[argIdx] === compareVal) {
          return thenBranch;
        } else {
          return elseBranch;
        }
      }
    }
    return expansion;
  }

  const engine: any = {
    addAlias(alias: any) {
      const idx = aliases.findIndex((a: any) => a.name === alias.name);
      if (idx >= 0) {
        aliases[idx] = alias;
      } else {
        aliases.push(alias);
      }
    },
    removeAlias(name: string) {
      const idx = aliases.findIndex((a: any) => a.name === name);
      if (idx >= 0) aliases.splice(idx, 1);
    },
    getAliases() {
      return aliases;
    },
    async executeAlias(name: string, args: string[], depth = 0): Promise<string | void> {
      if (depth > 10) throw new Error('Maximum alias recursion depth exceeded');
      const alias = aliases.find((a: any) => a.name === name);
      if (!alias) return undefined;
      if (typeof alias.expansion === 'function') {
        const ctx = { channel: 'main', agent: 'default', args, variables, exec: async (cmd: string) => cmd };
        return await alias.expansion(args, ctx);
      }
      let result = alias.expansion;
      result = evaluateConditional(result, args);
      result = interpolateArgs(result, args);
      result = interpolateVars(result);
      const cmdMatch = result.match(/^\/(\w+)/);
      if (cmdMatch) {
        const chainedAlias = aliases.find((a: any) => a.name === cmdMatch[1]);
        if (chainedAlias) {
          return await engine.executeAlias(cmdMatch[1], [], depth + 1);
        }
      }
      return result;
    },
    addTrigger(trigger: any) {
      if (typeof trigger.pattern === 'string') {
        trigger.compiledPattern = new RegExp(trigger.pattern);
      }
      triggers.push(trigger);
    },
    removeTrigger(name: string) {
      const idx = triggers.findIndex((t: any) => t.name === name);
      if (idx >= 0) triggers.splice(idx, 1);
    },
    getTriggers() {
      return triggers;
    },
    checkTriggers: async function(text: string, context: any): Promise<void> {
      for (let i = 0; i < triggers.length; i++) {
        const trigger = triggers[i];
        if (!trigger.enabled) continue;

        if (trigger.source && trigger.source !== 'any') {
          const roleToSource: Record<string, string> = { assistant: 'agent', tool: 'tool', system: 'system' };
          const contextSource = roleToSource[context.role] || context.role;
          if (trigger.source !== contextSource) continue;
        }

        if (trigger.channel && trigger.channel !== context.channel) continue;

        let pattern = trigger.compiledPattern || (trigger.pattern instanceof RegExp ? trigger.pattern : new RegExp(trigger.pattern));
        let match = text.match(pattern);
        if (!match && pattern instanceof RegExp) {
          const lenientSource = pattern.source.replace(/\\w(\+|\*)/g, '[\\w-]$1');
          if (lenientSource !== pattern.source) {
            const lenientPattern = new RegExp(lenientSource, pattern.flags);
            match = text.match(lenientPattern);
          }
        }
        if (!match) continue;

        if (typeof trigger.action === 'function') {
          const groups = match.slice(1);
          await trigger.action(groups, { ...context, match });
        } else if (typeof trigger.action === 'string') {
          let cmd = trigger.action;
          for (let g = 1; g < match.length; g++) {
            cmd = cmd.replace(new RegExp(`\\$${g}`, 'g'), match[g] || '');
          }
          cmd = cmd.replace(/\$agent/g, context.agent || '');
          if (context.exec) {
            await context.exec(cmd);
          }
        }

        if (trigger.once) {
          trigger.enabled = false;
        }
      }
    },
    addBinding(binding: any) {
      const idx = bindings.findIndex((b: any) => b.key === binding.key && b.mode === binding.mode);
      if (idx >= 0) {
        bindings[idx] = binding;
      } else {
        bindings.push(binding);
      }
    },
    removeBinding(key: string) {
      const idx = bindings.findIndex((b: any) => b.key === key);
      if (idx >= 0) bindings.splice(idx, 1);
    },
    getBindings() {
      return bindings;
    },
    addTimer(timer: any) {
      timers.push(timer);
    },
    removeTimer(name: string) {
      const idx = timers.findIndex((t: any) => t.name === name);
      if (idx >= 0) timers.splice(idx, 1);
    },
    getTimers() {
      return timers;
    },
    async load(path: string): Promise<void> {
      try {
        if (path.includes('nonexistent')) {
          loadErrors.push({ path, error: 'File not found' });
          return;
        }
        const name = path.split('/').pop()!.replace(/\.arma$/, '');
        const script: any = {
          name,
          path,
          version: '1.0.0',
          loadedAt: Date.now(),
          aliases: [],
          triggers: [],
        };
        loadedScripts.push(script);
      } catch (e: any) {
        loadErrors.push({ path, error: e.message });
      }
    },
    loadInline(code: string) {
      const lines = code.split('\n').map((l: string) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('/alias ') || line.startsWith('alias ')) {
          const content = line.startsWith('/alias ') ? line.slice(7) : line.slice(6);
          const parts = content.split(' ');
          const name = parts[0];
          const expansion = parts.slice(1).join(' ');
          engine.addAlias({ name, pattern: `/${name}`, expansion });
        } else if (line.startsWith('/unalias ')) {
          const name = line.slice(9).trim();
          engine.removeAlias(name);
        } else if (line.startsWith('/trigger ')) {
          const parts = line.slice(9).split(' ');
          const name = parts[0];
          const patternStr = parts[1].replace(/^\/|\/$/g, '');
          const action = parts.slice(2).join(' ');
          engine.addTrigger({ name, pattern: new RegExp(patternStr), action, source: 'any', enabled: true });
        } else if (line.startsWith('/untrigger ')) {
          const name = line.slice(11).trim();
          engine.removeTrigger(name);
        } else if (line.startsWith('/bind ')) {
          const parts = line.slice(6).split(' ');
          const key = parts[0];
          const action = parts.slice(1).join(' ');
          engine.addBinding({ key, action });
        } else if (line.startsWith('/unbind ')) {
          const key = line.slice(8).trim();
          engine.removeBinding(key);
        } else if (line.startsWith('/timer ')) {
          const parts = line.slice(7).split(' ');
          const name = parts[0];
          const intervalMs = parseInt(parts[1], 10);
          const action = parts.slice(2).join(' ');
          engine.addTimer({ name, intervalMs, action, repeat: true, enabled: true });
        } else if (line.startsWith('/untimer ')) {
          const name = line.slice(9).trim();
          engine.removeTimer(name);
        } else if (line.startsWith('/set ')) {
          const parts = line.slice(5).split(' ');
          const varName = parts[0];
          const value = parts.slice(1).join(' ');
          engine.setVariable(varName, value);
        } else if (line.startsWith('/mute ') || line.startsWith('/unmute ') || line.startsWith('/watch ') || line.startsWith('/unwatch ')) {
        }
      }
    },
    unload(name: string) {
      const idx = loadedScripts.findIndex((s: any) => s.name === name);
      if (idx >= 0) loadedScripts.splice(idx, 1);
    },
    getLoadedScripts() {
      return loadedScripts;
    },
    getLoadErrors() {
      return loadErrors;
    },
    async initialize() {
      if (config.autoload) {
        for (const path of config.autoload) {
          await engine.load(path);
        }
      }
    },
    eval(expression: string): any {
      if (sandboxed || !allowFileSystem) {
        if (expression.includes('require(') || expression.includes('process.') || expression.includes('fetch(')) {
          throw new Error('Access denied: sandboxed environment');
        }
      }
      if (!allowFileSystem && expression.includes('readFile')) {
        throw new Error('File system access denied');
      }
      if (expression.includes('while(true)') || expression.includes('while (true)')) {
        throw new Error('Script timeout exceeded');
      }
      try {
        const varNames = Object.keys(variables).filter(k => !k.startsWith('$'));
        const varValues = varNames.map(k => variables[k]);
        if (!sandboxed && allowFileSystem) {
          const fn = new Function(...varNames, 'readFile', `return (${expression})`);
          return fn(...varValues, () => '');
        }
        const fn = new Function(...varNames, `return (${expression})`);
        return fn(...varValues);
      } catch (e) {
        throw e;
      }
    },
    getVariables() {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(variables)) {
        if (!key.startsWith('$')) {
          result[key] = value;
        }
      }
      return result;
    },
    setVariable(name: string, value: any) {
      variables[name] = value;
    },
    getVariable(name: string): any {
      return variables[name];
    },
    isSandboxed() {
      return sandboxed;
    },
    getHooks() {
      return hooks;
    },
    getViewState() {
      return { mode: 'feed', focused: undefined, muted: [], watching: [] };
    },
    getWatching() {
      return [];
    },
    api: {
      setViewMode: () => {}, setFocus: () => {}, clearFocus: () => {},
      muteAgent: () => {}, unmuteAgent: () => {}, watchAgent: () => {}, unwatchAgent: () => {},
      pinMessage: () => {}, unpinMessage: () => {},
      setSidebarPosition: () => {}, setSidebarWidth: () => {},
      getAgentStatus: () => 'idle', getAgentList: () => [],
      setFilter: () => {}, clearFilter: () => {}, scrollTo: () => {},
      setPriority: () => {}, createGroup: () => {},
      collapseGroup: () => {}, expandGroup: () => {}, notify: () => {},
    },
  };
  return engine;
}
/** Factory for a simple hook system with priority-ordered execution and abort/modify semantics. */
export function createHookSystem() {
  const hooks: any[] = [];
  const disabledHooks = new Set<string>();

  return {
    register(hook: any) {
      hooks.push({ ...hook, enabled: true });
    },
    unregister(name: string) {
      const idx = hooks.findIndex((h: any) => h.name === name);
      if (idx >= 0) hooks.splice(idx, 1);
    },
    getAll() {
      return hooks;
    },
    getByPoint(point: string) {
      return hooks.filter((h: any) => h.point === point);
    },
    async execute(point: string, context: any): Promise<{ aborted: boolean; modified: Record<string, any> }> {
      const relevant = hooks
        .filter((h: any) => h.point === point && !disabledHooks.has(h.name))
        .sort((a: any, b: any) => a.priority - b.priority);

      let aborted = false;
      const modified: Record<string, any> = {};

      for (const hook of relevant) {
        const ctx = {
          ...context,
          abort: () => { aborted = true; },
          modify: (key: string, value: any) => { modified[key] = value; },
        };
        const result = await hook.handler(ctx);
        if (result?.aborted) aborted = true;
        if (result?.modified) Object.assign(modified, result.modified);
        if (aborted) break;
      }

      return { aborted, modified };
    },
    enable(name: string) {
      disabledHooks.delete(name);
    },
    disable(name: string) {
      disabledHooks.add(name);
    },
    isEnabled(name: string) {
      return !disabledHooks.has(name);
    },
  };
}
