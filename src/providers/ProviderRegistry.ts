import { ProviderRateLimit } from './ProviderRateLimit.js';
import { ProviderAgentMap } from './ProviderAgentMap.js';

/** Interface for ProviderConfig.
 * @property {string} id - Description of id.
 * @property {string} type - Description of type.
 * @property {string} name - Description of name.
 * @property {string} endpoint - Description of endpoint.
 * @property {Record<string, string>} credentials - Description of credentials.
 * @property {string} models - Description of models.
 * @property {boolean} isDefault - Description of isDefault.
 * @property {boolean} enabled - Description of enabled.
 * @property ... and 1 more properties.
 */
export interface ProviderConfig {
  id: string;
  type: string;
  name: string;
  endpoint?: string;
  credentials: Record<string, string>;
  models: string[];
  rateLimit?: { rpm: number; tpm: number };
  isDefault?: boolean;
  enabled: boolean;
  metadata?: Record<string, any>;
}

/** Interface for ProviderStatus.
 * @property {string} id - Description of id.
 * @property {boolean} healthy - Description of healthy.
 * @property {number} lastCheck - Description of lastCheck.
 * @property {number} latencyMs - Description of latencyMs.
 * @property {number} errorCount - Description of errorCount.
 * @property {number} requestCount - Description of requestCount.
 * @property {number} tokenCount - Description of tokenCount.
 * @property {number} costAccumulated - Description of costAccumulated.
 */
export interface ProviderStatus {
  id: string;
  healthy: boolean;
  lastCheck: number;
  latencyMs: number;
  errorCount: number;
  requestCount: number;
  tokenCount: number;
  costAccumulated: number;
}

type RegistryEvent =
  | 'provider:registered'
  | 'provider:unregistered'
  | 'provider:default-changed'
  | 'provider:enabled'
  | 'provider:disabled'
  | 'provider:error'
  | 'provider:rate-limited'
  | 'provider:healthy'
  | 'provider:unhealthy';

/** Class representing ProviderRegistry. */
export class ProviderRegistry {
  private _providers: Map<string, ProviderConfig> = new Map();
  private _status: Map<string, ProviderStatus> = new Map();
  private _defaultId: string | undefined;
  private _listeners: Map<RegistryEvent, Set<Function>> = new Map();
  private _agentMap = new ProviderAgentMap();
  private _rateLimit = new ProviderRateLimit();

  /**
   * Register.
   */
  register(config: ProviderConfig): ProviderConfig {
    if (!config.id || !config.type || !config.name) {
      throw new Error('Provider config requires id, type, and name');
    }
    if (this._providers.has(config.id)) {
      throw new Error(`Provider '${config.id}' is already registered`);
    }
    this._providers.set(config.id, { ...config });
    this._status.set(config.id, {
      id: config.id,
      healthy: true,
      lastCheck: Date.now(),
      latencyMs: 0,
      errorCount: 0,
      requestCount: 0,
      tokenCount: 0,
      costAccumulated: 0,
    });
    this._rateLimit.register(config.id);

    if (config.isDefault) {
      this._setDefaultInternal(config.id);
    } else if (this._providers.size === 1) {
      this._defaultId = config.id;
    }

    this.emit('provider:registered', { id: config.id });
    return config;
  }

  /**
   * Unregister.
   */
  unregister(id: string): void {
    if (!this._providers.has(id)) {
      throw new Error(`Provider '${id}' not found`);
    }
    this._providers.delete(id);
    this._status.delete(id);
    this._rateLimit.unregister(id);
    this._agentMap.removeProvider(id);

    if (this._defaultId === id) {
      const next = this._providers.keys().next().value;
      this._defaultId = next;
      if (next) {
        const cfg = this._providers.get(next)!;
        cfg.isDefault = true;
      }
    }

    this.emit('provider:unregistered', { id });
  }

  /**
   * Has.
   */
  has(id: string): boolean {
    return this._providers.has(id);
  }

  /**
   * Get.
   */
  get(id: string): ProviderConfig | undefined {
    return this._providers.get(id);
  }

  /**
   * Gets the all.
   */
  getAll(): ProviderConfig[] {
    return [...this._providers.values()];
  }

  /**
   * Count.
   */
  count(): number {
    return this._providers.size;
  }

  /**
   * Sets the default.
   */
  setDefault(id: string): void {
    if (!this._providers.has(id)) {
      throw new Error(`Provider '${id}' does not exist`);
    }
    const config = this._providers.get(id)!;
    if (!config.enabled) {
      throw new Error(`Cannot set disabled provider '${id}' as default`);
    }
    this._setDefaultInternal(id);
    this.emit('provider:default-changed', { id });
  }

  /**
   * Gets the default.
   */
  getDefault(): ProviderConfig | undefined {
    if (!this._defaultId) return undefined;
    return this._providers.get(this._defaultId);
  }

