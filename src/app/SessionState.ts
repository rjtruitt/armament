import type { IUsageStats, IContextUsage, IMessage } from '../core/index.js';
import { UserConfig } from '../config/UserConfig.js';

/**
 * Memory entry interface.
 */
export interface MemoryEntry {
  type: string;
  content: string;
  timestamp: number;
}

/**
 * Sticky note interface.
 */
export interface StickyNote {
  id: number;
  text: string;
  position: 'top' | 'bottom' | 'both';
}

/**
 * Session config interface.
 */
export interface SessionConfig {
  contextCapacity?: number;
  pricing?: Record<string, { input: number; output: number; cacheReadMultiplier?: number; cacheWriteMultiplier?: number }>;
  providers?: Array<{ models: Array<{ name: string; inputPrice?: number; outputPrice?: number; cacheReadMultiplier?: number; cacheWriteMultiplier?: number }> }>;
}

/**
 * Exit summary data interface.
 */
export interface ExitSummaryData {
  duration: string;
  tokens: string;
  cost: { current: number; budget: number };
  costByModel: Array<{ model: string; cost: number; inputTokens: number; outputTokens: number }>;
  requestCount: number;
}

/**
 * I session state interface.
 */
export interface ISessionState {
  readonly usageStats: IUsageStats;
  readonly contextUsage: IContextUsage;
  readonly messages: IMessage[];
  readonly turnCount: number;
  readonly memories: MemoryEntry[];
  readonly stickyNotes: StickyNote[];
  readonly startTime: number;

  incrementTurn(): number;
  addUsage(model: string, input: number, output: number, total: number, cost: number): void;
  trackModelCost(model: string, cost: number, input: number, output: number): void;
  recordRequest(inputTokens: number, outputTokens: number): void;
  calculateCost(model: string, inputTokens: number, outputTokens: number, cacheRead?: number, cacheWrite?: number): number;
  formatTokenCount(n: number): string;
  updateContextUsage(percentage: number): void;

  addMessage(msg: IMessage): void;
  clearMessages(): void;

  addStickyNote(content: string, position?: 'top' | 'bottom' | 'both'): StickyNote;
  removeStickyNote(idOrIndex: string | number): boolean;
  listStickyNotes(): StickyNote[];
  buildStickyInjection(): string;
  buildStickyInjectionTop(): string;
  buildStickyInjectionBottom(): string;
  addError(component: string, msg: string, err?: unknown): void;
  buildArmadebugInjection(): string;
  addMemory(type: string, content: string): void;
  getMemories(type?: string): MemoryEntry[];
  getPersistedMemories(): string;

  getElapsedTime(): { mins: number; secs: number; duration: string };
  buildExitSummaryData(budget: number): ExitSummaryData;

  checkCacheEfficiency(totalTokens: number, cacheRead: number, turnCount: number, threshold?: number): { efficient: boolean; ratio: number; pct: string } | null;

  reset(): void;
}

const DEFAULT_PRICING: Record<string, { input: number; output: number; cacheReadMultiplier?: number; cacheWriteMultiplier?: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 1.25 },
  'claude-opus-4-20250514': { input: 15, output: 75, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 1.25 },
  'claude-haiku-3-20250307': { input: 0.25, output: 1.25, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 1.25 },
  'gpt-4o': { input: 2.5, output: 10, cacheReadMultiplier: 0.5, cacheWriteMultiplier: 0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheReadMultiplier: 0.5, cacheWriteMultiplier: 0 },
  'deepseek-v4': { input: 0.5, output: 2.19, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 1.25 },
  'deepseek-v4-flash': { input: 0.15, output: 0.6, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 1.25 },
};

/**
 * Session state class.
 */
export class SessionState implements ISessionState {
  private _usageStats: IUsageStats;
  private _contextUsage: IContextUsage;
  private _messages: IMessage[] = [];
  private _turnCount = 0;
  private _memories: MemoryEntry[] = [];
  private _stickyNotes: StickyNote[] = [];
  private _stickyNoteCounter = 0;
  private _startTime = Date.now();
  private _pricing: Record<string, { input: number; output: number; cacheReadMultiplier?: number; cacheWriteMultiplier?: number }>;
  private _contextCapacity: number;
  private _budgetWarningSent = false;
  private _costByModel: Map<string, { cost: number; inputTokens: number; outputTokens: number }> = new Map();
  /** Rotating error buffer for armadebug mode — last 20 errors. */
  private _errorBuffer: string[] = [];

