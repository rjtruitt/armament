import type { CommandRegistration, CommandContext } from '../CommandDispatch.js';
/** Get context management slash commands (save, load, sticky notes, pin/unpin files). */
export function getContextCommands(): CommandRegistration[] {
  return [
    {
      name: 'save_context',
      aliases: ['save'],
      description: 'Save current context to file',
      handler: (args, ctx) => {
        const name = args[0];
        const description = args.slice(1).join(' ').trim() || undefined;
        ctx.saveContext(name, description);
        return { handled: true };
      },
    },
    {
      name: 'load_context',
      aliases: ['load'],
      description: 'Load a saved context',
      handler: (args, ctx) => {
        if (args.length > 0) {
          ctx.loadContext(args[0]);
        } else {
          ctx.showContextPicker();
        }
        return { handled: true };
      },
    },
    {
      name: 'sticky',
      aliases: ['stickynote'],
      description: 'Add a sticky note reminder (use /stickies to list)',
      handler: (args, ctx) => {
        const text = args.join(' ').trim();
        if (text) {
          ctx.addStickyNote(text);
        }
        return { handled: true };
      },
    },
    {
      name: 'stickies',
      description: 'List all sticky note reminders',
      handler: (_args, ctx) => {
        ctx.listStickyNotes();
        return { handled: true };
      },
    },
    {
      name: 'unsticky',
      description: 'Remove a sticky note — usage: /unsticky <id>',
      handler: (args, ctx) => {
        const raw = args[0];
        if (!raw) {
          ctx.tui?.writeMessage('system', 'error', 'Usage: /unsticky <id> (use /stickies to see IDs)', ctx.activeChannel || '#control');
          return { handled: true };
        }
        // Try numeric first (could be ID or index)
        const num = parseInt(raw, 10);
        if (!isNaN(num)) {
          ctx.removeStickyNote(num);
        } else {
          ctx.removeStickyNote(raw);
        }
        return { handled: true };
      },
    },
    {
      name: 'pin',
      description: 'Pin a file to survive compaction',
      handler: (args, ctx) => {
        const channel = ctx.activeChannel ?? '';
        const agent = ctx.channelAgents.get(channel);
        if (!agent) {
          ctx.tui?.writeMessage('system', '*', 'No agent on this channel', channel);
          return { handled: true };
        }
        const filePath = args.join(' ').trim();
        if (!filePath) {
          const pinned = agent.pinnedFiles;
          if (pinned.length === 0) {
            ctx.tui?.writeMessage('system', '*', 'No pinned files. Usage: /pin <filepath>', channel);
          } else {
            ctx.tui?.writeMessage('system', '*', `Pinned files (${pinned.length}):`, channel);
            for (const p of pinned) {
              ctx.tui?.writeMessage('system', '*', `  📌 ${p}`, channel);
            }
          }
        } else {
          agent.pinFile(filePath);
          ctx.tui?.writeMessage('system', '*', `Pinned: ${filePath}`, channel);
        }
        return { handled: true };
      },
    },
    {
      name: 'unpin',
      description: 'Unpin a file',
      handler: (args, ctx) => {
        const channel = ctx.activeChannel ?? '';
        const agent = ctx.channelAgents.get(channel);
        if (!agent) {
          ctx.tui?.writeMessage('system', '*', 'No agent on this channel', channel);
          return { handled: true };
        }
        const filePath = args.join(' ').trim();
        if (!filePath) {
          ctx.tui?.writeMessage('system', '*', 'Usage: /unpin <filepath>', channel);
        } else if (agent.unpinFile(filePath)) {
          ctx.tui?.writeMessage('system', '*', `Unpinned: ${filePath}`, channel);
        } else {
          ctx.tui?.writeMessage('system', '*', `Not pinned: ${filePath}`, channel);
        }
        return { handled: true };
      },
    },
    {
      name: 'auto',
      description: 'Manage auto-workers: list, enable, disable, interval, model',
      handler: (args, ctx) => {
        const channel = ctx.activeChannel ?? '';
        if (!channel) {
          ctx.tui?.writeMessage('system', 'error', 'No active channel', '#control');
          return { handled: true };
        }
        const aw = ctx.channelLifecycle.getAutoWorkerManager();
        const subCmd = args[0]?.toLowerCase();

        if (!subCmd || subCmd === 'list') {
          const cfg = aw.getConfig(channel);
          const entries = Object.entries(cfg);
          if (entries.length === 0) {
            ctx.tui?.writeMessage('system', 'info', 'No auto-workers configured. Enable one: /auto enable <type>', channel);
            return { handled: true };
          }
          ctx.tui?.writeMessage('system', 'info', '── Auto-Workers ──', channel);
          for (const [type, wc] of entries) {
            const status = wc.enabled ? 'ON' : 'OFF';
            const modelStr = wc.model ? ` model:${wc.model}` : '';
            ctx.tui?.writeMessage('system', 'info',
              `  ${type}: ${status} | every ${wc.intervalMinutes}m | idle guard ${wc.maxIdleMinutes}m${modelStr}`, channel);
          }
          return { handled: true };
        }

        if (subCmd === 'enable') {
          const type = args[1];
          if (!type) {
            ctx.tui?.writeMessage('system', 'error', 'Usage: /auto enable <type>', channel);
            return { handled: true };
          }
          aw.setWorkerEnabled(channel, type, true);
          ctx.tui?.writeMessage('system', 'info', `Auto-worker "${type}" enabled. Prompt: .armaws/auto-worker-${type}.md`, channel);
          return { handled: true };
        }

        if (subCmd === 'disable') {
          const type = args[1];
          if (!type) {
            ctx.tui?.writeMessage('system', 'error', 'Usage: /auto disable <type>', channel);
            return { handled: true };
          }
          aw.setWorkerEnabled(channel, type, false);
          ctx.tui?.writeMessage('system', 'info', `Auto-worker "${type}" disabled.`, channel);
          return { handled: true };
        }

        if (subCmd === 'interval') {
          const type = args[1];
          const mins = parseInt(args[2], 10);
          if (!type || isNaN(mins)) {
            ctx.tui?.writeMessage('system', 'error', 'Usage: /auto interval <type> <minutes>', channel);
            return { handled: true };
          }
          aw.setWorkerInterval(channel, type, mins);
          ctx.tui?.writeMessage('system', 'info', `Auto-worker "${type}" interval set to ${mins} min.`, channel);
          return { handled: true };
        }

        if (subCmd === 'model') {
          const type = args[1];
          const model = args.slice(2).join(' ') || 'default';
          if (!type) {
            ctx.tui?.writeMessage('system', 'error', 'Usage: /auto model <type> <provider/model> or "default"', channel);
            return { handled: true };
          }
          aw.setWorkerModel(channel, type, model === 'default' ? '' : model);
          ctx.tui?.writeMessage('system', 'info',
            model === 'default'
              ? `Auto-worker "${type}" model reset to channel default.`
              : `Auto-worker "${type}" model set to ${model}.`, channel);
          return { handled: true };
        }

        ctx.tui?.writeMessage('system', 'error',
          `Unknown subcommand: ${subCmd}. Use: list, enable, disable, interval, model`, channel);
        return { handled: true };
      },
    },
  ];
}