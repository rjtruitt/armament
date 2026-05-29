/** /godmode command — toggle per-channel god mode, bypassing all permission checks. */

import { getPermissionStore } from '../PermissionStore.js';
import type { CommandRegistration } from '../CommandDispatch.js';

/** Get godmode command. */
export function getGodModeCommand(): CommandRegistration[] {
  return [
    {
      name: 'godmode',
      description: 'Toggle god mode for this channel — bypasses all file-access permission prompts (temporary, resets on restart).',
      usage: '/godmode',
      handler: (_args, ctx) => {
        const channel = ctx.activeChannel;
        if (!channel) {
          return { handled: true, output: 'No active channel.' };
        }
        const store = getPermissionStore();
        const nowOn = store.toggleGodMode(channel);
        ctx.tui?.setGodMode(nowOn);
        return {
          handled: true,
          output: nowOn
            ? `⚡ God mode ON for ${channel} — all permission requests auto-approved.`
            : `God mode OFF for ${channel} — permission prompts restored.`,
        };
      },
    },
  ];
}
