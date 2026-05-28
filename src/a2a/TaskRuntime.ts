import type { ITool, ToolResult, ToolContext } from 'iteratio';
import type { IProviderPool } from '../core/index.js';
import type { IChannelAgent, ChannelAgentFactory } from '../core/index.js';
import { CompleteWorkerTool, ReportProgressTool, AskParentTool, WORKER_SYSTEM_PROMPT } from './WorkerTools.js';

/** Configuration for the worker task runtime (pool, models, callbacks, limits). */
export interface TaskRuntimeConfig {
  providerPool: IProviderPool;
  channelAgentFactory: ChannelAgentFactory;
  availableModels: Array<{ provider: string; model: string; region?: string; profile?: string; streaming?: boolean }>;
  getDefaultTools: () => ITool[];
  getWorkerCallbacks?: (workerId: string) => {
    onToolCall?: (toolName: string, args: unknown) => void;
    onToolResult?: (toolName: string, args: unknown, result: any, durationMs: number) => void;
    onTurnStart?: (turnNumber: number) => void;
    onTurnComplete?: (turnNumber: number, response: string) => void;
  };
  onWorkerSpawned?: (worker: IChannelAgent) => void;
  onWorkerComplete?: (workerId: string, response: string) => void;
  onWorkerError?: (workerId: string, error: string) => void;
  onWorkerProgress?: (workerId: string, progress: string, percent?: number) => void;
  onWorkerAsk?: (workerId: string, question: string) => void;
  onWorkerCancelled?: (workerId: string) => void;
  getParentAgent?: (workerId: string) => IChannelAgent | undefined;
  workerMaxTurns?: number;
  zombieThresholdMs?: number;
  zombieNudgeMessage?: string;
}

interface WorkerEntry {
  agent: IChannelAgent;
  completion: Promise<string>;
  spawnedAt: number;
}

/** Manages worker lifecycle, completion delivery, and zombie detection. */
export class TaskRuntime {
  private workers: Map<string, WorkerEntry> = new Map();
  private config: TaskRuntimeConfig;
  private zombieTimer: ReturnType<typeof setInterval> | null = null;
  private nudgedWorkers: Set<string> = new Set();

  constructor(config: TaskRuntimeConfig) {
    this.config = config;
    this.startZombieDetector();
  }

  /**
   * Spawn worker.
   */
  async spawnWorker(
    name: string,
    task: string,
    model?: string,
    systemPrompt?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
    stickyNotes?: Array<{ content: string; position: 'top' | 'bottom' | 'both' }>,
  ): Promise<{ success: boolean; workerId?: string; error?: string }> {
    const safeName = name.replace(/\s+/g, '-').toLowerCase().slice(0, 15);
    const modelConfig = model
      ? this.config.availableModels.find(m => m.model === model || m.model.includes(model))
      : this.config.availableModels[0];

    if (!modelConfig) {
      return { success: false, error: `Model not found. Available: ${this.config.availableModels.map(m => m.model).join(', ')}` };
    }

    try {
      const adapter = await this.config.providerPool.getOrCreate(
        modelConfig.provider,
        modelConfig.model,
        { region: modelConfig.region, profile: modelConfig.profile, streaming: modelConfig.streaming },
      );

      const workerId = `worker-${safeName}-${Date.now()}`;
      const callbacks = this.config.getWorkerCallbacks?.(workerId);

      const workerTools: ITool[] = [
        ...this.config.getDefaultTools(),
        new CompleteWorkerTool(),
        new ReportProgressTool(workerId, this.config.onWorkerProgress),
        new AskParentTool(workerId, this.config.onWorkerAsk),
      ];

      let completionSummary: string | null = null;

      const worker = this.config.channelAgentFactory({
        name: workerId,
        provider: adapter,
        model: modelConfig.model,
        providerType: modelConfig.provider,
        maxTurns: this.config.workerMaxTurns || 250,
        systemPrompt: systemPrompt || WORKER_SYSTEM_PROMPT(name),
        tools: workerTools,
        stickyNotes: [
          ...(stickyNotes || []),
          { content: 'You MUST call complete_worker when finished. This is the ONLY way to end your task.', position: 'both' as const },
          { content: 'Call report_progress at natural breakpoints to show you are alive.', position: 'bottom' as const },
        ],
        onToolCall: callbacks?.onToolCall,
        onToolResult: (toolName, args, result, durationMs) => {
          if (toolName === 'complete_worker') {
            const data = result?.data as Record<string, unknown> | undefined;
            const argsObj = args as Record<string, unknown> | undefined;
            completionSummary = (data?.summary as string) || (argsObj?.summary as string) || null;
          } else if (toolName === 'report_progress') {
            const data = result?.data as Record<string, unknown> | undefined;
            if (data?._terminal) {
              const argsObj = args as Record<string, unknown> | undefined;
              completionSummary = (data?.summary as string) || (argsObj?.progress as string) || null;
            }
          }
          callbacks?.onToolResult?.(toolName, args, result, durationMs);
        },
        onTurnStart: callbacks?.onTurnStart,
        onTurnComplete: callbacks?.onTurnComplete,
      });

      if (history && history.length > 0) {
        worker.seedMessages(history);
      }

      const completion = worker.sendMessage(task).then((response) => {
        const finalResponse = response || completionSummary || '';
        this.config.onWorkerComplete?.(workerId, finalResponse);
        this.cleanupWorker(workerId);
        return finalResponse;
      }).catch((err) => {
        this.config.onWorkerError?.(workerId, err.message);
        this.cleanupWorker(workerId);
        throw err;
      });

      this.workers.set(workerId, { agent: worker, completion, spawnedAt: Date.now() });
      if (!this.zombieTimer) this.startZombieDetector();
      this.config.onWorkerSpawned?.(worker);

      return { success: true, workerId };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Await worker.
   */
  async awaitWorker(workerId: string, timeoutMs: number): Promise<string> {
    const entry = this.workers.get(workerId);
    if (!entry) throw new Error(`Worker not found: ${workerId}`);

    return Promise.race([
      entry.completion,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs),
      ),
    ]);
  }

