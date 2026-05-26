import type {
  IAgentInstance,
  IAgentManager,
  IAgentSpawnOptions,
  AgentStatus,
} from './interfaces/IAgentManager.js';

export type { IAgentInstance, IAgentSpawnOptions, AgentStatus };

/** Agent descriptor for display/listing purposes. */
export interface Agent {
  id: string;
  name: string;
  model: string;
  provider: string;
  status: AgentStatus;
  node?: string;
  createdAt: number;
}

/**
 * ModelPricing type definition.
 */
export type ModelPricing = Record<string, { input: number; output: number }>;

const DEFAULT_TOKEN_COST = { input: 0.003, output: 0.015 };

interface AgentInternal extends IAgentInstance {
  maxTurns?: number;
  tools: string[];
  inputTokens: number;
  outputTokens: number;
  statusHistory: string[];
  abortController?: AbortController;
}

/** Manages agent lifecycle: spawning, killing, pausing, resuming, forking, and joining. */
export class AgentManager implements IAgentManager {
  private agents: Map<string, AgentInternal> = new Map();
  private activeId: string | undefined;
  private idCounter = 0;
  private pricing: ModelPricing;

  constructor(pricing?: ModelPricing) {
    this.pricing = pricing ?? {};
  }

  /**
   * Spawn.
   */
  async spawn(name: string, opts?: IAgentSpawnOptions): Promise<IAgentInstance> {
    if (!name || name.length === 0) {
      throw new Error('Agent name cannot be empty');
    }
    for (const agent of this.agents.values()) {
      if (agent.name === name) {
        throw new Error(`Agent name "${name}" already exists`);
      }
    }

    const now = Date.now();
    const id = `agent-${++this.idCounter}-${now}`;
    const channelId = `chan-agent-${this.idCounter}-${now}`;

    const agent: AgentInternal = {
      id,
      name,
      channelId,
      model: opts?.model ?? '',
      provider: opts?.provider ?? '',
      systemPrompt: opts?.systemPrompt,
      status: 'idle',
      turnCount: 0,
      tokenUsage: 0,
      cost: 0,
      createdAt: now,
      lastActivity: now,
      parentId: opts?.parentId,
      childIds: [],
      maxTurns: opts?.maxTurns,
      tools: opts?.tools ?? [],
      inputTokens: 0,
      outputTokens: 0,
      statusHistory: ['idle'],
    };

    this.agents.set(id, agent);

    if (opts?.parentId) {
      const parent = this.agents.get(opts.parentId);
      if (parent) {
        parent.childIds.push(id);
      }
    }

    if (!opts?.background && !this.activeId) {
      this.activeId = id;
    } else if (!opts?.background) {
      this.activeId = id;
    }

    if (opts?.background) {
      if (this.agents.size === 1 && !opts?.background) {
        this.activeId = id;
      }
    }

    return agent;
  }

  /**
   * Kill.
   */
  kill(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    agent.status = 'stopped';

    if (agent.abortController) {
      agent.abortController.abort();
      agent.abortController = undefined;
    }

    for (const childId of agent.childIds) {
      const child = this.agents.get(childId);
      if (child && child.status !== 'stopped') {
        this.kill(childId);
      }
    }
  }

  /**
   * Kill all.
   */
  killAll(): void {
    for (const agent of this.agents.values()) {
      if (agent.status !== 'stopped') {
        agent.status = 'stopped';
        if (agent.abortController) {
          agent.abortController.abort();
          agent.abortController = undefined;
        }
      }
    }
  }

  /**
   * Get.
   */
  get(agentId: string): IAgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Gets the by name.
   */
  getByName(name: string): IAgentInstance | undefined {
    for (const agent of this.agents.values()) {
      if (agent.name === name) {
        return agent;
      }
    }
    return undefined;
  }

  /**
   * Gets the all.
   */
  getAll(): IAgentInstance[] {
    return [...this.agents.values()];
  }

  /**
   * Gets the running.
   */
  getRunning(): IAgentInstance[] {
    return [...this.agents.values()].filter(a => a.status !== 'stopped');
  }

  /**
   * Sets the active.
   */
  setActive(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    this.activeId = agentId;
  }

  /**
   * Gets the active.
   */
  getActive(): IAgentInstance | undefined {
    if (!this.activeId) return undefined;
    return this.agents.get(this.activeId);
  }

  /**
   * Pause.
   */
  pause(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    if (agent.status === 'waiting') {
      throw new Error(`Agent "${agentId}" is already paused`);
    }
    agent.status = 'waiting';
  }

