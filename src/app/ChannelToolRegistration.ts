import { ChannelAgent, getDefaultTools, createAskUserTool, createTaskTrackingTools, TaskStore, createTodoTool, createNudgeTools, createPlanModeTools } from '../providers/index.js';
import { ReadChannelTool } from '../providers/ReadChannelTool.js';
import { createCrossChannelTools } from '../providers/CrossChannelTool.js';
import { createDriftTools } from '../drift/DriftTools.js';
import type { NudgeStore } from '../providers/index.js';
import type { IChannelAgent } from '../core/index.js';
import { createA2ATools } from '../a2a/index.js';
import { logInfo, logError } from '../core/index.js';
import { getArmaPath, getChannelRoot } from './ChannelPaths.js';
import { getPermissionStore } from './PermissionStore.js';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import type { ChannelLifecycleDeps } from './ChannelLifecycleTypes.js';

/** Persist worker session state to its sandbox dir before cleanup. */
function persistWorkerState(workerId: string, chName: string, agents: Map<string, IChannelAgent>): void {
  try {
    const workerAgent = agents.get(workerId);
    if (workerAgent) {
      const state = workerAgent.exportSession();
      const armaPath = getArmaPath(chName);
      const statePath = join(armaPath, 'workers', workerId, 'state.json');
      writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    }
  } catch (e) {
    logError('a2a', `Failed to persist worker state for ${workerId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Context passed to createChannelAgent for tool wiring.
 */
export interface ChannelAgentContext {
  chName: string;
  adapter: any;
  model: string;
  provType: string;
  providerName?: string;
  deps: ChannelLifecycleDeps;
  taskStore: TaskStore;
  channelAgents: Map<string, IChannelAgent>;
  setScheduleStore: (store: NudgeStore) => void;
  setRuntime: (chName: string, runtime: any) => void;
  persistChannelState: (chName: string) => void;
}

/**
 * Creates a fully-wired ChannelAgent with all tools, callbacks, and lifecycle hooks.
 * Extracted from ChannelLifecycle to keep file sizes manageable.
 */
export function createChannelAgentWithTools(ctx: ChannelAgentContext): ChannelAgent {
  const { chName, adapter, model, provType, deps, taskStore, channelAgents } = ctx;

  const availableModels = deps.config.providers.flatMap((p: any) =>
    (p.models || []).map((m: any) => ({
      provider: p.type,
      model: typeof m === 'string' ? m : m.name,
      region: p.region,
      profile: p.profile,
    }))
  );

  // Find model-specific options from config (effort, reasoning_effort, etc.)
  const allModels = deps.config.providers.flatMap((p: any) => p.models || []);
  const matchedModel = allModels.find((m: any) => (typeof m === 'string' ? m : m.name) === model);
  const modelOptions = matchedModel && typeof matchedModel === 'object' && !Array.isArray(matchedModel)
    ? (matchedModel as any).options ?? {}
    : {};

  const workerMaxTurns = deps.config.session?.workerMaxTurns ?? 250;
  const workerUiTimers = new Map<string, NodeJS.Timeout>();
  const a2aResult = createA2ATools({
    providerPool: deps.providerPool,
    channelAgentFactory: (cfg) => new ChannelAgent(cfg),
    availableModels,
    getDefaultTools,
    workerMaxTurns,
    getWorkerCallbacks: (workerId: string) => ({
      onToolCall: (_toolName: string, _args: unknown) => {
        deps.callbacks.updateChannelChild(chName, workerId, { status: 'tool_use' });
      },
      onToolResult: (toolName: string, args: unknown, result: any, durationMs: number) => {
        deps.callbacks.writeToolBlock(
          toolName,
          typeof args === 'object' && args ? JSON.stringify(args).slice(0, 80) : '',
          { success: result.success, data: result.data ? JSON.stringify(result.data).slice(0, 200) : undefined, error: result.error?.message },
          durationMs,
          workerId,
        );
        deps.callbacks.updateChannelChild(chName, workerId, { status: 'idle' });
      },
      onTurnStart: (_turnNumber: number) => {
        deps.callbacks.updateChannelChild(chName, workerId, { status: 'thinking' });
      },
      onTurnComplete: (_turnNumber: number, response: string) => {
        if (response) {
          const workerNick = workerId.replace(/^worker-/, '').replace(/-\d+$/, '');
          deps.callbacks.writeMessage('agent', workerNick, response, workerId);
        }
        deps.callbacks.updateChannelChild(chName, workerId, { status: 'idle' });
        deps.refreshProviderStats();
      },
    }),
    onWorkerSpawned: (worker) => {
      logInfo('a2a', `Worker spawned: ${worker.name} model=${worker.model}`);
      channelAgents.set(worker.name, worker as ChannelAgent);

      // Auto-setup sandbox workspace + parent permissions for every worker
      try {
        const armaPath = getArmaPath(chName);
        const parentRoot = getChannelRoot(chName);
        const workerSandbox = join(armaPath, 'workers', worker.name);
        mkdirSync(workerSandbox, { recursive: true });
        worker.setWorkspace(`${workerSandbox}:${parentRoot}:/tmp:/dev`);
        getPermissionStore().rememberPath(worker.name, parentRoot);
        getPermissionStore().setWorkerParent(worker.name, chName);
      } catch (e) {
        logError('a2a', `Worker sandbox setup failed for ${worker.name}: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Background workers (scribe, etc.) don't show in sidebar or notify
      if (worker.name.startsWith('historyscribe') || worker.name.startsWith('worker-historyscribe')) {
        return;
      }
      const workerLabel = worker.name.replace(/^worker-/, '').replace(/-\d+$/, '').slice(0, 15);
      deps.callbacks.addChannelChild(chName, {
        id: worker.name,
        label: workerLabel,
        status: 'thinking',
        role: 'worker',
      });
      deps.callbacks.writeMessage('system', '*', `Worker spawned: ${worker.name} (${worker.model})`, chName);
      const startTime = Date.now();
      const uiTimer = setInterval(() => {
        if (worker.status === 'complete' || worker.status === 'error' || !channelAgents.has(worker.name)) {
          clearInterval(uiTimer);
          workerUiTimers.delete(worker.name);
          return;
        }
        deps.refreshProviderStats();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const ctx2 = worker.getContextUsage();
        const tokK = Math.floor(worker.totalTokens / 1000);
        const ctxPct = ctx2.percent;
        const tillCompact = Math.floor((ctx2.max * 0.75 - ctx2.current) / 1000);
        const compactStr = tillCompact > 0 ? ` ~${tillCompact}k til compact` : ' COMPACT SOON';
        deps.callbacks.updateChannelChild(chName, worker.name, {
          status: `t${worker.turnCount}/${worker.maxTurns} ${elapsed}s | ${tokK}k tok ${ctxPct}% ctx${compactStr}`,
        });
      }, 5000);
      workerUiTimers.set(worker.name, uiTimer);
    },
    onWorkerCancelled: (workerId: string) => {
      deps.callbacks.updateChannelChild(chName, workerId, { status: 'cancelled' });
      deps.callbacks.writeMessage('system', '*', `Worker cancelled: ${workerId}`, chName);
      const t = workerUiTimers.get(workerId);
      if (t) { clearInterval(t); workerUiTimers.delete(workerId); }
      persistWorkerState(workerId, chName, channelAgents);
      channelAgents.delete(workerId);
      setTimeout(() => deps.callbacks.removeChannelChild(chName, workerId), 3000);
    },
    onWorkerProgress: (workerId: string, progress: string, _percent?: number) => {
      const workerNick = workerId.replace(/^worker-/, '').replace(/-\d+$/, '');
      deps.callbacks.updateChannelChild(chName, workerId, { status: progress.slice(0, 40) });
      deps.callbacks.writeMessage('system', '*', `[${workerNick}] ${progress}`, chName);
    },
    onWorkerAsk: (workerId: string, question: string) => {
      const workerNick = workerId.replace(/^worker-/, '').replace(/-\d+$/, '');
      deps.callbacks.writeMessage('system', '*', `[${workerNick} asks] ${question}`, chName);
      const parentAgent = channelAgents.get(chName);
      if (parentAgent) {
        const msg = `[WORKER QUESTION: ${workerNick}] ${question}`;
        if (parentAgent.status === 'idle') {
          // Use streaming path — has injected message drain + per-iteration sanitizer
          (async () => { for await (const _ of parentAgent.sendMessageStreaming(msg)) {} })().catch(e => deps.callbacks.writeMessage('system', 'err', `Stream error: ${e instanceof Error ? e.message : String(e)}`, chName));
        } else {
          parentAgent.injectMessage(msg);
        }
      }
    },
    onWorkerComplete: (workerId: string, response: string) => {
      // Background workers — no completion messages
      if (workerId.startsWith("worker-historyscribe") || workerId.startsWith("historyscribe")) return;
      logInfo('a2a', `Worker complete: ${workerId} (${response.length} chars)`);
      const workerNick = workerId.replace(/^worker-/, '').replace(/-\d+$/, '');
      if (response) {
        deps.callbacks.writeMessage('agent', workerNick, response, chName);
      }
      deps.callbacks.writeToolBlock(
        workerNick,
        `task complete (${response.length} chars)`,
        { success: true, data: response },
        0,
        chName,
      );
      deps.callbacks.updateChannelChild(chName, workerId, { status: 'done' });
      deps.callbacks.writeMessage('system', '*', `Worker ${workerNick} completed`, '#logs');
      const t = workerUiTimers.get(workerId);
      if (t) { clearInterval(t); workerUiTimers.delete(workerId); }

      const parentAgent = channelAgents.get(chName);
      if (parentAgent) {
        const msg = `[WORKER COMPLETE: ${workerNick}]\n${response}`;
        if (parentAgent.status === 'idle') {
          (async () => { for await (const _ of parentAgent.sendMessageStreaming(msg)) {} })().catch(e => deps.callbacks.writeMessage('system', 'err', `Stream error: ${e instanceof Error ? e.message : String(e)}`, chName));
        } else {
          parentAgent.injectMessage(msg);
        }
      }

      // Persist worker state to sandbox before cleanup
      persistWorkerState(workerId, chName, channelAgents);

      channelAgents.delete(workerId);
      setTimeout(() => deps.callbacks.removeChannelChild(chName, workerId), 5000);
    },
    onWorkerError: (workerId: string, error: string) => {
      if (workerId.startsWith("worker-historyscribe") || workerId.startsWith("historyscribe")) return;
      logError('a2a', `Worker error: ${workerId}`, error);
      const workerNick = workerId.replace(/^worker-/, '').replace(/-\d+$/, '');
      deps.callbacks.writeToolBlock(
        workerNick,
        'task failed',
        { success: false, error },
        0,
        chName,
      );
      deps.callbacks.updateChannelChild(chName, workerId, { status: 'error' });
      deps.callbacks.writeMessage('system', '*', `Worker ${workerNick} failed: ${error}`, '#logs');
      const t = workerUiTimers.get(workerId);
      if (t) { clearInterval(t); workerUiTimers.delete(workerId); }

      const parentAgent = channelAgents.get(chName);
      if (parentAgent) {
        const msg = `[WORKER FAILED: ${workerNick}] ${error}`;
        if (parentAgent.status === 'idle') {
          (async () => { for await (const _ of parentAgent.sendMessageStreaming(msg)) {} })().catch(e => deps.callbacks.writeMessage('system', 'err', `Stream error: ${e instanceof Error ? e.message : String(e)}`, chName));
        } else {
          parentAgent.injectMessage(msg);
        }
      }

      persistWorkerState(workerId, chName, channelAgents);
      channelAgents.delete(workerId);
      setTimeout(() => deps.callbacks.removeChannelChild(chName, workerId), 5000);
    },
    getParentAgent: (_workerId: string) => {
      return channelAgents.get(chName);
    },
  });

  const askTool = createAskUserTool(deps.askUserHandler, chName);
  const { tools: taskTools } = createTaskTrackingTools(taskStore);
  const { tool: todoTool } = createTodoTool((rendered) => {
    deps.callbacks.writeMessage('system', 'todo', rendered, chName);
  });
  // Track pending nudges that were skipped due to idle state
  let pendingNudge: string | null = null;

  const nudgeResult = createNudgeTools((prompt, jobId, hidden) => {
    if (!hidden) {
      deps.callbacks.writeMessage('system', 'info', `[sched:${jobId}] ${prompt}`, chName);
    }
    const agent = channelAgents.get(chName);
    if (agent) {
      // Don't queue duplicate — if this exact prompt is already pending, skip.
      if (agent.hasPendingInjection(prompt)) return;
      agent.injectMessage(prompt);
    }
  }, {
    // Skip nudge when agent is idle — fire only when channel is active
    idleCheck: () => {
      const agent = channelAgents.get(chName);
      const isIdle = agent ? agent.status === 'idle' : true;
      return !isIdle; // true = fire (agent is active), false = skip (agent is idle)
    },
  });
  ctx.setScheduleStore(nudgeResult.store);
  const planTools = createPlanModeTools({
    onEnterPlan: () => deps.callbacks.writeMessage('system', 'info', '⚡ entered plan mode', chName),
    onExitPlan: (_id, plan) => deps.callbacks.writeMessage('system', 'plan', plan, chName),
  });

  const agent = new ChannelAgent({
    name: chName,
    provider: adapter,
    model,
    providerType: provType,
    providerName: ctx.providerName,
    modelOptions,
    tools: [
      ...getDefaultTools({
        onWriteComplete: async (reason, toolName, filePath) => {
          // Auto-snapshot after each write/edit/append
          try {
            await deps.driftManager.snapshot(chName, filePath, reason, toolName);
          } catch {}
        },
        providerPool: deps.providerPool,
      }),
      askTool,
      todoTool,
      ...a2aResult.tools,
      ...taskTools,
      ...nudgeResult.tools,
      ...planTools,
      ...createDriftTools(deps.driftManager, chName),
      new ReadChannelTool(),
      ...createCrossChannelTools(channelAgents, chName),
      ...deps.mcpManager.getConnectedMcpITools(),
      deps.catalogManager.createRequestTool((newTools) => {
        if (newTools.length > 0) agent.registerTools(newTools);
        deps.setActiveToolNames(deps.catalogManager.activeToolNames);
        deps.callbacks.writeMessage('system', 'info',
          `Loaded ${newTools.length} tool(s) into context`, '#logs');
      }),
    ],
    onTurnStart: (_turnNumber: number) => {
      deps.callbacks.startThinking(chName);
      deps.callbacks.updateAgentStatus(chName, 'thinking');
    },
    onTurnComplete: (_turnNumber: number, _response: string) => {
      deps.callbacks.stopThinking(chName);
      deps.callbacks.updateAgentStatus(chName, 'idle');
      // State file write happens in onPostStream (only when threshold hit) + on shutdown
    },
    onToolCall: (toolName: string, args: unknown) => {
      deps.callbacks.stopThinking(chName);
      deps.callbacks.startThinking(chName);
      deps.callbacks.updateAgentStatus(chName, 'tool_use');
      const argsStr = typeof args === 'object' && args ? JSON.stringify(args).slice(0, 60) : '';
      deps.callbacks.writeMessage('system', 'tool',
        `${toolName}(${argsStr})`, '#logs');
      if (toolName === 'send_worker_message' && args && typeof args === 'object') {
        const { workerId: wId, message: msg } = args as { workerId?: string; message?: string };
        if (wId && msg) {
          const parentNick = chName.startsWith('#') ? chName.slice(1) : chName;
          deps.callbacks.writeMessage('agent', parentNick, msg, wId);
        }
      }
    },
    onToolResult: (toolName: string, args: unknown, result: any, durationMs: number) => {
      deps.callbacks.stopThinking(chName);
      deps.callbacks.updateAgentStatus(chName, 'thinking');
      const status = result.success ? '✓' : '✗';
      deps.callbacks.writeMessage('system', 'tool',
        `${status} ${toolName} (${durationMs}ms)${result.error ? ` — ${result.error.message}` : ''}`, '#logs');
      if (result.success && (toolName === 'read_file' || toolName === 'file_read')) {
        const argsObj = args as Record<string, unknown>;
        const filePath = (argsObj?.path || argsObj?.file_path) as string | undefined;
        const lines = (result.data as string)?.split?.('\n')?.length ?? 0;
        if (filePath) {
          const ag = channelAgents.get(chName);
          ag?.trackFileRead(filePath, lines);
        }
      }
    },
    onUsage: (usage) => {
      const cost = deps.calculateCost(model, usage.input_tokens, usage.output_tokens);
      deps.updateUsageStats(usage.input_tokens, usage.output_tokens, usage.total_tokens, cost);
      deps.trackModelCost(model, cost, usage.input_tokens, usage.output_tokens);
      deps.refreshProviderStats();
    },
    onPostCompact: async (result, _summary) => {
      const before = result.before.tokens;
      const after = result.after.tokens;
      const saved = before - after;
      const pctSaved = Math.round((saved / before) * 100);
      const beforeK = (before / 1000).toFixed(1);
      const afterK = (after / 1000).toFixed(1);
      const savedK = (saved / 1000).toFixed(1);
      deps.callbacks.writeMessage('system', '*',
        `⟳ context compacted: ${beforeK}k → ${afterK}k tokens (freed ${savedK}k, ${pctSaved}% reduction)`, chName);
      const ag = channelAgents.get(chName);
      if (ag) {
        const files = ag.getFilesForReinjection();
        for (const f of files) {
          const prefix = f.pinned ? 'Pinned' : 'Referenced';
          deps.callbacks.writeMessage('system', '*', `  ${prefix} file: ${f.path}`, chName);
        }
      }
      // No TUI buffer manipulation — rolling dropoff in persistChannelState handles state file growth
    },
  });

  // Inject drift sticky note so the agent knows snapshot/rollback is available
  agent.addStickyNote('Drift snapshots active — use drift_snapshots to list, drift_rollback <id> to revert. Auto-snapshots on every write/edit/append.', 'top');
  // Inject channel identity so the agent knows its own name
  agent.addStickyNote(`You are in channel: ${chName}`, 'top');

  ctx.setRuntime(chName, a2aResult.runtime);
  return agent;
}
