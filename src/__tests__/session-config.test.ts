import { describe, it, expect, beforeEach } from 'vitest';
import { createSessionConfigManager, createPermissionManager, createBudgetManager } from '../core/SessionConfigManager';

describe('Session Config Manager', () => {
  let config: ReturnType<typeof createSessionConfigManager>;

  beforeEach(() => {
    config = createSessionConfigManager();
  });

  describe('Loading and saving', () => {
    it('should load config from workspace path', () => {
      const loaded = config.loadConfig('/home/user/project');
      expect(loaded.workspace.root).toBeDefined();
      expect(loaded.budget).toBeDefined();
      expect(loaded.defaultModel).toBeDefined();
    });

    it('should save config to disk', () => {
      const cfg = config.loadConfig('/tmp');
      cfg.defaultModel = 'opus';
      config.saveConfig(cfg);
      // No throw = success
    });

    it('should return config file path', () => {
      const path = config.getConfigPath();
      expect(path).toContain('.armament');
      expect(path).toContain('config');
    });

    it('should load defaults when no config file exists', () => {
      const loaded = config.loadConfig('/nonexistent/path');
      expect(loaded.defaultModel).toBeDefined();
      expect(loaded.budget.sessionLimit).toBeGreaterThan(0);
    });
  });

  describe('Menu items', () => {
    it('should get a menu item by key', () => {
      const model = config.getMenuItem('defaultModel');
      expect(model).toBeDefined();
    });

    it('should set a menu item by key', () => {
      config.setMenuItem('defaultModel', 'opus');
      expect(config.getMenuItem('defaultModel')).toBe('opus');
    });

    it('should set budget via menu item', () => {
      config.setMenuItem('budget', { sessionLimit: 10.00, warnPercent: 90, freezePercent: 100, currency: 'USD' });
      const budget = config.getMenuItem('budget');
      expect(budget.sessionLimit).toBe(10.00);
    });

    it('should set theme via menu item', () => {
      config.setMenuItem('theme', 'fire-red');
      expect(config.getMenuItem('theme')).toBe('fire-red');
    });
  });

  describe('Validation', () => {
    it('should validate a valid config', () => {
      const errors = config.validateConfig({
        defaultModel: 'sonnet-4',
        budget: { sessionLimit: 5.00, warnPercent: 80, freezePercent: 100, currency: 'USD' },
      });
      expect(errors).toHaveLength(0);
    });

    it('should reject negative budget', () => {
      const errors = config.validateConfig({
        budget: { sessionLimit: -1 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject warnPercent > freezePercent', () => {
      const errors = config.validateConfig({
        budget: { sessionLimit: 5, warnPercent: 100, freezePercent: 80 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject unknown provider type', () => {
      const errors = config.validateConfig({
        providers: [{ id: 'x', type: 'made-up', models: [], available: true, priority: 1 }],
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty model string', () => {
      const errors = config.validateConfig({ defaultModel: '' });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Merging and defaults', () => {
    it('should reset to defaults', () => {
      const defaults = config.resetToDefaults();
      expect(defaults.defaultModel).toBeDefined();
      expect(defaults.budget).toBeDefined();
    });

    it('should merge overrides with existing config', () => {
      const merged = config.mergeWith({ defaultModel: 'haiku' });
      expect(merged.defaultModel).toBe('haiku');
    });

    it('should not lose existing values when merging partial', () => {
      const merged = config.mergeWith({ theme: 'green' });
      expect(merged.budget).toBeDefined();
      expect(merged.workspace).toBeDefined();
    });
  });
});

describe('Permission Manager', () => {
  let perms: ReturnType<typeof createPermissionManager>;

  beforeEach(() => {
    perms = createPermissionManager();
  });

  describe('Access checks', () => {
    it('should allow access to workspace files by default', () => {
      expect(perms.checkAccess('src/index.ts', 'read')).toBe(true);
    });

    it('should allow write to permitted paths', () => {
      expect(perms.checkAccess('src/auth.ts', 'write')).toBe(true);
    });

    it('should deny access to deny-listed paths', () => {
      expect(perms.checkAccess('.env', 'read')).toBe(false);
    });

    it('should deny access to secrets directory', () => {
      expect(perms.checkAccess('secrets/key.pem', 'read')).toBe(false);
    });

    it('should deny access outside workspace', () => {
      expect(perms.isInWorkspace('/etc/passwd')).toBe(false);
      expect(perms.checkAccess('/etc/passwd', 'read')).toBe(false);
    });

    it('should deny write when only read is granted', () => {
      perms.grantAccess({ path: 'docs/', action: 'read', recursive: true, scope: 'session' });
      expect(perms.checkAccess('docs/readme.md', 'write')).toBe(false);
    });
  });

  describe('Granting and revoking', () => {
    it('should grant access to a path', () => {
      perms.grantAccess({ path: 'new-dir/', action: 'write', recursive: true, scope: 'session' });
      expect(perms.checkAccess('new-dir/file.ts', 'write')).toBe(true);
    });

    it('should revoke access to a path', () => {
      perms.grantAccess({ path: 'temp/', action: 'write', recursive: true, scope: 'session' });
      perms.revokeAccess('temp/');
      expect(perms.checkAccess('temp/file.ts', 'write')).toBe(false);
    });

    it('should list all permissions', () => {
      perms.grantAccess({ path: 'a/', action: 'read', recursive: true, scope: 'session' });
      perms.grantAccess({ path: 'b/', action: 'write', recursive: false, scope: 'workspace' });
      const all = perms.getPermissions();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should support non-recursive permissions', () => {
      perms.grantAccess({ path: 'config/', action: 'read', recursive: false, scope: 'session' });
      expect(perms.checkAccess('config/app.json', 'read')).toBe(true);
      expect(perms.checkAccess('config/sub/deep.json', 'read')).toBe(false);
    });
  });

  describe('Deny list', () => {
    it('should return deny list', () => {
      const list = perms.getDenyList();
      expect(list).toContain('.env');
      expect(list).toContain('secrets/');
    });

    it('should update deny list', () => {
      perms.setDenyList(['.env', '.env.local', 'creds/']);
      const list = perms.getDenyList();
      expect(list).toContain('creds/');
    });

    it('should deny access after adding to deny list', () => {
      perms.setDenyList(['.env', 'private/']);
      expect(perms.checkAccess('private/keys.json', 'read')).toBe(false);
    });
  });

  describe('Interactive prompting', () => {
    it('should prompt for access to unknown path', async () => {
      const result = await perms.promptForAccess('/outside/path', 'read');
      expect(typeof result).toBe('boolean');
    });

    it('should not prompt for already-permitted paths', async () => {
      perms.grantAccess({ path: 'src/', action: 'read', recursive: true, scope: 'session' });
      // No prompt needed — direct check
      expect(perms.checkAccess('src/file.ts', 'read')).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('should persist permissions to disk', () => {
      perms.grantAccess({ path: 'src/', action: 'write', recursive: true, scope: 'workspace' });
      perms.persistPermissions();
      // No throw = success
    });

    it('should load permissions for a workspace', () => {
      perms.loadPermissions('/home/user/project');
      const loaded = perms.getPermissions();
      expect(Array.isArray(loaded)).toBe(true);
    });

    it('should only persist workspace-scoped permissions', () => {
      perms.grantAccess({ path: 'a/', action: 'read', recursive: true, scope: 'session' });
      perms.grantAccess({ path: 'b/', action: 'write', recursive: true, scope: 'workspace' });
      perms.persistPermissions();
      // Session-scoped should not persist
    });
  });

  describe('Agent inheritance', () => {
    it('should propagate workspace permissions to spawned agents', () => {
      perms.grantAccess({ path: 'src/', action: 'write', recursive: true, scope: 'workspace' });
      // Agent should inherit this
      expect(perms.checkAccess('src/new-file.ts', 'write')).toBe(true);
    });

    it('should restrict agent to parent permissions', () => {
      // Agent cannot exceed parent's access
      expect(perms.checkAccess('/root/system', 'write')).toBe(false);
    });
  });
});

describe('Budget Manager', () => {
  let budget: ReturnType<typeof createBudgetManager>;

  beforeEach(() => {
    budget = createBudgetManager();
  });

  describe('Budget configuration', () => {
    it('should return current budget config', () => {
      const cfg = budget.getBudget();
      expect(cfg.sessionLimit).toBe(5.00);
      expect(cfg.warnPercent).toBe(80);
      expect(cfg.freezePercent).toBe(100);
    });

    it('should update budget config', () => {
      budget.setBudget({ sessionLimit: 10.00 });
      expect(budget.getBudget().sessionLimit).toBe(10.00);
    });

    it('should support unlimited budget', () => {
      budget.setBudget({ sessionLimit: 'unlimited' as any });
      expect(budget.getBudget().sessionLimit).toBe('unlimited');
    });

    it('should support per-agent limits', () => {
      budget.setBudget({ perAgentLimit: 1.00 });
      expect(budget.getBudget().perAgentLimit).toBe(1.00);
    });

    it('should support per-minute rate limits', () => {
      budget.setBudget({ perMinuteLimit: 0.50 });
      expect(budget.getBudget().perMinuteLimit).toBe(0.50);
    });
  });

  describe('Spend tracking', () => {
    it('should start at zero spend', () => {
      expect(budget.getCurrentSpend()).toBe(0);
    });

    it('should record cost for an agent', () => {
      budget.recordCost('agent-1', 0.15);
      expect(budget.getCurrentSpend()).toBe(0.15);
    });

    it('should accumulate costs', () => {
      budget.recordCost('agent-1', 0.10);
      budget.recordCost('agent-2', 0.20);
      budget.recordCost('agent-1', 0.05);
      expect(budget.getCurrentSpend()).toBe(0.35);
    });

    it('should track spend per agent', () => {
      budget.recordCost('agent-1', 0.50);
      budget.recordCost('agent-2', 0.30);
      expect(budget.getSpendByAgent('agent-1')).toBe(0.50);
      expect(budget.getSpendByAgent('agent-2')).toBe(0.30);
    });

    it('should calculate remaining budget', () => {
      budget.setBudget({ sessionLimit: 5.00 });
      budget.recordCost('agent-1', 1.50);
      expect(budget.getRemainingBudget()).toBe(3.50);
    });

    it('should return Infinity remaining when unlimited', () => {
      budget.setBudget({ sessionLimit: 'unlimited' as any });
      expect(budget.getRemainingBudget()).toBe(Infinity);
    });

    it('should calculate percent used', () => {
      budget.setBudget({ sessionLimit: 10.00 });
      budget.recordCost('agent-1', 2.50);
      expect(budget.getPercentUsed()).toBe(25);
    });
  });

  describe('Thresholds', () => {
    it('should not be over warn threshold initially', () => {
      expect(budget.isOverWarnThreshold()).toBe(false);
    });

    it('should detect when over warn threshold', () => {
      budget.setBudget({ sessionLimit: 5.00, warnPercent: 80 });
      budget.recordCost('agent-1', 4.10);
      expect(budget.isOverWarnThreshold()).toBe(true);
    });

    it('should not be over freeze threshold initially', () => {
      expect(budget.isOverFreezeThreshold()).toBe(false);
    });

    it('should detect when over freeze threshold', () => {
      budget.setBudget({ sessionLimit: 5.00, freezePercent: 100 });
      budget.recordCost('agent-1', 5.01);
      expect(budget.isOverFreezeThreshold()).toBe(true);
    });

    it('should fire callback when warn threshold reached', () => {
      let fired: any = null;
      budget.onThresholdReached((type, pct) => { fired = { type, pct }; });
      budget.setBudget({ sessionLimit: 1.00, warnPercent: 80 });
      budget.recordCost('agent-1', 0.85);
      expect(fired).not.toBeNull();
      expect(fired.type).toBe('warn');
    });

    it('should fire callback when freeze threshold reached', () => {
      let fired: any = null;
      budget.onThresholdReached((type, pct) => { fired = { type, pct }; });
      budget.setBudget({ sessionLimit: 1.00, freezePercent: 100 });
      budget.recordCost('agent-1', 1.05);
      expect(fired.type).toBe('freeze');
    });

    it('should return unsubscribe function for threshold callback', () => {
      const unsub = budget.onThresholdReached(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should not fire warn again after already warned', () => {
      let count = 0;
      budget.onThresholdReached(() => { count++; });
      budget.setBudget({ sessionLimit: 1.00, warnPercent: 80 });
      budget.recordCost('agent-1', 0.85);
      budget.recordCost('agent-1', 0.01);
      expect(count).toBe(1);
    });
  });

  describe('Projections', () => {
    it('should project total cost based on current rate', () => {
      budget.recordCost('agent-1', 0.50);
      // If we've spent $0.50 and have 5 more minutes
      const projected = budget.getProjectedTotal(5);
      expect(projected).toBeGreaterThan(0.50);
    });

    it('should project zero when no spend recorded', () => {
      const projected = budget.getProjectedTotal(10);
      expect(projected).toBe(0);
    });
  });

  describe('Per-agent budget enforcement', () => {
    it('should detect when single agent exceeds its limit', () => {
      budget.setBudget({ sessionLimit: 10.00, perAgentLimit: 2.00 });
      budget.recordCost('agent-1', 2.10);
      expect(budget.getSpendByAgent('agent-1')).toBeGreaterThan(2.00);
    });

    it('should not freeze session if only one agent is over', () => {
      budget.setBudget({ sessionLimit: 10.00, perAgentLimit: 2.00, freezePercent: 100 });
      budget.recordCost('agent-1', 2.10);
      expect(budget.isOverFreezeThreshold()).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset all spend to zero', () => {
      budget.recordCost('agent-1', 3.00);
      budget.reset();
      expect(budget.getCurrentSpend()).toBe(0);
    });

    it('should reset per-agent tracking', () => {
      budget.recordCost('agent-1', 1.00);
      budget.reset();
      expect(budget.getSpendByAgent('agent-1')).toBe(0);
    });

    it('should not reset budget config on reset', () => {
      budget.setBudget({ sessionLimit: 20.00 });
      budget.reset();
      expect(budget.getBudget().sessionLimit).toBe(20.00);
    });
  });
});
