import type { ScriptContext, ScriptCommand, ScriptAST, DisplayConfig } from './ArmaScriptTypes.js';
import { DEFAULT_FONT, DEFAULT_DISPLAY } from './ArmaScriptTypes.js';
import { ArmaScriptParser } from './ArmaScriptParser.js';
import { executeCommand, CommandState } from './ArmaScriptCommands.js';
import { evalCondition, interpolate, resolveArgs, getCollection, RuntimeState } from './ArmaScriptRuntime.js';
import { logWarn } from '../core/index.js';

/** Class representing ArmaScriptExecutor. */
export class ArmaScriptExecutor {
  private ctx: ScriptContext;
  private parser: ArmaScriptParser;
  private variables: Record<string, any> = {};
  private aliases: Map<string, { pattern: string; expansion: string }> = new Map();
  private bindings: Map<string, { action: string; description?: string; mode?: string }> = new Map();
  private macros: Map<string, { body: string[]; args?: string[] }> = new Map();
  private eventHandlers: Map<string, Array<{ body: string[]; once: boolean }>> = new Map();
  private timerHandles: any[] = [];
  private maxIterations: number = 10000;
  private callDepth: number = 0;
  private maxCallDepth: number = 10;
  private errorMode: string = 'stop';
  private fileLoader: ((path: string) => Promise<string>) | null = null;
  private includeStack: string[] = [];
  private display: DisplayConfig = { ...DEFAULT_DISPLAY, font: { ...DEFAULT_FONT } };
  private lastResult: any = undefined;
  private lastError: string = '';

  constructor(ctx: ScriptContext, parser: ArmaScriptParser) {
    this.ctx = ctx;
    this.parser = parser;
  }

  /**
   * Gets the variables.
   */
  getVariables(): Record<string, any> { return this.variables; }
  /**
   * Gets the display.
   */
  getDisplay(): DisplayConfig { return { ...this.display, font: { ...this.display.font } }; }
  /**
   * Gets the event handlers.
   */
  getEventHandlers(event: string): Array<{ body: string[]; once: boolean }> { return this.eventHandlers.get(event) ?? []; }
  /**
   * Gets the macros.
   */
  getMacros(): string[] { return [...this.macros.keys()]; }

  /**
   * Sets the variable.
   */
  setVariable(name: string, value: any): void { this.variables[name] = value; }
  /**
   * Sets the max iterations.
   */
  setMaxIterations(max: number): void { this.maxIterations = max; }
  /**
   * Sets the file loader.
   */
  setFileLoader(loader: (path: string) => Promise<string>): void { this.fileLoader = loader; }

  /**
   * Gets the variable.
   */
  getVariable(name: string): any {
    if (name === '$time') return Date.now().toString();
    if (name === '$result') return this.lastResult ?? '';
    if (name === '$error') return this.lastError;
    if (name === '$user') return this.ctx.getConfig('user') ?? '';
    return this.variables[name] ?? '';
  }

  /**
   * Gets the font size.
   */
  getFontSize(): number { return this.display.font.size; }

  /**
   * Sets the font size.
   */
  setFontSize(size: number): void {
    if (size < 8 || size > 48) throw new Error('Font size must be 8-48');
    this.display.font.size = size;
    this.ctx.setConfig('font.size', size);
  }

  /**
   * Gets the font family.
   */
  getFontFamily(): string { return this.display.font.family; }

  /**
   * Sets the font family.
   */
  setFontFamily(family: string): void {
    if (!family) throw new Error('Font family cannot be empty');
    this.display.font.family = family;
    this.ctx.setConfig('font.family', family);
  }

  /**
   * Zoom in.
   */
  zoomIn(step: number = 2): void {
    this.setFontSize(Math.min(48, this.display.font.size + step));
  }

  /**
   * Zoom out.
   */
  zoomOut(step: number = 2): void {
    this.setFontSize(Math.max(8, this.display.font.size - step));
  }

