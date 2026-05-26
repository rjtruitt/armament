import type { ScriptContext, ScriptCommand, FontConfig, DisplayConfig } from './ArmaScriptTypes.js';
import { DEFAULT_FONT } from './ArmaScriptTypes.js';

/** Interface for CommandState.
 * @property {ScriptContext} ctx - Description of ctx.
 * @property {Record<string, any>} variables - Description of variables.
 * @property {Map<string, { pattern: string; expansion: string }>} aliases - Description of aliases.
 * @property {Map<string, { action: string; description?: string; mode?: string }>} bindings - Description of bindings.
 * @property {DisplayConfig} display - Description of display.
 * @property {any} lastResult - Description of lastResult.
 * @property {string} includeStack - Description of includeStack.
 * @property {string} errorMode - Description of errorMode.
 */
export interface CommandState {
  ctx: ScriptContext;
  variables: Record<string, any>;
  aliases: Map<string, { pattern: string; expansion: string }>;
  bindings: Map<string, { action: string; description?: string; mode?: string }>;
  display: DisplayConfig;
  lastResult: any;
  fileLoader: ((path: string) => Promise<string>) | null;
  includeStack: string[];
  errorMode: string;
  run: (scriptText: string) => Promise<void>;
  evalCondition: (condition: string) => boolean;
  interpolate: (text: string) => string;
  getVariable: (name: string) => any;
}

/** Execute command.
 * @param {ScriptCommand} cmd - Description of cmd.
 * @param {CommandState} state - Description of state.
 * @returns {Promise<void>} - Description of return value.
 */
export async function executeCommand(cmd: ScriptCommand, state: CommandState): Promise<void> {
  switch (cmd.command) {
    case 'theme':
      state.ctx.setConfig('theme', cmd.args[0]);
      state.display.theme = cmd.args[0];
      break;
    case 'font':
      handleFontCommand(cmd.args, state);
      break;
    case 'zoom':
      handleZoomCommand(cmd.args, state);
      break;
    case 'set':
      handleSetCommand(cmd.args, state);
      break;
    case 'unset':
      delete state.variables[cmd.args[0]];
      break;
    case 'log':
      state.ctx.log(cmd.args.join(' '));
      break;
    case 'spawn': {
      const opts = parseFlags(cmd.args.slice(1));
      state.lastResult = await state.ctx.spawn(cmd.args[0], opts);
      break;
    }
    case 'kill':
      await state.ctx.kill(cmd.args[0]);
      break;
    case 'msg':
      await state.ctx.msg(cmd.args[0], cmd.args.slice(1).join(' '));
      break;
    case 'broadcast':
      await state.ctx.broadcast(cmd.args.join(' '));
      break;
    case 'topic':
      await state.ctx.msg(cmd.args[0], `/topic ${cmd.args.slice(1).join(' ')}`);
      break;
    case 'notify':
      await state.ctx.notify(cmd.args[0], cmd.args.slice(1).join(' '));
      break;
    case 'sleep':
      await new Promise(resolve => setTimeout(resolve, parseInt(cmd.args[0]) || 0));
      break;
    case 'alias':
      state.aliases.set(cmd.args[0], { pattern: cmd.args[0], expansion: cmd.args.slice(1).join(' ') });
      break;
    case 'unalias':
      state.aliases.delete(cmd.args[0]);
      break;
    case 'bind':
      state.bindings.set(cmd.args[0], { action: cmd.args.slice(1).join(' '), mode: 'any' });
      break;
    case 'unbind':
      state.bindings.delete(cmd.args[0]);
      break;
    case 'sidebar':
      handleSidebarCommand(cmd.args, state);
      break;
    case 'display':
      handleDisplayCommand(cmd.args, state);
      break;
    case 'compact':
      state.display.compactMode = cmd.args[0] !== 'off';
      state.ctx.setConfig('display.compact', state.display.compactMode);
      break;
    case 'pin':
      if (cmd.args[0]) state.ctx.pin?.(cmd.args[0]);
      break;
    case 'unpin':
      if (cmd.args[0]) state.ctx.unpin?.(cmd.args[0]);
      break;
    case 'assert': {
      const cond = cmd.args[0] || '';
      const msg = cmd.args.slice(1).join(' ') || `Assertion failed: ${cond}`;
      if (!state.evalCondition(cond)) throw new Error(msg);
      break;
    }
    case 'onerror':
      if (cmd.args[0] === 'continue') state.errorMode = 'continue';
      else if (cmd.args[0] === 'stop') state.errorMode = 'stop';
      else if (cmd.args[0] === 'handler' && cmd.args[1]) state.errorMode = cmd.args[1];
      break;
    case 'include': {
      const filePath = cmd.args[0];
      if (!state.fileLoader) throw new Error('No file loader configured');
      if (state.includeStack.includes(filePath)) throw new Error(`Circular include detected: ${filePath}`);
      state.includeStack.push(filePath);
      try {
        const content = await state.fileLoader(filePath);
        await state.run(content);
      } finally {
        state.includeStack.pop();
      }
      break;
    }
    case 'timeout':
      state.variables['$_timeout'] = parseInt(cmd.args[0]) || 0;
      break;
  }
}

