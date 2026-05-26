/** Factory for session configuration with defaults, validation, and merge semantics. */
export function createSessionConfigManager() {
  const defaults = {
    workspace: { root: '/tmp/project', permissions: [], inheritToAgents: true },
    budget: { sessionLimit: 5.00, warnPercent: 80, freezePercent: 100, currency: 'USD' },
    defaultModel: 'sonnet-4',
    providers: [],
    mcpServers: [],
    denyPaths: ['.env', 'secrets/'],
    nodes: [],
    theme: 'default-cyan',
    contextWindow: {
      maxTokens: 200_000,
      compactThreshold: 0.85,
      recentMessagesToKeep: 10,
      summaryTargetRatio: 0.12,
      antiThrashAttempts: 3,
      maxSnapshots: 50,
      strategy: 'summary',
    },
    session: {
      enabled: true,
      saveTrigger: 'every-context-update',
    },
    scheduler: {
      enabled: true,
      maxConcurrentWorkflows: 3,
      defaults: {
        model: 'sonnet-4',
        provider: 'anthropic',
        budgetPerRun: 1.00,
        maxRetries: 3,
        retryPolicy: 'exponential',
        timeout: 600,
        logLevel: 'info',
      },
      workflows: [],
      pollers: [],
      triggers: [],
      history: {
        maxEntries: 100,
        retainDays: 7,
        autoClean: true,
      },
    },
    outputs: {
      slack: { enabled: false, channel: '', username: 'armament-bot', format: 'blocks' },
      email: { enabled: false, to: '', from: '', transport: 'smtp' },
      sms: { enabled: false, to: '', provider: 'twilio', maxLength: 160 },
      whatsapp: { enabled: false, to: '', provider: 'twilio' },
      toolChain: { enabled: false, tools: [], stopOnError: true },
      webhook: { enabled: false, url: '', method: 'POST', retries: 3, timeout: 30 },
    },
  } as any;
  let currentConfig = { ...defaults };
  return {
    loadConfig: (_path: string) => {
      currentConfig = { ...defaults };
      return currentConfig;
    },
    saveConfig: (_config: any) => {},
    getConfigPath: () => '.armament/config.json',
    getMenuItem: (key: string) => currentConfig[key],
    setMenuItem: (key: string, value: any) => { currentConfig[key] = value; },
    validateConfig: (config: any) => {
      const errors: string[] = [];
      if (config.budget) {
        if (config.budget.sessionLimit !== undefined && config.budget.sessionLimit < 0) {
          errors.push('budget.sessionLimit must be non-negative');
        }
        if (config.budget.warnPercent !== undefined && config.budget.freezePercent !== undefined &&
            config.budget.warnPercent > config.budget.freezePercent) {
          errors.push('budget.warnPercent must be <= freezePercent');
        }
      }
      if (config.providers) {
        const validTypes = ['anthropic', 'openai', 'local', 'cloud', 'remote'];
        for (const p of config.providers) {
          if (!validTypes.includes(p.type)) {
            errors.push(`Unknown provider type: ${p.type}`);
          }
        }
      }
      if (config.defaultModel !== undefined && config.defaultModel === '') {
        errors.push('defaultModel must not be empty');
      }
      return errors;
    },
    resetToDefaults: () => {
      currentConfig = { ...defaults };
      return currentConfig;
    },
    mergeWith: (overrides: any) => {
      currentConfig = { ...currentConfig, ...overrides };
      return currentConfig;
    },
  };
}
/** Factory for workspace permission management with deny lists and access grants. */
export function createPermissionManager() {
  let denyList = ['.env', 'secrets/'];
  const permissions: any[] = [];
  const revoked: Set<string> = new Set();
  function isInWorkspace(path: string): boolean {
    return !path.startsWith('/');
  }
  function isDenied(path: string): boolean {
    for (const denied of denyList) {
      if (path === denied || path.startsWith(denied)) return true;
    }
    return false;
  }
  function isRevoked(path: string): boolean {
    for (const r of revoked) {
      if (path === r || path.startsWith(r)) return true;
    }
    return false;
  }
  function checkAccess(path: string, action: string): boolean {
    if (!isInWorkspace(path)) return false;
    if (isDenied(path)) return false;
    if (isRevoked(path)) return false;
    const grants = permissions.filter(p => p.action === action || p.action === 'all');
    for (const grant of grants) {
      const grantPath = grant.path;
      if (grant.recursive) {
        if (path === grantPath || path.startsWith(grantPath)) return true;
      } else {
        if (path.startsWith(grantPath)) {
          const remainder = path.slice(grantPath.length);
          if (!remainder.includes('/')) return true;
          else return false;
        }
      }
    }
    const anyGrantForPath = permissions.find(p => {
      const grantPath = p.path;
      if (p.recursive) return path === grantPath || path.startsWith(grantPath);
      return path.startsWith(grantPath);
    });
    if (anyGrantForPath && anyGrantForPath.action !== action && anyGrantForPath.action !== 'all') {
      return false;
    }
    return true;
  }
  return {
    checkAccess,
    grantAccess: (perm: any) => {
      revoked.delete(perm.path);
      permissions.push(perm);
    },
    revokeAccess: (path: string) => {
      const idx = permissions.findIndex(p => p.path === path);
      if (idx !== -1) permissions.splice(idx, 1);
      revoked.add(path);
    },
    getPermissions: () => [...permissions],
    isInWorkspace,
    getDenyList: () => [...denyList],
    setDenyList: (paths: string[]) => { denyList = [...paths]; },
    promptForAccess: async (_path: string, _action: any) => true,
    persistPermissions: () => {},
    loadPermissions: (_path: string) => {},
  };
}
/** Factory for session budget tracking with threshold callbacks and projections. */
export function createBudgetManager() {
  let config: any = { sessionLimit: 5.00, warnPercent: 80, freezePercent: 100, currency: 'USD' };
  let totalSpend = 0;
  const agentSpend: Record<string, number> = {};
  const callbacks: Array<(type: string, pct: number) => void> = [];
  let warnFired = false;
  let freezeFired = false;
  let firstRecordTime: number | null = null;
  function getPercentUsed(): number {
    if (config.sessionLimit === 'unlimited') return 0;
    return (totalSpend / config.sessionLimit) * 100;
  }
  function checkThresholds() {
    const pct = getPercentUsed();
    if (!warnFired && config.warnPercent !== undefined && pct >= config.warnPercent) {
      warnFired = true;
      callbacks.forEach(cb => cb('warn', pct));
    }
    if (!freezeFired && config.freezePercent !== undefined && pct >= config.freezePercent) {
      freezeFired = true;
      callbacks.forEach(cb => cb('freeze', pct));
    }
  }
  return {
    getBudget: () => ({ ...config }),
    setBudget: (updates: any) => {
      config = { ...config, ...updates };
      warnFired = false;
      freezeFired = false;
    },
    getCurrentSpend: () => Math.round(totalSpend * 1e10) / 1e10,
    getSpendByAgent: (id: string) => agentSpend[id] || 0,
    getRemainingBudget: () => {
      if (config.sessionLimit === 'unlimited') return Infinity;
      return config.sessionLimit - totalSpend;
    },
    getPercentUsed,
    isOverWarnThreshold: () => {
      if (config.sessionLimit === 'unlimited') return false;
      return getPercentUsed() >= (config.warnPercent || 80);
    },
    isOverFreezeThreshold: () => {
      if (config.sessionLimit === 'unlimited') return false;
      return getPercentUsed() >= (config.freezePercent || 100);
    },
    recordCost: (agentId: string, amount: number) => {
      if (firstRecordTime === null) firstRecordTime = Date.now();
      totalSpend += amount;
      agentSpend[agentId] = (agentSpend[agentId] || 0) + amount;
      checkThresholds();
    },
    getProjectedTotal: (_mins: number) => {
      if (totalSpend === 0) return 0;
      const elapsed = Date.now() - (firstRecordTime || Date.now());
      const elapsedMins = elapsed > 0 ? elapsed / 60000 : 1;
      const rate = totalSpend / elapsedMins;
      return totalSpend + rate * _mins;
    },
    onThresholdReached: (cb: any) => {
      callbacks.push(cb);
      return () => {
        const idx = callbacks.indexOf(cb);
        if (idx !== -1) callbacks.splice(idx, 1);
      };
    },
    reset: () => {
      totalSpend = 0;
      Object.keys(agentSpend).forEach(k => delete agentSpend[k]);
      warnFired = false;
      freezeFired = false;
      firstRecordTime = null;
    },
  };
}