  /**
   * Reset font.
   */
  resetFont(): void {
    this.display.font = { ...DEFAULT_FONT };
    this.ctx.setConfig('font.size', DEFAULT_FONT.size);
    this.ctx.setConfig('font.family', DEFAULT_FONT.family);
  }

  /**
   * Emit.
   */
  async emit(event: { type: string; data?: any; timestamp?: number }): Promise<void> {
    const handlers = this.eventHandlers.get(event.type) ?? [];
    const remaining: Array<{ body: string[]; once: boolean }> = [];
    for (const handler of handlers) {
      this.variables['$event'] = event.data ?? {};
      await this.run(handler.body.join('\n'));
      if (!handler.once) remaining.push(handler);
    }
    this.eventHandlers.set(event.type, remaining);
  }

  /**
   * Run.
   */
  async run(scriptText: string): Promise<void> {
    const ast = this.parser.parse(scriptText);
    await this.executeBlock(ast.commands, {});
  }

  /**
   * Execute.
   */
  async execute(ast: ScriptAST): Promise<void> {
    await this.executeBlock(ast.commands, {});
  }

  /**
   * Dispose.
   */
  dispose(): void {
    for (const handle of this.timerHandles) clearInterval(handle);
    this.timerHandles = [];
    this.eventHandlers.clear();
  }

  private getRuntimeState(): RuntimeState {
    return { ctx: this.ctx, variables: this.variables, getVariable: (n) => this.getVariable(n) };
  }

  private getCommandState(): CommandState {
    return {
      ctx: this.ctx,
      variables: this.variables,
      aliases: this.aliases,
      bindings: this.bindings,
      display: this.display,
      lastResult: this.lastResult,
      fileLoader: this.fileLoader,
      includeStack: this.includeStack,
      errorMode: this.errorMode,
      run: (text) => this.run(text),
      evalCondition: (c) => evalCondition(c, this.getRuntimeState()),
      interpolate: (t) => interpolate(t, this.getRuntimeState()),
      getVariable: (n) => this.getVariable(n),
    };
  }

  private syncFromCommandState(state: CommandState): void {
    this.lastResult = state.lastResult;
    this.errorMode = state.errorMode;
  }

  /**
   * Execute block.
   */
  async executeBlock(commands: ScriptCommand[], scope: Record<string, any>): Promise<'break' | 'continue' | void> {
    const rs = this.getRuntimeState();
    let i = 0;
    while (i < commands.length) {
      const cmd = commands[i];
      const resolved = resolveArgs(cmd, rs);

      if (resolved.command === 'on' || resolved.command === 'once') {
        i = this.handleEventBlock(commands, i, resolved);
        continue;
      }
      if (resolved.command === 'off') {
        this.eventHandlers.delete(resolved.args[0]);
        i++;
        continue;
      }
      if (resolved.command === 'define') {
        i = this.handleDefineBlock(commands, i, resolved);
        continue;
      }
      if (resolved.command === 'call') {
        await this.handleCall(resolved);
        i++;
        continue;
      }
      if (resolved.command === 'repeat') {
        i = await this.handleRepeat(commands, i, resolved, scope);
        continue;
      }
      if (resolved.command === 'while') {
        i = await this.handleWhile(commands, i, cmd, scope);
        continue;
      }
      if (resolved.command === 'foreach') {
        i = await this.handleForEach(commands, i, resolved, scope);
        continue;
      }
      if (resolved.command === 'if') {
        const result = await this.handleIf(commands, i, resolved, scope);
        if (typeof result === 'string') return result as 'break' | 'continue';
        i = result;
        continue;
      }
      if (resolved.command === 'try') {
        i = await this.handleTry(commands, i, scope);
        continue;
      }
      if (resolved.command === 'break') return 'break';
      if (resolved.command === 'continue') return 'continue';

      await this.runCommand(resolved, cmd);
      i++;
    }
  }

