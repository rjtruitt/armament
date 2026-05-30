#!/usr/bin/env node
import { UserConfig } from '../config/UserConfig.js';
/**
 * DebugShell — Interactive/batch debug CLI for armament.
 *
 * Purpose: Expose every internal subsystem for script/AI consumption.
 * Not for humans — JSON output is the default for machine parsing.
 *
 * Usage:
 *   arma --shell                          Interactive REPL
 *   arma --shell channel list             One-shot, JSON output
 *   arma --shell --json drift snapshots   One-shot, explicit JSON
 *   echo "channel list" | arma --shell    Piped input, batch mode
 *   arma --debug channel list             Also works (uses remaining args after --debug)
 *
 * Subsystems:
 *   channel   List/join/leave/inspect channels
 *   session   Inspect/clear/export session state
 *   drift     Snapshot/rollback/tree/diff/grep/status
 *   tool      List/run/describe tools
 *   mcp       List/restart/discover MCP servers
 *   a2a       Spawn/status/cancel workers
 *   config    Get/set config values
 *   provider  List providers/models
 *   agent     Inspect agent state/turns/tokens
 */

import { createInterface } from 'readline';
import type { ArmamentApp } from '../app/ArmamentApp.js';

/** Result from a debug command handler. */
interface DebugResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** A registered debug command group. */
interface DebugCommandGroup {
  name: string;
  description: string;
  commands: Record<string, {
    description: string;
    handler: (args: string[], app: ArmamentApp) => DebugResult | Promise<DebugResult>;
  }>;
}

/** Format output for display vs machine consumption. */
function formatOutput(result: DebugResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);
  if (!result.success) return `✗ ${result.error ?? 'Unknown error'}`;
  if (result.data === undefined) return "OK";
  if (typeof result.data === "string") return result.data;
  return JSON.stringify(result.data, null, 2);
}

/**
 * Run the debug shell.
 * If commands are passed as remaining args, runs in batch mode and exits.
 * Otherwise starts an interactive REPL.
 */
export async function runDebugShell(app: ArmamentApp, remainingArgs: string[], jsonFlag: boolean): Promise<void> {
  const groups = getCommandGroups();

  // Batch mode: run a command and output
  if (remainingArgs.length > 0) {
    const result = await dispatchCommand(remainingArgs, groups, app);
    process.stdout.write(formatOutput(result, jsonFlag) + '\n');
    return;
  }

  // Pipe mode: check if stdin has data
  const isPipe = !process.stdin.isTTY;
  if (isPipe) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const lines = input.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 0) continue;
      const result = await dispatchCommand(parts, groups, app);
      process.stdout.write(formatOutput(result, jsonFlag) + '\n');
    }
    return;
  }

  // Interactive REPL mode
  process.stdout.write('Armament Debug Shell (JSON output for script consumption)\n');
  process.stdout.write('Type "help" for commands, "quit" to exit.\n\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'debug> ',
    terminal: true,
  });

  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); continue; }
    if (trimmed === 'quit' || trimmed === 'exit') break;
    if (trimmed === 'help') {
      for (const g of groups) {
        process.stdout.write(`\n${g.name} — ${g.description}\n`);
        for (const [cmd, def] of Object.entries(g.commands)) {
          process.stdout.write(`  ${cmd.padEnd(20)} ${def.description}\n`);
        }
      }
      process.stdout.write('\n');
      rl.prompt();
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const result = await dispatchCommand(parts, groups, app);
    process.stdout.write(formatOutput(result, jsonFlag) + '\n\n');
    rl.prompt();
  }

  rl.close();
}

