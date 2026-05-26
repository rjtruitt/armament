/**
 * Manages agent lifecycle, tool call approval, and event emission.
 *
 * Coordinates spawning/cancelling agents, recording tool calls with
 * approval/denial workflow, and bridging ChannelAgent context operations
 * (compact, rewind, snapshots) to the terminal UI layer.
 */

import type { IChannelAgent } from './interfaces/IChannelAgent.js';

/** Configuration for spawning a new agent. */
export interface AgentSpawnConfig {
  model?: string;
  provider?: string;
  task: string;
  node?: string;
  maxBudget?: number;
  tools?: string[];
}

/** Public agent state visible to consumers. */
export interface AgentInfo {
  id: string;
  name: string;
  model: string;
  provider: string;
  status: 'running' | 'queued' | 'completed' | 'failed' | 'cancelled';
  task: string;
  toolCalls: ToolCallRecord[];
  cost: number;
  startTime: number;
  endTime?: number;
}

/** Tracks the lifecycle of a single tool invocation within an agent. */
export interface ToolCallRecord {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'completed' | 'failed';
  result?: unknown;
  duration?: number;
}

/**
 * Agent controller class.
 */
export class AgentController {
  private agents: Map<string, AgentInfo> = new Map();
  private channelAgents: Map<string, IChannelAgent> = new Map();
  private activeChannelName: string | undefined;
  private agentSeq = 0;
  private maxAgents: number;
  private defaultModel: string;
  private defaultProvider: string;
  private toolCallListeners: Array<(agentId: string, tool: ToolCallRecord) => void> = [];
  private completeListeners: Array<(agent: AgentInfo) => void> = [];
  private errorListeners: Array<(agentId: string, error: Error) => void> = [];

  constructor(ctx: {
    maxAgents?: number;
    model?: string;
    provider?: string;
  } = {}) {
    this.maxAgents = ctx.maxAgents ?? 8;
    this.defaultModel = ctx.model ?? '';
    this.defaultProvider = ctx.provider ?? '';
  }

  /**
   * Spawn.
   */
  async spawn(config: AgentSpawnConfig): Promise<AgentInfo> {
    const activeCount = Array.from(this.agents.values()).filter(
      a => a.status === 'running' || a.status === 'queued'
    ).length;

    if (activeCount >= this.maxAgents) {
      throw new Error(`Max agent limit reached (${this.maxAgents})`);
    }

    this.agentSeq++;
    const id = `agent-${this.agentSeq}`;
    const agent: AgentInfo = {
      id,
      name: `Agent ${this.agentSeq}`,
      model: config.model ?? this.defaultModel,
      provider: config.provider ?? this.defaultProvider,
      status: 'running',
      task: config.task,
      toolCalls: [],
      cost: 0,
      startTime: Date.now(),
    };

    this.agents.set(id, agent);
    return agent;
  }

  /**
   * Cancel.
   */
  async cancel(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    if (agent.status === 'completed' || agent.status === 'cancelled') {
      return;
    }
    agent.status = 'cancelled';
    agent.endTime = Date.now();
  }

  /**
   * Gets the agent.
   */
  getAgent(id: string): AgentInfo {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    return agent;
  }

  /**
   * List agents.
   */
  listAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Switch model.
   */
  async switchModel(id: string, model: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    agent.model = model;
  }

  /**
   * Switch provider.
   */
  async switchProvider(id: string, provider: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    agent.provider = provider;
  }

  /**
   * Send message.
   */
  async sendMessage(id: string, _msg: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
  }

  /**
   * Add tool call.
   */
  addToolCall(agentId: string, toolCall: Omit<ToolCallRecord, 'id'>): ToolCallRecord {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const record: ToolCallRecord = {
      id: `tc-${agent.toolCalls.length + 1}`,
      ...toolCall,
    };
    agent.toolCalls.push(record);

    if (record.status === 'pending') {
      for (const cb of this.toolCallListeners) {
        cb(agentId, record);
      }
    }

    return record;
  }

  /**
   * Approve tool call.
   */
  async approveToolCall(agentId: string, toolCallId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const tc = agent.toolCalls.find(t => t.id === toolCallId);
    if (!tc) {
      throw new Error(`Tool call not found: ${toolCallId}`);
    }
    tc.status = 'approved';
  }

  /**
   * Deny tool call.
   */
  async denyToolCall(agentId: string, toolCallId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const tc = agent.toolCalls.find(t => t.id === toolCallId);
    if (!tc) {
      throw new Error(`Tool call not found: ${toolCallId}`);
    }
    tc.status = 'denied';
  }

