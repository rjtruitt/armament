/** Interface for the A2A TaskRuntime — decouples providers from a2a. */

import type { ITool } from 'iteratio';
import type { IProviderPool } from './IProviderPool.js';
import type { IChannelAgent, ChannelAgentFactory } from './IChannelAgent.js';

/** Configuration for the worker task runtime (pool, models, callbacks, limits). */
export interface ITaskRuntimeConfig {
  providerPool: IProviderPool;
  channelAgentFactory: ChannelAgentFactory;
  availableModels: Array<{ provider: string; model: string; region?: string; profile?: string }>;
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

/** Interface for the TaskRuntime that manages worker lifecycle. */
export interface ITaskRuntime {
  spawnWorker(
    name: string,
    task: string,
    model?: string,
    systemPrompt?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ success: boolean; workerId?: string; error?: string }>;
  awaitWorker(workerId: string, timeoutMs: number): Promise<string>;
  subscribeCompletion(workerId: string): boolean;
  sendWorkerMessage(workerId: string, message: string): Promise<string>;
  cancelWorker(workerId: string, reason?: string): void;
  getWorkersSummary(): string;
  getWorker(id: string): IChannelAgent | undefined;
  getWorkerIds(): string[];
  shutdown(): void;
}
