import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { simpleGit } from 'simple-git';
import { PluginRegistry } from './PluginRegistry.js';
import type { LoadedPlugin, PluginCommand, PluginInstallEntry } from './PluginRegistry.js';

// Re-export types for downstream consumers
export type { PluginManifest, PluginCommand, LoadedPlugin, PluginInstallEntry } from './PluginRegistry.js';

/** Loads, installs, and manages Armament plugins from local paths, git repos, or marketplaces. */
export class PluginLoader {
  private _registry: PluginRegistry;
  private _pluginsDir: string;
  private _cacheDir: string;

  constructor(armamentDir?: string) {
    const base = armamentDir ?? join(homedir(), '.armament');
    this._pluginsDir = join(base, 'plugins');
    this._cacheDir = join(this._pluginsDir, 'cache');
    const manifestPath = join(this._pluginsDir, 'installed.json');
    this._registry = new PluginRegistry(this._pluginsDir, manifestPath);
  }

  /**
   * Gets the plugins.
   */
  get plugins(): Map<string, LoadedPlugin> { return this._registry.plugins; }
  /**
   * Gets the commands.
   */
  get commands(): Map<string, { plugin: string; command: PluginCommand }> { return this._registry.commands; }
  /**
   * Gets the plugins dir.
   */
  get pluginsDir(): string { return this._pluginsDir; }

  /**
   * Load all.
   */
  loadAll(): void {
    this._registry.clear();
    this._registry.loadFromManifest();
  }

  /**
   * Install.
   */
  async install(source: string): Promise<{ success: boolean; pluginId?: string; error?: string }> {
    mkdirSync(this._cacheDir, { recursive: true });

    if (source.startsWith('/') || source.startsWith('~')) {
      return this.installFromLocal(source.replace('~', homedir()));
    }

    if (source.includes('github.com') || source.includes('github.') || source.startsWith('git@')) {
      return this.installFromGit(source);
    }

    if (source.includes('@')) {
      return this.installFromMarketplace(source);
    }

    return { success: false, error: `Unknown source format: "${source}". Use name@marketplace, a git URL, or a local path.` };
  }

  /**
   * Uninstall.
   */
  uninstall(pluginId: string): boolean {
    const manifest = this._registry.readManifest();
    const entry = manifest.plugins[pluginId];
    if (!entry) return false;

    if (existsSync(entry.installPath)) {
      rmSync(entry.installPath, { recursive: true, force: true });
    }

    delete manifest.plugins[pluginId];
    this._registry.writeManifest(manifest);
    this._registry.unregisterPlugin(pluginId);

    return true;
  }

  /**
   * Gets the command content.
   */
  getCommandContent(commandName: string): string | null {
    return this._registry.getCommandContent(commandName);
  }

  /**
   * Gets the command with references.
   */
  getCommandWithReferences(commandName: string): string | null {
    return this._registry.getCommandWithReferences(commandName);
  }

  /**
   * Gets the reference.
   */
  getReference(pluginId: string, refName: string): string | null {
    return this._registry.getReference(pluginId, refName);
  }

  /**
   * Match command.
   */
  matchCommand(input: string): string | null {
    return this._registry.matchCommand(input);
  }

  /**
   * List plugins.
   */
  listPlugins(): { id: string; name: string; version: string; description: string; commands: string[] }[] {
    const result: { id: string; name: string; version: string; description: string; commands: string[] }[] = [];
    for (const [id, plugin] of this._registry.plugins) {
      result.push({
        id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description,
        commands: plugin.commands.map(c => c.name),
      });
    }
    return result;
  }


