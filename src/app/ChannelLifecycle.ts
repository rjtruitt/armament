import { ChannelAgent, TaskStore } from '../providers/index.js';
import { createNudgeTools } from '../providers/NudgeTools.js';
import { getGlobalEventBus } from '../app/EventBus.js';
import type { IChannelManifestEntry, IChannelStateFile } from '../session/index.js';
import { ChannelThreadHandle, type ChannelThreadConfig } from '../threads/index.js';
import { createChannelAgentWithTools } from './ChannelToolRegistration.js';
import { NudgeManager } from './NudgeManager.js';
import type { ChannelInfo, AgentInfo, ChannelLifecycleCallbacks, ChannelLifecycleDeps } from './ChannelLifecycleTypes.js';
import { UserConfig } from '../config/index.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { getArmaPath, getNotesPath, getArchDir, armaDataDir, getChannelRoot } from './ChannelPaths.js';
export type { ChannelInfo, AgentInfo, ChannelLifecycleCallbacks, ChannelLifecycleDeps };

/**
 * Manages channel/agent lifecycle: join, leave, resume, persist, model switching.
 */
export class ChannelLifecycle {
  private channels: ChannelInfo[] = [];
  private agents: AgentInfo[] = [];
  private channelAgents: Map<string, ChannelAgent> = new Map();
  private channelRuntimes: Map<string, import('../a2a/TaskRuntime.js').TaskRuntime> = new Map();
  private channelReadyPromises: Map<string, Promise<void>> = new Map();
  private deps: ChannelLifecycleDeps;
  private _taskStore = new TaskStore();
  /** NudgeManager — reads core-nudges.md and creates per-channel scheduled prompts. */
  private _nudgeManager = new NudgeManager();

  constructor(deps: ChannelLifecycleDeps) {
    this.deps = deps;
  }

  /** Public accessor for the NudgeManager (used by /nudge REPL command via CommandContext). */
  getNudgeManager(): NudgeManager { return this._nudgeManager; }

  /** Load nudges from core-nudges.md for the given channel. Called once per channel after first user message. */
  ensureMaintenanceSchedule(chName: string): void {
    this._nudgeManager.loadForChannel(chName);
  }

  /** Ensure the channel's notes.md exists in the workspace, seeded from core-notes.md template. */
  private _notifyChannelsUpdated(): void {
    try { getGlobalEventBus().emit({ type: 'channels:updated' }); } catch {}
  }

  private ensureChannelNotes(name: string): void {
    const armaPath = getArmaPath(name);
    const notesPath = join(armaPath, 'notes.md');
    if (existsSync(notesPath)) return;
    mkdirSync(armaPath, { recursive: true });
    const template = join(armaDataDir(), 'core-notes.md');
    if (existsSync(template)) {
      copyFileSync(template, notesPath);
    } else {
      writeFileSync(notesPath, '# Channel Notes\n\n## Current notes\n', 'utf-8');
    }

    // Seed architecture/ folder alongside notes.md
    const archDir = join(armaPath, 'architecture');
    const archIndex = join(archDir, 'index.md');
    if (!existsSync(archIndex)) {
      mkdirSync(archDir, { recursive: true });
      const archTemplate = join(armaDataDir(), 'core-architecture-index.md');
      if (existsSync(archTemplate)) {
        copyFileSync(archTemplate, archIndex);
      } else {
        writeFileSync(archIndex, '# Architecture overview\n\n*Expand as you explore.*\n', 'utf-8');
      }
    }

    // Seed architecture/drift.md alongside index.md
    const archDrift = join(archDir, 'drift.md');
    if (!existsSync(archDrift)) {
      const driftTemplate = join(armaDataDir(), 'core-architecture-drift.md');
      if (existsSync(driftTemplate)) {
        copyFileSync(driftTemplate, archDrift);
      }
    }
  }

