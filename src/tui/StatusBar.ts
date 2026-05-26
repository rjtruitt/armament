/** Session status bar displaying model, agent count, and cost metrics. */

import { ScreenBuffer } from './ScreenBuffer.js';

/** Screen position and dimensions of the status bar. */
export interface StatusBarRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Structured values exposed by the status bar. */
export interface StatusBarValues {
  provider: string;
  model: string;
  agents: number;
  cost: { current: number; budget: number };
}

/** Partial data shape for bulk updates. */
export interface StatusBarData {
  model?: string;
  agents?: number;
  cost?: number;
  budget?: number;
  mode?: string;
  latency?: number;
}

/**
 * Renders a single-line status bar with model name, active agent count,
 * cost/budget tracking, and optional custom metrics.
 * Supports throttled and debounced rendering.
 */
export class StatusBar {
  private screen: ScreenBuffer;
  private _region: StatusBarRegion;
  private _provider = 'none';
  private _model = 'sonnet-4';
  private _agents = 0;
  private _costCurrent = 0;
  private _costBudget = 5.0;
  private _visible = true;
  private _theme = 'red';
  private _metrics: Map<string, string> = new Map();
  private _liveUpdates = false;
  private _throttleMs = 0;
  private _debounceMs = 0;
  private _lastRenderTime = 0;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingRender = false;
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  constructor(screen: ScreenBuffer, region: StatusBarRegion, initial?: Partial<{ model: string; agents: number; cost: { current: number; budget: number } }>) {
    if (!screen) throw new Error('Buffer is required');
    if (!region) throw new Error('Region is required');
    this.screen = screen;
    this._region = { ...region };
    if (initial) {
      if (initial.model) this._model = initial.model;
      if (initial.agents !== undefined) this._agents = initial.agents;
      if (initial.cost) {
        this._costCurrent = initial.cost.current;
        this._costBudget = initial.cost.budget;
      }
    }
  }

  /**
   * Gets the data.
   */
  get data(): StatusBarData {
    return { model: this._model, agents: this._agents, cost: this._costCurrent, budget: this._costBudget };
  }

  /**
   * Gets the visible.
   */
  get visible(): boolean { return this._visible; }
  /**
   * Gets the row.
   */
  get row(): number { return this._region.y; }

  /**
   * Gets the region.
   */
  getRegion(): StatusBarRegion { return { ...this._region }; }

  /**
   * Gets the values.
   */
  getValues(): StatusBarValues {
    return {
      provider: this._provider,
      model: this._model,
      agents: this._agents,
      cost: { current: this._costCurrent, budget: this._costBudget }
    };
  }

  /**
   * Gets the agents.
   */
  getAgents(): number { return this._agents; }
  /**
   * Gets the current cost.
   */
  getCurrentCost(): number { return this._costCurrent; }
  /**
   * Gets the metrics.
   */
  getMetrics(): Record<string, string> { return Object.fromEntries(this._metrics); }

  /**
   * Sets the provider.
   */
  setProvider(provider: string): void {
    this._provider = provider;
    this.scheduleRender();
  }

  /**
   * Sets the model.
   */
  setModel(model: string): void {
    this._model = model;
    this.emit('model:change', { model });
    this.scheduleRender();
  }

  /**
   * Sets the agents.
   */
  setAgents(count: number): void {
    if (count < 0) throw new Error('Agent count cannot be negative');
    this._agents = count;
    this.emit('agents:change', { agents: count });
    this.scheduleRender();
  }

  /**
   * Sets the agent count.
   */
  setAgentCount(count: number): void { this.setAgents(count); }

  /**
   * Increment agents.
   */
  incrementAgents(): void { this._agents++; this.emit('agents:change', { agents: this._agents }); }
  /**
   * Decrement agents.
   */
  decrementAgents(): void {
    if (this._agents > 0) this._agents--;
    this.emit('agents:change', { agents: this._agents });
  }

  /**
   * Sets the cost.
   */
  setCost(current: number, budget?: number): void {
    if (current < 0) throw new Error('Cost cannot be negative');
    this._costCurrent = current;
    if (budget !== undefined) this._costBudget = budget;
    this.emit('cost:change', { current: this._costCurrent, budget: this._costBudget });
    if (this._costBudget > 0) {
      const pct = this._costCurrent / this._costBudget;
      if (pct > 1) this.emit('cost:exceeded', { current: this._costCurrent, budget: this._costBudget });
      else if (pct >= 0.8) this.emit('cost:warning', { current: this._costCurrent, budget: this._costBudget });
    }
    this.scheduleRender();
  }

  /**
   * Add cost.
   */
  addCost(amount: number): void {
    this._costCurrent += amount;
    this._costCurrent = Math.round(this._costCurrent * 100) / 100;
    this.emit('cost:change', { current: this._costCurrent, budget: this._costBudget });
    this.scheduleRender();
  }

  /**
   * Sets the budget.
   */
  setBudget(budget: number): void { this._costBudget = budget; this.scheduleRender(); }

