import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { TuiRenderer } from './TuiRenderer.js';
import type { SessionState } from './SessionState.js';
import type { SessionPersistence } from '../session/index.js';
import type { CatalogManager, ChannelAgent } from '../providers/index.js';
import type { IMessage, IUsageStats, IReplConfig } from '../core/index.js';
import type { AgentInfo } from './ChannelLifecycle.js';

/** Interface for ContextManagerDeps. */
export interface ContextManagerDeps {
  getTui: () => TuiRenderer | null;
  getSessionState: () => SessionState;
  getSessionPersistence: () => SessionPersistence;
  getCatalogManager: () => CatalogManager;
  getChannelAgents: () => Map<string, ChannelAgent>;
  getAgentManagerInternal: () => AgentInfo[];
  getActiveChannel: () => string | undefined;
  getActiveToolNames: () => string[];
  setActiveToolNames: (names: string[]) => void;
  getConfig: () => IReplConfig;
  getMessages: () => IMessage[];
  getUsageStats: () => IUsageStats;
  getTurnCount: () => number;
  getChannelManagerInternal: () => Array<{ name: string; active?: boolean }>;
  spawnAgent: (name: string, opts?: any) => Promise<any>;
}

/** Class representing ContextManager. */
export class ContextManager {
  private deps: ContextManagerDeps;

  constructor(deps: ContextManagerDeps) {
    this.deps = deps;
  }

  /**
   * Gets the context dir.
   */
  getContextDir(): string {
    return path.join(homedir(), '.armament', 'contexts');
  }