  /** Read and format the channel's notes for injection into agent context. */
  getChannelNotes(name: string): string {
    const notesPath = getNotesPath(name);
    if (!existsSync(notesPath)) return '';
    try {
      const content = readFileSync(notesPath, 'utf-8').trim();
      if (!content) return '';
      return `\n[IMPORTANT NOTES — Channel context. Updated by agents as context evolves.]\n${content}\n[END IMPORTANT NOTES]\n`;
    } catch {
      return '';
    }
  }

  /** Remove the channel's notes directory. */
  private removeChannelNotes(name: string): void {
    const armaPath = getArmaPath(name);
    if (existsSync(armaPath)) {
      rmSync(armaPath, { recursive: true, force: true });
    }
  }

  /** Get the internal channel list. */
  getChannels(): ChannelInfo[] {
    return this.channels;
  }

  /** Get the internal agent list. */
  getAgents(): AgentInfo[] {
    return this.agents;
  }

  /** Get channel agents map. */
  getChannelAgents(): Map<string, ChannelAgent> {
    return this.channelAgents;
  }

  /** Get channel ready promises map. */
  getChannelReadyPromises(): Map<string, Promise<void>> {
    return this.channelReadyPromises;
  }

  /** Build a thread config for a channel. */
  private buildThreadConfig(chName: string, provType: string, model: string, provider: any): ChannelThreadConfig {
    return {
      channelName: chName,
      provider: { type: provType, model, region: provider.region, profile: provider.profile, apiKey: provider.apiKey, baseUrl: provider.baseUrl, streaming: provider.streaming },
      systemPrompt: this.deps.config.systemPrompt,
      maxTurns: this.deps.config.session?.maxTurns ?? 100,
      workerMaxTurns: this.deps.config.session?.workerMaxTurns ?? 250,
      tools: [],
      contextWindow: {
        maxTokens: this.deps.config.context?.maxTokens ?? 200_000,
        compactThreshold: this.deps.config.context?.compactThreshold ?? 0.75,
        recentMessagesToKeep: this.deps.config.context?.recentMessages ?? 12,
        summaryTargetRatio: 0.15,
      },
    };
  }

