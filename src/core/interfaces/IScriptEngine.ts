/** Scripting engine for loading, aliasing, triggering, and binding custom commands. */
export interface IScriptEngine {
  load(path: string): Promise<void>;
  loadInline(code: string): void;
  unload(name: string): void;
  eval(expression: string): unknown;
  getLoadedScripts(): ILoadedScript[];
  getAliases(): IAlias[];
  getTriggers(): ITrigger[];
  getBindings(): IKeyBinding[];
  getTimers(): ITimer[];
  addAlias(alias: IAlias): void;
  removeAlias(name: string): void;
  addTrigger(trigger: ITrigger): void;
  removeTrigger(name: string): void;
  addBinding(binding: IKeyBinding): void;
  removeBinding(key: string): void;
  addTimer(timer: ITimer): void;
  removeTimer(name: string): void;
  executeAlias(name: string, args: string[]): Promise<string | void>;
  checkTriggers(text: string, context: ITriggerContext): Promise<void>;
  getVariables(): Record<string, unknown>;
  setVariable(name: string, value: unknown): void;
  getVariable(name: string): unknown;
}

/** A script loaded from a file or inline code. */
export interface ILoadedScript {
  name: string;
  path?: string;
  version?: string;
  author?: string;
  description?: string;
  aliases: string[];
  triggers: string[];
  bindings: string[];
  loadedAt: number;
}

/** Command alias — expands a pattern into a command with argument interpolation. */
export interface IAlias {
  name: string;
  pattern: string;
  expansion: string | ((args: string[], context: IAliasContext) => Promise<string | void>);
  description?: string;
  script?: string;
}

/** Context passed to an alias expansion handler. */
export interface IAliasContext {
  channel: string;
  agent: string;
  args: string[];
  variables: Record<string, unknown>;
  exec: (command: string) => Promise<string | void>;
}

/** Pattern-based trigger that fires when matching text is seen (agent output, tool results, etc.). */
export interface ITrigger {
  name: string;
  pattern: string | RegExp;
  action: string | ((match: RegExpMatchArray, context: ITriggerContext) => Promise<void>);
  source?: 'agent' | 'tool' | 'system' | 'any';
  channel?: string;
  enabled: boolean;
  once?: boolean;
  description?: string;
}

/** Context passed to a trigger handler when its pattern matches. */
export interface ITriggerContext {
  message: string;
  channel: string;
  agent: string;
  role: string;
  match: RegExpMatchArray | null;
  exec: (command: string) => Promise<string | void>;
}

/** Keyboard shortcut bound to an action or command. */
export interface IKeyBinding {
  key: string;
  action: string | (() => Promise<void>);
  description?: string;
  mode?: 'normal' | 'insert' | 'any';
}

/** Recurring timer that executes an action at a fixed interval. */
export interface ITimer {
  name: string;
  intervalMs: number;
  action: string | (() => Promise<void>);
  repeat: boolean;
  enabled: boolean;
  description?: string;
}

/** Configuration for the scripting subsystem. */
export interface IScriptConfig {
  scriptsDir: string;
  flowsDir: string;
  autoload: string[];
  autoloadFlows: string[];
  allowFileSystem: boolean;
  allowNetwork: boolean;
  allowExec: boolean;
  maxExecutionMs: number;
  sandboxed: boolean;
  model?: string;
}

/** View manipulation API exposed to scripts (focus, mute, sidebar, notifications). */
export interface IScriptViewAPI {
  setViewMode(mode: 'feed' | 'focus' | 'split' | 'watch'): void;
  setFocus(agentId: string): void;
  clearFocus(): void;
  muteAgent(agentId: string, options?: { output?: boolean; notifications?: boolean; allowErrors?: boolean; allowMentions?: boolean }): void;
  unmuteAgent(agentId: string): void;
  watchAgent(agentId: string): void;
  unwatchAgent(agentId: string): void;
  pinMessage(index: number): void;
  unpinMessage(index: number): void;
  setSidebarPosition(position: 'left' | 'right' | 'top' | 'bottom' | 'hidden'): void;
  setSidebarWidth(cols: number): void;
  getAgentStatus(agentId: string): string;
  getAgentList(): Array<{ id: string; name: string; status: string }>;
  setFilter(filter: { agents?: string[]; types?: string[]; search?: string }): void;
  clearFilter(): void;
  scrollTo(position: number): void;
  setPriority(agentId: string, level: 'high' | 'normal' | 'low' | 'background'): void;
  createGroup(name: string, agentIds: string[]): void;
  collapseGroup(groupId: string): void;
  expandGroup(groupId: string): void;
  notify(message: string, options?: { level?: 'info' | 'warn' | 'error'; sound?: boolean }): void;
}
