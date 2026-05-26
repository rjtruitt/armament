import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { logWarn } from './FileLogger.js';
import { ArmaHomeBase, defaultFs } from './ArmaHomeStorage.js';
import type { FileSystem } from './ArmaHomeStorage.js';

export type { FileSystem, MemoryEntry, SessionRecord } from './ArmaHomeStorage.js';


/** Top-level user settings stored in ~/.armament/config.json. */
export interface GlobalSettings {
  defaultProvider?: string;
  defaultModel?: string;
  theme?: string;
  maxBudget?: number;
  warnPercent?: number;
  freezePercent?: number;
  noColor?: boolean;
  compact?: boolean;
  verbose?: boolean;
  streaming?: boolean;
  showThinking?: boolean;
  telemetry?: boolean;
  autoUpdate?: boolean;
  editor?: string;
  shell?: string;
  flavorTexts?: string[];
  bootAnimation?: boolean;
  redisUrl?: string;
  etcdEndpoints?: string[];
  natsUrl?: string;
  maxAgents?: number;
  perAgentBudget?: number;
  agentTimeout?: number;
  overseerModel?: string;
  agentModel?: string;
  hitlTimeout?: number;
  maxSpawnsPerSession?: number;
  permissionPolicy?: 'ask-always' | 'ask-once' | 'allow-all';
  scheduledWorkflows?: string[];
  workflowHistoryDays?: number;
  pollerIntervals?: Record<string, number>;
  nodeId?: string;
  remoteNodes?: { id: string; host: string }[];
  leaderElection?: { enabled: boolean; ttl: number };
}

/** Per-workspace settings stored in <workspace>/.armament/config.json. */
export interface ProjectSettings {
  workspace?: { root: string; allow?: string[]; deny?: string[] };
  providers?: any[];
  mcpServers?: any[];
  budget?: { limit: number; warnPercent: number; freezePercent: number };
  scripts?: string[];
  theme?: string;
}


function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}


/** Manages the ~/.armament/ directory structure and per-project overrides. */
export class ArmaHome extends ArmaHomeBase {

  constructor(config?: { homeDir?: string; fs?: FileSystem }) {
    const fileSystem = config?.fs ?? defaultFs;
    const homeDir =
      config?.homeDir ||
      process.env.ARMAMENT_HOME ||
      path.join(os.homedir(), '.armament');
    super(homeDir, fileSystem);
  }


  /**
   * Gets the home dir.
   */
  getHomeDir(): string {
    return this.homeDir;
  }

  /**
   * Gets the project dir.
   */
  getProjectDir(workspacePath: string): string {
    return path.join(workspacePath, '.armament');
  }

