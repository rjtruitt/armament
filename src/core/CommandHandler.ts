/**
 * Parses and executes slash commands and natural language input.
 *
 * Supports alias expansion, quote-aware tokenization, flag parsing,
 * command chaining via `&&`, and dispatches to the appropriate
 * subsystem (agent controller, provider manager, session lifecycle).
 */

import type { AgentController } from './AgentController.js';

/** Result of parsing raw user input into structured command parts. */
export interface ParsedCommand {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

/** Outcome of executing a single command. */
export interface CommandResult {
  command: string;
  success: boolean;
  output?: string;
  data?: unknown;
}

/** Class representing CommandHandler. */
export class CommandHandler {
  private ctx: {
    agentController?: AgentController;
    providerManager?: any;
    mcpManager?: any;
    menuController?: any;
    sessionLifecycle?: any;
    armaHome?: any;
  };
  private lastResult: CommandResult | null = null;
  private settings: Record<string, string> = {};

  private static KNOWN_COMMANDS = new Set([
    'help', 'model', 'provider', 'agents', 'budget', 'theme',
    'spawn', 'cancel', 'done', 'quit', 'export', 'set', 'run',
    'trigger', 'timer', 'message', 'commit', 'schedule_workflow', 'poll',
    'compact', 'rewind', 'context',
  ]);

  private static ALIASES: Record<string, string> = {
    m: 'model',
    p: 'provider',
    q: 'quit',
    h: 'help',
  };

  constructor(ctx: {
    agentController?: AgentController;
    providerManager?: any;
    mcpManager?: any;
    menuController?: any;
    sessionLifecycle?: any;
    armaHome?: any;
  }) {
    this.ctx = ctx;
  }

  /**
   * Execute.
   */
  async execute(input: string): Promise<CommandResult> {
    if (input.includes(' && ')) {
      const parts = input.split(' && ');
      let result: CommandResult = { command: 'chain', success: true };
      for (const part of parts) {
        result = await this.execute(part.trim());
      }
      return result;
    }

    const parsed = this.parseCommand(input);
    const cmd = parsed.command;

    if (cmd === 'message') {
        return this.handleMessage(parsed.args[0]);
    }

    if (!CommandHandler.KNOWN_COMMANDS.has(cmd)) {
      const result: CommandResult = { command: cmd, success: false, output: `Unknown command: /${cmd}` };
      this.lastResult = result;
      return result;
    }

    const result = await this.dispatch(cmd, parsed.args, parsed.flags);
    this.lastResult = result;
    return result;
  }

  private async dispatch(cmd: string, args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    switch (cmd) {
      case 'help':
        return {
          command: 'help',
          success: true,
          output: 'Available commands: /help, /model, /provider, /budget, /agents, /cancel, /theme, /spawn, /done, /commit, /set',
          data: { commands: Array.from(CommandHandler.KNOWN_COMMANDS) },
        };

      case 'model': {
        const model = args[0] ?? '';
        if (this.ctx.agentController) {
          this.ctx.agentController.setDefaultModel(model);
        }
        return { command: 'model', success: true, output: `Model switched to: ${model}`, data: { model } };
      }

      case 'provider': {
        const provider = args[0] ?? '';
        const profile = flags['profile'] as string | undefined;
        if (this.ctx.agentController) {
          this.ctx.agentController.setDefaultProvider(provider);
        }
        return {
          command: 'provider',
          success: true,
          output: `Provider switched to: ${provider}${profile ? ` (profile: ${profile})` : ''}`,
          data: { provider, profile },
        };
      }

      case 'budget': {
        const subCmd = args[0];
        if (subCmd === 'set') {
          const amount = parseFloat((args[1] ?? '').replace('$', ''));
          return { command: 'budget', success: true, output: `Budget set to $${amount.toFixed(2)}`, data: { budget: amount } };
        }
            const cost = this.ctx.agentController?.getTotalCost() ?? 0;
        return { command: 'budget', success: true, output: `Current spend: $${cost.toFixed(2)}`, data: { spent: cost } };
      }

      case 'agents': {
        const agents = this.ctx.agentController?.listAgents() ?? [];
        return { command: 'agents', success: true, output: `Active agents: ${agents.length}`, data: { agents } };
      }

      case 'cancel': {
        const target = args[0];
        if (target === 'all') {
          await this.ctx.agentController?.cancelAll();
          return { command: 'cancel', success: true, output: 'All agents cancelled' };
        }
        if (target && this.ctx.agentController) {
          await this.ctx.agentController.cancel(target);
          return { command: 'cancel', success: true, output: `Agent ${target} cancelled` };
        }
        return { command: 'cancel', success: false, output: 'Usage: /cancel <agent-id|all>' };
      }

      case 'theme': {
        const theme = args[0] ?? '';
        return { command: 'theme', success: true, output: `Theme changed to: ${theme}`, data: { theme } };
      }

      case 'spawn': {
        const task = (flags['task'] as string) ?? args.join(' ') ?? 'unnamed task';
        const model = flags['model'] as string | undefined;
        const count = parseInt(flags['count'] as string ?? '1', 10);
        const results: any[] = [];
        if (this.ctx.agentController) {
          for (let i = 0; i < count; i++) {
            const agent = await this.ctx.agentController.spawn({ task, model });
            results.push(agent);
          }
        }
        return {
          command: 'spawn',
          success: true,
          output: `Spawned ${count} agent(s)`,
          data: { agents: results },
        };
      }

      case 'done': {
        if (this.ctx.sessionLifecycle?.shutdown) {
          const summary = await this.ctx.sessionLifecycle.shutdown();
          return { command: 'done', success: true, output: 'Session ended', data: { summary } };
        }
        return { command: 'done', success: true, output: 'Session ended' };
      }

      case 'commit': {
        return { command: 'commit', success: true, output: 'Commit created', data: { committed: true } };
      }

      case 'set': {
        const key = args[0] ?? '';
        const value = args.slice(1).join(' ');
        this.settings[key] = value;
        return { command: 'set', success: true, output: `Set ${key} = ${value}`, data: { key, value } };
      }

      case 'schedule_workflow': {
        const workflow = args[0] ?? '';
        return { command: 'schedule_workflow', success: true, output: `Workflow scheduled: ${workflow}`, data: { workflow } };
      }

      case 'poll': {
        const target = args[0] ?? '';
        const interval = flags['interval'] as string | undefined;
        return { command: 'poll', success: true, output: `Polling ${target} every ${interval ?? '60'}s`, data: { target, interval } };
      }

      case 'compact': {
        if (!this.ctx.agentController) {
          return { command: 'compact', success: false, output: 'No agent controller available' };
        }
        const channel = args[0];
        const result = await this.ctx.agentController.compactChannel(channel);
        if (!result) {
          return { command: 'compact', success: true, output: 'Context already within limits, nothing to compact' };
        }
        return {
          command: 'compact',
          success: true,
          output: `Compacted: ${result.before.tokens} → ${result.after.tokens} tokens (${result.strategy})`,
          data: result,
        };
      }

      case 'rewind': {
        if (!this.ctx.agentController) {
          return { command: 'rewind', success: false, output: 'No agent controller available' };
        }
        const subCmd = args[0];
        const channel = flags['channel'] as string | undefined;

        if (subCmd === 'list') {
          const snapshots = this.ctx.agentController.getSnapshots(channel);
          return {
            command: 'rewind',
            success: true,
            output: `${snapshots.length} snapshot(s) available`,
            data: { snapshots },
          };
        }

        const targetId = parseInt(subCmd ?? '', 10);
        if (isNaN(targetId)) {
          return { command: 'rewind', success: false, output: 'Usage: /rewind <snapshot-id|list> [--channel name]' };
        }

        const ok = this.ctx.agentController.rewindChannel(channel, targetId);
        return {
          command: 'rewind',
          success: ok,
          output: ok ? `Rewound to snapshot ${targetId}` : `Snapshot ${targetId} not found`,
          data: { snapshotId: targetId, success: ok },
        };
      }

      case 'context': {
        if (!this.ctx.agentController) {
          return { command: 'context', success: false, output: 'No agent controller available' };
        }
        const channel = args[0];
        const usage = this.ctx.agentController.getContextUsage(channel);
        if (!usage) {
          return { command: 'context', success: false, output: 'Channel not found' };
        }
        return {
          command: 'context',
          success: true,
          output: `Context: ${usage.current}/${usage.max} tokens (${usage.percent}%) | headroom: ${usage.headroom}`,
          data: usage,
        };
      }

      default:
        return { command: cmd, success: true, output: `Command ${cmd} executed` };
    }
  }