  constructor(config: SessionConfig = {}) {
    this._contextCapacity = config.contextCapacity ?? 200000;
    this._pricing = config.pricing ?? DEFAULT_PRICING;

    // Build pricing from provider model configs (overrides defaults)
    if (config.providers) {
      for (const provider of config.providers) {
        for (const model of provider.models ?? []) {
          if (model.inputPrice !== undefined || model.outputPrice !== undefined) {
            this._pricing[model.name] = {
              input: model.inputPrice ?? DEFAULT_PRICING[model.name]?.input ?? 3,
              output: model.outputPrice ?? DEFAULT_PRICING[model.name]?.output ?? 15,
              cacheReadMultiplier: model.cacheReadMultiplier,
              cacheWriteMultiplier: model.cacheWriteMultiplier,
            };
          }
        }
      }
    }

    this._usageStats = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0,
      turnsUsed: 0,
      requestCount: 0,
      avgLatencyMs: 50,
      contextUsed: 0,
      contextCapacity: this._contextCapacity,
    };

    this._contextUsage = {
      used: 0,
      capacity: this._contextCapacity,
      remaining: this._contextCapacity,
      percentage: 0,
    };
  }

  /**
   * Gets the usage stats.
   */
  get usageStats(): IUsageStats { return this._usageStats; }
  /**
   * Gets the cost by model.
   */
  get costByModel(): Map<string, { cost: number; inputTokens: number; outputTokens: number }> { return this._costByModel; }
  /**
   * Gets the context usage.
   */
  get contextUsage(): IContextUsage { return this._contextUsage; }
  /**
   * Gets the messages.
   */
  get messages(): IMessage[] { return this._messages; }
  /**
   * Gets the turn count.
   */
  get turnCount(): number { return this._turnCount; }
  /**
   * Sets the turn count.
   */
  set turnCount(n: number) { this._turnCount = n; }
  /**
   * Gets the memories.
   */
  get memories(): MemoryEntry[] { return this._memories; }
  /**
   * Gets the sticky notes.
   */
  get stickyNotes(): StickyNote[] { return this._stickyNotes; }
  /**
   * Sets the sticky notes.
   */
  set stickyNotes(notes: StickyNote[]) {
    this._stickyNotes = notes;
    // Ensure counter is past the highest ID (handles restored notes)
    for (const n of notes) {
      // id can be 0 (legacy) — still need to advance counter past it
      if (n.id !== undefined && n.id >= this._stickyNoteCounter) {
        this._stickyNoteCounter = n.id + 1;
      }
    }
  }
  /**
   * Gets the start time.
   */
  get startTime(): number { return this._startTime; }

  /**
   * Increment turn.
   */
  incrementTurn(): number {
    this._turnCount++;
    this._usageStats.turnsUsed = this._turnCount;
    return this._turnCount;
  }

  /**
   * Add usage.
   */
  addUsage(model: string, input: number, output: number, total: number, cost: number): void {
    this._usageStats.inputTokens += input;
    this._usageStats.outputTokens += output;
    this._usageStats.totalTokens += total;
    this._usageStats.estimatedCost += cost;
    this._trackModelCostImpl(model, cost, input, output);
  }

  /**
   * Track per-model cost without affecting global counters (used alongside direct usageStats mutation).
   */
  trackModelCost(model: string, cost: number, input: number, output: number): void {
    this._trackModelCostImpl(model, cost, input, output);
  }

  private _trackModelCostImpl(model: string, cost: number, input: number, output: number): void {
    const entry = this._costByModel.get(model) ?? { cost: 0, inputTokens: 0, outputTokens: 0 };
    entry.cost += cost;
    entry.inputTokens += input;
    entry.outputTokens += output;
    this._costByModel.set(model, entry);
  }

  /**
   * Check if budget was just exceeded (returns true once per session).
   */
  get budgetWarningNeeded(): boolean {
    return this._budgetWarningSent;
  }

  /**
   * Reset budget warning flag (e.g. after user acknowledges).
   */
  resetBudgetWarning(): void {
    this._budgetWarningSent = false;
  }

  /**
   * Check if estimated cost exceeds budget and trigger warning if so.
   * Call after addUsage with the max budget amount.
   */
  checkBudget(maxBudget: number): boolean {
    if (maxBudget > 0 && this._usageStats.estimatedCost >= maxBudget && !this._budgetWarningSent) {
      this._budgetWarningSent = true;
      return true;
    }
    return false;
  }

  /**
   * Record request.
   */
  recordRequest(inputTokens: number, outputTokens: number): void {
    this._usageStats.requestCount++;
    this._usageStats.contextUsed += inputTokens + outputTokens;
  }

  /**
   * Calculate cost.
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number, cacheRead = 0, cacheWrite = 0): number {
    // Match longest key first to avoid partial matches (e.g. "deepseek-v4" matching "deepseek-v4-flash")
    const keys = Object.keys(this._pricing).sort((a, b) => b.length - a.length);
    const key = keys.find(k => model.includes(k) || k.includes(model));
    const rate = key ? this._pricing[key] : { input: 3, output: 15, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 1.25 };
    const nonCachedInput = inputTokens - cacheRead - cacheWrite;
    const inputCost = nonCachedInput * rate.input;
    const cacheReadMultiplier = rate.cacheReadMultiplier ?? 0.1;
    const cacheWriteMultiplier = rate.cacheWriteMultiplier ?? 1.25;
    const cacheReadCost = cacheRead * rate.input * cacheReadMultiplier;
    const cacheWriteCost = cacheWrite * rate.input * cacheWriteMultiplier;
    const outputCost = outputTokens * rate.output;
    return (inputCost + cacheReadCost + cacheWriteCost + outputCost) / 1_000_000;
  }

  /**
   * Format token count.
   */
  formatTokenCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  /**
   * Update context usage.
   */
  updateContextUsage(percentage: number): void {
    this._contextUsage.percentage = percentage;
    this._contextUsage.used = Math.round((percentage / 100) * this._contextUsage.capacity);
    this._contextUsage.remaining = this._contextUsage.capacity - this._contextUsage.used;
  }

  /**
   * Add message.
   */
  addMessage(msg: IMessage): void {
    this._messages.push(msg);
  }

  /**
   * Clear messages.
   */
  clearMessages(): void {
    this._messages.length = 0;
  }

  /**
   * Add sticky note.
   */
  addStickyNote(content: string, position: 'top' | 'bottom' | 'both' = 'top'): StickyNote {
    const note: StickyNote = { id: ++this._stickyNoteCounter, text: content, position };
    this._stickyNotes.push(note);
    return note;
  }

  /**
   * Remove sticky note by id.
   */
  removeStickyNote(idOrIndex: string | number): boolean {
    if (typeof idOrIndex === 'string') {
      const id = parseInt(idOrIndex, 10);
      if (isNaN(id)) return false;
      const idx = this._stickyNotes.findIndex(n => n.id === id);
      if (idx === -1) return false;
      this._stickyNotes.splice(idx, 1);
      return true;
    }
    // Index-based fallback
    if (idOrIndex < 0 || idOrIndex >= this._stickyNotes.length) return false;
    this._stickyNotes.splice(idOrIndex, 1);
    return true;
  }

  /**
   * List sticky notes.
   */
  listStickyNotes(): StickyNote[] {
    return [...this._stickyNotes];
  }

  /** Build top and bottom sticky note sections for injection. */
  buildStickyInjection(): string {
    return this._buildStickyAt('top', 'bottom');
  }

  /**
   * Build sticky injection top.
   */
  buildStickyInjectionTop(): string {
    return this._buildStickyAt('top', 'both');
  }

  /**
   * Build sticky injection bottom.
   */
  buildStickyInjectionBottom(): string {
    return this._buildStickyAt('bottom', 'both');
  }

  private _buildStickyAt(...positions: string[]): string {
    const notes = this._stickyNotes.filter(n => positions.includes(n.position));
    if (notes.length === 0) return '';
    const lines: string[] = [];
    for (const note of notes) {
      lines.push(`  📝 ${note.text}`);
    }
    return '\n' + lines.join('\n') + '\n';
  }

  /**
   * Add an error to the rotating buffer. Stores full stack trace.
   */
  addError(component: string, msg: string, err?: unknown): void {
    const ts = new Date().toLocaleTimeString();
    let detail = msg;
    if (err instanceof Error) {
      detail += `\n${err.stack || err.message}`;
    } else if (err) {
      detail += `\n${String(err)}`;
    }
    this._errorBuffer.push(`[${ts}] ${component}: ${detail}`);
    // Keep last 20
    if (this._errorBuffer.length > 20) {
      this._errorBuffer = this._errorBuffer.slice(-20);
    }
  }

  /**
   * Build armadebug injection — only if session setting `armadebug` is on.
   * Full stack traces for LLM consumption.
   */
  buildArmadebugInjection(): string {
    const settings = UserConfig.instance().settings.session;
    if (!settings || !settings.armadebug || this._errorBuffer.length === 0) return '';
    return `── arma debug ──────────────────\nThe following errors have occurred this session (${this._errorBuffer.length}):\n${this._errorBuffer.join('\n')}\n─────────────────────────────────\n`;
  }
  addMemory(type: string, content: string): void {
    this._memories.push({ type, content, timestamp: Date.now() });
  }

  /**
   * Gets the memories.
   */
  getMemories(type?: string): MemoryEntry[] {
    if (type) return this._memories.filter(m => m.type === type);
    return this._memories;
  }

  /**
   * Gets the persisted memories.
   */
  getPersistedMemories(): string {
    return this._memories.map(m => `[${m.type}] ${m.content}`).join('\n');
  }

  /**
   * Gets the elapsed time.
   */
  getElapsedTime(): { mins: number; secs: number; duration: string } {
    const elapsed = Date.now() - this._startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    return { mins, secs, duration };
  }

  /**
   * Build exit summary data.
   */
  buildExitSummaryData(budget: number): ExitSummaryData {
    const { duration } = this.getElapsedTime();
    const inK = Math.round(this._usageStats.inputTokens / 1000);
    const outK = Math.round(this._usageStats.outputTokens / 1000);
    const costByModel = Array.from(this._costByModel.entries())
      .filter(([model]) => model) // skip empty model names
      .map(([model, data]) => ({ model, cost: data.cost, inputTokens: data.inputTokens, outputTokens: data.outputTokens }))
      .sort((a, b) => b.cost - a.cost);
    return {
      duration,
      tokens: `${inK}k in / ${outK}k out`,
      cost: { current: this._usageStats.estimatedCost, budget },
      costByModel,
      requestCount: this._usageStats.requestCount,
    };
  }

  /**
   * Check cache efficiency.
   */
  checkCacheEfficiency(
    totalTokens: number,
    cacheRead: number,
    turnCount: number,
    threshold = 0.3,
  ): { efficient: boolean; ratio: number; pct: string } | null {
    if (turnCount < 10) return null; // check every 10th request — gives cache time to warm up
    if (turnCount % 10 !== 0) return null;
    if (totalTokens < 50_000) return null;
    const ratio = cacheRead / totalTokens;
    const efficient = ratio >= threshold;
    const pct = (ratio * 100).toFixed(1);
    return { efficient, ratio, pct };
  }

  /**
   * Reset.
   */
  reset(): void {
    this._turnCount = 0;
    this._messages.length = 0;
    this._memories.length = 0;
    this._stickyNotes.length = 0;
    this._stickyNoteCounter = 0;
    this._usageStats.inputTokens = 0;
    this._usageStats.outputTokens = 0;
    this._usageStats.totalTokens = 0;
    this._usageStats.cacheReadTokens = 0;
    this._usageStats.cacheWriteTokens = 0;
    this._usageStats.estimatedCost = 0;
    this._usageStats.turnsUsed = 0;
    this._usageStats.requestCount = 0;
    this._usageStats.contextUsed = 0;
    this._contextUsage.used = 0;
    this._contextUsage.remaining = this._contextCapacity;
    this._contextUsage.percentage = 0;
    this._startTime = Date.now();
  }
}
