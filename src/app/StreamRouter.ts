import type { ChannelAgent } from '../providers/index.js';
import type { TuiRenderer } from './TuiRenderer.js';
import { getGlobalEventBus } from './EventBus.js';

/**
 * RenderMode type definition.
 */
export type RenderMode = 'full' | 'tools-only' | 'silent';

/**
 * Output target interface.
 */
export interface OutputTarget {
  channel: string;
  nick: string;
  render?: RenderMode;
  flowChannel?: string;
  prefix?: string;
}

/**
 * Stream router deps interface.
 */
export interface StreamRouterDeps {
  getTui: () => TuiRenderer | null;
  getUserNick: () => string;
  getInputQueue: () => (string | { text: string; channel: string })[];
  onPostStream?: (agent: ChannelAgent, channel: string) => void;
  onError?: (component: string, msg: string, err?: unknown) => void;
}

/**
 * Stream router class.
 */
export class StreamRouter {
  private _pendingToolBlocks: Map<string, { blockId: number; channel: string }> = new Map();
  private _pendingToolStartBlock: { blockId: number; channel: string; toolName: string } | null = null;
  private deps: StreamRouterDeps;

  constructor(deps: StreamRouterDeps) {
    this.deps = deps;
  }

  /**
   * Gets the pending tool blocks.
   */
  get pendingToolBlocks(): Map<string, { blockId: number; channel: string }> {
    return this._pendingToolBlocks;
  }

  /**
   * Gets the pending tool start block.
   */
  get pendingToolStartBlock(): { blockId: number; channel: string; toolName: string } | null {
    return this._pendingToolStartBlock;
  }

  /**
   * Sets the pending tool start block.
   */
  set pendingToolStartBlock(v: { blockId: number; channel: string; toolName: string } | null) {
    this._pendingToolStartBlock = v;
  }

  /**
   * Route.
   */
  async route(
    agent: ChannelAgent, input: string, target: OutputTarget, interrupted?: () => boolean,
  ): Promise<string> {
    const tui = this.deps.getTui();
    const mode = target.render ?? 'full';

    if (mode === 'silent' || !(agent as any).sendMessageStreaming) {
      return this.routeNonStreaming(agent, input, target, tui);
    }

    return this.runStreamLoop(agent, input, target, tui, mode, interrupted);
  }

  /**
   * Route async.
   */
  routeAsync(agent: ChannelAgent, input: string, target: OutputTarget): void {
    this.route(agent, input, target).catch((err: unknown) => {
      const tui = this.deps.getTui();
      const errMsg = err instanceof Error ? err.message : String(err);
      tui?.writeMessage('system', 'err', `Agent error: ${errMsg}`, target.channel);
      tui?.writeMessage('system', 'err', `Agent error: ${errMsg}`, '#errors');
    });
  }

  /** @deprecated Use route() with render mode. Kept for existing callers. */
  async routeStream(
    agent: ChannelAgent, input: string, target: OutputTarget, interrupted?: () => boolean,
  ): Promise<string> {
    return this.route(agent, input, { ...target, render: 'full' }, interrupted);
  }

  /** @deprecated Use route() with render:'silent'. Kept for existing callers. */
  async routeSync(agent: ChannelAgent, input: string, target: OutputTarget): Promise<string> {
    return this.route(agent, input, { ...target, render: 'silent' });
  }

  private async routeNonStreaming(
    agent: ChannelAgent, input: string, target: OutputTarget, tui: TuiRenderer | null,
  ): Promise<string> {
    const bus = getGlobalEventBus();
    bus.emit({ type: 'message', channel: target.channel, message: { role: 'user', content: input, timestamp: Date.now() } });
    const response = await agent.sendMessage(input);
    if (response && tui && target.render !== 'silent') {
      tui?.writeMessage('agent', target.nick, response, target.channel);
    }
    this.deps.onPostStream?.(agent, target.channel);
    bus.emit({ type: 'message', channel: target.channel, message: { role: 'assistant', content: response, timestamp: Date.now() } });
    return response;
  }

