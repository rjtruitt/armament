/** Factory for agent-to-agent coordination tools backed by TaskRuntime. */

import type { ITool } from 'iteratio';
import { TaskRuntime, type TaskRuntimeConfig } from './TaskRuntime.js';
import {
  SpawnWorkerTool,
  AwaitWorkerTool,
  GetWorkersTool,
  SendWorkerMessageTool,
  CancelWorkerTool,
} from './TaskTools.js';

/** Re-export TaskRuntimeConfig as A2AToolsConfig for external use. */
export type { TaskRuntimeConfig as A2AToolsConfig };

/** Bundle returned by createA2ATools containing the tools and their shared runtime. */
export interface A2AToolsResult {
  tools: ITool[];
  runtime: TaskRuntime;
}

/** Creates a TaskRuntime and the five A2A coordination tools that operate on it. */
export function createA2ATools(config: TaskRuntimeConfig): A2AToolsResult {
  const runtime = new TaskRuntime(config);
  return {
    tools: [
      new SpawnWorkerTool(runtime),
      new AwaitWorkerTool(runtime),
      new GetWorkersTool(runtime),
      new SendWorkerMessageTool(runtime),
      new CancelWorkerTool(runtime),
    ],
    runtime,
  };
}