function setFontSize(size: number, state: CommandState): void {
  if (size < 8 || size > 48) throw new Error('Font size must be 8-48');
  state.display.font.size = size;
  state.ctx.setConfig('font.size', size);
}

function setFontFamily(family: string, state: CommandState): void {
  if (!family) throw new Error('Font family cannot be empty');
  state.display.font.family = family;
  state.ctx.setConfig('font.family', family);
}

function resetFont(state: CommandState): void {
  state.display.font = { ...DEFAULT_FONT };
  state.ctx.setConfig('font.size', DEFAULT_FONT.size);
  state.ctx.setConfig('font.family', DEFAULT_FONT.family);
}

function handleFontCommand(args: string[], state: CommandState): void {
  if (args.length === 0) return;
  const sub = args[0];
  switch (sub) {
    case 'size':
      if (args[1]) setFontSize(parseInt(args[1]), state);
      break;
    case 'family':
      if (args[1]) setFontFamily(args.slice(1).join(' '), state);
      break;
    case 'weight':
      if (args[1] && ['normal', 'bold', 'light'].includes(args[1])) {
        state.display.font.weight = args[1] as FontConfig['weight'];
        state.ctx.setConfig('font.weight', args[1]);
      }
      break;
    case 'lineheight':
      if (args[1]) {
        state.display.font.lineHeight = parseFloat(args[1]);
        state.ctx.setConfig('font.lineHeight', state.display.font.lineHeight);
      }
      break;
    case 'reset':
      resetFont(state);
      break;
    default: {
      const num = parseInt(sub);
      if (!isNaN(num)) setFontSize(num, state);
      break;
    }
  }
}

function handleZoomCommand(args: string[], state: CommandState): void {
  const dir = args[0];
  const step = args[1] ? parseInt(args[1]) : 2;
  if (dir === 'in' || dir === '+') setFontSize(Math.min(48, state.display.font.size + step), state);
  else if (dir === 'out' || dir === '-') setFontSize(Math.max(8, state.display.font.size - step), state);
  else if (dir === 'reset') resetFont(state);
  else { const size = parseInt(dir); if (!isNaN(size)) setFontSize(size, state); }
}

function handleSetCommand(args: string[], state: CommandState): void {
  if (args.length < 2) return;
  const name = args[0];
  let value: any = args.slice(1).join(' ');

  if (value.startsWith('(') && value.endsWith(')')) {
    const inner = value.slice(1, -1).trim();
    if (inner.startsWith('agents ')) {
      const idx = parseInt(inner.slice(7));
      const agents = state.ctx.getAgents();
      value = agents[idx] ?? null;
    } else {
      value = evalExpression(state.interpolate(inner), state);
    }
  } else {
    value = state.interpolate(value);
  }

  state.variables[name] = value;
  if (!name.startsWith('$')) state.ctx.setConfig(name, value);
}

function handleSidebarCommand(args: string[], state: CommandState): void {
  const sub = args[0];
  if (['left', 'right', 'hidden'].includes(sub)) {
    state.display.sidebarPosition = sub as DisplayConfig['sidebarPosition'];
    state.ctx.setConfig('sidebar.position', sub);
  } else if (sub === 'width' && args[1]) {
    state.display.sidebarWidth = parseInt(args[1]);
    state.ctx.setConfig('sidebar.width', state.display.sidebarWidth);
  }
}

function handleDisplayCommand(args: string[], state: CommandState): void {
  if (args.length < 2) return;
  const key = args[0];
  const value = args.slice(1).join(' ');
  switch (key) {
    case 'timestamps': state.display.timestamps = value !== 'off'; break;
    case 'thinking': state.display.showThinking = value !== 'off'; break;
    case 'tools': state.display.showToolCalls = value !== 'off'; break;
    case 'maxlines': state.display.maxOutputLines = parseInt(value); break;
  }
  state.ctx.setConfig(`display.${key}`, value);
}

function evalExpression(expr: string, state: CommandState): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 3) {
    const left = resolveValue(parts[0], state);
    const op = parts[1];
    const right = resolveValue(parts[2], state);
    const l = parseFloat(left) || 0;
    const r = parseFloat(right) || 0;
    switch (op) {
      case '+': return String(l + r);
      case '-': return String(l - r);
      case '*': return String(l * r);
      case '/': return r !== 0 ? String(l / r) : '0';
    }
  }
  return expr;
}

function resolveValue(token: string, state: CommandState): string {
  if (token.startsWith('$')) return String(state.getVariable(token));
  return token;
}

function parseFlags(args: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1]) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}
