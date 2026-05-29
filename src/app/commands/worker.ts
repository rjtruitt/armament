/**
 * /prompt and /spawn commands — run stored prompt definitions.
 *
 * /prompt <name>   — injects prompt content inline into the current channel
 * /spawn <name>    — spawns a subworker with the prompt + channel context
 *
 * Prompts are searched in order:
 *   1. .armaws/workers/prompts/<name>.md  (per-channel)
 *   2. ~/.arma/prompts/<name>.md           (global)
 */

import type { CommandRegistration } from '../CommandDispatch.js';
import { logError, logInfo } from '../../core/index.js';
import { getArmaPath } from '../ChannelPaths.js';
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/** Global prompts directory: ~/.arma/prompts/ */
const GLOBAL_PROMPTS_DIR = join(homedir(), '.arma', 'prompts');

/** Ensure global prompts dir exists. */
function ensureGlobalDir(): void {
  if (!existsSync(GLOBAL_PROMPTS_DIR)) {
    mkdirSync(GLOBAL_PROMPTS_DIR, { recursive: true });
  }
}

/**
 * List all available prompts from both per-channel and global directories.
 * Per-channel names take precedence (override globals with same name).
 */
function listAllPrompts(channel: string): string[] {
  ensureGlobalDir();
  const seen = new Set<string>();
  const result: string[] = [];

  // Per-channel prompts first
  const armaPath = getArmaPath(channel);
  const localDir = join(armaPath, 'workers', 'prompts');
  if (existsSync(localDir)) {
    for (const f of readdirSync(localDir)) {
      if (f.endsWith('.md')) {
        const name = f.replace(/\.md$/, '');
        seen.add(name);
        result.push(name);
      }
    }
  }

  // Global prompts (skip names already seen)
  if (existsSync(GLOBAL_PROMPTS_DIR)) {
    for (const f of readdirSync(GLOBAL_PROMPTS_DIR)) {
      if (f.endsWith('.md')) {
        const name = f.replace(/\.md$/, '');
        if (!seen.has(name)) {
          result.push(name);
        }
      }
    }
  }

  return result;
}

/**
 * Get prompt content for a given name.
 * Checks per-channel first, then global.
 */
function getPrompt(channel: string, name: string): { content: string; source: string } | null {
  const armaPath = getArmaPath(channel);
  const localPath = join(armaPath, 'workers', 'prompts', `${name}.md`);
  if (existsSync(localPath)) {
    return { content: readFileSync(localPath, 'utf-8'), source: 'local' };
  }

  ensureGlobalDir();
  const globalPath = join(GLOBAL_PROMPTS_DIR, `${name}.md`);
  if (existsSync(globalPath)) {
    return { content: readFileSync(globalPath, 'utf-8'), source: 'global' };
  }

  return null;
}

/** Shared handler for not-found / no-prompts. Writes to TUI. */
function showNoPrompt(name: string, channel: string | undefined, ctx: any): void {
  const all = listAllPrompts(channel ?? '');
  if (all.length === 0) {
    ctx.tui?.writeMessage('system', '*',
      'No prompts found. Create ~/.arma/prompts/<name>.md or .armaws/workers/prompts/<name>.md',
      ctx.activeChannel);
  } else {
    ctx.tui?.writeMessage('system', '*',
      `Prompt "${name}" not found. Available:\n  ${all.join('\n  ')}`, ctx.activeChannel);
  }
}

// ─── /prompt — inline injection ─────────────────────────────────────────────

/** Register the /prompt command — inject prompt content inline into current channel. */
export function getPromptCommand(): CommandRegistration[] {
  return [
    {
      name: 'prompt',
      description: 'Inject a stored prompt into the current conversation',
      usage: '/prompt <name> [extra instructions...]',
      getArgCompletions: (partial, ctx) => {
        const channel = ctx.activeChannel;
        if (!channel) return [];
        const prompts = listAllPrompts(channel);
        if (!partial) return prompts;
        return prompts.filter(p => p.startsWith(partial));
      },
      handler: (args, ctx) => {
        (async () => {
          try {
            const name = args[0];
            if (!name) {
              const all = listAllPrompts(ctx.activeChannel ?? '');
              if (ctx.tui && all.length > 0) {
                const items = all.map((p: string) => ({ name: p, description: '', category: 'standard' as const }));
                ctx.tui.showPicker('prompts', items, (selected) => {
                  const channel = ctx.activeChannel;
                  if (!channel) return;
                  const found = getPrompt(channel, selected.name);
                  if (!found) return;
                  ctx.tui?.writeMessage('system', '*', `📋 Prompt "${selected.name}" injected inline`, channel);
                  ctx.submitMessage(found.content, channel);
                });
                return;
              }
              // Fallback: no TUI available
              if (all.length === 0) {
                ctx.tui?.writeMessage('system', '*',
                  'No prompts found. Create ~/.arma/prompts/<name>.md or .armaws/workers/prompts/<name>.md',
                  ctx.activeChannel);
              } else {
                ctx.tui?.writeMessage('system', '*',
                  `Available prompts:\n  ${all.join('\n  ')}`, ctx.activeChannel);
              }
              return;
            }

            const channel = ctx.activeChannel;
            if (!channel) {
              ctx.tui?.writeMessage('system', '*', 'No active channel', channel);
              return;
            }

            const found = getPrompt(channel, name);
            if (!found) {
              showNoPrompt(name, channel, ctx);
              return;
            }

            const extraInstructions = args.slice(1).join(' ') || '';
            const message = extraInstructions
              ? `Following prompt "${name}":\n\n${found.content}\n\n${extraInstructions}`
              : `Following prompt "${name}":\n\n${found.content}`;

            ctx.tui?.writeMessage('system', '*', `📋 Prompt "${name}" injected inline`, channel);
            await ctx.submitMessage(message, channel);
          } catch (err: unknown) {
            logError('prompt', '/prompt error', err);
            ctx.tui?.writeMessage('system', '*',
              `Error: ${err instanceof Error ? err.message : String(err)}`, ctx.activeChannel);
          }
        })();
        return { handled: true, output: '' };
      },
    },
  ];
}

