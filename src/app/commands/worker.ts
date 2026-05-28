/**
 * /worker command — spawn a subworker with a stored prompt definition.
 *
 * Prompts are stored as .armaws/workers/prompts/<name>.md
 * The worker gets the same context as HistoryScribe (notes, architecture, messages)
 * plus the prompt content.
 */

import type { CommandRegistration } from '../CommandDispatch.js';
import { logError, logInfo } from '../../core/index.js';
import { getArmaPath } from '../ChannelPaths.js';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * List available worker prompts.
 */
function listPrompts(channel: string): string[] {
  const armaPath = getArmaPath(channel);
  const promptsDir = join(armaPath, 'workers', 'prompts');
  if (!existsSync(promptsDir)) return [];
  return readdirSync(promptsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

/**
 * Get the prompt content for a given name.
 */
function getPrompt(channel: string, name: string): string | null {
  const armaPath = getArmaPath(channel);
  const promptPath = join(armaPath, 'workers', 'prompts', `${name}.md`);
  if (!existsSync(promptPath)) return null;
  return readFileSync(promptPath, 'utf-8');
}

/** Register the /worker command. */
export function getWorkerCommands(): CommandRegistration[] {
  return [
    {
      name: 'worker',
      description: 'Spawn a subworker with a stored prompt definition',
      usage: '/worker <name> [extra instructions...]',
      getArgCompletions: (partial, ctx) => {
        const channel = ctx.activeChannel;
        if (!channel) return [];
        const prompts = listPrompts(channel);
        if (!partial) return prompts;
        return prompts.filter(p => p.startsWith(partial));
      },
      handler: (args, ctx) => {
        (async () => {
          try {
            const name = args[0];
            if (!name) {
              const available = listPrompts(ctx.activeChannel ?? '');
              if (available.length === 0) {
                ctx.tui?.writeMessage('system', '*', 'No worker prompts found. Create .armaws/workers/prompts/<name>.md', ctx.activeChannel);
                return;
              }
              ctx.tui?.writeMessage('system', '*', `Available prompts:\n  ${available.join('\n  ')}`, ctx.activeChannel);
              return;
            }

            const channel = ctx.activeChannel;
            if (!channel) {
              ctx.tui?.writeMessage('system', '*', 'No active channel', channel);
              return;
            }

            const prompt = getPrompt(channel, name);
            if (!prompt) {
              const available = listPrompts(channel);
              ctx.tui?.writeMessage('system', '*',
                `Prompt "${name}" not found. Available:\n  ${available.join('\n  ')}`, channel);
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
            const workerId = `worker-${name}-${Date.now()}`;

            // Recent messages
            const allMessages = ctx.getMessages() ?? [];
            const messageText = allMessages
              .filter((m: any) => m.content && typeof m.content === 'string')
              .slice(-50)
              .map((m: any) => `[${m.type}] ${m.sender}: ${m.content}`)
              .join('\n') || '(no recent messages)';

            // Build the full task prompt: stored prompt + extra instructions + context
            const taskParts = [prompt];
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

            logInfo('worker', `Spawning worker ${workerId} with prompt "${name}"`);

            // Sticky notes
            const stickyNotes = [
              { content: `📁 ${channel} worker: ${name}`, position: 'top' as const },
              { content: `📝 notes.md: ${join(armaPath, 'notes.md')}`, position: 'top' as const },
              { content: `📂 architecture/: ${join(armaPath, 'architecture')}`, position: 'top' as const },
            ];

            const result = await runtime.spawnWorker(workerId, task, undefined, undefined, undefined, stickyNotes);
            if (!result.success) {
              ctx.tui?.writeMessage('system', '*', `Worker ${name} failed to start: ${result.error ?? 'unknown error'}`, channel);
              return;
            }
            ctx.tui?.writeMessage('system', '*', `Worker "${name}" spawned as ${workerId}`, channel);
          } catch (err: unknown) {
            logError('worker', '/worker error', err);
            ctx.tui?.writeMessage('system', '*',
              `Error: ${err instanceof Error ? err.message : String(err)}`, ctx.activeChannel);
          }
        })();
        return { handled: true, output: '' };
      },
    },
  ];
}
