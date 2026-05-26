/**
 * User configuration management for Armament.
 *
 * Singleton that persists user preferences (theme, model, providers, budget)
 * to ~/.armament/config.json and provides resolution logic for provider/model
 * selection.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { IProviderConfig } from '../core/index.js';

/** Session-level settings. */
export interface SessionSettings {
  streaming: boolean;
  autoSave: boolean;
  promptCaching: boolean;
  useThreads: boolean;
  maxTurns: number;
  workerMaxTurns: number;
  conversationTimeout: number;
  budgetEnabled: boolean;
  budgetAmount: number;
}

/** Context window settings. */
export interface ContextSettings {
  maxTokens: number;
  compactThreshold: number;
  recentMessages: number;
  maxSnapshots: number;
  autoCompact: boolean;
  strategy: 'summary' | 'sliding' | 'hybrid';
}

/** Workspace access settings. */
export interface WorkspaceSettings {
  mode: 'allow-all' | 'restricted' | 'readonly';
  allowedPaths: string[];
  denyPaths: string[];
  gitAutoCommit: boolean;
  fileWatcher: boolean;
  maxFileSize: number;
  encoding: 'utf-8' | 'ascii' | 'binary';
}

/** Display/theme settings. */
export interface DisplaySettings {
  theme: string;
  showThinking: boolean;
  showToolCalls: boolean;
  compact: boolean;
  verbose: boolean;
  timestamps: boolean;
  syntaxHighlighting: boolean;
  maxOutputLines: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'light' | 'normal' | 'bold';
  lineHeight: number;
  renderInterval: number;
}

/** Persisted user settings. */
export interface UserSettings {
  theme: string;
  model: string;
  budget: number;
  providers: IProviderConfig[];
  mcpServers: string[];
  mode: string;
  defaultProvider?: string;
  defaultModel?: string;
  mcpClientName?: string;
  session: SessionSettings;
  context: ContextSettings;
  workspace: WorkspaceSettings;
  display: DisplaySettings;
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'random',
  model: 'sonnet-4',
  budget: 5.0,
  providers: [],
  mcpServers: [],
  mode: 'normal',
  session: {
    streaming: true,
    autoSave: true,
    promptCaching: true,
    useThreads: false,
    maxTurns: 100,
    workerMaxTurns: 250,
    conversationTimeout: 60,
    budgetEnabled: true,
    budgetAmount: 10.0,
  },
  context: {
    maxTokens: 200000,
    compactThreshold: 0.85,
    recentMessages: 10,
    maxSnapshots: 50,
    autoCompact: true,
    strategy: 'summary',
  },
  workspace: {
    mode: 'allow-all',
    allowedPaths: ['src/', 'tests/', 'docs/'],
    denyPaths: ['.env', 'node_modules/'],
    gitAutoCommit: false,
    fileWatcher: false,
    maxFileSize: 1024,
    encoding: 'utf-8',
  },
  display: {
    theme: 'random',
    showThinking: true,
    showToolCalls: true,
    compact: false,
    verbose: false,
    timestamps: false,
    syntaxHighlighting: true,
    maxOutputLines: 500,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: 'normal',
    lineHeight: 1.5,
    renderInterval: 33,
  },
};

/**
 * THEME_NAMES constant.
 */
export const THEME_NAMES = ['red', 'fire', 'ice', 'green', 'purple', 'synthwave', 'midnight', 'pro'];

/**
 * Singleton managing user configuration persisted at ~/.armament/config.json.
 *
 * Handles provider/model resolution with fallback logic:
 * explicit opts > session defaults > first available provider.
 */
export class UserConfig {
  private static _instance: UserConfig | null = null;
  private _settings: UserSettings;
  private _configDir: string;
  private _configPath: string;
  private _noPersist = false;

  private constructor() {
    this._configDir = join(homedir(), '.armament');
    this._configPath = join(this._configDir, 'config.json');
    this._settings = this.load();
  }

  /** Returns the singleton instance, creating it on first access. */
  static instance(): UserConfig {
    if (!UserConfig._instance) {
      UserConfig._instance = new UserConfig();
    }
    return UserConfig._instance;
  }