// ─── /spawn — subworker ─────────────────────────────────────────────────────

/** Register the /spawn command — spawn a subworker with the prompt + channel context. */
export function getSpawnCommand(): CommandRegistration[] {
  return [
    {
      name: 'spawn',
      description: 'Spawn a subworker with a stored prompt definition',
      usage: '/spawn <name> [extra instructions...]',
      getArgCompletions: (partial, ctx) => {
        const channel = ctx.activeChannel;
        if (!channel) return [];
        const prompts = listAllPrompts(channel);
        if (!partial) return prompts;
        return prompts.filter(p => p.startsWith(partial));
      },
      handler: (args, ctx) => {
        (async () => {
          try {
            const name = args[0];
            if (!name) {
              const all = listAllPrompts(ctx.activeChannel ?? '');
              if (ctx.tui && all.length > 0) {
                const items = all.map((p: string) => ({ name: p, description: '', category: 'standard' as const }));
                ctx.tui.showPicker('spawn', items, (selected) => {
                  const channel = ctx.activeChannel;
                  if (!channel) return;
                  // Re-run the spawn logic with the selected prompt name
                  const handler = getSpawnCommand()[0].handler;
                  handler([selected.name], ctx);
                });
                return;
              }
              // Fallback: no TUI available
              if (all.length === 0) {
                ctx.tui?.writeMessage('system', '*',
                  'No prompts found. Create ~/.arma/prompts/<name>.md or .armaws/workers/prompts/<name>.md',
                  ctx.activeChannel);
              } else {
                ctx.tui?.writeMessage('system', '*',
                  `Available prompts:\n  ${all.join('\n  ')}`, ctx.activeChannel);
              }
              return;
            }

            const channel = ctx.activeChannel;
            if (!channel) {
              ctx.tui?.writeMessage('system', '*', 'No active channel', channel);
              return;
            }

            const found = getPrompt(channel, name);
            if (!found) {
              showNoPrompt(name, channel, ctx);
              return;
            }

            const runtime = ctx.channelLifecycle.getRuntime(channel);
            if (!runtime) {
              ctx.tui?.writeMessage('system', '*', 'No runtime available for this channel', channel);
              return;
            }

            // Extra instructions from remaining args
            const extraInstructions = args.slice(1).join(' ') || '';

            // Build worker context
            const armaPath = getArmaPath(channel);
            const parentRoot = join(armaPath, '..');
            const workerId = `spawn-${name}-${Date.now()}`;

            // Recent messages
            const allMessages = ctx.getMessages() ?? [];
            const messageText = allMessages
              .filter((m: any) => m.content && typeof m.content === 'string')
              .slice(-50)
              .map((m: any) => `[${m.type}] ${m.sender}: ${m.content}`)
              .join('\n') || '(no recent messages)';

            // Build the full task prompt: stored prompt + extra instructions + context
            const taskParts = [found.content];
            if (extraInstructions) {
              taskParts.push(`\n## Additional instructions\n${extraInstructions}`);
            }
            taskParts.push([
              '',
              '## Channel context',
              `Channel: ${channel}`,
              `Workspace: ${parentRoot}`,
              '',
              `### notes.md path\n${join(armaPath, 'notes.md')}`,
              `### architecture/ path\n${join(armaPath, 'architecture')}`,
              '',
              '### Recent messages',
              messageText,
            ].join('\n'));
            const task = taskParts.join('\n');

            logInfo('spawn', `Spawning subworker ${workerId} with prompt "${name}" from ${found.source}`);

            // Sticky notes
            const stickyNotes = [
              { content: `📁 ${channel} /spawn ${name}`, position: 'top' as const },
              { content: `📝 notes.md: ${join(armaPath, 'notes.md')}`, position: 'top' as const },
              { content: `📂 architecture/: ${join(armaPath, 'architecture')}`, position: 'top' as const },
            ];

            const result = await runtime.spawnWorker(workerId, task, undefined, undefined, undefined, stickyNotes);
            if (!result.success) {
              ctx.tui?.writeMessage('system', '*',
                `Spawn "${name}" failed to start: ${result.error ?? 'unknown error'}`, channel);
              return;
            }
            ctx.tui?.writeMessage('system', '*',
              `"${name}" spawned as ${workerId}`, channel);
          } catch (err: unknown) {
            logError('spawn', '/spawn error', err);
            ctx.tui?.writeMessage('system', '*',
              `Error: ${err instanceof Error ? err.message : String(err)}`, ctx.activeChannel);
          }
        })();
        return { handled: true, output: '' };
      },
    },
  ];
}