  /** Join or switch to a channel, creating a new agent if needed. */
  joinChannel(name: string, activeChannelName: string | undefined): string {
    if (!name || name.length === 0) {
      throw new Error('Channel name cannot be empty');
    }
    if (name.includes(' ')) {
      throw new Error('Channel name cannot contain spaces');
    }
    const bare = name.startsWith('#') ? name.slice(1) : name;
    if (/[^a-zA-Z0-9\-_]/.test(bare)) {
      throw new Error('Channel name contains invalid characters');
    }
    name = `#${bare}`;
    if (name.length > 32) {
      throw new Error('Channel name too long');
    }

    const existing = this.channels.find(c => c.name === name);
    if (existing) {
      this.channels.forEach(c => c.active = false);
      existing.active = true;
      this.deps.callbacks.setActiveChannel(name);
      this._notifyChannelsUpdated();
      return name;
    }

    this.channels.forEach(c => c.active = false);
    this.channels.push({ name, active: true });
    this.deps.callbacks.addChannel(name);
    this.deps.callbacks.setActiveChannel(name);
    this.ensureChannelNotes(name);

    const chName = name;
    const uc = UserConfig.instance();
    const useThreads = this.deps.config.session?.useThreads && this.deps.threadCoordinator;
    const defaultProvider = uc.providers?.[0] ?? this.deps.config.providers?.[0];
    const defaultModel = uc.defaultModel || this.deps.config.defaultModel;
    if (useThreads && defaultProvider && defaultModel) {
      const provType = defaultProvider.type ?? defaultProvider;
      const model = defaultModel;
      const threadConfig = this.buildThreadConfig(chName, provType, model, defaultProvider);
      const coordinator = this.deps.threadCoordinator!;
      const readyPromise = coordinator.spawnChannel(threadConfig).then(() => {
        const handle = new ChannelThreadHandle(coordinator, chName, model, provType);
        this.channelAgents.set(chName, handle as unknown as ChannelAgent);
        // Create a nudge store for this threaded channel so core-nudges.md gets loaded
        const nudgeResult = createNudgeTools((prompt, _jobId, hidden) => {
          if (!hidden) {
            this.deps.callbacks.writeMessage('system', 'info', `[nudge] ${prompt}`, chName);
          }
          const agent = this.channelAgents.get(chName);
          if (agent) {
            if (agent.status === 'idle') {
              (async () => { for await (const _ of agent.sendMessageStreaming(prompt)) {} })().catch(e => this.deps.callbacks.writeMessage('system', 'err', `Stream error: ${e.message}`, chName));
            } else {
              agent.injectMessage(prompt);
            }
          }
        }, { idleCheck: () => this.channelAgents.get(chName)?.status === 'idle' });
        this._nudgeManager.registerStore(chName, nudgeResult.store);
        this.deps.refreshProviderStats();
        this.deps.callbacks.writeMessage('system', '*', `Connected to ${provType} (${model}) [threaded]`);
        this.deps.callbacks.writeMessage('system', '*', `Joined ${chName}`);
        this.deps.callbacks.writeMessage('system', 'conn', `${chName} thread spawned → ${provType}/${model}`, '#logs');
      }).catch((err: Error) => {
        this.deps.callbacks.writeMessage('system', 'error', `Failed to spawn thread: ${err.message}`);
        this.deps.callbacks.writeMessage('system', 'err', `${chName} thread failed: ${err.message}`, '#logs');
      });
      this.channelReadyPromises.set(chName, readyPromise);
      this._notifyChannelsUpdated();
      return name;
    }

    if (defaultProvider && defaultModel) {
      const provType = defaultProvider.type ?? defaultProvider;
      const model = defaultModel;
      const readyPromise = this.deps.providerPool.getOrCreate(provType, model, {
        region: defaultProvider.region,
        profile: defaultProvider.profile,
        apiKey: defaultProvider.apiKey,
        baseURL: defaultProvider.baseUrl,
        streaming: defaultProvider.streaming,
        providerName: defaultProvider.name,
      }).then((adapter) => {
        const agent = this.createChannelAgent(chName, adapter, model, provType, defaultProvider.name);
        agent.setWorkspace(getChannelRoot(chName) + ':/tmp:/dev');
        this.channelAgents.set(chName, agent);
        this.deps.refreshProviderStats();
        this.deps.callbacks.writeMessage('system', '*', `Connected to ${defaultProvider.name ?? provType} (${model})`);
        this.deps.callbacks.writeMessage('system', '*', `Joined ${chName}`);
        this.deps.callbacks.writeMessage('system', 'conn', `${chName} connected → ${provType}/${model}`, '#logs');
      }).catch((err: Error) => {
        this.deps.callbacks.writeMessage('system', '*', `Failed to connect: ${err.message}`);
        this.deps.callbacks.writeMessage('system', 'err',
          `${chName} connection failed: ${err.message}`, '#logs');
      });
      this.channelReadyPromises.set(chName, readyPromise);
    }

    this._notifyChannelsUpdated();
    return name;
  }