  /**
   * Clear session.
   */
  clearSession(): void {
    const sessionDir = this.deps.getSessionPersistence().getSessionDir();
    try {
      if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {}
    this.deps.getTui()?.writeMessage('system', '*', 'Session cleared — next launch starts fresh');
  }

  /**
   * Export session.
   */
  exportSession(): any {
    return {
      messages: this.deps.getMessages(),
      config: this.deps.getConfig(),
      channels: this.deps.getChannelManagerInternal().map(c => c.name.startsWith('#') ? c.name.slice(1) : c.name),
      turnCount: this.deps.getTurnCount(),
      usage: this.deps.getUsageStats(),
    };
  }

  /**
   * Import session.
   */
  importSession(data: any): void {
    const state = this.deps.getSessionState();
    if (data.messages) {
      state.clearMessages();
      for (const msg of data.messages) state.addMessage(msg);
    }
    if (data.channels) {
      const channels = this.deps.getChannelManagerInternal();
      for (const name of data.channels) {
        if (!channels.find(c => c.name === name)) channels.push({ name, active: false });
      }
    }
  }

  /**
   * Save context.
   */
  saveContext(title?: string, description?: string): string {
    const dir = this.getContextDir();
    fs.mkdirSync(dir, { recursive: true });
    const slug = title ? title.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() : `context-${Date.now()}`;
    const filename = `${slug}.arma.context`;
    const filepath = path.join(dir, filename);
    const activeChannel = this.deps.getActiveChannel();
    const tui = this.deps.getTui();
    const chatMessages = tui?.getChannelMessages(activeChannel) ?? [];
    const context = {
      title: title || slug, description: description || '',
      savedAt: new Date().toISOString(), session: this.exportSession(),
      chatMessages: chatMessages.map(m => ({
        type: m.type, sender: m.sender, content: m.content, timestamp: m.timestamp.getTime(),
      })),
      channel: activeChannel,
      agents: this.deps.getAgentManagerInternal().map(a => ({
        name: a.name, model: a.model, provider: a.provider, systemPrompt: a.systemPrompt,
      })),
      workers: Array.from(this.deps.getChannelAgents().entries())
        .filter(([id]) => id.startsWith('worker-'))
        .map(([id, w]) => ({ id, model: w.model, status: w.status, turnCount: w.turnCount })),
      activeTools: this.deps.getActiveToolNames() ?? [],
      stickyNotes: this.deps.getSessionState().stickyNotes ?? [],
    };
    fs.writeFileSync(filepath, JSON.stringify(context, null, 2));
    tui?.writeMessage('system', 'info', `Context saved: ${filename}`, '#control');
    return filename;
  }

  /**
   * Load context.
   */
  loadContext(nameOrFile: string): void {
    const dir = this.getContextDir();
    const filepath = nameOrFile.endsWith('.arma.context')
      ? path.join(dir, nameOrFile)
      : path.join(dir, `${nameOrFile}.arma.context`);
    if (!fs.existsSync(filepath)) throw new Error(`Context file not found: ${filepath}`);
    const context = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    if (context.session) this.importSession(context.session);
    if (context.agents) {
      for (const agent of context.agents) {
        if (!this.deps.getAgentManagerInternal().find(a => a.name === agent.name)) {
          this.deps.spawnAgent(agent.name, { model: agent.model, provider: agent.provider, systemPrompt: agent.systemPrompt });
        }
      }
    }
    const state = this.deps.getSessionState();
    if (context.stickyNotes && Array.isArray(context.stickyNotes)) state.stickyNotes = context.stickyNotes;
    if (context.activeTools && Array.isArray(context.activeTools)) {
      this.deps.getCatalogManager().restoreTools(context.activeTools);
      this.deps.setActiveToolNames(this.deps.getCatalogManager().activeToolNames);
    }
    const tui = this.deps.getTui();
    const targetChannel = context.channel || this.deps.getActiveChannel();
    if (context.chatMessages && Array.isArray(context.chatMessages)) {
      for (const msg of context.chatMessages) tui?.writeMessage(msg.type, msg.sender, msg.content, targetChannel);
    }
    if (context.workers && Array.isArray(context.workers)) {
      for (const child of context.workers) {
        const workerLabel = child.id.replace(/^worker-/, '').replace(/-\d+$/, '').slice(0, 15);
        tui?.addChannelChild(targetChannel, { id: child.id, label: workerLabel, status: child.status === 'complete' ? 'done' : 'idle', role: 'worker' });
      }
    }
    tui?.writeMessage('system', '*', `── Context restored: "${context.title}" (${context.savedAt}) ──`, targetChannel);
  }

  /**
   * List contexts.
   */
  listContexts(): string[] {
    const dir = this.getContextDir();
    const tui = this.deps.getTui();
    if (!fs.existsSync(dir)) { tui?.writeMessage('system', 'info', 'No saved contexts found', '#control'); return []; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.arma.context'));
    const contexts: string[] = [];
    for (const file of files) {
      try {
        const ctx = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        const desc = ctx.description ? ` — ${ctx.description}` : '';
        const entry = `${ctx.title}${desc} (${ctx.savedAt})`;
        contexts.push(entry);
        tui?.writeMessage('system', 'info', `  ${entry}`, '#control');
      } catch { contexts.push(file); }
    }
    if (contexts.length === 0) tui?.writeMessage('system', 'info', 'No saved contexts found', '#control');
    return contexts;
  }

  /**
   * Show context picker.
   */
  showContextPicker(): void {
    const dir = this.getContextDir();
    const tui = this.deps.getTui();
    if (!fs.existsSync(dir)) { tui?.writeMessage('system', 'info', 'No saved contexts found', '#control'); return; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.arma.context'));
    if (files.length === 0) { tui?.writeMessage('system', 'info', 'No saved contexts found', '#control'); return; }
    const items: Array<{ name: string; description: string; usage?: string; category: 'irc' | 'standard' | 'config' }> = [];
    for (const file of files) {
      try {
        const ctx = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        items.push({ name: ctx.title || file.replace('.arma.context', ''), description: ctx.description || `Saved ${ctx.savedAt}`, category: 'standard' });
      } catch { items.push({ name: file.replace('.arma.context', ''), description: 'Unable to read context', category: 'standard' }); }
    }
    if (!tui) { this.listContexts(); return; }
    tui.showContextPicker(items, (selected: { name: string }) => {
      try { this.loadContext(selected.name); } catch (err: any) { tui?.writeMessage('system', 'err', `Failed to load: ${err.message}`, '#control'); }
    });
  }
}
