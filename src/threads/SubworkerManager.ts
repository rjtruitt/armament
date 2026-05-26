/**
 * SubworkerManager — handles spawning and managing sub-worker threads.
 *
 * Extracted from ThreadCoordinator to separate the parent-child worker
 * relationship management from core thread lifecycle. Sub-workers are
 * spawned by agent threads to delegate parallel subtasks.
 */

import type {
  ChannelThreadConfig,
  InboundMessage,
  StreamChunk,
  SubworkerConfig,
  ThreadInfo,
} from './ThreadProtocol.js';
import type { Worker } from 'node:worker_threads';
import type { EventEmitter } from 'node:events';

/**
 * Thread handle interface.
 */
export interface ThreadHandle {
  worker: Worker;
  info: ThreadInfo;
  emitter: EventEmitter;
  ready: Promise<void>;
  readyResolve: () => void;
  pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: Error) => void }>;
  streamTimeout: ReturnType<typeof setTimeout> | null;
  children: Set<string>;
}

/**
 * Subworker deps interface.
 */
export interface SubworkerDeps {
  spawnChannel: (config: ChannelThreadConfig) => Promise<void>;
  getThread: (name: string) => ThreadHandle | undefined;
  sendToThread: (channelName: string, msg: InboundMessage) => void;
  shutdown: (channelName: string) => Promise<void>;
  onWorkerSpawned?: (parentChannel: string, workerId: string) => void;
  onWorkerProgress?: (parentChannel: string, workerId: string, progress: string, percent?: number) => void;
  onWorkerComplete?: (parentChannel: string, workerId: string, response: string) => void;
  onWorkerError?: (parentChannel: string, workerId: string, error: string) => void;
}

/**
 * Handle a sub-worker spawn request from a parent thread.
 */
export async function handleSubworkerRequest(
  parentChannel: string,
  parentHandle: ThreadHandle,
  requestId: string,
  config: SubworkerConfig,
  deps: SubworkerDeps,
): Promise<void> {
  const workerId = `worker-${config.name.replace(/\s+/g, '-').toLowerCase().slice(0, 15)}-${Date.now()}`;
  parentHandle.children.add(workerId);
  deps.onWorkerSpawned?.(parentChannel, workerId);

  try {
    const parentInfo = parentHandle.info;
    const workerConfig: ChannelThreadConfig = {
      channelName: workerId,
      provider: {
        type: parentInfo.providerType,
        model: config.model ?? parentInfo.model,
      },
      systemPrompt: config.systemPrompt,
      isWorker: true,
      parentChannel,
      workerMaxTurns: 250,
      tools: config.tools ?? [],
      stickyNotes: [
        { content: 'You MUST call complete_worker when finished. This is the ONLY way to end your task.', position: 'both' },
        { content: 'Call report_progress at natural breakpoints to show you are alive.', position: 'bottom' },
      ],
    };

    await deps.spawnChannel(workerConfig);

    const workerHandle = deps.getThread(workerId);
    if (!workerHandle) throw new Error('Worker thread failed to spawn');

    // Send the task to the worker
    deps.sendToThread(workerId, { type: 'send_message', id: `task-${workerId}`, input: config.task });

    // Listen for worker completion via stream chunks
    workerHandle.emitter.on('chunk', (chunk: StreamChunk) => {
      if (chunk.kind === 'done') {
        // Worker finished its turn
      }
    });
  } catch (err: any) {
    parentHandle.worker.postMessage({ type: 'subworker_error', workerId, error: err.message } as InboundMessage);
    deps.onWorkerError?.(parentChannel, workerId, err.message);
    parentHandle.children.delete(workerId);
  }
}
