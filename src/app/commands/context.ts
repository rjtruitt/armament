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
      name: 'stickynote',
      aliases: ['sticky'],
      description: 'Add/list sticky note reminders',
      handler: (args, ctx) => {
        const text = args.join(' ').trim();
        if (!text) {
          ctx.listStickyNotes();
        } else {
          ctx.addStickyNote(text);
        }
        return { handled: true };
      },
    },
    {
      name: 'unsticky',
      description: 'Remove a sticky note',
      handler: (args, ctx) => {
        const idx = parseInt(args[0], 10);
        if (!isNaN(idx)) {
          ctx.removeStickyNote(idx);
        } else {
          ctx.tui?.writeMessage('system', 'error', 'Usage: /unsticky <index>', '#control');
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
  ];
}