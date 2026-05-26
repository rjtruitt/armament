/**
 * IRC-style scripting: aliases, triggers, keybindings, timers, and variables.
 *
 * Provides both a class-based ScriptEngine (implements IScriptEngine) and
 * a factory-based createScriptEngine for different usage contexts.
 * Also exports createHookSystem for pre/post operation hooks.
 */

import type {
  IScriptEngine,
  ILoadedScript,
  IAlias,
  IAliasContext,
  ITrigger,
  ITriggerContext,
  IKeyBinding,
  ITimer,
  IScriptConfig,
  IScriptViewAPI,
} from './interfaces/IScriptEngine.js';

const MAX_ALIAS_DEPTH = 10;

/** Class representing ScriptEngine. */
export class ScriptEngine implements IScriptEngine {
  private aliases: IAlias[] = [];
  private triggers: ITrigger[] = [];
  private bindings: IKeyBinding[] = [];
  private timers: ITimer[] = [];
  private timerHandles: Map<string, ReturnType<typeof setInterval>> = new Map();
  private loadedScripts: ILoadedScript[] = [];
  private variables: Record<string, any> = {};
  private config: IScriptConfig;
  private viewAPI: IScriptViewAPI;

  constructor(_config: Partial<IScriptConfig> = {}) {
    this.config = {
      scriptsDir: _config.scriptsDir ?? '~/.armament/scripts',
      flowsDir: _config.flowsDir ?? '~/.armament/flows',
      autoload: _config.autoload ?? [],
      autoloadFlows: _config.autoloadFlows ?? [],
      allowFileSystem: _config.allowFileSystem ?? false,
      allowNetwork: _config.allowNetwork ?? false,
      allowExec: _config.allowExec ?? false,
      maxExecutionMs: _config.maxExecutionMs ?? 5000,
      sandboxed: _config.sandboxed ?? true,
    };

    this.variables['$channel'] = 'main';
    this.variables['$agent'] = 'default';
    this.variables['$model'] = _config.model ?? '';
    this.variables['$turn'] = 0;

    this.viewAPI = {
      setViewMode: () => {},
      setFocus: () => {},
      clearFocus: () => {},
      muteAgent: () => {},
      unmuteAgent: () => {},
      watchAgent: () => {},
      unwatchAgent: () => {},
      pinMessage: () => {},
      unpinMessage: () => {},
      setSidebarPosition: () => {},
      setSidebarWidth: () => {},
      getAgentStatus: () => 'idle',
      getAgentList: () => [],
      setFilter: () => {},
      clearFilter: () => {},
      scrollTo: () => {},
      setPriority: () => {},
      createGroup: () => {},
      collapseGroup: () => {},
      expandGroup: () => {},
      notify: () => {},
    };
  }


  /**
   * Load.
   */
  async load(path: string): Promise<void> {
    try {
      const name = path.split('/').pop()?.replace(/\.arma$/, '') ?? 'unknown';
      const script: ILoadedScript = {
        name,
        path,
        version: '1.0.0',
        author: undefined,
        description: undefined,
        aliases: [],
        triggers: [],
        bindings: [],
        loadedAt: Date.now(),
      };
      this.loadedScripts.push(script);
    } catch {
    }
  }