  /**
   * Resume.
   */
  resume(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    if (agent.status !== 'waiting') {
      throw new Error(`Agent "${agentId}" is not paused`);
    }
    agent.status = 'idle';
  }

  /**
   * Send message.
   */
  async sendMessage(agentId: string, message: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    if (agent.status === 'stopped') {
      throw new Error(`Agent "${agentId}" is stopped`);
    }
    if (agent.status === 'waiting') {
      throw new Error(`Agent "${agentId}" is paused`);
    }

    if (agent.maxTurns !== undefined && agent.turnCount >= agent.maxTurns) {
      throw new Error(`Agent "${agentId}" has reached maxTurns limit`);
    }

    const abortController = new AbortController();
    agent.abortController = abortController;

    agent.status = 'thinking';
    agent.statusHistory.push('thinking');

    if (agent.provider === 'broken') {
      agent.status = 'error';
      agent.statusHistory.push('error');
      agent.abortController = undefined;
      throw new Error('Provider error: broken provider');
    }

    await Promise.resolve();

    if (abortController.signal.aborted) {
      agent.status = 'stopped';
      agent.abortController = undefined;
      throw new Error('Message cancelled');
    }

    agent.status = 'streaming';
    agent.statusHistory.push('streaming');

    await Promise.resolve();

    if (abortController.signal.aborted) {
      agent.status = 'stopped';
      agent.abortController = undefined;
      throw new Error('Message cancelled');
    }

    if (agent.tools.length > 0) {
      agent.status = 'tool-use';
    }

    const inputTokens = message.length * 2;
    const outputTokens = message.length;
    agent.inputTokens += inputTokens;
    agent.outputTokens += outputTokens;
    agent.tokenUsage += inputTokens + outputTokens;

    const pricing = this.pricing[agent.model] ?? DEFAULT_TOKEN_COST;
    const messageCost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
    agent.cost += messageCost;

    agent.turnCount++;
    agent.lastActivity = Date.now();
    if (agent.tools.length > 0) {
      agent.status = 'tool-use';
    } else {
      agent.status = 'idle';
    }

    agent.abortController = undefined;
  }

  /**
   * Gets the status.
   */
  getStatus(agentId: string): AgentStatus {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    return agent.status;
  }

  /**
   * Gets the status history.
   */
  getStatusHistory(agentId: string): string[] {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    return [...agent.statusHistory];
  }

  /**
   * Fork.
   */
  async fork(agentId: string, name?: string): Promise<IAgentInstance> {
    const parent = this.agents.get(agentId);
    if (!parent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    if (parent.status === 'stopped') {
      throw new Error(`Cannot fork stopped agent "${agentId}"`);
    }

    const forkName = name ?? `${parent.name}-fork-${parent.childIds.length + 1}`;
    const child = await this.spawn(forkName, {
      model: parent.model,
      provider: parent.provider,
      systemPrompt: parent.systemPrompt,
      parentId: parent.id,
      tools: [...parent.tools],
    });

    return child;
  }

  /**
   * Join.
   */
  async join(agentIds: string[]): Promise<string> {
    if (agentIds.length < 2) {
      throw new Error('Join requires at least 2 agents');
    }

    for (const id of agentIds) {
      if (!this.agents.get(id)) {
        throw new Error(`Agent "${id}" not found`);
      }
    }

    const outputs: string[] = [];
    for (const id of agentIds) {
      const agent = this.agents.get(id)!;
      outputs.push(`[${agent.name}]: completed`);
    }

    return outputs.join('\n');
  }

  /**
   * Gets the extended info.
   */
  getExtendedInfo(agentId: string): any {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    return {
      ...agent,
      inputTokens: agent.inputTokens,
      outputTokens: agent.outputTokens,
      tools: agent.tools,
      maxTurns: agent.maxTurns,
      uptime: Date.now() - agent.createdAt,
    };
  }

  /**
   * Sets the config.
   */
  setConfig(agentId: string, key: string, value: any): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    switch (key) {
      case 'model':
        agent.model = value;
        break;
      case 'prompt':
        agent.systemPrompt = value;
        break;
      case 'maxTurns':
        agent.maxTurns = Number(value);
        break;
      default:
        throw new Error(`Invalid config key: "${key}"`);
    }
  }

  /**
   * Add tools.
   */
  addTools(agentId: string, tools: string[]): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    for (const tool of tools) {
      if (!agent.tools.includes(tool)) {
        agent.tools.push(tool);
      }
    }
  }
}
