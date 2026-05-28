/** ReadWorkerStateTool — pulls a completed worker's state from its sandbox dir. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';
import { getArmaPath, bareName } from '../app/ChannelPaths.js';

/** Shape of exported worker session state stored in .armaws/workers/{id}/state.json. */
interface WorkerSessionState {
  turnCount?: number;
  totalTokens?: number;
  messages?: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: Array<{ id: string; name: string; arguments: string }> }>;
  model?: string;
  provider?: string;
}

/** Reads a worker's session state from its sandbox dir (.armaws/workers/{worker-id}/state.json). */
export class ReadWorkerStateTool implements ITool {
  readonly name = 'read_worker_state';
  readonly description = `Read a completed worker's conversation history from its sandbox directory.

Workers are transient — their state lives in .armaws/workers/{worker-id}/ and is cleaned up when the sandbox is deleted.

Usage: {"worker_id": "worker-scanner-1716300000000"}
       {"worker_id": "worker-scanner-1716300000000", "channel": "armament"}

- worker_id: the full worker ID (e.g. "worker-scanner-1716300000000")
- channel: the parent channel (default: current channel). Used to find the sandbox path.`;

  readonly schema = z.object({
    worker_id: z.string().describe('The worker ID (e.g. "worker-scanner-1716300000000")'),
    channel: z.string().optional().describe('Parent channel name (default: current channel). Used to find .armaws/workers/{id}/'),
    includeMessages: z.boolean().optional().describe('If true, includes full message history (may be large). Default: false'),
  });

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { worker_id, channel, includeMessages } = args as { worker_id: string; channel?: string; includeMessages?: boolean };

    if (!worker_id) {
      return { success: false, error: { message: 'Missing required "worker_id". Usage: {"worker_id": "worker-scanner-1716300000000"}', code: 'INVALID_ARGS' } };
    }

    // Default to current channel (#armament) if not specified
    const parentChannel = channel ? (channel.startsWith('#') ? channel : `#${channel}`) : '#armament';
    const armaPath = getArmaPath(parentChannel);
    const statePath = join(armaPath, 'workers', worker_id, 'state.json');

    if (!existsSync(statePath)) {
      return {
        success: true,
        data: `No state found for worker "${worker_id}" at ${statePath}\n\nThe worker may still be running, or its sandbox was already cleaned up. Use get_workers() to check if it's active.`,
      };
    }

    let state: WorkerSessionState | null = null;
    try {
      const raw = readFileSync(statePath, 'utf-8');
      state = JSON.parse(raw);
    } catch (e: unknown) {
      return { success: false, error: { message: `Failed to parse worker state: ${e instanceof Error ? e.message : String(e)}`, code: 'PARSE_ERROR' } };
    }

    const output: string[] = [];
    output.push(`## Worker: ${worker_id}`);
    output.push(`Model: ${state!.model ?? 'unknown'}`);
    output.push(`Provider: ${state!.provider ?? 'unknown'}`);
    output.push(`Turn count: ${state!.turnCount ?? 0}`);
    output.push(`Total tokens: ${state!.totalTokens ?? 0}`);

    if (includeMessages && state!.messages) {
      const msgs = state!.messages;
      output.push(`\n## Message history (${msgs.length} messages)`);
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        const role = m.role ?? '?';
        const content = typeof m.content === 'string' ? m.content.slice(0, 300) : JSON.stringify(m.content).slice(0, 300);
        const extra = m.tool_call_id ? ` [tc:${m.tool_call_id}]` : m.tool_calls ? ` [${m.tool_calls.length} tool_calls]` : '';
        output.push(`[${i}] ${role}${extra}: ${content}`);
      }
    }

    return { success: true, data: output.join('\n') };
  }
}
