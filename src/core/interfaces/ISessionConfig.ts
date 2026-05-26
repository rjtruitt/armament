/** Type union for PermissionScope: session, workspace, global. */
export type PermissionScope = 'session' | 'workspace' | 'global';
/** Type union for PermissionAction: read, write, execute, deny. */
export type PermissionAction = 'read' | 'write' | 'execute' | 'deny';

/** Maps a filesystem path to its allowed access level. */
export interface IPathPermission {
  path: string;
  action: PermissionAction;
  recursive: boolean;
  scope: PermissionScope;
}

/** Cost budget limits with warning and freeze thresholds. */
export interface IBudgetConfig {
  sessionLimit: number | 'unlimited';
  perAgentLimit?: number;
  perMinuteLimit?: number;
  warnPercent: number;
  freezePercent: number;
  currency: string;
}

/** Registered LLM provider entry with credentials and model list. */
export interface IProviderEntry {
  id: string;
  type: string;
  models: string[];
  apiKeyRef?: string;
  endpoint?: string;
  available: boolean;
  priority: number;
}

/** Remote agent node configuration for distributed setups. */
export interface INodeConfig {
  id: string;
  host: string;
  status: 'connected' | 'disconnected' | 'connecting';
  capabilities: string[];
  maxAgents: number;
}

/** Full session configuration as shown in the session config menu. */
export interface ISessionConfigMenu {
  workspace: IWorkspaceConfig;
  budget: IBudgetConfig;
  defaultModel: string;
  providers: IProviderEntry[];
  mcpServers: IMcpServerEntry[];
  denyPaths: string[];
  nodes: INodeConfig[];
  theme: string;
}

/** Workspace root and permission rules. */
export interface IWorkspaceConfig {
  root: string;
  permissions: IPathPermission[];
  inheritToAgents: boolean;
}

/** Registered MCP server with connection status. */
export interface IMcpServerEntry {
  name: string;
  status: 'connected' | 'failed' | 'disabled';
  toolCount: number;
}

/** Interface for ISessionConfigManager. */
export interface ISessionConfigManager {
  loadConfig(workspacePath: string): ISessionConfigMenu;
  saveConfig(config: ISessionConfigMenu): void;
  getConfigPath(): string;
  getMenuItem(key: string): unknown;
  setMenuItem(key: string, value: unknown): void;
  validateConfig(config: Partial<ISessionConfigMenu>): string[];
  resetToDefaults(): ISessionConfigMenu;
  mergeWith(overrides: Partial<ISessionConfigMenu>): ISessionConfigMenu;
}

/** Interface for IPermissionManager. */
export interface IPermissionManager {
  checkAccess(path: string, action: PermissionAction): boolean;
  grantAccess(permission: IPathPermission): void;
  revokeAccess(path: string): void;
  getPermissions(): IPathPermission[];
  isInWorkspace(path: string): boolean;
  getDenyList(): string[];
  setDenyList(paths: string[]): void;
  promptForAccess(path: string, action: PermissionAction): Promise<boolean>;
  persistPermissions(): void;
  loadPermissions(workspacePath: string): void;
}

/** Interface for IBudgetManager. */
export interface IBudgetManager {
  getBudget(): IBudgetConfig;
  setBudget(config: Partial<IBudgetConfig>): void;
  getCurrentSpend(): number;
  getSpendByAgent(agentId: string): number;
  getRemainingBudget(): number;
  getPercentUsed(): number;
  isOverWarnThreshold(): boolean;
  isOverFreezeThreshold(): boolean;
  recordCost(agentId: string, amount: number): void;
  getProjectedTotal(minutesRemaining: number): number;
  onThresholdReached(callback: (type: 'warn' | 'freeze', percent: number) => void): () => void;
  reset(): void;
}
