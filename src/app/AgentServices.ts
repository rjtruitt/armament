import type { ChannelAgent } from '../providers/index.js';
import type { ChannelLifecycle } from './ChannelLifecycle.js';
import type { StreamRouter, OutputTarget } from './StreamRouter.js';
import type { TuiRenderer } from './TuiRenderer.js';

/** Interface for AgentServicesDeps.
 * @property {TuiRenderer} tui - Description of tui.
 * @property {ChannelLifecycle} channelLifecycle - Description of channelLifecycle.
 * @property {Map<string, ChannelAgent>} channelAgents - Description of channelAgents.
 * @property {Map<string, Promise<void>} channelReadyPromises - Description of channelReadyPromises.
 * @property {StreamRouter} streamRouter - Description of streamRouter.
 */
export interface AgentServicesDeps {
  tui: TuiRenderer | null;
  channelLifecycle: ChannelLifecycle;
  channelAgents: Map<string, ChannelAgent>;
  channelReadyPromises: Map<string, Promise<void>>;
  streamRouter: StreamRouter;
  getUserNick: () => string;
}

/** Class representing AgentServices. */
export class AgentServices {
  private deps: AgentServicesDeps;

  constructor(deps: AgentServicesDeps) {
    this.deps = deps;
  }

  /**
   * Gets the agent.
   */
  getAgent(channel: string): ChannelAgent | undefined {
    const chName = channel.startsWith('#') ? channel : `#${channel}`;
    return this.deps.channelAgents.get(chName);
  }

  /**
   * Await ready.
   */
  async awaitReady(channel: string): Promise<void> {
    const chName = channel.startsWith('#') ? channel : `#${channel}`;
    const p = this.deps.channelReadyPromises.get(chName);
    if (p) await p;
  }

  /**
   * Send to agent.
   */
  sendToAgent(channel: string, message: string, target: OutputTarget): Promise<string> {
    const agent = this.getAgent(channel);
    if (!agent) throw new Error(`No agent on ${channel}`);
    return this.deps.streamRouter.routeSync(agent, message, target);
  }

  /**
   * Send to agent async.
   */
  sendToAgentAsync(channel: string, message: string, target: OutputTarget): void {
    const agent = this.getAgent(channel);
    if (!agent) throw new Error(`No agent on ${channel}`);
    this.deps.streamRouter.routeAsync(agent, message, target);
  }

  /**
   * Stream to agent.
   */
  streamToAgent(channel: string, message: string, target: OutputTarget, interrupted?: () => boolean): Promise<string> {
    const agent = this.getAgent(channel);
    if (!agent) throw new Error(`No agent on ${channel}`);
    return this.deps.streamRouter.routeStream(agent, message, target, interrupted);
  }

  /**
   * Kill agent.
   */
  killAgent(name: string): void {
    const chName = name.startsWith('#') ? name : `#${name}`;
    this.deps.channelAgents.delete(chName);
  }

  /**
   * Register tool.
   */
  registerTool(channel: string, tool: any): void {
    const agent = this.getAgent(channel);
    if (agent) agent.registerTool(tool);
  }

  /**
   * Deregister tools.
   */
  deregisterTools(channel: string, toolNames: string[]): void {
    const agent = this.getAgent(channel);
    if (agent) {
      for (const name of toolNames) {
        agent.deregisterTool(name);
      }
    }
  }
}
