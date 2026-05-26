/** CrossChannelTool — send messages to other channels.
 *  Idle → fire-and-forget sendMessageStreaming (async generator yields to event loop).
 *  Busy → injectMessage (picked up on drain).
 *  Skips agents without a connected provider (status=complete|error).
 */

import type { ITool, ToolResult, ToolContext } from 'iteratio';
import type { IChannelAgent } from '../core/interfaces/IChannelAgent.js';
import { logError } from '../core/index.js';
import { z } from 'zod';

/** Status values indicating the agent has an active provider connection. */
const CONNECTED_STATUSES = new Set(['idle', 'thinking', 'tool_use']);

/**
 * Check if an agent has an active provider connection.
 * Agents with status 'idle', 'thinking', or 'tool_use' have live provider connections.
 * Agents with status 'complete' or 'error' are disconnected.
 */
function isConnected(agent: IChannelAgent): boolean {
  return CONNECTED_STATUSES.has(agent.status);
}

/** Tool to send messages to another channel's agent. */
export class SendToChannelTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'send_to_channel';
  /**
   * description property.
   */
  readonly description = `Send a message to another channel's agent. If the target is idle,
the message is processed and the response appears in that channel's conversation.
If the target is busy, the message is queued silently.

Examples:
  {"channel": "iteratio", "message": "Update the architecture docs with the latest changes."}
  {"channel": "#iteratio", "message": "Run npm test and report results."}
  {"channel": "general", "message": "What's the status of the release?"}`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    channel: z.string().describe('Target channel name (with or without # prefix, e.g. "iteratio" or "#iteratio")'),
    message: z.string().describe('The message to send to the target channel\'s agent'),
  });

  private _channelAgents: Map<string, IChannelAgent>;
  private _sourceChannel: string;

  constructor(channelAgents: Map<string, IChannelAgent>, sourceChannel: string) {
    this._channelAgents = channelAgents;
    this._sourceChannel = sourceChannel;
  }

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { channel, message } = args as { channel: string; message: string };

    if (!channel || !message) {
      return { success: false, error: { message: `Both "channel" and "message" are required.`, code: 'INVALID_ARGS' } };
    }

    const chName = channel.startsWith('#') ? channel : `#${channel}`;
    const targetAgent = this._channelAgents.get(chName);

    if (!targetAgent) {
      return {
        success: false,
        error: {
          message: `Channel ${chName} not found. Available: ${[...this._channelAgents.keys()].join(', ')}`,
          code: 'NOT_FOUND',
        },
      };
    }

    if (!isConnected(targetAgent)) {
      return {
        success: false,
        error: {
          message: `Channel ${chName} is offline (status: ${targetAgent.status}). No provider connected.`,
          code: 'OFFLINE',
        },
      };
    }

    const prefixed = `[cross-channel from channel ${this._sourceChannel}] ${message}`;

    // Start streaming immediately — async generator yields to event loop on first await.
    // No re-entrancy because the streaming loop runs asynchronously on the target agent.
    if (targetAgent.status === 'idle') {
      (async () => {
        try {
          for await (const _ of targetAgent.sendMessageStreaming(prefixed)) {}
        } catch (err: unknown) {
          logError('cross-channel', `sendMessageStreaming error on ${chName}`, err);
        }
      })();
    } else {
      targetAgent.injectMessage(prefixed);
    }

    return {
      success: true,
      data: `Message sent to ${chName} (${targetAgent.status}). Use read_channel to see the response.`,
    };
  }
}

/** Broadcast a message to all chat channels (those with # prefix, excluding workers/flows). */
export class BroadcastTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'broadcast';
  /**
   * description property.
   */
  readonly description = `Send a message to ALL chat channels. Useful for asking "Who's working on X?" or broadcasting an announcement.

Only reaches chat channels (those with # prefix) — workers and flow channels are excluded.
Responses appear in each target channel's conversation.

Examples:
  {"message": "Who is working on the iteratio project?"}
  {"message": "Heads up: I'm about to deploy to production."}`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    message: z.string().describe('The message to broadcast to all channels'),
    waitSeconds: z.number().optional().describe('Max seconds to wait for responses (default: 30, max: 120)'),
  });

  private _channelAgents: Map<string, IChannelAgent>;
  private _sourceChannel: string;

  constructor(channelAgents: Map<string, IChannelAgent>, sourceChannel: string) {
    this._channelAgents = channelAgents;
    this._sourceChannel = sourceChannel;
  }

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { message } = args as { message: string };

    if (!message) {
      return { success: false, error: { message: `"message" is required.`, code: 'INVALID_ARGS' } };
    }

    // Gather all chat channels with connected providers (exclude self, workers, non-#)
    const targets: string[] = [];
    let skipped = 0;
    for (const [name, agent] of this._channelAgents) {
      if (name === this._sourceChannel) continue; // Skip self
      if (name.startsWith('worker-')) continue;   // Skip workers
      if (!name.startsWith('#')) continue;         // Skip non-chat (flow) channels
      if (!isConnected(agent)) {
        skipped++;
        continue;
      }
      targets.push(name);
    }

    if (targets.length === 0) {
      const msg = skipped > 0
        ? `No connected chat channels to broadcast to (${skipped} offline).`
        : 'No other chat channels to broadcast to.';
      return { success: true, data: msg };
    }

    const prefixed = `[broadcast from channel ${this._sourceChannel}] ${message}`;

    for (const name of targets) {
      const agent = this._channelAgents.get(name)!;
      if (agent.status === 'idle') {
        // Start streaming immediately — async generator yields to event loop on first await.
        (async () => {
          try {
            for await (const _ of agent.sendMessageStreaming(prefixed)) {}
          } catch (err: unknown) {
            logError('broadcast', `sendMessageStreaming error on ${name}`, err);
          }
        })();
      } else {
        agent.injectMessage(prefixed);
      }
    }

    const suffix = skipped > 0 ? ` (${skipped} offline channel${skipped > 1 ? 's' : ''} skipped)` : '';
    return {
      success: true,
      data: `Broadcast sent to ${targets.length} channel(s): ${targets.join(', ')}.${suffix} Responses appear in each channel's conversation. Use read_channel to check.`,
    };
  }
}

/** Factory: creates cross-channel tools. */
export function createCrossChannelTools(channelAgents: Map<string, IChannelAgent>, sourceChannel: string): ITool[] {
  return [
    new SendToChannelTool(channelAgents, sourceChannel),
    new BroadcastTool(channelAgents, sourceChannel),
  ];
}
