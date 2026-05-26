import type { CommandRegistration } from '../CommandDispatch.js';
import { logError } from '../../core/index.js';
/** Register and return nudge management commands. */
export function getNudgeCommands(): CommandRegistration[] {
  return [
    {
      name: 'nudge',
      description: 'Manage scheduled nudges',
      usage: '/nudge [list|create|delete] [args...]',
      handler: (args, ctx) => {
        try {
          const mgr = ctx.channelLifecycle.getNudgeManager();
          const sub = args[0]?.toLowerCase();
          if (!sub || sub === 'list') {
            const chName = args[1] ? (args[1].startsWith('#') ? args[1] : `#${args[1]}`) : undefined;
            const nudges = mgr.list(chName);
            if (nudges.length === 0) return { handled: true, output: 'No active nudges.' };
            const lines = nudges.map(n =>
              `  ${n.jobId}: [${n.status}] ${n.channel} every ${n.every ?? '?'} — "${n.prompt.slice(0, 60)}" (fired ${n.fireCount}x)`,
            );
            return { handled: true, output: `Active nudges:\n${lines.join('\n')}` };
          }
          if (sub === 'create') {
            const chName = args[1] ? (args[1].startsWith('#') ? args[1] : `#${args[1]}`) : ctx.activeChannel;
            const every = args[2];
            const prompt = args.slice(3).join(' ');
            if (!every || !prompt) {
              return { handled: true, output: 'Usage: /nudge create <channel> <every> <prompt...>' };
            }
            const id = mgr.create(chName ?? '', every, prompt);
            if (!id) return { handled: true, output: `Failed: no schedule store for ${chName ?? '(no channel)'}` };
            return { handled: true, output: `Created nudge ${id} on ${chName}: every ${every}` };
          }
          if (sub === 'delete') {
            const id = args[1];
            if (!id) return { handled: true, output: 'Usage: /nudge delete <jobId>' };
            const ok = mgr.delete(id);
            return { handled: true, output: ok ? `Deleted nudge ${id}.` : `Nudge ${id} not found.` };
          }
          return { handled: true, output: 'Usage: /nudge [list|create|delete] [args...]' };
        } catch (err: unknown) {
          logError('command', `/nudge error`, err);
          return { handled: true, output: `Error: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },
  ];
}