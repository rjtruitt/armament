import * as fs from 'node:fs';
import * as path from 'node:path';
import { ArmaFlow, type FlowContext, type CompletionSchema } from '../scripting/index.js';
import { logInfo } from '../core/index.js';
import type { ChannelAgent } from '../providers/index.js';
import type { ChannelLifecycle } from './ChannelLifecycle.js';
import type { StreamRouter } from './StreamRouter.js';
import type { TuiRenderer } from './TuiRenderer.js';
import { buildCompletionTool } from './FlowCompletionTool.js';
import { getArmaPath, armaDataDir } from './ChannelPaths.js';

/** Interface for FlowRuntimeDeps.
 * @property {ChannelLifecycle} channelLifecycle - Description of channelLifecycle.
 * @property {Map<string, ChannelAgent>} channelAgents - Description of channelAgents.
 * @property {Map<string, Promise<void>} channelReadyPromises - Description of channelReadyPromises.
 * @property {StreamRouter} streamRouter - Description of streamRouter.
 * @property {Map<string, { resolve: (response: string) =>} pendingApprovals - Description of pendingApprovals.
 */
export interface FlowRuntimeDeps {
  getTui: () => TuiRenderer | null;
  channelLifecycle: ChannelLifecycle;
  channelAgents: Map<string, ChannelAgent>;
  channelReadyPromises: Map<string, Promise<void>>;
  streamRouter: StreamRouter;
  pendingApprovals: Map<string, { resolve: (response: string) => void; question: string; options?: string[]; source: string }>;
  joinChannel: (name: string) => void;
  getActiveChannel: () => string | undefined;
  setActiveChannel: (name: string) => void;
  getUserNick: () => string;
}

/** Class representing FlowRuntime. */
export class FlowRuntime {
  private deps: FlowRuntimeDeps;

  constructor(deps: FlowRuntimeDeps) {
    this.deps = deps;
  }