  /**
   * Complete agent.
   */
  completeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    agent.status = 'completed';
    agent.endTime = Date.now();
    for (const cb of this.completeListeners) {
      cb(agent);
    }
  }

  /**
   * Fail agent.
   */
  failAgent(id: string, error: Error): void {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    agent.status = 'failed';
    agent.endTime = Date.now();
    for (const cb of this.errorListeners) {
      cb(id, error);
    }
  }

  /**
   * Add cost.
   */
  addCost(id: string, amount: number): void {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    agent.cost += amount;
  }

  /**
   * Gets the total cost.
   */
  getTotalCost(): number {
    let total = 0;
    for (const agent of this.agents.values()) {
      total += agent.cost;
    }
    return total;
  }

  /**
   * Gets the running agents.
   */
  getRunningAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).filter(a => a.status === 'running');
  }

  /**
   * Sets the default model.
   */
  setDefaultModel(model: string): void {
    this.defaultModel = model;
  }

  /**
   * Sets the default provider.
   */
  setDefaultProvider(provider: string): void {
    this.defaultProvider = provider;
  }

  /**
   * Gets the default model.
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Gets the default provider.
   */
  getDefaultProvider(): string {
    return this.defaultProvider;
  }

  /**
   * On tool call request.
   */
  onToolCallRequest(cb: (agentId: string, tool: ToolCallRecord) => void): () => void {
    this.toolCallListeners.push(cb);
    return () => {
      const idx = this.toolCallListeners.indexOf(cb);
      if (idx >= 0) this.toolCallListeners.splice(idx, 1);
    };
  }

  /**
   * On agent complete.
   */
  onAgentComplete(cb: (agent: AgentInfo) => void): () => void {
    this.completeListeners.push(cb);
    return () => {
      const idx = this.completeListeners.indexOf(cb);
      if (idx >= 0) this.completeListeners.splice(idx, 1);
    };
  }

  /**
   * On agent error.
   */
  onAgentError(cb: (agentId: string, error: Error) => void): () => void {
    this.errorListeners.push(cb);
    return () => {
      const idx = this.errorListeners.indexOf(cb);
      if (idx >= 0) this.errorListeners.splice(idx, 1);
    };
  }

  /**
   * Cancel all.
   */
  async cancelAll(): Promise<void> {
    for (const agent of this.agents.values()) {
      if (agent.status === 'running' || agent.status === 'queued') {
        agent.status = 'cancelled';
        agent.endTime = Date.now();
      }
    }
  }

  /** Pauses all running/queued agents. Currently a no-op pending scheduler integration. */
  pauseAll(): void {}

  /** Resumes all paused agents. Currently a no-op pending scheduler integration. */
  resumeAll(): void {}

  /**
   * Register channel agent.
   */
  registerChannelAgent(name: string, agent: IChannelAgent): void {
    this.channelAgents.set(name, agent);
  }

  /**
   * Unregister channel agent.
   */
  unregisterChannelAgent(name: string): void {
    this.channelAgents.delete(name);
  }

  /**
   * Sets the active channel name.
   */
  setActiveChannelName(name: string): void {
    this.activeChannelName = name;
  }

  private resolveChannel(name?: string): IChannelAgent | undefined {
    if (name) return this.channelAgents.get(name);
    if (this.activeChannelName) return this.channelAgents.get(this.activeChannelName);
    const first = this.channelAgents.values().next();
    return first.done ? undefined : first.value;
  }

  /**
   * Compact channel.
   */
  async compactChannel(channelName?: string): Promise<any> {
    const agent = this.resolveChannel(channelName);
    if (!agent) return null;
    return agent.compact();
  }

  /**
   * Gets the snapshots.
   */
  getSnapshots(channelName?: string): any[] {
    const agent = this.resolveChannel(channelName);
    if (!agent) return [];
    return agent.getSnapshots();
  }

  /**
   * Rewind channel.
   */
  rewindChannel(channelName: string | undefined, snapshotId: number): boolean {
    const agent = this.resolveChannel(channelName);
    if (!agent) return false;
    return agent.rewind(snapshotId);
  }

  /**
   * Gets the context usage.
   */
  getContextUsage(channelName?: string): any {
    const agent = this.resolveChannel(channelName);
    if (!agent) return null;
    return agent.getContextUsage();
  }
}
