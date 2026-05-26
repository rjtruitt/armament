export type {
  FlowContext,
  ApprovalOptions,
  ApprovalResult,
  FlowNode,
  FlowEdge,
  FlowDefinition,
  FlowTrigger,
  FlowExecution,
  CompletionField,
  CompletionSchema,
  FlowCommand,
  FlowAST,
  FlowBlock,
} from './ArmaFlowTypes.js';

import type { FlowContext, FlowExecution, FlowAST } from './ArmaFlowTypes.js';
import { ArmaFlowParser } from './ArmaFlowParser.js';
import { ArmaFlowExecutor } from './ArmaFlowExecutor.js';

/** DAG-based workflow engine for .armaflow files with parallel execution and approval gates. */
export class ArmaFlow {
  private ctx: FlowContext;
  private executions: Map<string, FlowExecution> = new Map();
  private variables: Record<string, any> = {};
  private parser: ArmaFlowParser;
  private executor: ArmaFlowExecutor;

  constructor(ctx: FlowContext) {
    this.ctx = ctx;
    this.parser = new ArmaFlowParser();
    this.executor = new ArmaFlowExecutor(ctx, this.parser);
  }

  /** Parses flow text into an AST, validating command syntax. */
  parse(flowText: string): FlowAST {
    return this.parser.parse(flowText);
  }

  /** Parses and executes a flow, returning the execution record. */
  async run(flowText: string): Promise<FlowExecution> {
    const ast = this.parse(flowText);
    const execution: FlowExecution = {
      id: Math.random().toString(36).slice(2, 10),
      flowName: ast.name || 'unnamed',
      status: 'running',
      startedAt: Date.now(),
      currentNodes: [],
      completedNodes: [],
      failedNodes: [],
      variables: { ...this.variables },
      cost: 0,
    };

    this.executions.set(execution.id, execution);

    try {
      await this.executor.executeCommands(ast.commands, execution);
      execution.status = 'completed';
      execution.completedAt = Date.now();
    } catch (err: unknown) {
      execution.status = 'failed';
      execution.error = err instanceof Error ? err.message : String(err);
      execution.completedAt = Date.now();
      throw err;
    }

    return execution;
  }

  /** Validates and simulates a flow without executing, returning a step-by-step plan. */
  dryRun(flowText: string): { valid: boolean; steps: string[]; errors: string[] } {
    const steps: string[] = [];
    const errors: string[] = [];

    let ast: FlowAST;
    try {
      ast = this.parse(flowText);
    } catch (err: unknown) {
      return { valid: false, steps: [], errors: [err instanceof Error ? err.message : String(err)] };
    }

    steps.push(`Flow: ${ast.name || '(unnamed)'}${ast.description ? ` — ${ast.description}` : ''}`);

    let stepNum = 0;
    for (let i = 0; i < ast.commands.length; i++) {
      const cmd = ast.commands[i];
      switch (cmd.command) {
        case 'chain': {
          stepNum++;
          const hasArrow = cmd.args.includes('->');
          if (hasArrow) {
            const agents = cmd.args.filter(a => a !== '->');
            steps.push(`[${stepNum}] chain pipeline: ${agents.join(' → ')}`);
          } else {
            steps.push(`[${stepNum}] chain: spawn ${cmd.args[0]}${cmd.args.length > 1 ? ' with task' : ''}, wait for completion`);
          }
          const nextCmd = ast.commands[i + 1];
          if (nextCmd?.command === 'complete' && nextCmd.completionSchema) {
            const s = nextCmd.completionSchema;
            steps.push(`       → completion schema (${s.fields.length} fields): ${s.fields.map(f => `${f.name}:${f.type}${f.required ? '*' : ''}`).join(', ')}`);
            if (s.pipe) steps.push(`       → pipe output through: ${s.pipe}`);
            if (s.sticky) steps.push(`       → sticky note injected with field descriptions`);
            i++; // skip the /complete command
          }
          break;
        }
        case 'spawn':
          stepNum++;
          steps.push(`[${stepNum}] spawn: ${cmd.args[0]}${cmd.args.length > 1 ? ` (${cmd.args.slice(1).join(' ')})` : ''}`);
          break;
        case 'pipe': {
          stepNum++;
          const parts = cmd.args.join(' ').split('->').map(s => s.trim());
          steps.push(`[${stepNum}] pipe: ${parts[0]} → ${parts[1]}${parts[2] ? ` → ${parts[2]}` : ''}`);
          break;
        }
        case 'msg':
          stepNum++;
          steps.push(`[${stepNum}] msg: send to ${cmd.args[0]} (${cmd.args.slice(1).join(' ').slice(0, 50)}…)`);
          break;
        case 'wait':
          stepNum++;
          steps.push(`[${stepNum}] wait: ${cmd.args[0]} ${cmd.args[1] || 'complete'}`);
          break;
        case 'join':
          stepNum++;
          steps.push(`[${stepNum}] join: wait for all [${cmd.args.join(', ')}]`);
          break;
        case 'seed':
          stepNum++;
          steps.push(`[${stepNum}] seed: inject ${cmd.args[1]} message into ${cmd.args[0]}`);
          break;
        case 'collect': {
          stepNum++;
          const arrowIdx = cmd.args.indexOf('->');
          if (arrowIdx > 0) {
            steps.push(`[${stepNum}] collect: [${cmd.args.slice(0, arrowIdx).join(', ')}] → ${cmd.args[arrowIdx + 1]}`);
          }
          break;
        }
        case 'approve':
          stepNum++;
          steps.push(`[${stepNum}] ⚠ approval gate: "${cmd.args.join(' ')}"`);
          break;
        case 'sleep':
          stepNum++;
          steps.push(`[${stepNum}] sleep: ${cmd.args[0]}ms`);
          break;
        case 'log':
          steps.push(`     log: ${cmd.args.join(' ')}`);
          break;
        case 'parallel':
          stepNum++;
          steps.push(`[${stepNum}] parallel block start`);
          break;
        case 'complete':
        case 'field':
        case 'name':
        case 'description':
        case 'trigger':
        case 'budget':
        case 'timeout':
        case 'set':
        case 'emit':
        case 'end':
          break;
        default:
          steps.push(`[?] ${cmd.command}: ${cmd.args.join(' ')}`);
      }
    }

    steps.push(`\nTotal steps: ${stepNum}`);
    return { valid: errors.length === 0, steps, errors };
  }

  /** Returns the execution record for a given ID. */
  getExecution(id: string): FlowExecution | undefined {
    return this.executions.get(id);
  }

  /** Returns all execution records. */
  getExecutions(): FlowExecution[] {
    return [...this.executions.values()];
  }

  /** Cancels a running execution. */
  async cancel(executionId: string): Promise<void> {
    const exec = this.executions.get(executionId);
    if (exec && exec.status === 'running') {
      exec.status = 'cancelled';
      exec.completedAt = Date.now();
    }
  }
}
