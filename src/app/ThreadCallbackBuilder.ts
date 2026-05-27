import type { TuiRenderer } from './TuiRenderer.js';
import type { ChannelAgent, ProviderPool } from '../providers/index.js';
import type { McpManager } from './McpManager.js';
import type { ThreadCoordinator } from '../threads/index.js';
import type { SessionState } from './SessionState.js';
import { logError } from '../core/index.js';
/** Interface for ThreadCallbackDeps. */
export interface ThreadCallbackDeps {
  getTui: () => TuiRenderer | null;
  getChannelAgents: () => Map<string, ChannelAgent>;
  getMcpManager: () => McpManager;
  getProviderPool: () => ProviderPool;
  getThreadCoordinator: () => ThreadCoordinator | undefined;
  getSessionState: () => SessionState;
  calculateCost: (model: string, input: number, output: number, cacheRead?: number, cacheWrite?: number) => number;
  refreshProviderStats: () => void;
  getUsageStats: () => { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number };
  trackModelCost: (model: string, cost: number, input: number, output: number) => void;
}
/** Build callback handlers for thread events (stream chunks, errors, usage, MCP tools). */
export function buildThreadCallbacks(deps: ThreadCallbackDeps): any {
  return {
    onStreamChunk: (channel: string, chunk: any) => {
      const agent = deps.getChannelAgents().get(channel) as any;
      agent?.handleChunk?.(chunk);
    },
    onError: (channel: string, message: string) => {
      deps.getTui()?.writeMessage('system', 'err', `[${channel}] ${message}`, '#logs');
    },
    onStatusChange: (channel: string, status: any) => {
      deps.getTui()?.updateAgentStatus(channel, status);
    },
    onWorkerSpawned: (parentChannel: string, workerId: string) => {
      const workerLabel = workerId.replace(/^worker-/, '').replace(/-\d+$/, '').slice(0, 15);
      deps.getTui()?.addChannelChild(parentChannel, { id: workerId, label: workerLabel, status: 'thinking', role: 'worker' });
    },
    onWorkerComplete: (parentChannel: string, workerId: string, response: any) => {
      const workerNick = workerId.replace(/^worker-/, '').replace(/-\d+$/, '');
      if (response) deps.getTui()?.writeMessage('agent', workerNick, response, parentChannel);
      deps.getTui()?.updateChannelChild(parentChannel, workerId, { status: 'done' });
      setTimeout(() => deps.getTui()?.removeChannelChild(parentChannel, workerId), 5000);
    },
    onWorkerError: (parentChannel: string, workerId: string, error: any) => {
      deps.getTui()?.updateChannelChild(parentChannel, workerId, { status: 'error' });
      deps.getTui()?.writeMessage('system', '*', `Worker ${workerId} failed: ${error}`, '#logs');
    },
    onUsage: (channel: string, usage: any) => {
      const agent = deps.getChannelAgents().get(channel);
      const threadInfo = deps.getThreadCoordinator()?.getThreadInfo(channel);
      const model = agent?.model ?? threadInfo?.model ?? '';
      const provType = agent?.providerType ?? threadInfo?.providerType ?? '';
      const cacheRead = usage.cache_read_tokens ?? 0;
      const cacheWrite = usage.cache_write_tokens ?? 0;
      const cost = deps.calculateCost(model, usage.input_tokens, usage.output_tokens, cacheRead, cacheWrite);
      const stats = deps.getUsageStats();
      stats.inputTokens += usage.input_tokens;
      stats.outputTokens += usage.output_tokens;
      stats.totalTokens += usage.total_tokens;
      stats.estimatedCost += cost;
      deps.trackModelCost?.(model, cost, usage.input_tokens, usage.output_tokens);
      if (provType && model) {
        const adapter = deps.getProviderPool().get(provType, model) as any;
        adapter?.addExternalUsage?.(usage.input_tokens, usage.output_tokens, cacheRead, cacheWrite);
      }
      deps.refreshProviderStats();
    },
    onMcpToolRequest: (channel: string, requestId: string, server: string, tool: string, args: any) => {
      (deps.getMcpManager() as any).executeTool?.(server, tool, args).then((result: any) => {
        deps.getThreadCoordinator()?.respondMcpTool(channel, requestId, result);
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        deps.getThreadCoordinator()?.respondMcpTool(channel, requestId, { success: false, error: { message: msg, code: 'MCP_ERROR' } });
      });
    },
    onThreadDied: (channel: string) => {
      logError('repl', `Thread died: ${channel}`);
      deps.getTui()?.writeMessage('system', 'err', `Thread crashed: ${channel}`, '#logs');
    },
  };
}
/** Interface for ResumeAgentDeps. */
export interface ResumeAgentDeps {
  getTui: () => TuiRenderer | null;
  getChannelAgents: () => Map<string, ChannelAgent>;
  getAgentNick: () => string;
  setProcessing: (channel: string, state: boolean) => void;
  refreshProviderStats: () => void;
}
/** Resume an agent turn to process pending worker results. */
export function resumeAgentTurn(channel: string, deps: ResumeAgentDeps): void {
  const agent = deps.getChannelAgents().get(channel);
  if (!agent || agent.status !== 'idle') return;
  deps.setProcessing(channel, true);
  const tui = deps.getTui();
  const resume = async () => {
    try {
      if (tui && (agent as any).sendMessageStreaming) {
        tui.beginStreamMessage(deps.getAgentNick(), channel);
        for await (const chunk of agent.sendMessageStreaming('[system] Process pending worker results.')) {
          if (chunk.type === 'text' && chunk.text) tui.appendStreamChunk(chunk.text, channel);
          else if (chunk.type === 'thinking' && chunk.text) tui.appendStreamThinking(chunk.text, channel);
          else if (chunk.type === 'tool_call') {
            tui.finalizeStreamMessage(channel);
            const toolName = chunk.toolCall?.name ?? 'unknown';
            let argsStr = '';
            try { argsStr = JSON.stringify(JSON.parse(chunk.toolCall?.arguments ?? '{}')).slice(0, 80); } catch {}
            tui.writeToolBlock(toolName, argsStr, { success: true }, 0, channel);
          } else if (chunk.type === 'tool_result') {
            tui.writeToolBlock(chunk.toolName ?? 'tool', '', chunk.result as any, chunk.durationMs ?? 0, channel);
          } else if (chunk.type === 'done') {
            tui.stopThinking();
            tui.finalizeStreamMessage(channel);
          }
        }
      }
    } catch (err: unknown) {
      tui?.writeMessage('system', '*', `Resume error: ${err instanceof Error ? err.message : String(err)}`, channel);
    } finally {
      deps.setProcessing(channel, false);
      deps.refreshProviderStats();
    }
  };
  resume();
}