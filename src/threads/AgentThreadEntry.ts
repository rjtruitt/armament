/**
 * Worker thread entry point. Each channel runs in its own thread.
 * Receives config via workerData, communicates via parentPort.
 */

import { parentPort, workerData } from 'node:worker_threads';
import type { ChannelThreadConfig, InboundMessage, OutboundMessage, StreamChunk } from './ThreadProtocol.js';

if (!parentPort) throw new Error('AgentThreadEntry must run inside a worker_thread');

const config = workerData as ChannelThreadConfig;
const port = parentPort;

let agent: any = null;
let interrupted = false;
let pendingSubworkers: Map<string, { resolve: (response: string) => void; reject: (err: Error) => void }> = new Map();
let pendingMcpRequests: Map<string, { resolve: (result: any) => void; reject: (err: Error) => void }> = new Map();

function send(msg: OutboundMessage): void {
  port.postMessage(msg);
}

function log(level: 'info' | 'warn' | 'error', component: string, message: string, data?: any): void {
  send({ type: 'log', level, component, message, data });
}

async function initialize(): Promise<void> {
  try {
    const { ProviderPool } = await import('../providers/ProviderPool.js');
    const { ChannelAgent } = await import('../providers/ChannelAgent.js');
    const { getDefaultTools } = await import('../providers/BuiltinTools.js');

    const pool = new ProviderPool({});
    const adapter = await pool.getOrCreate(
      config.provider.type,
      config.provider.model,
      { region: config.provider.region, profile: config.provider.profile, apiKey: config.provider.apiKey, baseURL: config.provider.baseUrl, streaming: config.provider.streaming },
    );

    const tools = getDefaultTools();

    // Task tracking + plan mode for all agents
    const { createTaskTrackingTools } = await import('../providers/TaskTrackingTools.js');
    const { createPlanModeTools } = await import('../providers/PlanModeTools.js');
    const { ReadChannelTool } = await import('../providers/ReadChannelTool.js');
    const { tools: taskTools } = createTaskTrackingTools();
    tools.push(...taskTools, ...createPlanModeTools(), new ReadChannelTool());

    // Add MCP proxy tools
    if (config.tools) {
      for (const def of config.tools) {
        if (def.isMcp) {
          tools.push(createMcpProxyTool(def));
        }
      }
    }

    // If this is an orchestrator, add A2A tools
    if (!config.isWorker) {
      const { createA2AToolsForThread } = await import('./ThreadA2ATools.js');
      const a2aTools = createA2AToolsForThread({
        sendSubworkerRequest: (subConfig) => requestSubworker(subConfig),
        awaitSubworker: (workerId, timeoutMs) => awaitSubworker(workerId, timeoutMs),
      });
      tools.push(...a2aTools);
    } else {
      // Workers get complete_worker, report_progress
      const { CompleteWorkerTool, ReportProgressTool } = await import('../a2a/WorkerTools.js');
      tools.push(new CompleteWorkerTool());
      tools.push(new ReportProgressTool(config.channelName, (workerId, progress, percent) => {
        send({ type: 'worker_progress', workerId, progress, percent });
      }));
    }

    agent = new ChannelAgent({
      name: config.channelName,
      provider: adapter,
      model: config.provider.model,
      providerType: config.provider.type,
      systemPrompt: config.systemPrompt,
      maxTurns: config.maxTurns ?? (config.isWorker ? config.workerMaxTurns ?? 250 : 250),
      maxOutputTokens: config.maxOutputTokens,
      tools,
      stickyNotes: config.stickyNotes?.map(s => ({ content: s.content, position: s.position })),
      contextWindow: config.contextWindow,
      onTurnStart: (turnNumber: number) => {
        send({ type: 'turn_start', turnNumber });
        send({ type: 'status_change', status: 'thinking' });
      },
      onTurnComplete: (turnNumber: number, response: string) => {
        send({ type: 'turn_complete', turnNumber, response });
        send({ type: 'status_change', status: 'idle' });
      },
      onToolCall: (toolName: string, args: unknown) => {
        send({ type: 'tool_call', toolName, args });
        send({ type: 'status_change', status: 'tool_use' });
      },
      onToolResult: (toolName: string, args: unknown, result: any, durationMs: number) => {
        send({ type: 'tool_result', toolName, args, result, durationMs });
      },
      onUsage: (usage: any) => {
        send({ type: 'usage', usage });
      },
      onCompaction: (result: any) => {
        send({ type: 'compaction', before: result.before.tokens, after: result.after.tokens });
      },
      onSessionDirty: (channelName: string) => {
        send({ type: 'session_dirty', channelName });
      },
    });

    log('info', 'thread', `Agent initialized: ${config.channelName} (${config.provider.type}/${config.provider.model})`);
    send({ type: 'ready' });
  } catch (err: unknown) {
    log('error', 'thread', `Failed to initialize: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : undefined);
    send({ type: 'error', message: `Thread init failed: ${err instanceof Error ? err.message : String(err)}`, fatal: true });
    process.exit(1);
  }
}

async function handleSendMessage(id: string, input: string): Promise<void> {
  interrupted = false;
  send({ type: 'status_change', status: 'thinking' });

  try {
    if (agent.sendMessageStreaming) {
      for await (const chunk of agent.sendMessageStreaming(input)) {
        if (interrupted) {
          send({ type: 'stream_chunk', chunk: { kind: 'done' } });
          break;
        }
        const mapped = mapChunk(chunk);
        if (mapped) send({ type: 'stream_chunk', chunk: mapped });
      }
    } else {
      const response = await agent.sendMessage(input);
      send({ type: 'stream_chunk', chunk: { kind: 'text', text: response } });
      send({ type: 'stream_chunk', chunk: { kind: 'done' } });
    }
  } catch (err: unknown) {
    log('error', 'thread', `sendMessage error: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : undefined);
    send({ type: 'error', message: err instanceof Error ? err.message : String(err), code: err instanceof Error && 'code' in err ? (err as any).code : undefined });
  }

  // Send updated context usage
  const ctx = agent.getContextUsage();
  send({ type: 'context_usage', ...ctx });
  send({ type: 'status_change', status: 'idle' });
}