  /**
   * Gets the flows dir.
   */
  getFlowsDir(): string | null {
    const candidates = [
      path.join(armaDataDir(), 'flows'),
      path.join(process.cwd(), '.arma', 'flows'),
      path.join(process.cwd(), 'armament', '.arma', 'flows'),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir)) return dir;
    }
    return null;
  }

  /**
   * Gets the flow names.
   */
  getFlowNames(): string[] {
    const flowsDir = this.getFlowsDir();
    if (!flowsDir) return [];
    // Support both flat files and per-folder structure
    const names: string[] = [];
    try {
      for (const entry of fs.readdirSync(flowsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Per-folder structure
          const flowFile = path.join(flowsDir, entry.name, `${entry.name}.armaflow`);
          if (fs.existsSync(flowFile)) names.push(entry.name);
        } else if (entry.isFile() && entry.name.endsWith('.armaflow')) {
          // Legacy flat structure
          names.push(entry.name.replace('.armaflow', ''));
        }
      }
    } catch {}
    return names;
  }

  private getFlowPath(flowName: string): string | null {
    const flowsDir = this.getFlowsDir();
    if (!flowsDir) return null;
    // Try per-folder first
    const folderPath = path.join(flowsDir, flowName, `${flowName}.armaflow`);
    if (fs.existsSync(folderPath)) return folderPath;
    // Legacy flat
    const flatPath = path.join(flowsDir, `${flowName}.armaflow`);
    if (fs.existsSync(flatPath)) return flatPath;
    return null;
  }

  /**
   * Test.
   */
  test(flowName: string): string {
    const flowPath = this.getFlowPath(flowName);
    if (!flowPath) return `Flow not found: ${flowName}`;

    const flowText = fs.readFileSync(flowPath, 'utf-8');
    const dummyCtx: FlowContext = {
      spawn: async () => '', spawnWorker: async () => '', kill: async () => {},
      msg: async () => {}, broadcast: async () => {}, seed: () => {},
      getAgents: () => [], findAgent: () => null, waitFor: async () => '',
      approve: async () => ({ approved: true }), getResult: async () => '',
      runPipe: async (_s, i) => i, log: () => {}, emit: () => {},
      setVariable: () => {}, getVariable: () => undefined,
    };

    const flow = new ArmaFlow(dummyCtx);
    const result = flow.dryRun(flowText);

    if (result.errors.length > 0) {
      return `✗ Flow "${flowName}" has errors:\n${result.errors.map(e => `  • ${e}`).join('\n')}`;
    }
    return `✓ Flow "${flowName}" — valid\n\n${result.steps.join('\n')}`;
  }

  /**
   * Run.
   */
  run(flowName: string): void {
    const flowsDir = this.getFlowsDir();
    if (!flowsDir) {
      this.deps.getTui()?.writeMessage('system', '*', 'No flows directory found', '#control');
      return;
    }
    const flowPath = this.getFlowPath(flowName);
    if (!flowPath || !fs.existsSync(flowPath)) {
      this.deps.getTui()?.writeMessage('system', '*', `Flow not found: ${flowName}`, '#control');
      return;
    }

    const flowText = fs.readFileSync(flowPath, 'utf-8');
    const flowChannel = `#flow-${flowName}`;
    const resultBuffer: Map<string, string> = new Map();
    const completionPromises: Map<string, { promise: Promise<string>; resolve: (v: string) => void }> = new Map();
    let stepCounter = 0;

    this.deps.getTui()?.addChannel(flowChannel);
    this.deps.channelLifecycle.registerChannel(flowChannel);
    this.deps.setActiveChannel(flowChannel);
    this.deps.getTui()?.setActiveChannel(flowChannel);

    const flowLog = (msg: string) => {
      this.deps.getTui()?.writeMessage('system', 'flow', msg, flowChannel);
    };

    const ctx: FlowContext = {
      spawn: async (name: string, opts?: Record<string, any>) => {
        stepCounter++;
        flowLog(`[step ${stepCounter}] spawning ${name}${opts?.task ? ' with task' : ''}${opts?.completionSchema ? ` (${opts.completionSchema.fields.length} output fields)` : ''}`);

        this.deps.channelLifecycle.spawnChannelBackground(name);
        const chName = name.startsWith('#') ? name : `#${name}`;
        const readyPromise = this.deps.channelReadyPromises.get(chName);
        if (readyPromise) await readyPromise;

        // Seed worker notes from parent channel notes
        const bare = chName.startsWith('#') ? chName.slice(1) : chName;
        const parentNotes = this.deps.channelLifecycle.getChannelNotes(flowChannel);
        if (parentNotes) {
          const notesPath = path.join(getArmaPath(chName), 'notes.md');
          try {
            const fs = await import('fs');
            fs.appendFileSync(notesPath, `\n## Inherited from parent\n${parentNotes.replace(/=== CHANNEL NOTES ===\n?|={2,}/g, '').trim()}\n`);
          } catch {}
        }
        this.deps.getTui()?.removeChannel(chName);
        this.deps.getTui()?.addChannelChild(flowChannel, { id: chName, label: name, status: 'thinking', role: 'worker' });
        this.deps.getTui()?.writeMessage('system', 'flow', `⟨${flowName}⟩ step ${stepCounter}`, chName);

        // Sandbox: lock flow agents to their channel workspace directory
        const sandboxDir = getArmaPath(chName);
        try { (await import('fs')).mkdirSync(sandboxDir, { recursive: true }); } catch {}
        const spawnedAgent = this.deps.channelAgents.get(chName);
        if (spawnedAgent) {
          let workspace = sandboxDir + ':/tmp:/dev:' + path.resolve(process.cwd()) + ':' + path.resolve(process.cwd(), '..');
          if (opts?.allowPaths && Array.isArray(opts.allowPaths)) {
            const resolved = opts.allowPaths
              .map((p: string) => path.resolve(process.cwd(), p))
              .filter((p: string) => { try { return fs.existsSync(p); } catch { return false; } });
            workspace = [sandboxDir, ...resolved].join(':') + ':/tmp:/dev';
          }
          (spawnedAgent as any).setWorkspace?.(workspace);
        }

        if (opts?.task) {
          const agent = this.deps.channelAgents.get(chName);
          if (agent) {
            let resolveCompletion: (v: string) => void;
            const completionP = new Promise<string>(r => { resolveCompletion = r; });
            completionPromises.set(name, { promise: completionP, resolve: resolveCompletion! });

            for (const toolName of ['spawn_worker', 'await_worker', 'get_workers', 'send_worker_message', 'cancel_worker']) {
              agent.deregisterTool(toolName);
            }

            const { z } = await import('zod');
            const schema: CompletionSchema | undefined = opts.completionSchema;
            const { tool: completeTool, stickyText } = buildCompletionTool(z, schema, (output: string) => {
              resultBuffer.set(name, output);
              resolveCompletion!(output);
              const preview = output.length > 300 ? output.slice(0, 300) + '…' : output;
              flowLog(`[step ${stepCounter}] ${name} completed → payload (${output.length} chars):\n${preview}`);
            });

            agent.registerTool(completeTool);
            agent.addStickyNote(stickyText, 'bottom');

            this.deps.getTui()?.writeMessage('user', this.deps.getUserNick(), opts.task, chName);
            // Route through StreamRouter so output appears in agent channel + flow log
            this.deps.streamRouter.routeAsync(agent, opts.task, {
              channel: chName,
              nick: name,
              render: 'tools-only',
              flowChannel,
              prefix: `<${name}>`,
            });

            // Idle nudge — only nudge if agent has been CONTINUOUSLY idle for 60s
            let idleStart = 0;
            const nudgeInterval = setInterval(() => {
              if (resultBuffer.has(name)) { clearInterval(nudgeInterval); return; }
              if (agent.status === 'idle') {
                if (!idleStart) idleStart = Date.now();
                if (Date.now() - idleStart >= 60000) {
                  flowLog(`${name} idle — nudging to call report_complete`);
                  agent.sendMessage('You appear to be done but haven\'t called report_complete yet. Please call report_complete now with your output to deliver your work to the next workflow step.').catch(() => {});
                  idleStart = Date.now();
                }
              } else {
                idleStart = 0;
              }
            }, 5000);
            completionP.then(() => clearInterval(nudgeInterval));
          }
        }
        return name;
      },

      spawnWorker: async (parent: string, name: string, task: string, opts?: Record<string, any>) => {
        const chName = parent.startsWith('#') ? parent : `#${parent}`;
        const runtime = this.deps.channelLifecycle.getRuntime(chName);
        if (!runtime) throw new Error(`No runtime for channel ${parent}`);
        const result = await runtime.spawnWorker(name, task, opts?.model, opts?.systemPrompt);
        if (!result.success) throw new Error(result.error || 'spawn failed');
        return result.workerId!;
      },

      kill: async (name: string) => {
        const chName = name.startsWith('#') ? name : `#${name}`;
        this.deps.channelAgents.delete(chName);
      },

      msg: async (target: string, message: string) => {
        const entry = completionPromises.get(target);
        if (entry) await entry.promise;
        const chName = target.startsWith('#') ? target : `#${target}`;
        const agent = this.deps.channelAgents.get(chName);
        if (agent) {
          this.deps.getTui()?.writeMessage('user', this.deps.getUserNick(), message, chName);
          this.deps.streamRouter.routeAsync(agent, message, {
            channel: chName,
            nick: target,
            render: 'tools-only',
            flowChannel,
            prefix: `<${target}>`,
          });
        }
      },

      broadcast: async (message: string) => {
        for (const [ch, agent] of this.deps.channelAgents) {
          if (!ch.startsWith('#')) agent.injectMessage(message);
        }
      },

      getAgents: () => {
        return this.deps.channelLifecycle.getAgents().map(a => ({
          name: a.name, provider: a.provider ?? 'unknown', status: a.status, model: a.model,
        }));
      },

      findAgent: (name: string) => {
        const a = this.deps.channelLifecycle.getAgents().find(ag => ag.name === name);
        if (!a) return null;
        return { name: a.name, provider: a.provider ?? 'unknown', status: a.status };
      },

      waitFor: async (agentName: string, _event: string, timeoutMs?: number) => {
        const timeout = timeoutMs ?? 600000;
        if (resultBuffer.has(agentName)) return resultBuffer.get(agentName)!;

        let entry = completionPromises.get(agentName);
        if (!entry) {
          const chName = agentName.startsWith('#') ? agentName : `#${agentName}`;
          const agent = this.deps.channelAgents.get(chName);
          if (agent) {
            let resolveCompletion: (v: string) => void;
            const completionP = new Promise<string>(r => { resolveCompletion = r; });
            completionPromises.set(agentName, { promise: completionP, resolve: resolveCompletion! });
            entry = completionPromises.get(agentName)!;

            const { z } = await import('zod');
            const { tool: completeTool, stickyText } = buildCompletionTool(z, undefined, (output: string) => {
              resultBuffer.set(agentName, output);
              resolveCompletion!(output);
              flowLog(`[wait] ${agentName} completed → payload (${output.length} chars)`);
            });
            agent.registerTool(completeTool);
            agent.addStickyNote(stickyText, 'bottom');
          }
        }

        if (entry) {
          const result = await Promise.race([
            entry.promise,
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error(`Timeout waiting for ${agentName}`)), timeout)),
          ]);
          return result;
        }
        throw new Error(`Agent ${agentName} not found`);
      },

      approve: async (prompt: string) => {
        return new Promise((resolve) => {
          const id = `flow-approval-${Date.now()}`;
          this.deps.pendingApprovals.set(id, {
            resolve: (response) => {
              const approved = response.toLowerCase() === 'y' || response.toLowerCase() === 'yes';
              resolve({ approved, value: response });
            },
            question: prompt,
            options: ['yes', 'no'],
            source: flowChannel,
          });
          this.deps.getTui()?.pushApproval({ id, question: prompt, options: ['yes', 'no'], source: flowChannel, timestamp: new Date() });
        });
      },

      seed: (target: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
        const chName = target.startsWith('#') ? target : `#${target}`;
        const agent = this.deps.channelAgents.get(chName);
        if (agent) {
          agent.seedMessages(messages);
        }
      },

      getResult: async (agentName: string) => {
        if (resultBuffer.has(agentName)) return resultBuffer.get(agentName)!;
        const chName = agentName.startsWith('#') ? agentName : `#${agentName}`;
        const agent = this.deps.channelAgents.get(chName);
        if (agent) return agent.getLastResponse();
        return '';
      },

      log: (message: string) => {
        flowLog(message);
      },

      emit: (event: string, data?: any) => {
        logInfo('flow', `Event: ${event}`, data);
      },

      runPipe: async (script: string, input: string): Promise<string> => {
        const { spawn: spawnProc } = await import('node:child_process');
        const scriptPath = path.resolve(script);
        const inputPreview = input.length > 200 ? input.slice(0, 200) + '…' : input;
        flowLog(`pipe: ${script}\n  stdin (${input.length} chars): ${inputPreview}`);
        return new Promise((resolve) => {
          const proc = spawnProc(scriptPath, [], { timeout: 30000 });
          let stdout = '';
          let stderr = '';
          proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
          proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
          proc.on('close', (code) => {
            if (code !== 0) {
              flowLog(`pipe exit ${code}: ${stderr.slice(0, 200)}`);
              resolve(input);
            } else {
              const outPreview = stdout.length > 200 ? stdout.slice(0, 200) + '…' : stdout;
              flowLog(`pipe: stdout (${stdout.length} chars): ${outPreview}`);
              resolve(stdout.trim());
            }
          });
          proc.on('error', (err) => {
            flowLog(`pipe failed: ${err.message}`);
            resolve(input);
          });
          proc.stdin?.write(input);
          proc.stdin?.end();
        });
      },

      setVariable: (name: string, value: any) => {
        logInfo('flow', `Set ${name} = ${value}`);
      },

      getVariable: (_name: string) => {
        return undefined;
      },
    };

    const flow = new ArmaFlow(ctx);
    const ast = flow.parse(flowText);
    const flowDesc = ast.description || ast.name || flowName;
    flowLog(`▶ ${flowName}: ${flowDesc}`);

    flow.run(flowText).then((execution) => {
      flowLog(`✓ flow "${flowName}" ${execution.status} (${((execution.completedAt ?? Date.now()) - execution.startedAt) / 1000}s)`);
    }).catch((err) => {
      flowLog(`✗ flow "${flowName}" failed: ${err.message}`);
    });
  }
}

