/**
 * /help command — lists commands and shows per-command details.
 *
 * Usage:
 *   /help           — list all registered commands
 *   /help spawn     — show usage and description for /spawn
 *   /help prompt    — show usage for /prompt
 *
 * Tab autocomplete: /help <Tab> lists command names.
 * After selecting one, /help <cmd> shows its usage.
 */
import type { CommandDispatch, CommandRegistration } from '../CommandDispatch.js';

/** Register the /help command. Requires CommandDispatch to query registered commands. */
export function getHelpCommand(dispatch: CommandDispatch): CommandRegistration[] {
  return [
    {
      name: 'help',
      description: 'Show command help and usage',
      usage: '/help [command] — list all commands, or get details for a specific one',
      getArgCompletions: (partial, _ctx) => {
        const allCommands = dispatch.getRegistrations();
        const names = allCommands.map(r => r.name);
        if (!partial) return names;
        return names.filter(n => n.startsWith(partial));
      },
      handler: (_args, ctx) => {
        if (_args.length === 0) {
          // List all commands
          const all = dispatch.getRegistrations();
          if (ctx.tui && all.length > 0) {
            const items = all.map(r => ({
              name: `/${r.name}`,
              description: r.description ?? '',
              category: 'standard' as const,
            }));
            ctx.tui.showPicker('help', items, (selected) => {
              const cmdName = selected.name.slice(1);
              const reg = dispatch.getRegistrations().find(r => r.name === cmdName);
              if (!reg) return;
              const lines: string[] = [`/${reg.name}`];
              if (reg.description) lines.push(reg.description);
              lines.push('');
              lines.push(`  Usage: ${reg.usage ?? '/' + reg.name + ' <args>'}`);
              if (reg.aliases && reg.aliases.length > 0) {
                lines.push(`  Aliases: ${reg.aliases.map(a => '/' + a).join(', ')}`);
              }
              ctx.tui?.writeMessage('system', 'help', lines.join('\n'), ctx.activeChannel);
            });
            return { handled: true, output: '' };
          }
          // Fallback: text list
          if (all.length === 0) {
            ctx.tui?.writeMessage('system', '*', 'No commands registered.', ctx.activeChannel);
            return { handled: true, output: '' };
          }

          const lines: string[] = ['Available commands:'];
          for (const reg of all) {
            const desc = reg.description ?? '';
            lines.push(`  /${reg.name}  ${desc}`);
          }
          lines.push('');
          lines.push('Use /help <command> for details on a specific command.');
          return { handled: true, output: lines.join('\n') };
        }

        // Show detail for a specific command
        const cmdName = _args[0].toLowerCase();
        const all = dispatch.getRegistrations();
        const reg = all.find(r => r.name === cmdName);

        if (!reg) {
          return {
            handled: true,
            output: `Unknown command: /${cmdName}. Try /help to list available commands.`,
          };
        }

        const lines: string[] = [`/${reg.name}`];
        if (reg.description) lines.push(reg.description);
        lines.push('');
        lines.push(`  Usage: ${reg.usage ?? '/' + reg.name + ' <args>'}`);
        if (reg.aliases && reg.aliases.length > 0) {
          lines.push(`  Aliases: ${reg.aliases.map(a => '/' + a).join(', ')}`);
        }
        if (reg.getArgCompletions) {
          lines.push(`  Tab-completes arguments ✓`);
        }
        return { handled: true, output: lines.join('\n') };
      },
    },
  ];
}