  private installFromLocal(localPath: string): { success: boolean; pluginId?: string; error?: string } {
    if (!existsSync(localPath)) {
      return { success: false, error: `Path does not exist: ${localPath}` };
    }

    const plugin = this._registry.loadPlugin(localPath, 'local');
    if (!plugin) {
      return { success: false, error: 'Not a valid plugin (missing .arma-plugin or .claude-plugin manifest)' };
    }

    const pluginId = plugin.manifest.name;
    const destDir = join(this._cacheDir, pluginId, plugin.manifest.version);
    mkdirSync(destDir, { recursive: true });
    cpSync(localPath, destDir, { recursive: true });

    const manifest = this._registry.readManifest();
    manifest.plugins[pluginId] = {
      installPath: destDir,
      version: plugin.manifest.version,
      installedAt: new Date().toISOString(),
      source: 'local',
    };
    this._registry.writeManifest(manifest);

    this._registry.registerPlugin(pluginId, { ...plugin, installPath: destDir });
    return { success: true, pluginId };
  }

  private async installFromGit(repoUrl: string): Promise<{ success: boolean; pluginId?: string; error?: string }> {
    const tmpDir = join(this._cacheDir, '.tmp-clone');
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });

    try {
      const git = simpleGit();
      await git.clone(repoUrl, tmpDir, ['--depth', '1']);
    } catch (err: any) {
      return { success: false, error: `Git clone failed: ${err.message}` };
    }

    const pluginDirs = this._registry.findPluginDirs(tmpDir);
    if (pluginDirs.length === 0) {
      rmSync(tmpDir, { recursive: true, force: true });
      return { success: false, error: 'No valid plugins found in repository' };
    }

    const installed: string[] = [];
    for (const dir of pluginDirs) {
      const result = this.installFromLocal(dir);
      if (result.success && result.pluginId) {
        const m = this._registry.readManifest();
        if (m.plugins[result.pluginId]) {
          m.plugins[result.pluginId].source = 'git';
          m.plugins[result.pluginId].repository = repoUrl;
          this._registry.writeManifest(m);
        }
        installed.push(result.pluginId);
      }
    }

    rmSync(tmpDir, { recursive: true, force: true });

    if (installed.length === 0) {
      return { success: false, error: 'No plugins could be installed from repository' };
    }
    return { success: true, pluginId: installed[0] };
  }

  private async installFromMarketplace(source: string): Promise<{ success: boolean; pluginId?: string; error?: string }> {
    const [name, marketplace] = source.split('@');
    const { readFileSync } = await import('node:fs');

    const mpPath = join(this._pluginsDir, 'marketplaces.json');
    if (!existsSync(mpPath)) {
      return { success: false, error: `Marketplace "${marketplace}" not found. Use /plugin marketplace add <owner/repo> first.` };
    }

    let known: Record<string, { repo: string }>;
    try {
      known = JSON.parse(readFileSync(mpPath, 'utf-8'));
    } catch {
      return { success: false, error: 'Could not read marketplace config' };
    }

    const entry = known[marketplace];
    if (!entry?.repo) {
      return { success: false, error: `Marketplace "${marketplace}" not registered. Use /plugin marketplace add <owner/repo>` };
    }

    const repoUrl = entry.repo.includes('://') ? entry.repo : `https://github.com/${entry.repo}`;

    const tmpDir = join(this._cacheDir, '.tmp-marketplace');
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });

    try {
      const git = simpleGit();
      await git.clone(repoUrl, tmpDir, ['--depth', '1']);
    } catch (err: any) {
      return { success: false, error: `Clone failed: ${err.message}` };
    }

    const searchDirs = [
      join(tmpDir, 'plugins', name),
      join(tmpDir, name),
      tmpDir,
    ];

    for (const dir of searchDirs) {
      if (existsSync(join(dir, '.arma-plugin')) || existsSync(join(dir, '.claude-plugin'))) {
        const result = this.installFromLocal(dir);
        rmSync(tmpDir, { recursive: true, force: true });
        if (result.success && result.pluginId) {
          const m = this._registry.readManifest();
          if (m.plugins[result.pluginId]) {
            m.plugins[result.pluginId].source = 'git';
            m.plugins[result.pluginId].repository = repoUrl;
            this._registry.writeManifest(m);
          }
        }
        return result;
      }
    }

    rmSync(tmpDir, { recursive: true, force: true });
    return { success: false, error: `Plugin "${name}" not found in marketplace "${marketplace}"` };
  }
}