  private handleEventBlock(commands: ScriptCommand[], i: number, resolved: ScriptCommand): number {
    const eventName = resolved.args[0];
    const isOnce = resolved.command === 'once';
    const body: string[] = [];
    i++;
    while (i < commands.length && commands[i].command !== 'endon') {
      body.push(commands[i].raw);
      i++;
    }
    if (eventName.startsWith('timer:')) {
      const ms = parseInt(eventName.slice(6));
      if (ms > 0) {
        const handle = setInterval(async () => {
          try { await this.run(body.join('\n')); }
          catch (err) { logWarn('ArmaScript', `Timer handler "${eventName}" threw`, err); }
        }, ms);
        this.timerHandles.push(handle);
      }
    } else {
      const handlers = this.eventHandlers.get(eventName) ?? [];
      handlers.push({ body, once: isOnce });
      this.eventHandlers.set(eventName, handlers);
    }
    return i + 1;
  }

  private handleDefineBlock(commands: ScriptCommand[], i: number, resolved: ScriptCommand): number {
    const macroName = resolved.args[0];
    const body: string[] = [];
    i++;
    while (i < commands.length && commands[i].command !== 'enddefine') {
      body.push(commands[i].raw);
      i++;
    }
    this.macros.set(macroName, { body });
    return i + 1;
  }

  private async handleCall(resolved: ScriptCommand): Promise<void> {
    const macroName = resolved.args[0];
    const macroArgs = resolved.args.slice(1);
    const macro = this.macros.get(macroName);
    if (!macro) return;
    this.callDepth++;
    if (this.callDepth > this.maxCallDepth) {
      this.callDepth--;
      throw new Error('Max recursion depth exceeded');
    }
    const savedVars = { ...this.variables };
    macroArgs.forEach((a, idx) => { this.variables[`$${idx + 1}`] = a; });
    this.variables['$args'] = macroArgs;
    await this.run(macro.body.join('\n'));
    this.variables = savedVars;
    this.callDepth--;
  }

  private async handleRepeat(commands: ScriptCommand[], i: number, resolved: ScriptCommand, scope: Record<string, any>): Promise<number> {
    const count = parseInt(resolved.args[0]) || 0;
    const body: ScriptCommand[] = [];
    let depth = 1;
    i++;
    while (i < commands.length && depth > 0) {
      if (commands[i].command === 'repeat') depth++;
      if (commands[i].command === 'endrepeat') { depth--; if (depth === 0) break; }
      body.push(commands[i]);
      i++;
    }
    let iterations = 0;
    for (let n = 0; n < count; n++) {
      if (++iterations > this.maxIterations) throw new Error('Max iterations exceeded');
      const result = await this.executeBlock(body, scope);
      if (result === 'break') break;
    }
    return i + 1;
  }

  private async handleWhile(commands: ScriptCommand[], i: number, cmd: ScriptCommand, scope: Record<string, any>): Promise<number> {
    const rawCondition = cmd.args.join(' ');
    const body: ScriptCommand[] = [];
    let depth = 1;
    i++;
    while (i < commands.length && depth > 0) {
      if (commands[i].command === 'while') depth++;
      if (commands[i].command === 'endwhile') { depth--; if (depth === 0) break; }
      body.push(commands[i]);
      i++;
    }
    let iterations = 0;
    const rs = this.getRuntimeState();
    while (evalCondition(interpolate(rawCondition, rs), rs)) {
      if (++iterations > this.maxIterations) throw new Error('Max iterations exceeded');
      const result = await this.executeBlock(body, scope);
      if (result === 'break') break;
    }
    return i + 1;
  }