  /** Spawn a channel in the background without switching active focus. Used by flows. */
  spawnChannelBackground(name: string): string {
    const bare = name.startsWith('#') ? name.slice(1) : name;
    const chName = `#${bare}`;

    const existing = this.channels.find(c => c.name === chName);
    if (existing) { this._notifyChannelsUpdated(); return chName; }

    this.channels.push({ name: chName, active: false });
    this.deps.callbacks.addChannel(chName);
    this.ensureChannelNotes(chName);

    const uc = UserConfig.instance();
    const defaultProvider = uc.providers?.[0] ?? this.deps.config.providers?.[0];
    const defaultModel = uc.defaultModel || this.deps.config.defaultModel;
    const useThreads = this.deps.config.session?.useThreads && this.deps.threadCoordinator;

    if (useThreads && defaultProvider && defaultModel) {
      const provType = defaultProvider.type ?? defaultProvider;
      const model = defaultModel;
      const threadConfig = this.buildThreadConfig(chName, provType, model, defaultProvider);
      const coordinator = this.deps.threadCoordinator!;
      const readyPromise = coordinator.spawnChannel(threadConfig).then(() => {
        const handle = new ChannelThreadHandle(coordinator, chName, model, provType);
        (handle as any).setWorkspace?.(getChannelRoot(chName) + ':/tmp:/dev');
        this.channelAgents.set(chName, handle as unknown as ChannelAgent);
        this.deps.refreshProviderStats();
      }).catch(() => {});
      this.channelReadyPromises.set(chName, readyPromise);
      this._notifyChannelsUpdated();
      return chName;
    }

    if (defaultProvider && defaultModel) {
      const provType = defaultProvider.type ?? defaultProvider;
      const model = defaultModel;
      const readyPromise = this.deps.providerPool.getOrCreate(provType, model, {
        region: defaultProvider.region,
        profile: defaultProvider.profile,
        apiKey: defaultProvider.apiKey,
        baseURL: defaultProvider.baseUrl,
        streaming: defaultProvider.streaming,
        providerName: defaultProvider.name,
      }).then((adapter) => {
        const agent = this.createChannelAgent(chName, adapter, model, provType, defaultProvider.name);
        agent.setWorkspace(getChannelRoot(chName) + ':/tmp:/dev');
        this.channelAgents.set(chName, agent);
        this.deps.refreshProviderStats();
      }).catch(() => {});
      this.channelReadyPromises.set(chName, readyPromise);
    }

    this._notifyChannelsUpdated();
    return name;
  }

  /** Register a channel without spawning an agent (e.g. flow log channels). */
  registerChannel(name: string): void {
    const chName = name.startsWith('#') ? name : `#${name}`;
    if (this.channels.find(c => c.name === chName)) return;
    this.channels.push({ name: chName, active: false });
    this._notifyChannelsUpdated();
  }

  /** Leave a channel, destroying its agent and workers. */
  leaveChannel(name: string): string | undefined {
    if (name && !name.startsWith('#')) name = `#${name}`;
    const idx = this.channels.findIndex(c => c.name === name);
    if (idx === -1) {
      throw new Error(`Channel "${name}" not found`);
    }
    const channel = this.channels[idx];

    // Shut down and remove workers/sub-agents first
    const bareName = name.startsWith('#') ? name.slice(1) : name;
    const workerPrefix = `worker-${bareName}`;
    for (const [id, w] of this.channelAgents.entries()) {
      if (!id.startsWith(workerPrefix)) continue;
      w.shutdown().catch(() => {});
      this.channelAgents.delete(id);
      this.deps.callbacks.removeAgent(id);
      this.deps.callbacks.removeChannelChild(name, id);
    }

    const agent = this.channelAgents.get(name);
    if (agent) {
      agent.shutdown().catch(() => {});
    }
    this.channelAgents.delete(name);

    this._nudgeManager.unregisterStore(name);

    const runtime = this.channelRuntimes.get(name);
    if (runtime) {
      runtime.shutdown?.();
      this.channelRuntimes.delete(name);
    }

    // Also clean up any sub-channel runtimes
    for (const [id] of this.channelRuntimes) {
      if (id.startsWith(workerPrefix)) {
        this.channelRuntimes.get(id)?.shutdown?.();
        this.channelRuntimes.delete(id);
      }
    }

    if (channel.agentId) {
      const agentIdx = this.agents.findIndex(a => a.id === channel.agentId);
      if (agentIdx !== -1) this.agents.splice(agentIdx, 1);
    }
    const agentByName = this.agents.findIndex(a => a.name === bareName);
    if (agentByName !== -1) this.agents.splice(agentByName, 1);

    this.channels.splice(idx, 1);

    this.deps.callbacks.removeChannel(name);
    this.deps.callbacks.removeAgent(name);
    this.deps.refreshProviderStats();

    this.deps.sessionPersistence.deleteChannel(name).catch(() => {});

    const controlChannel = this.channels.find(c => c.name === '#control');
    const fallback = controlChannel ?? this.channels[0];
    let newActive: string | undefined;
    if (fallback) {
      this.channels.forEach(c => c.active = false);
      fallback.active = true;
      newActive = fallback.name;
      this.deps.callbacks.setActiveChannel(fallback.name);
    }

    this.deps.callbacks.writeMessage('system', '*', `Left ${name}`);
    this.removeChannelNotes(name);
    return newActive;
  }

