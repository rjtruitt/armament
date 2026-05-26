/** Execution context provided by the host for flow commands. */
export interface FlowContext {
  spawn: (name: string, opts?: Record<string, any>) => Promise<string>;
  spawnWorker: (parent: string, name: string, task: string, opts?: Record<string, any>) => Promise<string>;
  kill: (name: string) => Promise<void>;
  msg: (target: string, message: string) => Promise<void>;
  broadcast: (message: string) => Promise<void>;
  seed: (target: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => void;
  getAgents: () => Array<{ name: string; provider: string; status: string; model?: string }>;
  findAgent: (name: string) => { name: string; provider: string; status: string } | null;
  waitFor: (agentName: string, event: string, timeoutMs?: number) => Promise<any>;
  approve: (prompt: string, options?: ApprovalOptions) => Promise<ApprovalResult>;
  getResult: (agentName: string) => Promise<any>;
  runPipe: (script: string, input: string) => Promise<string>;
  log: (message: string) => void;
  emit: (event: string, data?: any) => void;
  setVariable: (name: string, value: any) => void;
  getVariable: (name: string) => any;
  pin?: (filePath: string) => void;
  unpin?: (filePath: string) => void;
}

/** Options for approval gates within a flow. */
export interface ApprovalOptions {
  type: 'confirm' | 'choice' | 'input' | 'multi-select';
  choices?: string[];
  timeout?: number;
  default?: string;
}

/** Result of an approval gate decision. */
export interface ApprovalResult {
  approved: boolean;
  value?: string | string[];
  input?: string;
}

/** A node in the flow DAG representing a unit of work. */
export interface FlowNode {
  id: string;
  type: 'spawn' | 'task' | 'gate' | 'approval' | 'parallel' | 'condition' | 'wait' | 'join' | 'end';
  config: Record<string, any>;
  dependsOn?: string[];
  condition?: string;
  timeout?: number;
  retries?: number;
  budget?: number;
}

/** A directed edge between flow nodes. */
export interface FlowEdge {
  from: string;
  to: string;
  condition?: string;
  label?: string;
}

/** Complete definition of a flow, including nodes, edges, and metadata. */
export interface FlowDefinition {
  name: string;
  description?: string;
  version?: string;
  trigger?: FlowTrigger;
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables?: Record<string, any>;
  budget?: number;
  maxDuration?: number;
}

/** Trigger configuration for automatic flow invocation. */
export interface FlowTrigger {
  type: 'manual' | 'event' | 'cron' | 'webhook';
  event?: string;
  cron?: string;
  webhookPath?: string;
}

/** Runtime state of a flow execution. */
export interface FlowExecution {
  id: string;
  flowName: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  currentNodes: string[];
  completedNodes: string[];
  failedNodes: string[];
  variables: Record<string, any>;
  cost: number;
  error?: string;
}

/** A single field in a completion schema — defines what the agent must output. */
export interface CompletionField {
  name: string;
  type: 'string' | 'string[]' | 'number' | 'boolean' | 'enum';
  required: boolean;
  description: string;
  enumValues?: string[];
}

/** Declarative completion contract for a workflow step. */
export interface CompletionSchema {
  fields: CompletionField[];
  purpose?: string;
  sticky: boolean;
  stickyDescription?: string;
  pipe?: string;
}

/** A parsed command from a .armaflow file. */
export interface FlowCommand {
  command: string;
  args: string[];
  lineNumber: number;
  indent: number;
  completionSchema?: CompletionSchema;
}

/** Abstract syntax tree produced by the flow parser. */
export interface FlowAST {
  name: string;
  description?: string;
  trigger?: FlowTrigger;
  commands: FlowCommand[];
  blocks: FlowBlock[];
}

/** A structured block within a flow (parallel, sequence, condition, etc.). */
export interface FlowBlock {
  type: 'parallel' | 'sequence' | 'condition' | 'loop' | 'approval' | 'retry';
  commands: FlowCommand[];
  children?: FlowBlock[];
  condition?: string;
  maxRetries?: number;
}

/** Flow commands.
 */
export const FLOW_COMMANDS = new Set([
  'name', 'description', 'trigger', 'budget', 'timeout',
  'spawn', 'worker', 'kill', 'msg', 'wait', 'join', 'sleep',
  'parallel', 'end', 'sequence',
  'if', 'elif', 'else', 'endif',
  'approve', 'gate',
  'retry', 'endretry',
  'loop', 'endloop',
  'set', 'log', 'emit', 'chain', 'seed', 'collect', 'pipe',
  'complete', 'field',
  'on_error', 'on_complete', 'on_timeout',
  'allow',
]);