  /**
   * Enable.
   */
  enable(id: string): void {
    const config = this._providers.get(id);
    if (!config) throw new Error(`Provider '${id}' not found`);
    config.enabled = true;
    this.emit('provider:enabled', { id });
  }

  /**
   * Disable.
   */
  disable(id: string): void {
    const config = this._providers.get(id);
    if (!config) throw new Error(`Provider '${id}' not found`);
    config.enabled = false;
    this.emit('provider:disabled', { id });

    if (this._defaultId === id) {
      const next = [...this._providers.values()].find(p => p.id !== id && p.enabled);
      this._defaultId = next?.id;
      if (next) {
        next.isDefault = true;
        config.isDefault = false;
      } else {
        config.isDefault = false;
      }
    }
  }

  /**
   * Checks whether enabled.
   */
  isEnabled(id: string): boolean {
    return this._providers.get(id)?.enabled ?? false;
  }

  /**
   * Find by type.
   */
  findByType(type: string): ProviderConfig[] {
    return this.getAll().filter(p => p.type === type);
  }

  /**
   * Find by model.
   */
  findByModel(model: string): ProviderConfig[] {
    return this.getAll().filter(p => p.models.includes(model));
  }

  /**
   * Find by capability.
   */
  findByCapability(capability: string): ProviderConfig[] {
    return this.getAll().filter(p => {
      const caps = p.metadata?.capabilities;
      return Array.isArray(caps) && caps.includes(capability);
    });
  }

  /**
   * Find available.
   */
  findAvailable(opts?: { includeUnhealthy?: boolean }): ProviderConfig[] {
    return this.getAll().filter(p => {
      if (!p.enabled) return false;
      if (!opts?.includeUnhealthy) {
        const status = this._status.get(p.id);
        if (status && !status.healthy) return false;
      }
      return true;
    });
  }

  /**
   * Find idle.
   */
  findIdle(): ProviderConfig[] {
    return this.getAll().filter(p => p.enabled && !this.isRateLimited(p.id));
  }

  /**
   * Find cheapest.
   */
  findCheapest(model: string): ProviderConfig | undefined {
    const candidates = this.findByModel(model).filter(p => p.enabled);
    if (candidates.length === 0) return undefined;
    return candidates.reduce((best, p) => {
      const bestCost = this._status.get(best.id)?.costAccumulated ?? Infinity;
      const pCost = this._status.get(p.id)?.costAccumulated ?? Infinity;
      return pCost < bestCost ? p : best;
    });
  }

  /**
   * Find fastest.
   */
  findFastest(): ProviderConfig | undefined {
    const available = this.findAvailable();
    if (available.length === 0) return undefined;
    return available.reduce((best, p) => {
      const bestLat = this._status.get(best.id)?.latencyMs ?? Infinity;
      const pLat = this._status.get(p.id)?.latencyMs ?? Infinity;
      if (pLat === 0 && bestLat === 0) return best;
      if (pLat === 0) return best;
      if (bestLat === 0) return p;
      return pLat < bestLat ? p : best;
    });
  }

  /**
   * Find for task.
   */
  findForTask(req: { model: string; maxLatency: number; maxCost: number }): ProviderConfig | undefined {
    const byModel = this.findByModel(req.model).filter(p => p.enabled);
    for (const p of byModel) {
      const status = this._status.get(p.id);
      if (!status) continue;
      if (status.latencyMs <= req.maxLatency && status.costAccumulated <= req.maxCost) {
        return p;
      }
    }
    return undefined;
  }

  /**
   * Gets the models.
   */
  getModels(providerId: string): string[] {
    return this._providers.get(providerId)?.models ?? [];
  }

  /**
   * Gets the all models.
   */
  getAllModels(): string[] {
    const set = new Set<string>();
    for (const p of this._providers.values()) {
      for (const m of p.models) set.add(m);
    }
    return [...set];
  }

  /**
   * Gets the status.
   */
  getStatus(id: string): ProviderStatus | undefined {
    return this._status.get(id);
  }

  /**
   * Record request.
   */
  recordRequest(id: string, data: { tokens: number; latencyMs: number; cost: number }): void {
    const status = this._status.get(id);
    if (!status) return;
    status.requestCount++;
    status.tokenCount += data.tokens;
    status.costAccumulated += data.cost;
    status.latencyMs = Math.round((status.latencyMs * (status.requestCount - 1) + data.latencyMs) / status.requestCount);

    this._rateLimit.recordRequest(id, data.tokens);

    if (this.isRateLimited(id)) {
      this.emit('provider:rate-limited', { id });
    }
  }

  /**
   * Record error.
   */
  recordError(id: string, error: Error): void {
    const status = this._status.get(id);
    if (!status) return;
    status.errorCount++;
    this.emit('provider:error', { id, error });
  }

