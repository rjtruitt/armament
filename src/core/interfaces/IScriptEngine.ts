/** Interface for IScriptEngine. */
export interface IScriptEngine {
  load(path: string): Promise<void>;
  loadInline(code: string): void;
  unload(name: string): void;
  eval(expression: string): any;
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
  getVariables(): Record<string, any>;
  setVariable(name: string, value: any): void;
  getVariable(name: string): any;
}

/** Interface for ILoadedScript.
 * @property {string} name - Description of name.
 * @property {string} path - Description of path.
 * @property {string} version - Description of version.
 * @property {string} author - Description of author.
 * @property {string} description - Description of description.
 * @property {string} aliases - Description of aliases.
 * @property {string} triggers - Description of triggers.
 * @property {string} bindings - Description of bindings.
 * @property ... and 1 more properties.
 */
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

/** Interface for IAlias.
 * @property {string} name - Description of name.
 * @property {string} pattern - Description of pattern.
 * @property {string} expansion - Description of expansion.
 * @property {string} description - Description of description.
 * @property {string} script - Description of script.
 */
export interface IAlias {
  name: string;
  pattern: string;
  expansion: string | ((args: string[], context: IAliasContext) => Promise<string | void>);
  description?: string;
  script?: string;
}

/** Interface for IAliasContext.
 * @property {string} channel - Description of channel.
 * @property {string} agent - Description of agent.
 * @property {string} args - Description of args.
 * @property {Record<string, any>} variables - Description of variables.
 */
export interface IAliasContext {
  channel: string;
  agent: string;
  args: string[];
  variables: Record<string, any>;
  exec: (command: string) => Promise<string | void>;
}

/** Interface for ITrigger.
 * @property {string} name - Description of name.
 * @property {string} pattern - Description of pattern.
 * @property {string} action - Description of action.
 * @property {string} channel - Description of channel.
 * @property {boolean} enabled - Description of enabled.
 * @property {boolean} once - Description of once.
 * @property {string} description - Description of description.
 */
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

/** Interface for ITriggerContext.
 * @property {string} message - Description of message.
 * @property {string} channel - Description of channel.
 * @property {string} agent - Description of agent.
 * @property {string} role - Description of role.
 * @property {RegExpMatchArray} match - Description of match.
 */
export interface ITriggerContext {
  message: string;
  channel: string;
  agent: string;
  role: string;
  match: RegExpMatchArray | null;
  exec: (command: string) => Promise<string | void>;
}

/** Interface for IKeyBinding.
 * @property {string} key - Description of key.
 * @property {string} action - Description of action.
 * @property {string} description - Description of description.
 */
export interface IKeyBinding {
  key: string;
  action: string | (() => Promise<void>);
  description?: string;
  mode?: 'normal' | 'insert' | 'any';
}

/** Interface for ITimer.
 * @property {string} name - Description of name.
 * @property {number} intervalMs - Description of intervalMs.
 * @property {string} action - Description of action.
 * @property {boolean} repeat - Description of repeat.
 * @property {boolean} enabled - Description of enabled.
 * @property {string} description - Description of description.
 */
export interface ITimer {
  name: string;
  intervalMs: number;
  action: string | (() => Promise<void>);
  repeat: boolean;
  enabled: boolean;
  description?: string;
}

/** Interface for IScriptConfig.
 * @property {string} scriptsDir - Description of scriptsDir.
 * @property {string} flowsDir - Description of flowsDir.
 * @property {string} autoload - Description of autoload.
 * @property {string} autoloadFlows - Description of autoloadFlows.
 * @property {boolean} allowFileSystem - Description of allowFileSystem.
 * @property {boolean} allowNetwork - Description of allowNetwork.
 * @property {boolean} allowExec - Description of allowExec.
 * @property {number} maxExecutionMs - Description of maxExecutionMs.
 * @property ... and 2 more properties.
 */
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

/** Interface for IScriptViewAPI. */
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