  private async handleForEach(commands: ScriptCommand[], i: number, resolved: ScriptCommand, scope: Record<string, any>): Promise<number> {
    const varName = resolved.args[0];
    const collectionName = resolved.args[2];
    const body: ScriptCommand[] = [];
    let depth = 1;
    i++;
    while (i < commands.length && depth > 0) {
      if (commands[i].command === 'foreach') depth++;
      if (commands[i].command === 'endfor' || commands[i].command === 'endforeach') { depth--; if (depth === 0) break; }
      body.push(commands[i]);
      i++;
    }
    const collection = getCollection(collectionName, this.ctx);
    for (const item of collection) {
      this.variables[varName] = item;
      const result = await this.executeBlock(body, scope);
      if (result === 'break') break;
    }
    return i + 1;
  }

  private async handleIf(commands: ScriptCommand[], i: number, resolved: ScriptCommand, scope: Record<string, any>): Promise<number | 'break' | 'continue'> {
    const branches: Array<{ condition: string | null; body: ScriptCommand[] }> = [];
    let currentCondition: string | null = resolved.args.join(' ');
    let currentBody: ScriptCommand[] = [];
    let depth = 1;
    i++;
    while (i < commands.length && depth > 0) {
      if (commands[i].command === 'if') depth++;
      if (commands[i].command === 'endif') { depth--; if (depth === 0) break; }
      if (depth === 1 && commands[i].command === 'elif') {
        branches.push({ condition: currentCondition, body: currentBody });
        currentCondition = commands[i].args.join(' ');
        currentBody = [];
        i++;
        continue;
      }
      if (depth === 1 && commands[i].command === 'else') {
        branches.push({ condition: currentCondition, body: currentBody });
        currentCondition = null;
        currentBody = [];
        i++;
        continue;
      }
      currentBody.push(commands[i]);
      i++;
    }
    branches.push({ condition: currentCondition, body: currentBody });
    const rs = this.getRuntimeState();
    for (const branch of branches) {
      if (branch.condition === null || evalCondition(interpolate(branch.condition, rs), rs)) {
        const result = await this.executeBlock(branch.body, scope);
        if (result) return result;
        break;
      }
    }
    return i + 1;
  }

  private async handleTry(commands: ScriptCommand[], i: number, scope: Record<string, any>): Promise<number> {
    const tryBody: ScriptCommand[] = [];
    const catchBody: ScriptCommand[] = [];
    let inCatch = false;
    i++;
    while (i < commands.length && commands[i].command !== 'endtry') {
      if (commands[i].command === 'catch') { inCatch = true; i++; continue; }
      if (inCatch) catchBody.push(commands[i]);
      else tryBody.push(commands[i]);
      i++;
    }
    try {
      await this.executeBlock(tryBody, scope);
    } catch (err: any) {
      this.lastError = err.message;
      this.variables['$error'] = err.message;
      await this.executeBlock(catchBody, scope);
    }
    return i + 1;
  }

  private async runCommand(resolved: ScriptCommand, cmd: ScriptCommand): Promise<void> {
    try {
      const timeoutMs = this.variables['$_timeout'] as number || 0;
      const state = this.getCommandState();
      if (timeoutMs > 0) {
        const cmdPromise = executeCommand(resolved, state);
        cmdPromise.catch(() => {});
        let rejectTimeout: (e: Error) => void;
        let timer: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject; });
        timeoutPromise.catch(() => {});
        timer = setTimeout(() => rejectTimeout(new Error('Command timeout exceeded')), timeoutMs);
        try {
          await Promise.race([cmdPromise, timeoutPromise]);
        } finally {
          clearTimeout(timer);
        }
      } else {
        await executeCommand(resolved, state);
      }
      this.syncFromCommandState(state);
    } catch (err: any) {
      if (this.errorMode === 'continue') {
        logWarn('ArmaScript', `Command /${cmd.command} failed (continue mode)`, err);
      } else if (this.errorMode !== 'stop' && this.macros.has(this.errorMode)) {
        this.variables['$error'] = err.message;
        const macro = this.macros.get(this.errorMode)!;
        await this.run(macro.body.join('\n'));
      } else {
        throw err;
      }
    }
  }
}