/** Parse remaining args after --debug and dispatch to the right handler. */
async function dispatchCommand(
  parts: string[],
  groups: DebugCommandGroup[],
  app: ArmamentApp,
): Promise<DebugResult> {
  if (parts.length === 0) return { success: false, error: 'No command' };

  const subsystem = parts[0];
  const group = groups.find(g => g.name === subsystem);
  if (!group) {
    const available = groups.map(g => g.name).join(', ');
    return { success: false, error: `Unknown subsystem "${subsystem}". Available: ${available}` };
  }

  const cmd = parts[1];
  if (!cmd) {
    const cmds = Object.keys(group.commands).join(', ');
    return { success: false, error: `Missing command for "${subsystem}". Available: ${cmds}` };
  }

  const handler = group.commands[cmd];
  if (!handler) {
    const cmds = Object.keys(group.commands).join(', ');
    return { success: false, error: `Unknown command "${cmd}" for "${subsystem}". Available: ${cmds}` };
  }

  const cmdArgs = parts.slice(2);
  try {
    return await handler.handler(cmdArgs, app);
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Register all debug command groups. */
function getCommandGroups(): DebugCommandGroup[] {
  return [
    {
      name: 'channel',
      description: 'Channel operations',
      commands: {
        list: {
          description: 'List all channels with agent info',
          handler: (_args, app) => {
            const agents = (app as any)._channelAgents as Map<string, any> | undefined;
            if (!agents) return { success: true, data: [] };
            const channels = Array.from(agents.entries()).map(([name, agent]) => ({
              channel: name,
              model: agent.model,
              provider: agent.providerType,
              status: agent.status,
              turns: agent.turnCount,
              tokens: agent.totalTokens ?? 0,
            }));
            return { success: true, data: channels };
          },
        },
        inspect: {
          description: 'Inspect a specific channel: channel inspect <name>',
          handler: (args, app) => {
            const chName = args[0] ? (args[0].startsWith('#') ? args[0] : `#${args[0]}`) : '#general';
            const agents = (app as any)._channelAgents as Map<string, any> | undefined;
            const agent = agents?.get(chName);
            if (!agent) return { success: false, error: `Channel "${chName}" not found` };
            return {
              success: true,
              data: {
                channel: chName,
                model: agent.model,
                provider: agent.providerType,
                status: agent.status,
                turns: agent.turnCount,
                maxTurns: agent.maxTurns,
                tokens: agent.totalTokens ?? 0,
                tools: agent._loop?.getToolDefinitions?.()?.map((t: any) => t.name ?? t.function?.name) ?? [],
              },
            };
          },
        },
        join: {
          description: 'Join/create a channel: channel join <name>',
          handler: (args, app) => {
            const name = args[0] ? (args[0].startsWith('#') ? args[0] : `#${args[0]}`) : '#debug';
            try {
              (app as any).joinChannel(name);
              return { success: true, data: { channel: name, action: 'joined' } };
            } catch (e: unknown) {
              return { success: false, error: e instanceof Error ? e.message : String(e) };
            }
          },
        },
      },
    },
    {
      name: 'session',
      description: 'Session state operations',
      commands: {
        inspect: {
          description: 'Inspect session state for a channel: session inspect [channel]',
          handler: (args, app) => {
            const chName = args[0] ? (args[0].startsWith('#') ? args[0] : `#${args[0]}`) : '#general';
            const lifecycle = (app as any)._channelLifecycle;
            const notes = lifecycle?.getChannelNotes(chName) ?? '';
            return {
              success: true,
              data: { channel: chName, notesLength: notes.length },
            };
          },
        },
        compact: {
          description: 'Trigger compaction on a channel: session compact [channel]',
          handler: (args, app) => {
            const chName = args[0] ? (args[0].startsWith('#') ? args[0] : `#${args[0]}`) : '#general';
            const agents = (app as any)._channelAgents as Map<string, any> | undefined;
            const agent = agents?.get(chName);
            if (!agent) return { success: false, error: `No agent for ${chName}` };
            agent.compact(true);
            return { success: true, data: { channel: chName, action: 'compacted' } };
          },
        },
      },
    },
    {
      name: 'drift',
      description: 'Drift snapshot operations',
      commands: {
        status: {
          description: 'Show drift status for current/specified channel',
          handler: async (args, app) => {
            const chName = args[0] ?? '#armament';
            const lifecycle = (app as any)._channelLifecycle as any;
            const drift = lifecycle?.deps?.driftManager;
            if (!drift) return { success: false, error: 'No drift manager' };
            try {
              const snapshots = await drift.listSnapshots(chName);
              return { success: true, data: { channel: chName, snapshotCount: snapshots.length, snapshots } };
            } catch (e: unknown) {
              return { success: false, error: e instanceof Error ? e.message : String(e) };
            }
          },
        },
        snapshot: {
          description: 'Take a drift snapshot: drift snapshot <filepath> [reason]',
          handler: async (args, app) => {
            if (!args[0]) return { success: false, error: 'Missing file path' };
            const chName = '#armament';
            const lifecycle = (app as any)._channelLifecycle as any;
            const drift = lifecycle?.deps?.driftManager;
            if (!drift) return { success: false, error: 'No drift manager' };
            const reason = args[1] ?? 'debug-snapshot';
            try {
              const result = await drift.snapshot(chName, args[0], reason, 'debug-shell');
              return { success: true, data: { path: args[0], snapshotId: result?.id ?? 'ok' } };
            } catch (e: unknown) {
              return { success: false, error: e instanceof Error ? e.message : String(e) };
            }
          },
        },
      },
    },
    {
      name: 'tool',
      description: 'Tool operations',
      commands: {
        list: {
          description: 'List available tools for a channel: tool list [channel]',
          handler: (args, app) => {
            const chName = args[0] ? (args[0].startsWith('#') ? args[0] : `#${args[0]}`) : '#general';
            const agents = (app as any)._channelAgents as Map<string, any> | undefined;
            const agent = agents?.get(chName);
            if (!agent) return { success: false, error: `No agent for ${chName}` };
            const tools = agent._loop?.getToolDefinitions?.() ?? agent._loop?.getTools?.() ?? [];
            return {
              success: true,
              data: tools.map((t: any) => ({
                name: t.name ?? t.function?.name ?? 'unknown',
                description: (t.description ?? t.function?.description ?? '').slice(0, 80),
              })),
            };
          },
        },
      },
    },
    {
      name: 'mcp',
      description: 'MCP server operations',
      commands: {
        list: {
          description: 'List connected MCP servers and their tools',
          handler: (_args, app) => {
            const mcp = (app as any)._mcpManager;
            if (!mcp) return { success: false, error: 'No MCP manager' };
            const servers = mcp.getConnectedServers?.() ?? [];
            return { success: true, data: servers.map((s: any) => ({
              name: s.name ?? s,
              tools: mcp.getServerTools?.(s.name ?? s)?.length ?? 0,
              status: 'connected',
            }))};
          },
        },
      },
    },
    {
      name: 'a2a',
      description: 'Agent-to-agent (worker) operations',
      commands: {
        status: {
          description: 'List running workers',
          handler: (_args, app) => {
            const agents = (app as any)._channelAgents as Map<string, any> | undefined;
            if (!agents) return { success: true, data: [] };
            const workers = Array.from(agents.entries())
              .filter(([name]) => name.startsWith('worker-'))
              .map(([name, agent]) => ({
                id: name,
                model: agent.model,
                status: agent.status,
                turns: agent.turnCount,
              }));
            return { success: true, data: workers };
          },
        },
      },
    },
    {
      name: 'config',
      description: 'Configuration operations',
      commands: {
        get: {
          description: 'Get a config value: config get <path>',
          handler: (args, _app) => {
            const cfg = UserConfig.instance();
            if (!args[0]) {
              return { success: true, data: cfg.settings };
            }
            const val = cfg.getPath?.(args[0]);
            return { success: true, data: { [args[0]]: val ?? null } };
          },
        },
      },
    },
    {
      name: 'provider',
      description: 'Provider/model operations',
      commands: {
        list: {
          description: 'List configured providers and their models',
          handler: (_args, _app) => {
            const cfg = UserConfig.instance();
            return {
              success: true,
              data: (cfg.providers ?? []).map((p: any) => ({
                name: p.name ?? p.type,
                type: p.type,
                models: (p.models ?? []).map((m: any) => typeof m === 'string' ? m : m.name),
              })),
            };
          },
        },
      },
    },
    {
      name: 'agent',
      description: 'Inspect agent internals',
      commands: {
        usage: {
          description: 'Show token/cost usage for all channels',
          handler: (_args, app) => {
            const agents = (app as any)._channelAgents as Map<string, any> | undefined;
            if (!agents) return { success: true, data: {} };
            const usage = Array.from(agents.entries()).map(([name, agent]) => ({
              channel: name,
              tokens: agent.totalTokens ?? 0,
              turns: agent.turnCount,
              status: agent.status,
              model: agent.model,
            }));
            return { success: true, data: usage };
          },
        },
      },
    },
  ];
}
