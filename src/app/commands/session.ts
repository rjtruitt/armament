import type { CommandRegistration, CommandContext } from '../CommandDispatch.js';

/** Get session commands.
 */
export function getSessionCommands(): CommandRegistration[] {
  return [
    {
      name: 'quit',
      aliases: ['exit', 'q'],
      description: 'Exit armament',
      handler: (_args, ctx) => {
        ctx.stop();
        return { handled: true };
      },
    },
    {
      name: 'clear',
      description: 'Clear screen',
      handler: (_args, ctx) => {
        const ch = ctx.activeChannel;
        if (ch && ctx.tui) {
          ctx.tui.clearDisplay(ch);
        }
        return { handled: true };
      },
    },
    {
      name: 'clear-session',
      description: 'Clear persisted session data',
      handler: (_args, ctx) => {
        ctx.clearSession();
        return { handled: true };
      },
    },
    {
      name: 'wipe',
      description: 'Wipe ALL state, messages, and display buffer for the current channel',
      handler: (_args, ctx) => {
        const ch = ctx.activeChannel;
        if (ch) ctx.tui?.clearDisplay(ch);
        // Clear in-memory messages
        const msgs = ctx.getMessages();
        if (Array.isArray(msgs)) msgs.length = 0;
        ctx.setTurnCount(0);
        // Clear persisted state
        ctx.clearSession();
        return { handled: true, output: 'Channel wiped. Starting fresh.' };
      },
    },
    {
      name: 'status',
      description: 'Show current status',
      handler: (_args, ctx) => {
        const model = ctx.channelAgents.get(ctx.activeChannel ?? '')?.model ?? ctx.getCurrentModel();
        const turns = ctx.getTurnCount();
        return { handled: true, output: `Status: running | Model: ${model} | Turns: ${turns}` };
      },
    },
    {
      name: 'cost',
      description: 'Show estimated cost',
      handler: (_args, ctx) => {
        const stats = ctx.getUsageStats();
        return { handled: true, output: `Total cost: $${stats.estimatedCost.toFixed(4)}` };
      },
    },
    {
      name: 'context',
      description: 'Show context usage',
      handler: (_args, ctx) => {
        const usage = ctx.getContextUsage();
        return { handled: true, output: `Context: ${usage.percentage}% used (${usage.used}/${usage.capacity})` };
      },
    },
    {
      name: 'history',
      description: 'Show message history',
      handler: (_args, ctx) => {
        const msgs = ctx.getMessages();
        const output = msgs.map((m: any) => `[${m.role}] ${m.content.substring(0, 50)}`).join('\n') || 'No messages';
        return { handled: true, output };
      },
    },
    {
      name: 'tools',
      description: 'Show available tools',
      handler: (_args, ctx) => {
        const lines: string[] = [];
        const enabled = ctx.getEnabledTools();
        if (enabled.length > 0) {
          lines.push('── built-in ──');
          for (const t of enabled) lines.push(`  ${t}`);
        }
        for (const server of ctx.getMcpServers().values()) {
          if (server.status === 'connected' && server.tools.length > 0) {
            lines.push(`── ${server.name} (${server.tools.length}) ──`);
            for (const t of server.tools) {
              lines.push(`  ${t.name}${t.description ? `  ${t.description}` : ''}`);
            }
          }
        }
        return { handled: true, output: lines.length > 0 ? lines.join('\n') : 'No tools available' };
      },
    },
    {
      name: 'undo',
      description: 'Undo last action',
      handler: (_args, ctx) => {
        const turnCount = ctx.getTurnCount();
        if (turnCount > 0) {
          const messages = ctx.getMessages();
          const filtered = messages.filter((m: any) => m.metadata?.turnNumber !== turnCount);
          messages.length = 0;
          messages.push(...filtered);
          ctx.setTurnCount(turnCount - 1);
        }
        return { handled: true };
      },
    },
    {
      name: 'compact',
      aliases: ['compress'],
      description: 'Compact context window (onPostCompact writes the result message)',
      handler: (_args, ctx) => {
        const channel = ctx.activeChannel ?? '';
        const agent = ctx.channelAgents.get(channel);
        if (agent) {
          ctx.tui?.startCompacting(channel);
          agent.compact(true).then((result) => {
            ctx.tui?.stopCompacting();
            if (!result) {
              ctx.tui?.writeMessage('system', '*', 'Nothing to compact', channel);
            }
          });
        } else {
          ctx.tui?.writeMessage('system', '*', 'No agent on this channel', ctx.activeChannel ?? '#control');
        }
        return { handled: true };
      },
    },
    {
      name: 'stats',
      description: 'Show session stats',
      handler: (_args, ctx) => {
        const stats = ctx.getUsageStats();
        return { handled: true, output: `Stats: avg latency ${stats.avgLatencyMs}ms, ${stats.requestCount} requests` };
      },
    },
  ];
}