  /**
   * Subscribe completion.
   */
  subscribeCompletion(workerId: string): boolean {
    const entry = this.workers.get(workerId);
    if (!entry) return false;

    entry.completion.then((response) => {
      const parent = this.config.getParentAgent?.(workerId);
      if (parent) {
        parent.injectMessage(`[WORKER COMPLETE: ${workerId}]\n${response}`);
      }
    }).catch((err) => {
      const parent = this.config.getParentAgent?.(workerId);
      if (parent) {
        parent.injectMessage(`[WORKER FAILED: ${workerId}] ${err.message}`);
      }
    });

    return true;
  }

  /**
   * Send worker message.
   */
  async sendWorkerMessage(workerId: string, message: string): Promise<string> {
    const entry = this.workers.get(workerId);
    if (!entry) throw new Error(`Worker not found: ${workerId}`);
    return entry.agent.sendMessage(message);
  }

  /**
   * Cancel worker.
   */
  cancelWorker(workerId: string, reason?: string): void {
    const entry = this.workers.get(workerId);
    if (!entry) return;
    entry.agent.markComplete();
    this.config.onWorkerCancelled?.(workerId);
  }

  /**
   * Gets the workers summary.
   */
  getWorkersSummary(): string {
    if (this.workers.size === 0) return '';
    const lines: string[] = [];
    for (const [id, entry] of this.workers) {
      const label = id.replace(/^worker-/, '').replace(/-\d+$/, '');
      const elapsed = Math.floor((Date.now() - entry.spawnedAt) / 1000);
      lines.push(`${label}: ${entry.agent.status} (turn ${entry.agent.turnCount}, ${elapsed}s)`);
    }
    return lines.join('\n');
  }

  /**
   * Gets the worker.
   */
  getWorker(id: string): IChannelAgent | undefined {
    return this.workers.get(id)?.agent;
  }

  /**
   * Gets the worker ids.
   */
  getWorkerIds(): string[] {
    return Array.from(this.workers.keys());
  }

  private cleanupWorker(workerId: string): void {
    this.workers.delete(workerId);
    this.nudgedWorkers.delete(workerId);
    if (this.workers.size === 0 && this.zombieTimer) {
      clearInterval(this.zombieTimer);
      this.zombieTimer = null;
    }
  }

  /**
   * Shutdown.
   */
  shutdown(): void {
    if (this.zombieTimer) {
      clearInterval(this.zombieTimer);
      this.zombieTimer = null;
    }
  }

  private startZombieDetector(): void {
    const threshold = this.config.zombieThresholdMs ?? 300_000;
    this.zombieTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.workers) {
        if (entry.agent.status === 'complete' || entry.agent.status === 'error') continue;
        if (entry.agent.status !== 'idle') continue;

        const elapsed = now - entry.spawnedAt;
        if (elapsed < threshold) continue;

        if (!this.nudgedWorkers.has(id)) {
          this.nudgedWorkers.add(id);
          const nudgeMsg = this.config.zombieNudgeMessage
            ?? '[system] You appear stalled. If blocked, call ask_parent. Otherwise call complete_worker.';
          entry.agent.sendMessage(nudgeMsg).catch(() => {});
        } else {
          this.config.onWorkerError?.(id, `Worker stalled for ${Math.floor(elapsed / 1000)}s after nudge`);
        }
      }
    }, 60_000);
  }
}
