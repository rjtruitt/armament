/**
 * Connects ChannelAgent lifecycle to SessionPersistence for save/restore.
 *
 * Acts as the glue between live agents and the persistence layer, handling
 * serialization of agent state to IChannelStateFile and warm/cold restore.
 */

import type { IChannelAgent } from '../../core/index.js';
import type { SessionPersistence } from './SessionPersistence.js';
import type { ResumeController } from './ResumeController.js';
import type { IChannelStateFile, ISessionManifest, IChannelManifestEntry, ResumeMode } from '../interfaces/ISessionPersistence.js';
import type { Message } from 'iteratio';

/** Bridges live ChannelAgent instances with disk-based session persistence. */
export class SessionBridge {
  private agents: Map<string, IChannelAgent> = new Map();
  private activeChannel: string | undefined;

  constructor(
    private persistence: SessionPersistence,
    private resume: ResumeController
  ) {}

  /**
   * Register agent.
   */
  registerAgent(channelName: string, agent: IChannelAgent): void {
    this.agents.set(channelName, agent);
  }

  /**
   * Unregister agent.
   */
  unregisterAgent(channelName: string): void {
    this.agents.delete(channelName);
  }

  /**
   * Sets the active channel.
   */
  setActiveChannel(name: string): void {
    this.activeChannel = name;
  }

  /**
   * Save all.
   */
  async saveAll(): Promise<void> {
    const manifest = this.buildManifest();
    await this.persistence.saveManifest(manifest);

    for (const [name, agent] of this.agents) {
      const state = this.exportChannelState(name, agent);
      await this.persistence.saveChannel(name, state);
    }
  }

  /**
   * Save channel.
   */
  async saveChannel(channelName: string): Promise<void> {
    const agent = this.agents.get(channelName);
    if (!agent) return;
    const state = this.exportChannelState(channelName, agent);
    await this.persistence.saveChannel(channelName, state);
  }

  /**
   * Restore all.
   */
  async restoreAll(mode: ResumeMode = 'warm'): Promise<Map<string, { agent: IChannelAgent; restored: boolean }>> {
    const manifest = await this.persistence.loadManifest();
    if (!manifest) return new Map();

    const results = new Map<string, { agent: IChannelAgent; restored: boolean }>();

    for (const entry of manifest.channels) {
      const agent = this.agents.get(entry.name);
      if (!agent) continue;

      const channelState = await this.persistence.loadChannelState(entry.name);
      if (!channelState) {
        results.set(entry.name, { agent, restored: false });
        continue;
      }

      if (mode === 'warm') {
        const { messages } = this.resume.resumeWarm(entry.name, channelState);
        const sessionState = agent.exportSession();
        agent.importSession({
          messages: messages.map(m => ({
            role: m.role as Message['role'],
            content: m.content,
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
          })),
          runningSummary: channelState.summary ?? '',
          snapshots: sessionState.snapshots,
          config: sessionState.config,
          compactionHistory: sessionState.compactionHistory,
        });
      } else {
        const summary = channelState.summary ?? '';
        const { catchUpMessage } = this.resume.resumeCold(entry.name, channelState, summary);
        agent.importSession({
          messages: [{ role: 'system', content: catchUpMessage }],
          runningSummary: summary,
          snapshots: [],
          config: {},
          compactionHistory: [],
        });
      }

      results.set(entry.name, { agent, restored: true });
    }

    if (manifest.activeChannel) {
      this.activeChannel = manifest.activeChannel;
    }

    return results;
  }

  private exportChannelState(channelName: string, agent: IChannelAgent): IChannelStateFile {
    const session = agent.exportSession();
    const now = Date.now();

    return {
      channelName,
      messages: session.messages.map((m: any, i: number) => ({
        id: `msg-${i}`,
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        timestamp: now,
        tool_call_id: m.tool_call_id ?? undefined,
        tool_calls: m.tool_calls ?? undefined,
      })),
      chatMessages: [],
      agentConfig: {
        model: agent.model,
        provider: agent.providerType,
        systemPrompt: undefined,
        tools: [],
      },
      turnCount: agent.turnCount,
      totalTokens: agent.totalTokens,
      summary: session.runningSummary || undefined,
    };
  }

  private buildManifest(): ISessionManifest {
    const channels: IChannelManifestEntry[] = [];

    for (const [name, agent] of this.agents) {
      channels.push({
        name,
        stateFile: `channels/${name.replace(/^#/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}.state.json`,
        status: agent.status === 'complete' ? 'suspended' : 'active',
        model: agent.model,
        provider: agent.providerType,
        turnCount: agent.turnCount,
        lastActivity: Date.now(),
      });
    }

    return {
      version: 1,
      savedAt: new Date().toISOString(),
      workspace: '',
      activeChannel: this.activeChannel,
      channels,
      globalConfig: {},
      stickyNotes: [],
      activeTools: [],
    };
  }

  /**
   * Shutdown.
   */
  shutdown(): void {
    // Synchronous final save before exit
    const manifest = this.buildManifest();
    this.persistence.saveManifest(manifest);

    for (const [name, agent] of this.agents) {
      const state = this.exportChannelState(name, agent);
      this.persistence.saveChannel(name, state);
    }
  }
}
