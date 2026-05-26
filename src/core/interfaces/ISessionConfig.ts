/** Type union for PermissionScope: session, workspace, global. */
export type PermissionScope = 'session' | 'workspace' | 'global';
/** Type union for PermissionAction: read, write, execute, deny. */
export type PermissionAction = 'read' | 'write' | 'execute' | 'deny';

/** Interface for IPathPermission.
 * @property {string} path - Description of path.
 * @property {PermissionAction} action - Description of action.
 * @property {boolean} recursive - Description of recursive.
 * @property {PermissionScope} scope - Description of scope.
 */
export interface IPathPermission {
  path: string;
  action: PermissionAction;
  recursive: boolean;
  scope: PermissionScope;
}

/** Interface for IBudgetConfig.
 * @property {number} sessionLimit - Description of sessionLimit.
 * @property {number} perAgentLimit - Description of perAgentLimit.
 * @property {number} perMinuteLimit - Description of perMinuteLimit.
 * @property {number} warnPercent - Description of warnPercent.
 * @property {number} freezePercent - Description of freezePercent.
 * @property {string} currency - Description of currency.
 */
export interface IBudgetConfig {
  sessionLimit: number | 'unlimited';
  perAgentLimit?: number;
  perMinuteLimit?: number;
  warnPercent: number;
  freezePercent: number;
  currency: string;
}

/** Interface for IProviderEntry.
 * @property {string} id - Description of id.
 * @property {string} type - Description of type.
 * @property {string} models - Description of models.
 * @property {string} apiKeyRef - Description of apiKeyRef.
 * @property {string} endpoint - Description of endpoint.
 * @property {boolean} available - Description of available.
 * @property {number} priority - Description of priority.
 */
export interface IProviderEntry {
  id: string;
  type: string;
  models: string[];
  apiKeyRef?: string;
  endpoint?: string;
  available: boolean;
  priority: number;
}

/** Interface for INodeConfig.
 * @property {string} id - Description of id.
 * @property {string} host - Description of host.
 * @property {string} capabilities - Description of capabilities.
 * @property {number} maxAgents - Description of maxAgents.
 */
export interface INodeConfig {
  id: string;
  host: string;
  status: 'connected' | 'disconnected' | 'connecting';
  capabilities: string[];
  maxAgents: number;
}

/** Interface for ISessionConfigMenu.
 * @property {IWorkspaceConfig} workspace - Description of workspace.
 * @property {IBudgetConfig} budget - Description of budget.
 * @property {string} defaultModel - Description of defaultModel.
 * @property {IProviderEntry} providers - Description of providers.
 * @property {IMcpServerEntry} mcpServers - Description of mcpServers.
 * @property {string} denyPaths - Description of denyPaths.
 * @property {INodeConfig} nodes - Description of nodes.
 * @property {string} theme - Description of theme.
 */
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

/** Interface for IWorkspaceConfig.
 * @property {string} root - Description of root.
 * @property {IPathPermission} permissions - Description of permissions.
 * @property {boolean} inheritToAgents - Description of inheritToAgents.
 */
export interface IWorkspaceConfig {
  root: string;
  permissions: IPathPermission[];
  inheritToAgents: boolean;
}

/** Interface for IMcpServerEntry.
 * @property {string} name - Description of name.
 * @property {number} toolCount - Description of toolCount.
 */
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