  private async runStreamLoop(
    agent: ChannelAgent,
    input: string,
    target: OutputTarget,
    tui: TuiRenderer | null,
    mode: 'full' | 'tools-only',
    interrupted?: () => boolean,
  ): Promise<string> {
    const showText = mode === 'full';
    const pendingTools = new Map<string, { blockId: number; channel: string }>();
    let pendingStart: { blockId: number; channel: string; toolName: string } | null = null;
    let fullResponse = '';
    let inToolCall = false;

    const bus = getGlobalEventBus();
    bus.emit({ type: 'message', channel: target.channel, message: { role: 'user', content: input, timestamp: Date.now() } });

    tui?.startThinking(target.channel);

    try {
      for await (const chunk of agent.sendMessageStreaming(input)) {
        if (interrupted?.()) break;

        switch (chunk.type) {
          case 'text':
          if (!chunk.text) break;
          fullResponse += chunk.text;
          if (showText) {
            // Begin stream on first content — not before, so no empty header if first thing is a tool
            if (!tui?.isChannelStreaming(target.channel)) {
              tui?.beginStreamMessage(target.nick, target.channel);
            }
            tui?.appendStreamChunk(chunk.text, target.channel);
          }
          break;

        case 'thinking':
          if (!chunk.text) break;
          bus.emit({ type: 'thinking', channel: target.channel, text: chunk.text });
          if (showText) {
            // Always show thinking in the buffer — user needs to see what's happening
            if (!tui?.isChannelStreaming(target.channel)) {
              tui?.beginStreamMessage(target.nick, target.channel);
            }
            tui?.appendStreamThinking(chunk.text, target.channel);
          }
          break;

        case 'tool_start': {
          if (showText) tui?.finalizeStreamMessage(target.channel);
          tui?.stopThinking(target.channel);
          inToolCall = true;
          const startName = chunk.toolName ?? 'tool';
          const blockId = tui?.beginToolBlock(startName, 'streaming...', target.channel);
          if (blockId !== undefined) {
            pendingStart = { blockId, channel: target.channel, toolName: startName };
          }
          getGlobalEventBus().emit({ type: 'tool_start', channel: target.channel, toolName: startName });
          break;
        }

        case 'tool_progress':
          if (pendingStart && chunk.bytes) {
            const kb = (chunk.bytes / 1024).toFixed(1);
            tui?.updateToolBlockDescription(
              pendingStart.channel, pendingStart.blockId, `streaming... ${kb}kb`,
            );
          }
          break;

        case 'tool_call': {
          if (showText && !inToolCall) {
            tui?.finalizeStreamMessage(target.channel);
            inToolCall = true;
          }
          const toolName = chunk.toolCall?.name ?? chunk.toolName ?? 'unknown';
          let argsStr = '';
          if (chunk.toolCall?.arguments) {
            try { argsStr = JSON.stringify(JSON.parse(chunk.toolCall.arguments)).slice(0, 80); }
            catch { argsStr = chunk.toolCall.arguments.slice(0, 80); }
          }
          if (pendingStart) {
            tui?.updateToolBlockDescription(
              pendingStart.channel, pendingStart.blockId, argsStr || toolName,
            );
            pendingTools.set(chunk.toolCall?.id ?? toolName, {
              blockId: pendingStart.blockId, channel: pendingStart.channel,
            });
            pendingStart = null;
          } else if (tui) {
            const blockId = tui.beginToolBlock(toolName, argsStr, target.channel);
            pendingTools.set(chunk.toolCall?.id ?? toolName, { blockId, channel: target.channel });
          }
          getGlobalEventBus().emit({
            type: 'tool_call', channel: target.channel,
            toolName, toolArgs: argsStr, toolId: chunk.toolCall?.id,
          });
          if (target.flowChannel) {
            const prefix = target.prefix ?? `<${target.nick}>`;
            tui?.writeMessage('system', 'flow', `${prefix} ⚙ ${toolName}`, target.flowChannel);
          }
          break;
        }

        case 'tool_result': {
          const key = chunk.toolCall?.id ?? chunk.toolName;
          const pending = pendingTools.get(key!);
          if (pending) {
            const result = chunk.result as any;
            const data = result?.success
              ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? '').slice(0, 200))
              : undefined;
            const error = !result?.success ? (result?.error?.message ?? 'failed') : undefined;
            tui?.completeToolBlock(
              pending.channel, pending.blockId,
              { success: result?.success ?? false, data, error },
              chunk.durationMs,
            );
            pendingTools.delete(key!);
            getGlobalEventBus().emit({
              type: 'tool_result', channel: target.channel,
              toolName: chunk.toolCall?.name ?? chunk.toolName ?? 'tool',
              toolId: chunk.toolCall?.id, success: result?.success ?? false,
              data: data?.slice(0, 500),
              error,
              durationMs: chunk.durationMs,
            });
            if (target.flowChannel) {
              const prefix = target.prefix ?? `<${target.nick}>`;
              const toolId = chunk.toolCall?.name ?? chunk.toolName ?? 'tool';
              const statusIcon = result?.success ? '✓' : '✗';
              tui?.writeMessage('system', 'flow', `${prefix} ${statusIcon} ${toolId}`, target.flowChannel);
            }
          }
          tui?.startThinking(target.channel);
          if (showText) {
            await new Promise(r => setImmediate(r));
            const queue = this.deps.getInputQueue();
            if (queue.length > 0) {
              // If user hit Ctrl+C, don't inject messages mid-stream — leave them
              // in the queue so _processMessage's finally block can drain them
              // after the interrupt is handled.
              if (interrupted?.()) {
                tui?.flushStaging(target.channel);
              } else {
                tui?.flushStaging(target.channel);
                const drained: (string | { text: string; channel: string })[] = [];
                const remaining: (string | { text: string; channel: string })[] = [];
                while (queue.length > 0) {
                  const entry = queue.shift()!;
                  const entryChannel = typeof entry === 'string' ? undefined : (entry as { text: string; channel: string }).channel;
                  // Only drain messages for the current channel — requeue others
                  if (entryChannel !== undefined && entryChannel !== target.channel) {
                    remaining.push(entry);
                  } else {
                    drained.push(entry);
                  }
                }
                for (const item of drained) {
                  const injected = typeof item === 'string' ? item : (item as { text: string; channel: string }).text;
                  tui?.writeMessage('user', this.deps.getUserNick(), injected, target.channel);
                  agent.injectMessage(injected);
                }
                // Put back messages for other channels
                for (const entry of remaining) {
                  queue.push(entry);
                }
              }
            }
          }
          break;
        }

        case 'done':
          tui?.stopThinking(target.channel);
          if (showText) tui?.finalizeStreamMessage(target.channel);
          break;
      }
    }
  } catch (err: unknown) {
    // Generator error — log to #errors channel, store in debug buffer, and re-throw
    const errMsg = err instanceof Error ? err.message : String(err);
    tui?.writeMessage('system', 'err', `Stream error on ${target.channel}: ${errMsg}`, '#errors');
    this.deps.onError?.('stream', `Stream error on ${target.channel}`, err);
    throw err;
  } finally {
    // ALWAYS clear thinking indicator, no matter how the loop exits
    tui?.stopThinking(target.channel);
  }

    if (interrupted?.()) {
      tui?.stopThinking(target.channel);
      if (showText) tui?.cancelStreamMessage(target.channel);
    }

    if (!showText && fullResponse) {
      tui?.writeMessage('agent', target.nick, fullResponse, target.channel);
    }

    // Store pending tool state for interactive mode (external resume support)
    if (showText) {
      this._pendingToolBlocks = pendingTools;
      this._pendingToolStartBlock = pendingStart;
    }

    this.deps.onPostStream?.(agent, target.channel);

    const mm = (agent as any)._loop?.getMessageManager?.();
    if (mm) {
      const allMessages = mm.getMessages();
      let lastUserIdx = -1;
      for (let i = allMessages.length - 1; i >= 0; i--) {
        if (allMessages[i].role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx >= 0) {
        for (let i = lastUserIdx; i < allMessages.length; i++) {
          const m = allMessages[i];
          if (m.role === 'user') continue;
          bus.emit({
            type: 'message',
            channel: target.channel,
            message: {
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              thinking: (m as any).reasoning || (m as any).thinking,
              tool_calls: m.tool_calls || undefined,
              timestamp: Date.now(),
            },
          });
        }
      }
    }

    return fullResponse;
  }
}
