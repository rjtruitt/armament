/** Budget limits and threshold configuration. */
export interface BudgetConfig {
  session: number;
  daily: number;
  warning: number;
  action: string;
}
/** Class representing BudgetManager. */
export class BudgetManager {
  private config: { session: number; daily: number; warning: number; action: string };
  private totalSpend = 0;
  private agentSpend: Record<string, number> = {};
  private modelSpend: Record<string, number> = {};
  private thresholdHandlers: Array<(type: 'warn' | 'freeze', spend: number) => void> = [];
  private warnFired = false;
  private freezeFired = false;
  private startTime: number;
  constructor() {
    this.config = {
      session: 5.0,
      daily: 20.0,
      warning: 80,
      action: 'warn',
    };
    this.startTime = Date.now();
  }
  /**
   * Gets the budget.
   */
  getBudget(): { session: number; daily: number; warning: number; action: string } {
    return { ...this.config };
  }
  /**
   * Sets the budget.
   */
  setBudget(_config: Partial<{ session: number; daily: number; warning: number; action: string }>): void {
    this.config = { ...this.config, ..._config };
    this.warnFired = false;
    this.freezeFired = false;
  }
  /**
   * Gets the current spend.
   */
  getCurrentSpend(): number {
    return this.totalSpend;
  }
  /**
   * Gets the spend by agent.
   */
  getSpendByAgent(_agentId: string): number {
    return this.agentSpend[_agentId] || 0;
  }
  /**
   * Gets the remaining budget.
   */
  getRemainingBudget(): number {
    return this.config.session - this.totalSpend;
  }
  /**
   * Gets the percent used.
   */
  getPercentUsed(): number {
    if (this.config.session <= 0) return 0;
    return (this.totalSpend / this.config.session) * 100;
  }
  /**
   * Checks whether over warn threshold.
   */
  isOverWarnThreshold(): boolean {
    return this.getPercentUsed() >= this.config.warning;
  }
  /**
   * Checks whether over freeze threshold.
   */
  isOverFreezeThreshold(): boolean {
    return this.getPercentUsed() >= 100;
  }
  /**
   * Record cost.
   */
  recordCost(_amount: number, _agentId: string, _model: string): void {
    this.totalSpend += _amount;
    this.agentSpend[_agentId] = (this.agentSpend[_agentId] || 0) + _amount;
    this.modelSpend[_model] = (this.modelSpend[_model] || 0) + _amount;
    const percentUsed = this.getPercentUsed();
    if (!this.warnFired && percentUsed >= this.config.warning) {
      this.warnFired = true;
      for (const handler of this.thresholdHandlers) {
        handler('warn', this.totalSpend);
      }
    }
    if (!this.freezeFired && percentUsed >= 100) {
      this.freezeFired = true;
      for (const handler of this.thresholdHandlers) {
        handler('freeze', this.totalSpend);
      }
    }
  }
  /**
   * Gets the projected total.
   */
  getProjectedTotal(_hoursRemaining?: number): number {
    if (this.totalSpend === 0) return 0;
    const elapsedMs = Date.now() - this.startTime;
    const elapsedHours = elapsedMs > 0 ? elapsedMs / 3600000 : 1;
    const rate = this.totalSpend / elapsedHours;
    const hours = _hoursRemaining ?? 1;
    return this.totalSpend + rate * hours;
  }
  /**
   * On threshold reached.
   */
  onThresholdReached(_handler: (type: 'warn' | 'freeze', spend: number) => void): void {
    this.thresholdHandlers.push(_handler);
  }
  /**
   * Reset.
   */
  reset(): void {
    this.totalSpend = 0;
    this.agentSpend = {};
    this.modelSpend = {};
    this.warnFired = false;
    this.freezeFired = false;
    this.startTime = Date.now();
  }
}