  /** Persist channel state to session storage. */
  persistChannelState(channelName: string): void {
    const agent = this.channelAgents.get(channelName);
    if (!agent) return;

    const chatMessages = this.deps.callbacks.getChannelMessages(channelName) ?? [];

    const agentState = agent.exportSession();

    // Rolling dropoff: keep last 5000 messages, drop oldest
    const MAX_SAVED_MESSAGES = 5000;
    let messages = agentState.messages;
    if (messages.length > MAX_SAVED_MESSAGES) {
      const dropped = messages.length - MAX_SAVED_MESSAGES;
      messages = messages.slice(-MAX_SAVED_MESSAGES);
      // Ensure the first message is a system note about the drop
      messages[0] = {
        role: 'system',
        content: `[Rolling dropoff — dropped ${dropped} oldest messages to stay under ${MAX_SAVED_MESSAGES}]`,
      } as any;
      // Trim any preceding system messages
      while (messages.length > 1 && messages[1]?.role === 'system') {
        messages.splice(1, 1);
      }
    }

    const bareName = channelName.startsWith('#') ? channelName.slice(1) : channelName;
    const workers = Array.from(this.channelAgents.entries())
      .filter(([id]) => id.startsWith(`worker-${bareName}`))
      .map(([id, w]) => ({
        id,
        model: w.model,
        status: w.status,
        turnCount: w.turnCount,
      }));

    const state: IChannelStateFile = {
      channelName,
      messages: messages.map((m: any, i: number) => ({
        id: `msg-${i}`,
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        timestamp: Date.now(),
        metadata: undefined,
        tool_call_id: m.tool_call_id ?? undefined,
        tool_calls: m.tool_calls ?? undefined,
      })),
      chatMessages: chatMessages.map(m => ({
        type: m.type,
        sender: m.sender,
        content: m.content,
        timestamp: m.timestamp.getTime(),
      })),
      agentConfig: {
        model: agent.model,
        provider: agent.providerType,
        tools: this.deps.getActiveToolNames(),
      },
      turnCount: agent.turnCount,
      totalTokens: agent.totalTokens,
      children: workers,
    };

    this.deps.sessionPersistence.saveChannel(channelName, state);
  }

