import { ChannelAgent, TaskStore } from '../providers/index.js';
import { createNudgeTools } from '../providers/NudgeTools.js';
import { getGlobalEventBus } from '../app/EventBus.js';
import type { IChannelManifestEntry, IChannelStateFile } from '../session/index.js';
import { ChannelThreadHandle, type ChannelThreadConfig } from '../threads/index.js';
import { createChannelAgentWithTools } from './ChannelToolRegistration.js';
import type { ILLMProvider } from '../providers/ProviderPool.js';
import type { Message } from 'iteratio';
import { NudgeManager } from './NudgeManager.js';
import { AutoWorkerManager } from './AutoWorkerManager.js';
import type { ChannelInfo, AgentInfo, ChannelLifecycleCallbacks, ChannelLifecycleDeps } from './ChannelLifecycleTypes.js';
import { UserConfig } from '../config/index.js';
import type { IProviderConfig } from '../core/interfaces/IProviderConfig.js';
import { stripAllAnsi } from '../core/stripAnsi.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { getArmaPath, getNotesPath, getArchDir, armaDataDir, getChannelRoot } from './ChannelPaths.js';
import { ScheduledPrompt } from './ScheduledPrompt.js';
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
  /** Per-channel recurring prompts (reads .armaws/reminder_prompt.md). */
  private _recurringPrompts = new Map<string, ScheduledPrompt>();
  /** Per-channel auto-worker manager (refactor, jsdoc, test-builder, etc.). */
  private _autoWorkerManager: AutoWorkerManager;

  constructor(deps: ChannelLifecycleDeps) {
    this.deps = deps;
    this._autoWorkerManager = new AutoWorkerManager({
      getChannelAgent: (ch) => this.channelAgents.get(ch),
      getRuntime: (ch) => this.channelRuntimes.get(ch),
      getChannelMessages: (ch) => this.deps.callbacks.getChannelMessages(ch),
      callbacks: this.deps.callbacks,
      getChannelRoot,
      getArmaPath,
    });
    // Listen for recurring prompt config changes
    try {
      getGlobalEventBus().on((event: Record<string, unknown>) => {
        if (event && event.type === 'recurring-prompt:config-changed') {
          this._reloadRecurringPrompts();
        }
      });
    } catch {}
  }

  /** Public accessor for the AutoWorkerManager. */
  getAutoWorkerManager(): AutoWorkerManager { return this._autoWorkerManager; }

  /** Public accessor for the NudgeManager (used by /nudge REPL command via CommandContext). */
  getNudgeManager(): NudgeManager { return this._nudgeManager; }

  /**
   * Spawn a channel agent (threaded or non-threaded) and register it.
   * Shared by both joinChannel and spawnChannelBackground.
   * Calls onSuccess after the agent is created and registered, onError on failure.
   * The ready promise is stored in channelReadyPromises internally.
   */
  private _spawnChannelAgent(
    chName: string,
    defaultProvider: IProviderConfig | undefined,
    defaultModel: string,
    onSuccess: () => void,
    onError: (err: Error) => void,
  ): void {
    const useThreads = this.deps.config.session?.useThreads && this.deps.threadCoordinator;

    if (useThreads && defaultProvider && defaultModel) {
      const provType = defaultProvider.type ?? defaultProvider;
      const model = defaultModel;
      const threadConfig = this.buildThreadConfig(chName, provType, model, defaultProvider);
      const coordinator = this.deps.threadCoordinator!;
      const readyPromise = coordinator.spawnChannel(threadConfig).then(() => {
        const handle = new ChannelThreadHandle(coordinator, chName, model, provType);
        handle.setWorkspace(getChannelRoot(chName) + ':/tmp:/dev');
        this.channelAgents.set(chName, handle as unknown as ChannelAgent);
        onSuccess();
      }).catch(onError);
      this.channelReadyPromises.set(chName, readyPromise);
      return;
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
        onSuccess();
      }).catch(onError);
      this.channelReadyPromises.set(chName, readyPromise);
    }
  }

  /** Create nudge tools, register store, and start recurring prompt for a channel.
   *  Shared by both threaded and non-threaded join paths. */
  private _setupChannelNudges(chName: string): void {
    const nudgeResult = createNudgeTools((prompt, _jobId, hidden) => {
      if (!hidden) {
        this.deps.callbacks.writeMessage('system', 'info', `[nudge] ${prompt}`, chName);
      }
      const a = this.channelAgents.get(chName);
      if (a) {
        if (a.status === 'idle') {
          (async () => { for await (const _ of a.sendMessageStreaming(prompt)) {} })().catch(e =>
            this.deps.callbacks.writeMessage('system', 'err', `Stream error: ${e.message}`, chName));
        } else {
          a.injectMessage(prompt);
        }
      }
    }, { idleCheck: () => this.channelAgents.get(chName)?.status === 'idle' });
    this._nudgeManager.registerStore(chName, nudgeResult.store);
    this._manageRecurringPrompt(chName);
  }

  /**
   * Start or update the recurring prompt for a channel.
   * Reads .armaws/reminder_prompt.md and creates a recurring nudge job via ScheduledPrompt.
   * Called on first message and on config change.
   */
  private _manageRecurringPrompt(chName: string): void {
    const settings = UserConfig.instance().settings.session;
    if (!settings.recurringPromptEnabled) {
      // Cancel any existing prompt
      this._recurringPrompts.get(chName)?.stop();
      this._recurringPrompts.delete(chName);
      return;
    }

    // Read the reminder prompt file
    const armaPath = getArmaPath(chName);
    const promptPath = join(armaPath, 'reminder_prompt.md');
    if (!existsSync(promptPath)) return;
    const prompt = readFileSync(promptPath, 'utf-8').trim();
    if (!prompt) return;

    // Get or create the ScheduledPrompt for this channel
    let sp = this._recurringPrompts.get(chName);
    if (!sp) {
      sp = new ScheduledPrompt();
      this._recurringPrompts.set(chName, sp);
    }

    // The NudgeStore should already be registered by now (via registerStore in joinChannel/spawnChannelBackground)
    const store = this._nudgeManager.getStore(chName);
    if (!store) return;
    sp.setStore(store);

    const intervalMs = (settings.recurringPromptInterval || 5) * 60 * 1000;
    sp.start(prompt, intervalMs, { hidden: true, fireNow: false });
  }

  /** Reload all recurring prompts (used on config change). */
  private _reloadRecurringPrompts(): void {
    for (const chName of this._recurringPrompts.keys()) {
      this._manageRecurringPrompt(chName);
    }
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

    // Seed reminder_prompt.md alongside notes.md if it doesn't exist
    const reminderPath = join(armaPath, 'reminder_prompt.md');
    if (!existsSync(reminderPath)) {
      writeFileSync(reminderPath, [
        '# Reminder Prompt',
        '',
        'Edit this file to set the recurring prompt for this channel.',
        'The prompt is injected into the agent conversation on a configurable interval.',
        '',
        'Example:',
        '  - Check for any new drift in the architecture docs and update them.',
        '  - Review recent changes and suggest improvements.',
      ].join('\n'), 'utf-8');
    }

    // Seed auto-worker prompt templates from core-auto-worker-*.md files
    // Any file matching core-auto-worker-{type}.md in armaDataDir() becomes
    // a seedable auto-worker type. Add new workers by creating core templates.
    try {
      const coreDir = armaDataDir();
      const coreFiles = readdirSync(coreDir).filter(f => f.startsWith('core-auto-worker-') && f.endsWith('.md'));
      for (const cf of coreFiles) {
        const type = cf.replace('core-auto-worker-', '').replace(/\.md$/, '');
        const targetPath = join(armaPath, `auto-worker-${type}.md`);
        if (!existsSync(targetPath)) {
          copyFileSync(join(coreDir, cf), targetPath);
        }
      }
    } catch {
      // Best-effort
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
  private buildThreadConfig(chName: string, provType: string, model: string, provider: IProviderConfig | undefined): ChannelThreadConfig {
    return {
      channelName: chName,
      provider: { type: provType, model, region: provider?.region, profile: provider?.profile, apiKey: provider?.apiKey, baseUrl: provider?.baseUrl, streaming: provider?.streaming },
      systemPrompt: this.deps.config.systemPrompt,
      maxTurns: this.deps.config.session?.maxTurns ?? 100,
      workerMaxTurns: this.deps.config.session?.workerMaxTurns ?? 250,
      tools: [],
      contextWindow: {
        maxTokens: UserConfig.instance().settings.context.maxTokens ?? 200_000,
        compactThreshold: UserConfig.instance().settings.context.compactThreshold ?? 0.75,
        recentMessagesToKeep: UserConfig.instance().settings.context.recentMessages ?? 12,
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
      this._autoWorkerManager.startChannel(name);
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

    this._spawnChannelAgent(chName, defaultProvider, defaultModel,
      () => {
        this._autoWorkerManager.startChannel(chName);
        this._setupChannelNudges(chName);
        this.deps.refreshProviderStats();
        const agent = this.channelAgents.get(chName);
        const label = agent ? `${agent.providerType}/${agent.model}` : '?';
        const prefix = useThreads ? `${label} [threaded]` : `${label}`;
        this.deps.callbacks.writeMessage('system', '*', `Connected to ${prefix}`);
        this.deps.callbacks.writeMessage('system', '*', `Joined ${chName}`);
        this.deps.callbacks.stopThinking(chName);
        this.deps.callbacks.writeMessage('system', 'conn', `${chName} connected → ${label}`, '#logs');
      },
      (err: Error) => {
        const msg = useThreads ? `Failed to spawn thread: ${err.message}` : `Failed to connect: ${err.message}`;
        this.deps.callbacks.writeMessage('system', 'error', msg);
        this.deps.callbacks.writeMessage('system', 'err', `${chName} ${useThreads ? 'thread' : 'connection'} failed: ${err.message}`, '#logs');
      },
    );

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

    this._spawnChannelAgent(chName, defaultProvider, defaultModel,
      () => {
        this._autoWorkerManager.startChannel(chName);
        this.deps.refreshProviderStats();
      },
      () => {},
    );

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
    this._recurringPrompts.get(name)?.stop();
    this._recurringPrompts.delete(name);
    this._autoWorkerManager.stopChannel(name);

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
  persistChannelState(channelName: string, force = false): void {
    const agent = this.channelAgents.get(channelName);
    if (!agent) return;

    const chatMessages = this.deps.callbacks.getChannelMessages(channelName) ?? [];

    const agentState = agent.exportSession();
    let messages = agentState.messages || [];

    // Rolling dropoff: let it grow to 5500, then drop 1000 (keep 4500)
    if (messages.length > 5500) {
      const drop = messages.length - 4500;
      messages = messages.slice(drop);
      messages.unshift({
        role: 'system',
        content: `[Rolling dropoff — dropped ${drop} oldest messages to 4500]`,
      });
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
      messages: messages.map((m: Message, i: number) => ({
        id: `msg-${i}`,
        role: m.role,
        content: typeof m.content === 'string' ? stripAllAnsi(m.content).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') : JSON.stringify(m.content),
        timestamp: Date.now(),
        metadata: undefined,
        tool_call_id: m.tool_call_id ?? undefined,
        tool_calls: m.tool_calls ?? undefined,
      })),
      chatMessages: chatMessages.map(m => ({
        type: m.type,
        sender: m.sender,
        content: stripAllAnsi(m.content),
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
          timestamp: Date.now(),
        };
      }
      agent.importSession({
        messages: loadMsgs.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system' | 'tool',
          content: stripAllAnsi(m.content).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        })),
      });
    }

    // Restore the channel's model/provider from state if it differs from default
    if (state.agentConfig?.model && state.agentConfig?.model !== agent?.model) {
      await this.switchChannelModel(chName, state.agentConfig.model, state.agentConfig.provider || undefined);
    }

    // Re-fetch agent — switchChannelModel creates a new one if model changed
    const restoredAgent = this.channelAgents.get(chName);

    // Don't restore turn count — start fresh each session. The cache
    // efficiency check uses turnCount to guard against cold-cache warnings.
    if (restoredAgent) {
      restoredAgent.turnCount = 0;
    }

    if (state.chatMessages && state.chatMessages.length > 0) {
      for (const msg of state.chatMessages) {
        if (msg.type === 'system' && msg.content.includes('Session restored')) continue;
        this.deps.callbacks.writeMessage(msg.type, msg.sender, msg.content, chName);
      }
    }

    const displayModel = state.agentConfig?.model || entry.model;
    this.deps.callbacks.writeMessage('system', '*',
      `── Session restored (0 turns, ${displayModel}) ──`, chName);

    // Don't restore children from state — they're transient runtime state.
    // Workers from previous sessions are long gone. TaskRuntime recreates
    // them as needed when new workers are spawned.
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
    const provConfig = providerList?.find((p: IProviderConfig) => (p.name ?? p.type) === provType);
    if (!provConfig) {
      this.deps.callbacks.writeMessage('system', 'error', `Provider "${provType}" not configured`, channelName);
      return;
    }

    const sessionState = existingAgent.exportSession();
    // Strip any ANSI codes from messages before importing into new agent
    if (sessionState.messages) {
      sessionState.messages = sessionState.messages.map((m: Message) => ({
        ...m,
        content: typeof m.content === 'string' ? stripAllAnsi(m.content) : m.content,
      }));
    }
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
      // Re-register any dynamically loaded tools (from request_tools) on the new agent
      const activeToolNames = this.deps.catalogManager.activeToolNames;
      if (activeToolNames.length > 0) {
        const restoredTools = this.deps.catalogManager.restoreTools(activeToolNames);
        if (restoredTools.length > 0) {
          agent.registerTools(restoredTools);
        }
      }
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
  private createChannelAgent(chName: string, adapter: ILLMProvider, model: string, provType: string, providerName?: string): ChannelAgent {
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