  /**
   * Sets the metric.
   */
  setMetric(key: string, value: string): void { this._metrics.set(key, value); }
  /**
   * Remove metric.
   */
  removeMetric(key: string): void { this._metrics.delete(key); }
  /**
   * Clear metrics.
   */
  clearMetrics(): void { this._metrics.clear(); }

  /**
   * Sets the region.
   */
  setRegion(region: StatusBarRegion): void {
    this._region = { ...region };
  }

  /**
   * Sets the theme.
   */
  setTheme(theme: string): void { this._theme = theme; }

  /**
   * Show.
   */
  show(): void { this._visible = true; this.emit('visibility:change', { visible: true }); }
  /**
   * Hide.
   */
  hide(): void { this._visible = false; this.emit('visibility:change', { visible: false }); }
  /**
   * Checks whether visible.
   */
  isVisible(): boolean { return this._visible; }

  /**
   * Enable live updates.
   */
  enableLiveUpdates(): void { this._liveUpdates = true; }
  /**
   * Enable throttling.
   */
  enableThrottling(ms: number): void { this._throttleMs = ms; }
  /**
   * Enable debounce.
   */
  enableDebounce(ms: number): void { this._debounceMs = ms; }

  /**
   * Update.
   */
  update(data: Partial<{ model: string; agents: number; cost: { current: number; budget: number } }>): void {
    if (data.model !== undefined) this._model = data.model;
    if (data.agents !== undefined) this._agents = data.agents;
    if (data.cost) {
      this._costCurrent = data.cost.current;
      this._costBudget = data.cost.budget;
    }
    this.emit('update', data);
    this.render();
  }

  /**
   * Render.
   */
  render(): void {
    if (!this._visible) return;

    const w = this._region.width;
    const y = this._region.y;
    const x = this._region.x;

    const labelColor = '\x1b[38;2;140;140;140m';
    const valueColor = '\x1b[38;2;210;210;210m';
    const sep = ' │ ';

    const parts: string[] = [];
    const modelStr = this._model.length > 20 ? this._model.slice(0, 17) + '...' : this._model;
    parts.push(`${labelColor}model:${valueColor}${modelStr}`);
    parts.push(`${labelColor}agents:${valueColor}${this._agents}`);

    const costStr = `$${this._costCurrent.toFixed(2)}/$${this._costBudget.toFixed(2)}`;
    const pctValue = this._costBudget > 0 ? Math.round((this._costCurrent / this._costBudget) * 100) : 0;
    parts.push(`${labelColor}cost:${valueColor}${costStr} ${pctValue}%`);

    for (const [key, value] of this._metrics) {
      parts.push(`${labelColor}${key}:${valueColor}${value}`);
    }

    let text = parts.join(sep);
    const plainLen = text.replace(/\x1b\[[0-9;]*m/g, '').length;
    if (plainLen > w) {
      const coreParts = [`${labelColor}model:${valueColor}${modelStr}`, `${labelColor}agents:${valueColor}${this._agents}`, `${labelColor}cost:${valueColor}${costStr} ${pctValue}%`];
      text = coreParts.join(sep);
      const coreLen = text.replace(/\x1b\[[0-9;]*m/g, '').length;
      if (coreLen > w && this._model.length > 10) {
        const shortModel = this._model.slice(0, 7) + '...';
        coreParts[0] = `${labelColor}model:${valueColor}${shortModel}`;
        text = coreParts.join(sep);
      }
    }

    const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
    const padded = plain.slice(0, w).padEnd(w);
    this.screen.writeAt(y, x, `${labelColor}${padded}\x1b[0m`);
    this._lastRenderTime = Date.now();
    this._pendingRender = false;
  }

  /**
   * Gets the content.
   */
  getContent(): string {
    const parts: string[] = [];
    if (this._model) parts.push(`model:${this._model}`);
    parts.push(`agents:${this._agents}`);
    const costStr = `$${this._costCurrent.toFixed(2)}`;
    const budgetStr = `/$${this._costBudget.toFixed(2)}`;
    parts.push(`cost:${costStr}${budgetStr}`);
    return parts.join('  ');
  }

  /**
   * Format currency.
   */
  formatCurrency(amount: number): string { return `$${amount.toFixed(2)}`; }
  /**
   * Format percentage.
   */
  formatPercentage(pct: number): string { return `${pct}%`; }
  /**
   * Format duration.
   */
  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  /**
   * Format number.
   */
  formatNumber(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  /**
   * On.
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) h(data);
  }

  private scheduleRender(): void {
    if (this._debounceMs > 0) {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this.render(), this._debounceMs);
      return;
    }
    if (this._throttleMs > 0) {
      const elapsed = Date.now() - this._lastRenderTime;
      if (elapsed < this._throttleMs) {
        if (!this._pendingRender) {
          this._pendingRender = true;
          setTimeout(() => this.render(), this._throttleMs - elapsed);
        }
        return;
      }
    }
  }
}
