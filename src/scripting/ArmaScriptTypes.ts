/** Execution context provided by the host application to script commands. */
export interface ScriptContext {
  spawn: (name: string, opts?: Record<string, any>) => Promise<string>;
  kill: (name: string) => Promise<void>;
  msg: (target: string, message: string) => Promise<void>;
  broadcast: (message: string) => Promise<void>;
  setConfig: (key: string, value: any) => void;
  getConfig: (key: string) => any;
  getAgents: () => Array<{ name: string; provider: string; status: string }>;
  findAgent: (name: string) => { name: string; provider: string; status: string } | null;
  notify: (channel: string, message: string) => Promise<void>;
  log: (message: string) => void;
  pin?: (filePath: string) => void;
  unpin?: (filePath: string) => void;
}
/** An event that can be emitted into the script event system. */
export interface ScriptEvent {
  type: 'agent:message' | 'agent:spawn' | 'agent:kill' | 'tool:call' | 'tool:result' | 'system' | 'user:input' | 'timer';
  source?: string;
  data?: any;
  timestamp: number;
}
/** A single parsed command from a .arma script. */
export interface ScriptCommand {
  command: string;
  args: string[];
  lineNumber: number;
  raw: string;
}
/** Abstract syntax tree produced by the ArmaScript parser. */
export interface ScriptAST {
  commands: ScriptCommand[];
  metadata?: {
    description?: string;
    author?: string;
    version?: string;
  };
}
/** Font configuration for terminal display. */
export interface FontConfig {
  size: number;
  family: string;
  weight: 'normal' | 'bold' | 'light';
  lineHeight: number;
}
/** Full display configuration controlled by script commands. */
export interface DisplayConfig {
  font: FontConfig;
  theme: string;
  sidebarPosition: 'left' | 'right' | 'hidden';
  sidebarWidth: number;
  compactMode: boolean;
  timestamps: boolean;
  showThinking: boolean;
  showToolCalls: boolean;
  maxOutputLines: number;
}
/**
 * DEFAULT_FONT constant.
 */
export const DEFAULT_FONT: FontConfig = {
  size: 13,
  family: 'monospace',
  weight: 'normal',
  lineHeight: 1.5,
};
/**
 * DEFAULT_DISPLAY constant.
 */
export const DEFAULT_DISPLAY: DisplayConfig = {
  font: { ...DEFAULT_FONT },
  theme: 'red',
  sidebarPosition: 'left',
  sidebarWidth: 180,
  compactMode: false,
  timestamps: false,
  showThinking: true,
  showToolCalls: true,
  maxOutputLines: 500,
};
/** All recognized slash-commands in the ArmaScript language. */
export const VALID_COMMANDS = new Set([
  'theme', 'font', 'set', 'unset', 'log', 'notify',
  'spawn', 'kill', 'msg', 'broadcast', 'topic', 'sleep',
  'alias', 'unalias', 'bind', 'unbind', 'trigger', 'untrigger',
  'timer', 'untimer', 'try', 'catch', 'endtry',
  'if', 'elif', 'else', 'endif',
  'sidebar', 'display', 'zoom', 'compact',
  'mute', 'unmute', 'watch', 'unwatch',
  'filter', 'pin', 'unpin', 'scroll',
  'macro', 'run',
  'define', 'enddefine', 'call', 'assert',
  'foreach', 'endfor', 'endforeach',
  'on', 'once', 'endon', 'off', 'onerror',
  'repeat', 'endrepeat', 'while', 'endwhile',
  'break', 'continue', 'include', 'timeout',
]);