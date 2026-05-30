/**
 * /paste command — read clipboard content (image or text) and send it as a message.
 *
 * Images are sent as multi-modal content blocks (text + image) to the LLM.
 * Text is sent as plain text.
 */
import type { CommandRegistration } from '../CommandDispatch.js';
import { readClipboard } from '../../utils/ClipboardReader.js';

/** Register the /paste command. */
export function getPasteCommand(): CommandRegistration[] {
  return [
    {
      name: 'paste',
      description: 'Paste clipboard content (image or text) as a message',
      usage: '/paste [text] — if text provided, sends it directly; otherwise reads clipboard',
      handler: (args, ctx) => {
        const channel = ctx.activeChannel;
        if (!channel) {
          ctx.tui?.writeMessage('system', '*', 'No active channel', '#control');
          return { handled: true, output: '' };
        }

        // If user provided text as argument, send it directly
        if (args.length > 0) {
          sendText(args.join(' '), channel, ctx);
          return { handled: true, output: '' };
        }

        // Otherwise read clipboard
        const clip = readClipboard();
        if (!clip) {
          ctx.tui?.writeMessage('system', '*', 'Clipboard is empty or unreadable', channel);
          return { handled: true, output: '' };
        }

        if (clip.type === 'image') {
          sendImage(clip, channel, ctx);
        } else {
          sendText(clip.data, channel, ctx);
        }
        return { handled: true, output: '' };
      },
    },
  ];
}

/** Send plain text message through the normal pipeline. */
function sendText(text: string, channel: string, ctx: any): void {
  ctx.tui?.writeMessage('user', ctx.getUserNick(), text, channel);
  doSend(channel, ctx, text);
}

/** Send image as multi-modal content blocks (text + image). */
function sendImage(clip: { data: string; mediaType?: string }, channel: string, ctx: any): void {
  const mediaType = clip.mediaType ?? 'image/png';
  const label = `📷 Pasted ${mediaType} (${Math.round(clip.data.length * 0.75 / 1024)}kb)`;

  // Show a system message indicating the paste
  ctx.tui?.writeMessage('system', '*', label, channel);

  // Build content blocks: text placeholder + image
  const contentBlocks: Record<string, unknown>[] = [
    { type: 'text', text: `[${label}]` },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: clip.data,
      },
    },
  ];

  doSend(channel, ctx, contentBlocks);
}

/** Route content (string or content blocks) through the agent. */
async function doSend(
  channel: string,
  ctx: any,
  content: string | Record<string, unknown>[],
): Promise<void> {
  const agent = ctx.channelAgents?.get(channel);
  if (!agent) {
    ctx.tui?.writeMessage('system', '*', `No agent for ${channel}`, channel);
    return;
  }
  const streamRouter = ctx.streamRouter;
  if (!streamRouter) {
    ctx.tui?.writeMessage('system', '*', 'No stream router available', channel);
    return;
  }

  try {
    const nick = ctx.getUserNick?.() ?? 'user';
    await streamRouter.route(agent, content, { channel, nick });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.tui?.writeMessage('system', 'err', `Paste error: ${msg}`, channel);
    ctx.tui?.writeMessage('system', 'err', `Paste error: ${msg}`, '#errors');
  }
}