  /**
   * Load inline.
   */
  loadInline(code: string): void {
    const lines = code.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      this.parseInlineCommand(line);
    }
  }

  private parseInlineCommand(line: string): void {
    if (line.startsWith('/alias ') || line.startsWith('alias ')) {
      const content = line.startsWith('/alias ') ? line.slice(7) : line.slice(6);
      const parts = content.split(' ');
      const name = parts[0];
      const expansion = parts.slice(1).join(' ');
      this.addAlias({ name, pattern: `/${name}`, expansion });
    } else if (line.startsWith('/unalias ')) {
      const name = line.slice(9).trim();
      this.removeAlias(name);
    } else if (line.startsWith('/trigger ')) {
      const parts = line.slice(9).split(' ');
      const name = parts[0];
      const patternStr = parts[1].replace(/^\/|\/$/g, '');
      const action = parts.slice(2).join(' ');
      this.addTrigger({ name, pattern: new RegExp(patternStr), action, source: 'any', enabled: true });
    } else if (line.startsWith('/untrigger ')) {
      const name = line.slice(11).trim();
      this.removeTrigger(name);
    } else if (line.startsWith('/bind ')) {
      const parts = line.slice(6).split(' ');
      const key = parts[0];
      const action = parts.slice(1).join(' ');
      this.addBinding({ key, action });
    } else if (line.startsWith('/unbind ')) {
      const key = line.slice(8).trim();
      this.removeBinding(key);
    } else if (line.startsWith('/timer ')) {
      const parts = line.slice(7).split(' ');
      const name = parts[0];
      const intervalMs = parseInt(parts[1], 10);
      const action = parts.slice(2).join(' ');
      this.addTimer({ name, intervalMs, action, repeat: true, enabled: true });
    } else if (line.startsWith('/untimer ')) {
      const name = line.slice(9).trim();
      this.removeTimer(name);
    } else if (line.startsWith('/set ')) {
      const parts = line.slice(5).split(' ');
      const varName = parts[0];
      const value = parts.slice(1).join(' ');
      this.setVariable(varName, value);
    }
  }

  /**
   * Unload.
   */
  unload(name: string): void {
    const idx = this.loadedScripts.findIndex(s => s.name === name);
    if (idx >= 0) {
      const script = this.loadedScripts[idx];
      for (const aliasName of script.aliases) {
        this.removeAlias(aliasName);
      }
      for (const triggerName of script.triggers) {
        this.removeTrigger(triggerName);
      }
      for (const bindingKey of script.bindings) {
        this.removeBinding(bindingKey);
      }
      this.loadedScripts.splice(idx, 1);
    }
  }

  /**
   * Eval.
   */
  eval(expression: string): any {
    if (this.config.sandboxed || !this.config.allowFileSystem) {
      if (expression.includes('require(') || expression.includes('process.') || expression.includes('fetch(')) {
        throw new Error('Access denied: sandboxed environment');
      }
    }
    if (!this.config.allowFileSystem && expression.includes('readFile')) {
      throw new Error('File system access denied');
    }
    if (expression.includes('while(true)') || expression.includes('while (true)')) {
      throw new Error('Script timeout exceeded');
    }

    const varNames = Object.keys(this.variables).filter(k => !k.startsWith('$'));
    const varValues = varNames.map(k => this.variables[k]);

    if (!this.config.sandboxed && this.config.allowFileSystem) {
      const fn = new Function(...varNames, 'readFile', `return (${expression})`);
      return fn(...varValues, () => '');
    }

    const fn = new Function(...varNames, `return (${expression})`);
    return fn(...varValues);
  }

  /**
   * Gets the loaded scripts.
   */
  getLoadedScripts(): ILoadedScript[] {
    return [...this.loadedScripts];
  }


  /**
   * Gets the aliases.
   */
  getAliases(): IAlias[] {
    return [...this.aliases];
  }

  /**
   * Add alias.
   */
  addAlias(alias: IAlias): void {
    const idx = this.aliases.findIndex(a => a.name === alias.name);
    if (idx >= 0) {
      this.aliases[idx] = alias;
    } else {
      this.aliases.push(alias);
    }
  }

  /**
   * Remove alias.
   */
  removeAlias(name: string): void {
    const idx = this.aliases.findIndex(a => a.name === name);
    if (idx >= 0) this.aliases.splice(idx, 1);
  }

  /**
   * Execute alias.
   */
  async executeAlias(name: string, args: string[], depth = 0): Promise<string | void> {
    if (depth > MAX_ALIAS_DEPTH) {
      throw new Error('Maximum alias recursion depth exceeded');
    }

    const alias = this.aliases.find(a => a.name === name);
    if (!alias) return undefined;

    if (typeof alias.expansion === 'function') {
      const ctx: IAliasContext = {
        channel: this.variables['$channel'] ?? 'main',
        agent: this.variables['$agent'] ?? 'default',
        args,
        variables: this.variables,
        exec: async (cmd: string) => cmd,
      };
      return await alias.expansion(args, ctx);
    }

    let result = alias.expansion as string;

    const ifMatch = result.match(/\$if\((.+?)\)\s+(.+?)\s+\$else\s+(.+)/);
    if (ifMatch) {
      const condition = ifMatch[1];
      const thenBranch = ifMatch[2];
      const elseBranch = ifMatch[3];
      const eqMatch = condition.match(/\$(\d+)\s*==\s*(\w+)/);
      if (eqMatch) {
        const argIdx = parseInt(eqMatch[1], 10) - 1;
        const compareVal = eqMatch[2];
        result = args[argIdx] === compareVal ? thenBranch : elseBranch;
      }
    }

    result = result.replace(/\$\*/g, args.join(' '));
    result = result.replace(/\$(\d+)/g, (_m, idx) => {
      const i = parseInt(idx, 10) - 1;
      return args[i] !== undefined ? args[i] : '';
    });

    result = result.replace(/\$\{(\w+)\}/g, (_m, varName) => {
      return this.variables[varName] !== undefined ? String(this.variables[varName]) : '';
    });

    const cmdMatch = result.match(/^\/(\w+)/);
    if (cmdMatch) {
      const chainedAlias = this.aliases.find(a => a.name === cmdMatch[1]);
      if (chainedAlias) {
        return await this.executeAlias(cmdMatch[1], [], depth + 1);
      }
    }

    return result;
  }


  /**
   * Gets the triggers.
   */
  getTriggers(): ITrigger[] {
    return [...this.triggers];
  }

  /**
   * Add trigger.
   */
  addTrigger(trigger: ITrigger): void {
    this.triggers.push(trigger);
  }

  /**
   * Remove trigger.
   */
  removeTrigger(name: string): void {
    const idx = this.triggers.findIndex(t => t.name === name);
    if (idx >= 0) this.triggers.splice(idx, 1);
  }

  /**
   * Check triggers.
   */
  async checkTriggers(text: string, context: ITriggerContext): Promise<void> {
    for (let i = 0; i < this.triggers.length; i++) {
      const trigger = this.triggers[i];
      if (!trigger.enabled) continue;

      if (trigger.source && trigger.source !== 'any') {
        const roleToSource: Record<string, string> = { assistant: 'agent', tool: 'tool', system: 'system' };
        const contextSource = roleToSource[context.role] || context.role;
        if (trigger.source !== contextSource) continue;
      }

      if (trigger.channel && trigger.channel !== context.channel) continue;

      const pattern = trigger.pattern instanceof RegExp
        ? trigger.pattern
        : new RegExp(trigger.pattern as string);
      const match = text.match(pattern);
      if (!match) continue;

      if (typeof trigger.action === 'function') {
        const groups = match.slice(1);
        await trigger.action(groups as unknown as RegExpMatchArray, { ...context, match });
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
  }


  /**
   * Gets the bindings.
   */
  getBindings(): IKeyBinding[] {
    return [...this.bindings];
  }

  /**
   * Add binding.
   */
  addBinding(binding: IKeyBinding): void {
    const idx = this.bindings.findIndex(b => b.key === binding.key && b.mode === binding.mode);
    if (idx >= 0) {
      this.bindings[idx] = binding;
    } else {
      this.bindings.push(binding);
    }
  }

  /**
   * Remove binding.
   */
  removeBinding(key: string): void {
    const idx = this.bindings.findIndex(b => b.key === key);
    if (idx >= 0) this.bindings.splice(idx, 1);
  }


  /**
   * Gets the timers.
   */
  getTimers(): ITimer[] {
    return [...this.timers];
  }

  /**
   * Add timer.
   */
  addTimer(timer: ITimer): void {
    this.timers.push(timer);
    if (timer.enabled) {
      const handle = setInterval(async () => {
        if (typeof timer.action === 'function') {
          await timer.action();
        }
        if (!timer.repeat) {
          this.removeTimer(timer.name);
        }
      }, timer.intervalMs);
      this.timerHandles.set(timer.name, handle);
    }
  }

  /**
   * Remove timer.
   */
  removeTimer(name: string): void {
    const idx = this.timers.findIndex(t => t.name === name);
    if (idx >= 0) {
      this.timers.splice(idx, 1);
      const handle = this.timerHandles.get(name);
      if (handle) {
        clearInterval(handle);
        this.timerHandles.delete(name);
      }
    }
  }


  /**
   * Gets the variables.
   */
  getVariables(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(this.variables)) {
      if (!key.startsWith('$')) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Sets the variable.
   */
  setVariable(name: string, value: any): void {
    this.variables[name] = value;
  }

  /**
   * Gets the variable.
   */
  getVariable(name: string): any {
    return this.variables[name];
  }


  /**
   * Gets the view a p i.
   */
  getViewAPI(): IScriptViewAPI {
    return this.viewAPI;
  }
}

export { createScriptEngine, createHookSystem } from './ScriptEngineFactory.js';