  /** Resume a previously suspended channel from session state. */
  async resumeChannel(
    entry: IChannelManifestEntry,
    state: IChannelStateFile,
    activeChannelName: string | undefined,
  ): Promise<void> {
    const chName = entry.name;

    this.joinChannel(chName, activeChannelName);

    const readyPromise = this.channelReadyPromises.get(chName);
    if (readyPromise) {
      await readyPromise;
    }

    const agent = this.channelAgents.get(chName);
    if (agent && state.messages && state.messages.length > 0) {
      // Rolling dropoff on load too — safety net in case state file exceeded 5000
      const MAX_LOADED_MESSAGES = 5000;
      let loadMsgs = state.messages;
      if (loadMsgs.length > MAX_LOADED_MESSAGES) {
        loadMsgs = loadMsgs.slice(-MAX_LOADED_MESSAGES);
        loadMsgs[0] = {
          id: 'msg-dropoff',
          role: 'system',
          content: `[Rolling dropoff — earlier messages trimmed to stay under ${MAX_LOADED_MESSAGES}]`,
        } as any;
      }
      agent.importSession({
        messages: loadMsgs.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system' | 'tool',
          content: m.content,
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        })),
      });
    }

    // Restore turn count but NOT token totals — tokens are per-session
    if (agent) {
      agent.turnCount = state.turnCount || 0;
    }

    if (state.chatMessages && state.chatMessages.length > 0) {
      for (const msg of state.chatMessages) {
        if (msg.type === 'system' && msg.content.includes('Session restored')) continue;
        this.deps.callbacks.writeMessage(msg.type, msg.sender, msg.content, chName);
      }
    }

    this.deps.callbacks.writeMessage('system', '*',
      `── Session restored (${entry.turnCount} turns, ${entry.model}) ──`, chName);

    if (state.children && state.children.length > 0) {
      for (const child of state.children) {
        const workerLabel = child.id.replace(/^worker-/, '').replace(/-\d+$/, '').slice(0, 15);
        this.deps.callbacks.addChannelChild(chName, {
          id: child.id,
          label: workerLabel,
          status: child.status === 'complete' ? 'done' : 'idle',
          role: 'worker',
        });
      }
    }
  }

  /** Switch the model/provider on an existing channel. */
  async switchChannelModel(channelName: string, newModel: string, newProvider?: string): Promise<void> {
    if (!channelName.startsWith('#')) channelName = `#${channelName}`;
    const existingAgent = this.channelAgents.get(channelName);
    if (!existingAgent) {
      this.deps.callbacks.writeMessage('system', 'error', `No agent on ${channelName}`, channelName);
      return;
    }

    const provType = newProvider ?? existingAgent.providerType;
    const uc = UserConfig.instance();
    const providerList = uc.providers?.length ? uc.providers : this.deps.config.providers;
    const provConfig = providerList?.find((p: any) => (p.name ?? p.type) === provType);
    if (!provConfig) {
      this.deps.callbacks.writeMessage('system', 'error', `Provider "${provType}" not configured`, channelName);
      return;
    }

    const sessionState = existingAgent.exportSession();
    await existingAgent.shutdown().catch(() => {});

    try {
      const driverType = provConfig.type ?? provType;
      const adapter = await this.deps.providerPool.getOrCreate(driverType, newModel, {
        region: provConfig.region,
        profile: provConfig.profile,
        apiKey: provConfig.apiKey,
        baseURL: provConfig.baseUrl,
        streaming: provConfig.streaming,
        providerName: provConfig.name,
      });

      const agent = this.createChannelAgent(channelName, adapter, newModel, driverType);
      agent.importSession(sessionState);
      this.channelAgents.set(channelName, agent);
      this.deps.refreshProviderStats();
      this.deps.callbacks.writeMessage('system', '*', `Switched to ${provConfig.name ?? provConfig.type}/${newModel}`, channelName);
      this.deps.callbacks.writeMessage('system', 'conn',
        `${channelName} model switch → ${provConfig.name ?? provConfig.type}/${newModel}`, '#logs');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.deps.callbacks.writeMessage('system', 'error', `Failed to switch model: ${msg}`, channelName);
      this.deps.callbacks.writeMessage('system', 'err',
        `${channelName} model switch failed: ${msg}`, '#logs');
    }
  }

  /** Create a ChannelAgent with all standard tools and callbacks wired. */
  private createChannelAgent(chName: string, adapter: any, model: string, provType: string, providerName?: string): ChannelAgent {
    return createChannelAgentWithTools({
      chName,
      adapter,
      model,
      provType,
      providerName,
      deps: this.deps,
      taskStore: this._taskStore,
      channelAgents: this.channelAgents,
      setScheduleStore: (store) => { this._nudgeManager.registerStore(chName, store); },
      setRuntime: (name, runtime) => { this.channelRuntimes.set(name, runtime); },
      persistChannelState: (name) => { this.persistChannelState(name); },
    });
  }

  /**
   * Gets the runtime.
   */
  getRuntime(channelName: string): import('../a2a/TaskRuntime.js').TaskRuntime | undefined {
    return this.channelRuntimes.get(channelName);
  }
}