  /**
   * Ensure home dir.
   */
  async ensureHomeDir(): Promise<void> {
    const dirs = [
      this.homeDir,
      path.join(this.homeDir, 'memory'),
      path.join(this.homeDir, 'history'),
      path.join(this.homeDir, 'scripts'),
      path.join(this.homeDir, 'themes'),
      path.join(this.homeDir, 'credentials'),
      path.join(this.homeDir, 'plugins'),
    ];
    for (const dir of dirs) {
      if (!this.fs.existsSync(dir)) {
        this.fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Ensure project dir.
   */
  async ensureProjectDir(workspacePath: string): Promise<void> {
    const projectDir = this.getProjectDir(workspacePath);
    if (!this.fs.existsSync(projectDir)) {
      this.fs.mkdirSync(projectDir, { recursive: true });
    }
  }


  /**
   * Load global settings.
   */
  loadGlobalSettings(): GlobalSettings {
    const configPath = path.join(this.homeDir, 'config.json');
    if (!this.fs.existsSync(configPath)) {
      return {};
    }
    try {
      const raw = this.fs.readFileSync(configPath);
      return JSON.parse(raw) as GlobalSettings;
    } catch (err) {
      logWarn('ArmaHome', `Failed to parse global config: ${configPath}`, err);
      return {};
    }
  }

  /**
   * Save global settings.
   */
  saveGlobalSettings(settings: Partial<GlobalSettings>): void {
    const configPath = path.join(this.homeDir, 'config.json');
    const existing = this.loadGlobalSettings();
    const merged = deepMerge(existing, settings);
    this.fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  }

  /**
   * Gets the global setting.
   */
  getGlobalSetting<T>(key: string): T {
    const settings = this.loadGlobalSettings();
    return (settings as Record<string, unknown>)[key] as T;
  }

  /**
   * Sets the global setting.
   */
  setGlobalSetting(key: string, value: unknown): void {
    const settings = this.loadGlobalSettings();
    (settings as Record<string, unknown>)[key] = value;
    const configPath = path.join(this.homeDir, 'config.json');
    this.fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
  }


  /**
   * Load project settings.
   */
  loadProjectSettings(workspacePath: string): ProjectSettings {
    const configPath = path.join(this.getProjectDir(workspacePath), 'config.json');
    if (!this.fs.existsSync(configPath)) {
      return {};
    }
    try {
      const raw = this.fs.readFileSync(configPath);
      return JSON.parse(raw) as ProjectSettings;
    } catch (err) {
      logWarn('ArmaHome', `Failed to parse project config: ${configPath}`, err);
      return {};
    }
  }

  /**
   * Save project settings.
   */
  saveProjectSettings(workspacePath: string, settings: Partial<ProjectSettings>): void {
    const projectDir = this.getProjectDir(workspacePath);
    if (!this.fs.existsSync(projectDir)) {
      this.fs.mkdirSync(projectDir, { recursive: true });
    }
    const configPath = path.join(projectDir, 'config.json');
    const existing = this.loadProjectSettings(workspacePath);
    const merged = deepMerge(existing, settings);
    this.fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  }

  /**
   * Merge settings.
   */
  mergeSettings(global: GlobalSettings, project: ProjectSettings): GlobalSettings & ProjectSettings {
    const result: any = { ...global };

    for (const [key, value] of Object.entries(project)) {
      if (value === undefined) continue;
      if (key === 'mcpServers') {
        type McpEntry = Record<string, unknown> & { name?: string };
        const globalServers: McpEntry[] = (global as Record<string, unknown>).mcpServers as McpEntry[] ?? [];
        const projectServers: McpEntry[] = value as McpEntry[];
        const merged: McpEntry[] = [...projectServers];
        for (const gs of globalServers) {
          const nameField = gs.name ?? gs;
          const exists = merged.some((ps) => (ps.name ?? ps) === nameField);
          if (!exists) {
            merged.push(gs);
          }
        }
        result.mcpServers = merged;
      } else {
        result[key] = value;
      }
    }

    return result as GlobalSettings & ProjectSettings;
  }


  /**
   * Load global mcp config.
   */
  loadGlobalMcpConfig(): any[] {
    const mcpPath = path.join(this.homeDir, 'mcp.json');
    if (!this.fs.existsSync(mcpPath)) {
      return [];
    }
    try {
      const raw = this.fs.readFileSync(mcpPath);
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      logWarn('ArmaHome', `Failed to parse global MCP config: ${mcpPath}`, err);
      return [];
    }
  }

  /**
   * Load project mcp config.
   */
  loadProjectMcpConfig(workspacePath: string): any[] {
    const mcpPath = path.join(this.getProjectDir(workspacePath), 'mcp.json');
    if (!this.fs.existsSync(mcpPath)) {
      return [];
    }
    try {
      const raw = this.fs.readFileSync(mcpPath);
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      logWarn('ArmaHome', `Failed to parse project MCP config: ${mcpPath}`, err);
      return [];
    }
  }

  /**
   * Save mcp config.
   */
  saveMcpConfig(configs: any[], scope: 'global' | 'project', workspacePath?: string): void {
    let mcpPath: string;
    if (scope === 'global') {
      mcpPath = path.join(this.homeDir, 'mcp.json');
    } else {
      if (!workspacePath) {
        throw new Error('workspacePath required for project scope');
      }
      const projectDir = this.getProjectDir(workspacePath);
      if (!this.fs.existsSync(projectDir)) {
        this.fs.mkdirSync(projectDir, { recursive: true });
      }
      mcpPath = path.join(projectDir, 'mcp.json');
    }
    this.fs.writeFileSync(mcpPath, JSON.stringify(configs, null, 2));
  }


  /**
   * List scripts.
   */
  listScripts(scope?: 'global' | 'project', workspacePath?: string): string[] {
    let scriptsDir: string;
    if (scope === 'project' && workspacePath) {
      scriptsDir = path.join(this.getProjectDir(workspacePath), 'scripts');
    } else {
      scriptsDir = path.join(this.homeDir, 'scripts');
    }
    if (!this.fs.existsSync(scriptsDir)) {
      return [];
    }
    return this.fs.readdirSync(scriptsDir).filter(f => f.endsWith('.arma'));
  }

  /**
   * Gets the script path.
   */
  getScriptPath(name: string): string {
    const globalPath = path.join(this.homeDir, 'scripts', name.endsWith('.arma') ? name : `${name}.arma`);
    if (this.fs.existsSync(globalPath)) {
      return globalPath;
    }
    return globalPath;
  }

  /**
   * Gets the autoload scripts.
   */
  getAutoloadScripts(workspacePath?: string): string[] {
    const scripts: string[] = [];
    const globalSettings = this.loadGlobalSettings();
    const globalScripts = (globalSettings as Record<string, unknown>).autoloadScripts as string[] | undefined;
    if (globalScripts) {
      for (const name of globalScripts) {
        scripts.push(this.getScriptPath(name));
      }
    }
    if (workspacePath) {
      const projectSettings = this.loadProjectSettings(workspacePath);
      if (projectSettings.scripts) {
        for (const name of projectSettings.scripts) {
          const projectScriptPath = path.join(
            this.getProjectDir(workspacePath),
            'scripts',
            name.endsWith('.arma') ? name : `${name}.arma`,
          );
          scripts.push(projectScriptPath);
        }
      }
    }
    return scripts;
  }


  /**
   * List themes.
   */
  listThemes(): string[] {
    const builtIn = ['red', 'ice', 'green', 'purple', 'synthwave', 'midnight', 'pro'];
    const themesDir = path.join(this.homeDir, 'themes');
    if (!this.fs.existsSync(themesDir)) {
      return builtIn;
    }
    const customFiles = this.fs.readdirSync(themesDir).filter(f => f.endsWith('.json'));
    const customNames = customFiles.map(f => f.replace('.json', ''));
    const all = new Set([...builtIn, ...customNames]);
    return Array.from(all);
  }

  /**
   * Gets the theme path.
   */
  getThemePath(name: string): string {
    const customPath = path.join(this.homeDir, 'themes', `${name}.json`);
    if (this.fs.existsSync(customPath)) {
      return customPath;
    }
    return customPath;
  }

  /**
   * Gets the active theme.
   */
  getActiveTheme(workspacePath?: string): string {
    if (workspacePath) {
      const projectSettings = this.loadProjectSettings(workspacePath);
      if (projectSettings.theme) {
        return projectSettings.theme;
      }
    }
    const globalSettings = this.loadGlobalSettings();
    if (globalSettings.theme) {
      return globalSettings.theme;
    }
    return 'red';
  }


  /**
   * Gets the credential.
   */
  getCredential(key: string): string | undefined {
    const credPath = path.join(this.homeDir, 'credentials', key);
    if (!this.fs.existsSync(credPath)) {
      return undefined;
    }
    try {
      return this.fs.readFileSync(credPath).trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Sets the credential.
   */
  setCredential(key: string, value: string): void {
    const credDir = path.join(this.homeDir, 'credentials');
    if (!this.fs.existsSync(credDir)) {
      this.fs.mkdirSync(credDir, { recursive: true });
      try { fs.chmodSync(credDir, 0o700); } catch {}
    }
    const credPath = path.join(credDir, key);
    this.fs.writeFileSync(credPath, value);
    try { fs.chmodSync(credPath, 0o600); } catch {}
  }

  /**
   * Delete credential.
   */
  deleteCredential(key: string): void {
    const credPath = path.join(this.homeDir, 'credentials', key);
    if (this.fs.existsSync(credPath)) {
      this.fs.unlinkSync(credPath);
    }
  }

  /**
   * List credential keys.
   */
  listCredentialKeys(): string[] {
    const credDir = path.join(this.homeDir, 'credentials');
    if (!this.fs.existsSync(credDir)) {
      return [];
    }
    return this.fs.readdirSync(credDir);
  }
}