function mapChunk(chunk: any): StreamChunk | null {
  switch (chunk.type) {
    case 'text': return { kind: 'text', text: chunk.text };
    case 'thinking': return { kind: 'thinking', text: chunk.text };
    case 'tool_start': return { kind: 'tool_start', toolName: chunk.toolName };
    case 'tool_progress': return { kind: 'tool_progress', toolName: chunk.toolName, bytes: chunk.bytes ?? 0 };
    case 'tool_call': return { kind: 'tool_call', toolCall: chunk.toolCall };
    case 'tool_result': return { kind: 'tool_result', toolName: chunk.toolName, toolCall: chunk.toolCall, result: chunk.result, durationMs: chunk.durationMs ?? 0 };
    case 'done': return { kind: 'done' };
    default: return null;
  }
}

function requestSubworker(subConfig: any): Promise<string> {
  const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pendingSubworkers.set(id, { resolve, reject });
    send({ type: 'request_subworker', id, config: subConfig });
  });
}

function awaitSubworker(workerId: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const existing = pendingSubworkers.get(workerId);
    if (existing) {
      // Already waiting from spawn
      return;
    }
    pendingSubworkers.set(workerId, { resolve, reject });
    setTimeout(() => {
      if (pendingSubworkers.has(workerId)) {
        pendingSubworkers.delete(workerId);
        reject(new Error('timeout'));
      }
    }, timeoutMs);
  });
}

function createMcpProxyTool(def: any): any {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    async execute(args: any) {
      const requestId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve, reject) => {
        pendingMcpRequests.set(requestId, { resolve, reject });
        send({ type: 'mcp_tool_request', requestId, server: def.mcpServer!, tool: def.name, args });
        setTimeout(() => {
          if (pendingMcpRequests.has(requestId)) {
            pendingMcpRequests.delete(requestId);
            reject(new Error(`MCP tool timeout: ${def.name}`));
          }
        }, 120_000);
      });
    },
  };
}

// --- Message handler ---

port.on('message', async (msg: InboundMessage) => {
  switch (msg.type) {
    case 'send_message':
      await handleSendMessage(msg.id, msg.input);
      break;

    case 'interrupt':
      interrupted = true;
      break;

    case 'export_session':
      if (agent) {
        const state = agent.exportSession();
        send({ type: 'export_session_result', id: msg.id, state });
      }
      break;

    case 'import_session':
      if (agent) agent.importSession(msg.state);
      break;

    case 'compact':
      if (agent) {
        const result = await agent.compact(msg.force);
        send({ type: 'compact_result', id: msg.id, result });
      }
      break;

    case 'add_sticky':
      if (agent) agent.addStickyNote(msg.content, msg.position);
      break;

    case 'add_system_message':
      if (agent) {
        const mm = (agent as any)._loop?.getMessageManager?.();
        if (mm) mm.addMessage({ role: 'system', content: msg.content });
      }
      break;

    case 'remove_sticky':
      if (agent) agent.removeStickyNote(msg.index);
      break;

    case 'register_tool':
      if (agent && msg.toolDef?.name) {
        agent.registerTool({
          name: msg.toolDef.name,
          description: msg.toolDef.description || '',
          inputSchema: msg.toolDef.inputSchema || { type: 'object', properties: {} },
          execute: async (args: any) => {
            const requestId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            return new Promise((resolve, reject) => {
              pendingMcpRequests.set(requestId, { resolve, reject });
              send({ type: 'tool_execute', requestId, name: msg.toolDef.name, args } as any);
              setTimeout(() => {
                if (pendingMcpRequests.has(requestId)) {
                  pendingMcpRequests.delete(requestId);
                  reject(new Error('Tool execution timed out'));
                }
              }, 30000);
            });
          },
        } as any);
      }
      break;

    case 'deregister_tool':
      if (agent) agent.deregisterTool(msg.name);
      break;

    case 'mcp_tool_result': {
      const pending = pendingMcpRequests.get(msg.requestId);
      if (pending) {
        pendingMcpRequests.delete(msg.requestId);
        pending.resolve(msg.result);
      }
      break;
    }

    case 'subworker_complete': {
      const pending = pendingSubworkers.get(msg.workerId);
      if (pending) {
        pendingSubworkers.delete(msg.workerId);
        pending.resolve(msg.response);
      }
      break;
    }

    case 'subworker_error': {
      const pending = pendingSubworkers.get(msg.workerId);
      if (pending) {
        pendingSubworkers.delete(msg.workerId);
        pending.reject(new Error(msg.error));
      }
      break;
    }

    case 'shutdown':
      if (agent) await agent.shutdown();
      process.exit(0);
      break;

    case 'set_workspace':
      if (agent) agent.setWorkspace(msg.workspace);
      break;
  }
});

// Start initialization
initialize();