  /**
   * Reset status.
   */
  resetStatus(id: string): void {
    const status = this._status.get(id);
    if (!status) return;
    status.requestCount = 0;
    status.tokenCount = 0;
    status.errorCount = 0;
    status.costAccumulated = 0;
    status.latencyMs = 0;
    this._rateLimit.reset(id);
  }

  /**
   * Health check.
   */
  healthCheck(id: string, healthy: boolean): void {
    const status = this._status.get(id);
    if (!status) return;
    const wasHealthy = status.healthy;
    status.healthy = healthy;
    status.lastCheck = Date.now();

    if (healthy && !wasHealthy) this.emit('provider:healthy', { id });
    if (!healthy && wasHealthy) this.emit('provider:unhealthy', { id });
  }

  /**
   * Gets the healthy.
   */
  getHealthy(): ProviderConfig[] {
    return this.getAll().filter(p => {
      const status = this._status.get(p.id);
      return status?.healthy ?? false;
    });
  }

  /**
   * Checks whether rate limited.
   */
  isRateLimited(id: string): boolean {
    const config = this._providers.get(id);
    return this._rateLimit.isRateLimited(id, config?.rateLimit);
  }

  /**
   * Gets the remaining.
   */
  getRemaining(id: string): { rpm: number; tpm: number } {
    const config = this._providers.get(id);
    return this._rateLimit.getRemaining(id, config?.rateLimit);
  }

  /**
   * Wait time.
   */
  waitTime(id: string): number {
    const config = this._providers.get(id);
    return this._rateLimit.waitTime(id, config?.rateLimit);
  }

  /**
   * To j s o n.
   */
  toJSON(): any {
    const providers = this.getAll().map(p => ({
      ...p,
      credentials: this.maskCredentials(p.credentials),
    }));
    return { providers, defaultId: this._defaultId };
  }

  /**
   * From j s o n.
   */
  static fromJSON(json: any): ProviderRegistry {
    const reg = new ProviderRegistry();
    for (const p of json.providers ?? []) {
      reg.register(p);
    }
    if (json.defaultId && reg.has(json.defaultId)) {
      reg.setDefault(json.defaultId);
    }
    return reg;
  }

  /**
   * Export.
   */
  export(): ProviderConfig[] {
    return this.getAll().map(p => ({
      ...p,
      isDefault: p.id === this._defaultId,
    }));
  }

  /**
   * Import.
   */
  import(configs: ProviderConfig[]): { skipped: string[] } {
    const skipped: string[] = [];
    for (const config of configs) {
      if (this._providers.has(config.id)) {
        skipped.push(config.id);
        continue;
      }
      this.register(config);
    }
    return { skipped };
  }

  /**
   * On.
   */
  on(event: RegistryEvent, handler: Function): void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(handler);
  }

  /**
   * Off.
   */
  off(event: RegistryEvent, handler: Function): void {
    this._listeners.get(event)?.delete(handler);
  }

  /**
   * Assign to agent.
   */
  assignToAgent(agentId: string, providerId: string): void {
    if (!this._providers.has(providerId)) {
      throw new Error(`Provider '${providerId}' not found`);
    }
    this._agentMap.assign(agentId, providerId);
  }

  /**
   * Unassign agent.
   */
  unassignAgent(agentId: string): void {
    this._agentMap.unassign(agentId);
  }

  /**
   * Gets the agent provider.
   */
  getAgentProvider(agentId: string): ProviderConfig | undefined {
    const assignedId = this._agentMap.getAssignedId(agentId);
    if (assignedId && this._providers.has(assignedId)) {
      return this._providers.get(assignedId);
    }
    return this.getDefault();
  }

  /**
   * Gets the agents by provider.
   */
  getAgentsByProvider(providerId: string): string[] {
    return this._agentMap.getAgentsByProvider(providerId);
  }

  /**
   * Suggest for agent.
   */
  suggestForAgent(_agentId: string, requirements: { model: string; maxLatency: number; maxCost: number }): ProviderConfig | undefined {
    return this.findForTask(requirements);
  }

  private _setDefaultInternal(id: string): void {
    if (this._defaultId && this._providers.has(this._defaultId)) {
      this._providers.get(this._defaultId)!.isDefault = false;
    }
    this._defaultId = id;
    const config = this._providers.get(id);
    if (config) config.isDefault = true;
  }

  private maskCredentials(creds: Record<string, string>): Record<string, string> {
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(creds)) {
      if (typeof value === 'string' && value.length > 4) {
        masked[key] = '****' + value.slice(-4);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  private emit(event: RegistryEvent, data: any): void {
    const handlers = this._listeners.get(event);
    if (handlers) {
      for (const handler of handlers) handler(data);
    }
  }
}