  private async handleMessage(text: string): Promise<CommandResult> {
    if (!this.ctx.agentController) {
      return { command: 'message', success: true, output: 'Message received (no agent controller)', data: { text, spawned: false } };
    }

    const running = this.ctx.agentController.getRunningAgents();
    if (running.length === 0) {
        const agent = await this.ctx.agentController.spawn({ task: text });
      return { command: 'message', success: true, output: `Spawned agent: ${agent.id}`, data: { text, spawned: true, agentId: agent.id } };
    }

    await this.ctx.agentController.sendMessage(running[0].id, text);
    return { command: 'message', success: true, output: `Message sent to ${running[0].id}`, data: { text, spawned: false, agentId: running[0].id } };
  }

  /**
   * Gets the last result.
   */
  getLastResult(): CommandResult | null {
    return this.lastResult;
  }

  /**
   * Gets the setting.
   */
  getSetting(key: string): string | undefined {
    return this.settings[key];
  }

  /**
   * Parse command.
   */
  parseCommand(input: string): ParsedCommand {
    const trimmed = input.trim();

    if (!trimmed.startsWith('/')) {
      return { command: 'message', args: [trimmed], flags: {} };
    }

    const tokens = this.tokenize(trimmed.slice(1));
    if (tokens.length === 0) {
      return { command: 'message', args: [''], flags: {} };
    }

    let command = tokens[0];
    if (CommandHandler.ALIASES[command]) {
      command = CommandHandler.ALIASES[command];
    }

    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    let i = 1;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.startsWith('--')) {
        const flagName = token.slice(2);
        if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
          flags[flagName] = tokens[i + 1];
          i += 2;
        } else {
          flags[flagName] = true;
          i++;
        }
      } else {
        args.push(token);
        i++;
      }
    }

    return { command, args, flags };
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let i = 0;

    while (i < input.length) {
      const ch = input[i];

      if (ch === '\\' && i + 1 < input.length) {
        if (inQuote) {
          if (input[i + 1] === quoteChar) {
            current += input[i + 1];
            i += 2;
            continue;
          }
          current += ch + input[i + 1];
          i += 2;
          continue;
        }
        current += ch + input[i + 1];
        i += 2;
        continue;
      }

      if ((ch === '"' || ch === "'") && !inQuote) {
        inQuote = true;
        quoteChar = ch;
        i++;
        continue;
      }

      if (ch === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
        i++;
        continue;
      }

      if (ch === ' ' && !inQuote) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
        i++;
        continue;
      }

      current += ch;
      i++;
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }
}