  /**
   * Gets the settings.
   */
  get settings(): UserSettings { return { ...this._settings }; }
  /**
   * Gets the theme.
   */
  get theme(): string { return this._settings.theme; }
  /**
   * Gets the model.
   */
  get model(): string { return this._settings.model; }
  /**
   * Gets the budget.
   */
  get budget(): number { return this._settings.budget; }
  /**
   * Gets the providers.
   */
  get providers(): IProviderConfig[] { return this._settings.providers; }
  /**
   * Gets the default provider.
   */
  get defaultProvider(): string | undefined { return this._settings.defaultProvider; }
  /**
   * Gets the default model.
   */
  get defaultModel(): string | undefined { return this._settings.defaultModel; }
  /**
   * Gets the mcp client name.
   */
  get mcpClientName(): string { return this._settings.mcpClientName || 'Armament'; }

  /** Returns the default model for a given provider type. */
  getProviderDefaultModel(providerType: string): string | undefined {
    const provider = this._settings.providers.find(p => p.type === providerType);
    return provider?.defaultModel ?? (provider?.models?.[0] ? (typeof provider.models[0] === 'string' ? provider.models[0] : provider.models[0].name) : undefined);
  }

  /** Resolves a provider+model pair using cascade: explicit > defaults > first available. */
  resolveModel(opts?: { provider?: string; model?: string }): { provider: string; model: string } | null {
    if (opts?.model && opts?.provider) {
      return { provider: opts.provider, model: opts.model };
    }
    if (opts?.provider) {
      const model = this.getProviderDefaultModel(opts.provider);
      if (model) return { provider: opts.provider, model };
    }
    if (opts?.model) {
      const provider = this._settings.providers.find(p => p.models?.some(m => (typeof m === 'string' ? m : m.name) === opts.model!));
      if (provider) return { provider: provider.type, model: opts.model };
    }
    const dp = this._settings.defaultProvider;
    const dm = this._settings.defaultModel;
    if (dp && dm) return { provider: dp, model: dm };
    if (dp) {
      const model = this.getProviderDefaultModel(dp);
      if (model) return { provider: dp, model };
    }
    const first = this._settings.providers.find(p => p.models?.length > 0);
    if (first) {
      const firstModel = first.models?.[0];
      return { provider: first.type, model: first.defaultModel ?? (firstModel ? (typeof firstModel === 'string' ? firstModel : firstModel.name) : '') };
    }
    return null;
  }

  /**
   * Set.
   */
  set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    if (key === 'providers' && this._settings.providers.length > 0 && (value as any[]).length === 0) {
      process.stderr.write('[config] WARNING: providers being cleared!\n');
    }
    this._settings[key] = value;
    this.save();
  }

  /** Deep-get a nested config value via dotted path (e.g. 'session.maxRetries'). */
  getPath(path: string): any {
    const parts = path.split('.');
    let obj: any = this._settings;
    for (const part of parts) {
      if (obj == null) return undefined;
      obj = obj[part];
    }
    return obj;
  }

  /** Deep-set a nested config value via dotted path (e.g. 'session.maxRetries', 5). */
  setPath(path: string, value: any): void {
    const parts = path.split('.');
    let obj: any = this._settings;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] == null) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    this.save();
  }

  /**
   * Update.
   */
  update(partial: Partial<UserSettings>): void {
    Object.assign(this._settings, partial);
    this.save();
  }

  /**
   * Reset.
   */
  reset(): void {
    this._settings = { ...DEFAULT_SETTINGS };
    this.save();
  }

  /**
   * Gets the available themes.
   */
  getAvailableThemes(): string[] {
    return ['red', 'fire', 'ice', 'green', 'purple', 'synthwave', 'midnight', 'pro', 'random'];
  }

  private load(): UserSettings {
    try {
      if (existsSync(this._configPath)) {
        const raw = readFileSync(this._configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const merged = { ...DEFAULT_SETTINGS, ...parsed };
        if (Array.isArray(merged.providers)) {
          merged.providers = merged.providers.map((p: any) =>
            typeof p === 'string' ? { type: p, models: [] } : p
          );
        }
        return merged;
      }
    } catch {
    }
    return { ...DEFAULT_SETTINGS };
  }

  /** When true, set/setPath/update/reset skip writing to disk. */
  setNoPersist(val: boolean): void {
    this._noPersist = val;
  }

  private save(): void {
    if (this._noPersist) return;
    try {
      if (!existsSync(this._configDir)) {
        mkdirSync(this._configDir, { recursive: true });
      }
      writeFileSync(this._configPath, JSON.stringify(this._settings, null, 2) + '\n');
    } catch (e) {
      console.error('Failed to save config:', (e as Error).message);
    }
  }
}
