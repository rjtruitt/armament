import type { FlowContext, FlowExecution, FlowCommand, ApprovalOptions } from './ArmaFlowTypes.js';
import { ArmaFlowParser } from './ArmaFlowParser.js';

/** Executes parsed flow commands against a FlowContext. */
export class ArmaFlowExecutor {
  private ctx: FlowContext;
  private parser: ArmaFlowParser;

  constructor(ctx: FlowContext, parser: ArmaFlowParser) {
    this.ctx = ctx;
    this.parser = parser;
  }

  /**
   * Execute commands.
   */
  async executeCommands(commands: FlowCommand[], execution: FlowExecution): Promise<void> {
    let i = 0;
    while (i < commands.length) {
      if (execution.status === 'cancelled') break;

      const cmd = commands[i];

      switch (cmd.command) {
        case 'spawn': {
          const opts = this.parser.parseFlags(cmd.args.slice(1));
          const positional = this.parser.extractPositional(cmd.args.slice(1));
          if (positional.length > 0) opts.task = positional.join(' ');
          if (execution.variables.$allowPaths) {
            opts.allowPaths = execution.variables.$allowPaths;
          }
          const id = await this.ctx.spawn(cmd.args[0], opts);
          execution.variables[`$${cmd.args[0]}`] = id;
          execution.currentNodes.push(cmd.args[0]);
          break;
        }

        case 'worker': {
          const parent = cmd.args[0];
          const workerName = cmd.args[1];
          const positional = this.parser.extractPositional(cmd.args.slice(2));
          const task = positional.join(' ');
          if (parent && workerName && task) {
            const workerId = await this.ctx.spawnWorker(parent, workerName, task);
            execution.variables[`$${workerName}`] = workerId;
            execution.currentNodes.push(workerId);
          }
          break;
        }

        case 'kill':
          await this.ctx.kill(cmd.args[0]);
          execution.currentNodes = execution.currentNodes.filter(n => n !== cmd.args[0]);
          break;

        case 'msg':
          await this.ctx.msg(cmd.args[0], this.interpolate(cmd.args.slice(1).join(' '), execution.variables));
          break;

        case 'wait':
          await this.ctx.waitFor(cmd.args[0], cmd.args[1] || 'complete', parseInt(cmd.args[2]) || undefined);
          execution.completedNodes.push(cmd.args[0]);
          execution.currentNodes = execution.currentNodes.filter(n => n !== cmd.args[0]);
          break;

        case 'join': {
          const agents = cmd.args;
          await Promise.all(agents.map(a => this.ctx.waitFor(a, 'complete')));
          for (const a of agents) {
            execution.completedNodes.push(a);
            execution.currentNodes = execution.currentNodes.filter(n => n !== a);
          }
          break;
        }

        case 'parallel': {
          const parallelCmds: FlowCommand[] = [];
          i++;
          while (i < commands.length && commands[i].command !== 'end') {
            parallelCmds.push(commands[i]);
            i++;
          }
          await Promise.all(parallelCmds.map(pc => this.executeCommands([pc], execution)));
          break;
        }

        case 'approve': {
          const result = await this.ctx.approve(cmd.args.join(' '), {
            type: 'confirm',
          });
          if (!result.approved) {
            execution.status = 'cancelled';
            return;
          }
          break;
        }

        case 'gate': {
          const gateType = cmd.args[0] || 'confirm';
          const gateMsg = cmd.args.slice(1).join(' ');
          const result = await this.ctx.approve(gateMsg, { type: gateType as ApprovalOptions['type'] });
          execution.variables['$gate_result'] = result;
          if (!result.approved) {
            execution.status = 'paused';
            return;
          }
          break;
        }

        case 'chain': {
          // Look ahead for a /complete block attached to this chain
          const nextCmd = commands[i + 1];
          const chainSchema = nextCmd?.command === 'complete' ? nextCmd.completionSchema : undefined;

          const hasArrow = cmd.args.includes('->');
          if (hasArrow) {
            const agents = cmd.args.filter(a => a !== '->');
            let prevResult: string | undefined;
            this.ctx.log(`chain pipeline: ${agents.join(' → ')}`);

            for (let j = 0; j < agents.length; j++) {
              const agentName = agents[j];
              const alreadySpawned = execution.completedNodes.includes(agentName) || this.ctx.findAgent(agentName);

              if (alreadySpawned) {
                this.ctx.log(`chain: ${agentName} already spawned, waiting...`);
                await this.ctx.waitFor(agentName, 'complete');
                const result = await this.ctx.getResult(agentName);
                if (result && result.trim()) prevResult = result;
                this.ctx.log(`chain: ${agentName} done (${(prevResult?.length ?? 0)} chars)`);
                if (!execution.completedNodes.includes(agentName)) execution.completedNodes.push(agentName);
                continue;
              }

              const task = prevResult
                ? `Here is the output from the previous agent in the chain:\n\n${prevResult}\n\nNow analyze the above and continue the pipeline.`
                : undefined;
              const spawnOpts: Record<string, any> = task ? { task } : {};
              if (chainSchema) spawnOpts.completionSchema = chainSchema;
              this.ctx.log(`chain: spawning ${agentName}${task ? ` with ${task.length} char task` : ''}`);
              await this.ctx.spawn(agentName, spawnOpts);
              await this.ctx.waitFor(agentName, 'complete');
              const rawResult = await this.ctx.getResult(agentName);

              // If a pipe is configured, run the structured output through it
              if (chainSchema?.pipe && rawResult) {
                this.ctx.log(`chain: piping ${agentName} output through ${chainSchema.pipe}`);
                prevResult = await this.ctx.runPipe(chainSchema.pipe, rawResult);
              } else {
                prevResult = rawResult;
              }
              this.ctx.log(`chain: ${agentName} complete (${(prevResult?.length ?? 0)} chars)`);
              execution.completedNodes.push(agentName);
            }
          } else {
            const agentName = cmd.args[0];
            const positional = this.parser.extractPositional(cmd.args.slice(1));
            const opts = this.parser.parseFlags(cmd.args.slice(1));
            if (positional.length > 0) opts.task = positional.join(' ');
            if (execution.variables.$allowPaths) {
              opts.allowPaths = execution.variables.$allowPaths;
            }
            if (chainSchema) opts.completionSchema = chainSchema;
            if (agentName) {
              this.ctx.log(`chain: starting ${agentName}${opts.task ? ' with task' : ''}`);
              await this.ctx.spawn(agentName, opts);
              await this.ctx.waitFor(agentName, 'complete');
              this.ctx.log(`chain: ${agentName} complete`);
              execution.completedNodes.push(agentName);
            }
          }

          // Skip the /complete command if we consumed it
          if (chainSchema) i++;
          break;
        }

        case 'seed': {
          const target = cmd.args[0];
          const role = cmd.args[1] as 'user' | 'assistant';
          const content = this.interpolate(cmd.args.slice(2).join(' '), execution.variables);
          if (target && role && content) {
            this.ctx.seed(target, [{ role, content }]);
          }
          break;
        }

        case 'collect': {
          const arrowIdx = cmd.args.indexOf('->');
          if (arrowIdx > 0) {
            const sources = cmd.args.slice(0, arrowIdx);
            const target = cmd.args[arrowIdx + 1];
            const results: string[] = [];
            for (const src of sources) {
              const result = await this.ctx.getResult(src);
              if (result) results.push(`── ${src} ──\n${result}`);
            }
            if (target && results.length > 0) {
              await this.ctx.msg(target, results.join('\n\n'));
            }
            execution.variables['$collected'] = results.join('\n\n');
          }
          break;
        }

        case 'pipe': {
          // /pipe source -> ./script.py -> target
          // Runs script with source's result as JSON stdin, sends stdout to target
          const parts = cmd.args.join(' ').split('->').map(s => s.trim());
          if (parts.length >= 2) {
            const source = parts[0];
            const script = parts[1];
            const target = parts[2]; // optional
            const sourceResult = await this.ctx.getResult(source);
            const input = sourceResult || execution.variables['$collected'] || '';
            this.ctx.log(`pipe: ${source} → ${script}${target ? ` → ${target}` : ''}`);
            const output = await this.ctx.runPipe(script, input);
            execution.variables['$pipe_result'] = output;
            if (target) {
              await this.ctx.msg(target, output);
            }
          }
          break;
        }

        case 'complete': {
          // /complete attaches to the most recently spawned agent
          // The schema is parsed and stored; the runtime reads it from the command
          // Actual tool injection happens in the spawn context (ArmamentApp)
          if (cmd.completionSchema) {
            const lastAgent = execution.currentNodes[execution.currentNodes.length - 1];
            if (lastAgent) {
              execution.variables[`$${lastAgent}_schema`] = cmd.completionSchema;
              this.ctx.log(`complete: schema attached to ${lastAgent} (${cmd.completionSchema.fields.length} fields)`);
            }
          }
          break;
        }

        case 'field':
          // Consumed by /complete block parser, no runtime action
          break;

        case 'set':
          execution.variables[cmd.args[0]] = cmd.args.slice(1).join(' ');
          this.ctx.setVariable(cmd.args[0], cmd.args.slice(1).join(' '));
          break;

        case 'allow':
          execution.variables.$allowPaths = cmd.args;
          break;

        case 'log':
          this.ctx.log(this.interpolate(cmd.args.join(' '), execution.variables));
          break;

        case 'emit':
          this.ctx.emit(cmd.args[0], cmd.args.slice(1).join(' '));
          break;

        case 'sleep':
          await new Promise(resolve => setTimeout(resolve, parseInt(cmd.args[0]) || 0));
          break;

        case 'name':
        case 'description':
        case 'trigger':
        case 'budget':
        case 'timeout':
        case 'end':
          break;

        case 'on_error':
        case 'on_complete':
        case 'on_timeout':
          return;
      }

      i++;
    }
  }

  /**
   * Interpolate.
   */
  interpolate(text: string, variables: Record<string, any>): string {
    return text.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      const key = name.startsWith('$') ? name : `$${name}`;
      return variables[key] ?? variables[name] ?? '';
    });
  }
}
