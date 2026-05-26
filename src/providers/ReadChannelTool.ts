/** ReadChannelTool — pulls another channel's session state + notes.md in one call. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';
import { bareName, getNotesPath, armaDataDir } from '../app/ChannelPaths.js';

/** Reads a channel's session state file and workspace notes.md. */
export class ReadChannelTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'read_channel';
  /**
   * description property.
   */
  readonly description = `Pull another channel's conversation history and notes.md. Use to catch up on what happened in another channel, review past discussions, or investigate bugs.

Usage: {"channel": "general"}
       {"channel": "general", "includeMessages": true}

The channel name can be with or without the # prefix (e.g. "general" or "#general"). 
Returns the channel's notes.md content, agent info (model, provider, turn count, tokens), 
and optionally the full message history (may be large).`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    channel: z.string().describe('Channel name (with or without # prefix, e.g. "general" or "#general")'),
    includeMessages: z.boolean().optional().describe('If true, includes full message history (may be large). Default: false'),
  });

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { channel, includeMessages } = args as { channel: string; includeMessages?: boolean };

    if (!channel) {
      return { success: false, error: { message: `Missing required "channel". Usage: {"channel": "general"}`, code: 'INVALID_ARGS' } };
    }

    const chName = channel.startsWith('#') ? channel : `#${channel}`;
    const slug = bareName(chName).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    // Read session state file from ~/.arma
    const statePath = join(armaDataDir(), 'sessions', 'channels', `${slug}.state.json`);
    let state: any = null;
    let stateErr: string | null = null;
    if (existsSync(statePath)) {
      try {
        const raw = readFileSync(statePath, 'utf-8');
        state = JSON.parse(raw);
      } catch (e: any) {
        stateErr = `Failed to parse state file: ${e.message}`;
      }
    } else {
      stateErr = `No session file found at ${statePath}`;
    }

    // Read notes.md
    const notesPath = getNotesPath(chName);
    let notes: string | null = null;
    let notesErr: string | null = null;
    if (existsSync(notesPath)) {
      try {
        notes = readFileSync(notesPath, 'utf-8');
      } catch (e: any) {
        notesErr = `Failed to read notes.md: ${e.message}`;
      }
    } else {
      notesErr = `No notes.md found for ${chName}`;
    }

    // Build output
    const output: string[] = [];

    // --- Notes section ---
    output.push(`## ${chName} notes.md`);
    if (notes !== null) {
      output.push(notes);
    } else {
      output.push(notesErr!);
    }

    // --- Agent info section ---
    output.push(`\n## ${chName} agent info`);
    if (state?.agentConfig) {
      const cfg = state.agentConfig;
      output.push(`Model: ${cfg.model ?? 'unknown'}`);
      output.push(`Provider: ${cfg.provider ?? 'unknown'}`);
      output.push(`Tools: ${(cfg.tools ?? []).join(', ')}`);
    } else {
      output.push('No agent config found.');
    }
    output.push(`Turn count: ${state?.turnCount ?? 0}`);
    output.push(`Total tokens: ${state?.totalTokens ?? 0}`);

    // --- Chat messages section ---
    const chatMsgs = state?.chatMessages ?? [];
    const msgCount = chatMsgs.length;
    output.push(`\n## ${chName} chat history (${msgCount} messages)`);
    if (msgCount > 0) {
      for (const msg of chatMsgs) {
        const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '??:??:??';
        const sender = msg.sender ?? '?';
        const type = msg.type ?? '?';
        const content = (msg.content ?? '').slice(0, 200);
        output.push(`[${ts}] <${type}:${sender}> ${content}`);
      }
    }

    // --- Full messages section (optional, can be large) ---
    if (includeMessages && state?.messages) {
      const fullMsgs = state.messages;
      output.push(`\n## ${chName} full message history (${fullMsgs.length} messages)`);
      for (let i = 0; i < fullMsgs.length; i++) {
        const m = fullMsgs[i];
        const role = m.role ?? '?';
        const content = typeof m.content === 'string' ? m.content.slice(0, 300) : JSON.stringify(m.content).slice(0, 300);
        const extra = m.tool_call_id ? ` [tc:${m.tool_call_id}]` : m.tool_calls ? ` [${m.tool_calls.length} tool_calls]` : '';
        output.push(`[${i}] ${role}${extra}: ${content}`);
      }
    }

    return { success: true, data: output.join('\n') };
  }
}
