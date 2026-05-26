import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandRegistration, CommandContext } from '../CommandDispatch.js';
import { getArmaPath, armaDataDir, channelBaseDir, ARMAWS_DIR } from '../ChannelPaths.js';
/** Get IRC-style slash commands for channel/agent management. */
export function getIrcCommands(): CommandRegistration[] {
  return [
    {
      name: 'join',
      description: 'Create/switch to agent channel',
      handler: (args, ctx) => {
        if (args.length > 0) {
          ctx.joinChannel(args[0]);
          return { handled: true, output: `Joined #${args[0]}` };
        }
        return { handled: true, output: 'Usage: /join <channel>' };
      },
    },
    {
      name: 'part',
      aliases: ['leave'],
      description: 'Leave/close an agent channel',
      handler: (args, ctx) => {
        if (args.length > 0) {
          ctx.leaveChannel(args[0]);
          return { handled: true, output: `Left ${args[0].startsWith('#') ? args[0] : '#' + args[0]}` };
        }
        if (ctx.activeChannel) {
          const name = ctx.activeChannel;
          ctx.leaveChannel(name);
          return { handled: true, output: `Left ${name}` };
        }
        return { handled: true, output: 'No active channel' };
      },
    },
    {
      name: 'spawn',
      description: 'Spawn a new agent in its own channel',
      handler: (args, ctx) => {
        const name = args[0];
        if (!name) return { handled: true, output: 'Usage: /spawn <name> [--model <m>] [--provider <p>]' };
        const opts: Record<string, string> = {};
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--model' && args[i + 1]) opts.model = args[++i];
          else if (args[i] === '--provider' && args[i + 1]) opts.provider = args[++i];
          else if (args[i] === '--prompt' && args[i + 1]) opts.systemPrompt = args[++i];
        }
        ctx.spawnAgent(name, opts);
        return { handled: true, output: `Spawned agent "${name}"` };
      },
    },
    {
      name: 'kill',
      description: 'Kill a running agent',
      handler: (args, ctx) => {
        if (args.length > 0) {
          try {
            ctx.killAgent(args[0]);
            return { handled: true, output: `Killed agent "${args[0]}"` };
          } catch (e: any) {
            return { handled: true, output: e.message };
          }
        }
        return { handled: true, output: 'Usage: /kill <name>' };
      },
    },
    {
      name: 'switch',
      description: 'Switch active channel',
      handler: (args, ctx) => {
        if (args.length > 0) {
          const idx = parseInt(args[0], 10);
          try {
            ctx.switchChannel(isNaN(idx) ? args[0] : idx);
            return { handled: true, output: 'Switched to channel' };
          } catch (e: any) {
            return { handled: true, output: e.message };
          }
        }
        return { handled: true, output: 'Usage: /switch <n|name>' };
      },
    },
    {
      name: 'msg',
      description: 'Send message to specific agent',
      handler: (args, ctx) => {
        if (args.length >= 2) {
          const target = args[0];
          const message = args.slice(1).join(' ');
          ctx.msgAgent(target, message);
          return { handled: true, output: `→ ${target}: ${message}` };
        }
        return { handled: true, output: 'Usage: /msg <agent> <message>' };
      },
    },
    {
      name: 'list',
      description: 'List channels',
      handler: (_args, ctx) => {
        return { handled: true, output: ctx.listChannels() };
      },
    },
    {
      name: 'whois',
      description: 'Show agent info',
      handler: (args, ctx) => {
        if (args.length > 0) {
          return { handled: true, output: ctx.whoIs(args[0]) };
        }
        return { handled: true, output: 'Usage: /whois <agent>' };
      },
    },
    {
      name: 'who',
      description: 'Show agents in current channel',
      handler: (_args, ctx) => {
        const agents = ctx.channelLifecycle.getAgents();
        const output = agents.map((a: any) => `${a.name} [${a.status}]`).join('\n') || 'No agents';
        return { handled: true, output };
      },
    },
    {
      name: 'nick',
      description: 'Rename current agent',
      handler: (_args, _ctx) => ({ handled: true }),
    },
    {
      name: 'topic',
      description: 'Set system prompt for current channel',
      handler: (_args, _ctx) => ({ handled: true }),
    },
    {
      name: 'away',
      description: 'Pause agent on current channel',
      handler: (_args, _ctx) => ({ handled: true }),
    },
    {
      name: 'back',
      description: 'Resume agent on current channel',
      handler: (_args, _ctx) => ({ handled: true }),
    },
    {
      name: 'restart_channel',
      aliases: ['reset_channel'],
      description: 'Wipe channel workspace and session, rebuild fresh scaffold',
      usage: '/restart_channel [name]',
      handler: (args, ctx) => {
        const name = args.length > 0 ? (args[0].startsWith('#') ? args[0] : `#${args[0]}`) : ctx.activeChannel;
        if (!name) return { handled: true, output: 'No active channel and no name provided.' };
        try {
          // Leave the channel (deregisters from manifest, keeps state file)
          ctx.leaveChannel(name);
          // Wipe the .armaroot pointer so channel resets to default workspace
          const armaroot = join(channelBaseDir(name), '.armaroot');
          try { rmSync(armaroot, { force: true }); } catch {}
          // Wipe only the .armaws/ workspace directory — never touch the parent project
          const wsDir = getArmaPath(name);
          if (!wsDir.endsWith(ARMAWS_DIR)) {
            return { handled: true, output: `Safety check failed: workspace path doesn't end with ${ARMAWS_DIR}` };
          }
          rmSync(wsDir, { recursive: true, force: true });
          // Wipe the session state file
          const bare = name.startsWith('#') ? name.slice(1) : name;
          const stateFile = join(armaDataDir(), 'sessions', 'channels', `${bare}.state.json`);
          rmSync(stateFile, { force: true });
          // Rejoin — this will re-seed notes.md, architecture/, etc.
          ctx.joinChannel(bare);
          return { handled: true, output: `Channel ${name} restarted — workspace and session rebuilt.` };
        } catch (e: any) {
          return { handled: true, output: `Error restarting channel: ${e.message}` };
        }
      },
    },
  ];
}