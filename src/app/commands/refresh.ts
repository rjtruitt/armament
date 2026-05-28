/**
 * /refresh command — reload the clean state file into the TUI display.
 *
 * Reads the persisted state (which has ANSI codes stripped on save) and
 * replays the chat messages into the display buffer, replacing whatever
 * garbage might be in memory.
 */
import type { CommandRegistration } from '../CommandDispatch.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/** Register the /refresh command. */
export function getRefreshCommand(): CommandRegistration[] {
  return [
    {
      name: 'refresh',
      description: 'Reload the TUI display from the clean state file',
      usage: '/refresh — strips ANSI garbage from the display by reloading from clean state',
      handler: (args, ctx) => {
        try {
          const channel = ctx.activeChannel;
          if (!channel) {
            ctx.tui?.writeMessage('system', '*', 'No active channel', '#control');
            return { handled: true, output: '' };
          }

          // Build state file path: ~/.arma/sessions/channels/<slug>.state.json
          const slug = channel.replace(/^#/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
          const statePath = join(homedir(), '.arma', 'sessions', 'channels', `${slug}.state.json`);

          if (!existsSync(statePath)) {
            ctx.tui?.writeMessage('system', '*', `No state file found for ${channel}`, channel);
            return { handled: true, output: '' };
          }

          const raw = readFileSync(statePath, 'utf-8');
          const state = JSON.parse(raw);
          const chatMessages: Array<{ type: string; sender: string; content: string }> = state.chatMessages ?? [];

          if (chatMessages.length === 0) {
            ctx.tui?.writeMessage('system', '*', 'State file is empty — nothing to refresh', channel);
            return { handled: true, output: '' };
          }

          // Clear the display and replay from clean state
          ctx.tui?.clearDisplay(channel);

          for (const msg of chatMessages) {
            // Skip session-restored banners (they're for restart, not for mid-session refresh)
            if (msg.type === 'system' && msg.content.includes('Session restored')) continue;
            if (msg.type === 'system' && msg.content.includes('── interrupted ──')) continue;
            ctx.tui?.writeMessage(msg.type as any, msg.sender, msg.content, channel);
          }

          ctx.tui?.writeMessage('system', '*', `── Display refreshed from state (${chatMessages.length} messages) ──`, channel);

          return { handled: true, output: '' };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.tui?.writeMessage('system', '*', `Refresh error: ${msg}`, ctx.activeChannel ?? '#control');
          return { handled: true, output: '' };
        }
      },
    },
  ];
}
