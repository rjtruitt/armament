import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Plugin manifest interface.
 */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: { name: string; email?: string };
  repository?: string;
  homepage?: string;
  keywords?: string[];
}

/**
 * Plugin command interface.
 */
export interface PluginCommand {
  name: string;
  description: string;
  keywords: string[];
  content: string;
}

/**
 * Loaded plugin interface.
 */
export interface LoadedPlugin {
  manifest: PluginManifest;
  commands: PluginCommand[];
  references: Map<string, string>;
  installPath: string;
  source: string;
}

/**
 * Plugin install entry interface.
 */
export interface PluginInstallEntry {
  installPath: string;
  version: string;
  installedAt: string;
  source: 'claude' | 'git' | 'local';
  repository?: string;
}

/**
 * Installed plugins file interface.
 */
export interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, PluginInstallEntry>;
}

/**
 * ARMAMENT_ADAPTER_PREAMBLE constant.
 */
export const ARMAMENT_ADAPTER_PREAMBLE = `
## Armament Environment Adapter

You are running inside **armament**, not Claude Code. Adjust these instructions:
- Instead of editing \`~/.claude.json\`, use the \`/mcp add <name> <config-json>\` command or call McpManager.addServer()
- Instead of \`/mcp\` (Claude Code's MCP panel), use armament's \`/mcp list\`, \`/mcp restart <name>\`, \`/mcp auth <name>\`
- Instead of \`ToolSearch\`, use \`/tools\` to check available tools
- Instead of \`AskUserQuestion\`, just ask the user directly in the channel
- File operations use the standard tool set (read_file, write_file, bash)
- After configuring an MCP server, use \`/mcp restart <name>\` instead of "restart Claude Code"

---

`;

/**
 * Registry that manages plugin storage, manifest I/O, plugin loading from disk,
 * command extraction, and reference resolution.
 */
export class PluginRegistry {
  private _plugins: Map<string, LoadedPlugin> = new Map();
  private _commands: Map<string, { plugin: string; command: PluginCommand }> = new Map();
  private _pluginsDir: string;
  private _manifestPath: string;

  constructor(pluginsDir: string, manifestPath: string) {
    this._pluginsDir = pluginsDir;
    this._manifestPath = manifestPath;
  }

  /**
   * Gets the plugins.
   */
  get plugins(): Map<string, LoadedPlugin> { return this._plugins; }
  /**
   * Gets the commands.
   */
  get commands(): Map<string, { plugin: string; command: PluginCommand }> { return this._commands; }

  /** Clear all loaded plugins and commands. */
  clear(): void {
    this._plugins.clear();
    this._commands.clear();
  }

  /** Load all plugins from the installed manifest file. */
  loadFromManifest(): void {
    if (!existsSync(this._manifestPath)) return;

    let manifest: InstalledPluginsFile;
    try {
      manifest = JSON.parse(readFileSync(this._manifestPath, 'utf-8'));
    } catch {
      return;
    }

    for (const [pluginId, entry] of Object.entries(manifest.plugins ?? {})) {
      if (!existsSync(entry.installPath)) continue;
      try {
        const plugin = this.loadPlugin(entry.installPath, pluginId);
        if (plugin) this.registerPlugin(pluginId, plugin);
      } catch {
      }
    }
  }

  /** Register a plugin into memory and index its commands. */
  registerPlugin(pluginId: string, plugin: LoadedPlugin): void {
    this._plugins.set(pluginId, plugin);
    for (const cmd of plugin.commands) {
      this._commands.set(cmd.name, { plugin: pluginId, command: cmd });
    }
  }

  /** Unregister a plugin and remove its commands from the index. */
  unregisterPlugin(pluginId: string): void {
    this._plugins.delete(pluginId);
    for (const [cmdName, cmd] of this._commands) {
      if (cmd.plugin === pluginId) this._commands.delete(cmdName);
    }
  }

  /** Load a plugin from a directory path. Returns null if not a valid plugin. */
  loadPlugin(pluginPath: string, sourceId: string): LoadedPlugin | null {
    let manifestDir = join(pluginPath, '.arma-plugin');
    if (!existsSync(manifestDir)) {
      manifestDir = join(pluginPath, '.claude-plugin');
    }
    if (!existsSync(manifestDir)) return null;

    const manifestFiles = readdirSync(manifestDir).filter(f => !f.startsWith('.'));
    if (manifestFiles.length === 0) return null;

    let manifest: PluginManifest;
    try {
      const manifestFile = manifestFiles.find(f => f.endsWith('.json')) ?? manifestFiles[0];
      manifest = JSON.parse(readFileSync(join(manifestDir, manifestFile), 'utf-8'));
    } catch {
      return null;
    }

    const commands: PluginCommand[] = [];
    const commandsDir = join(pluginPath, 'commands');
    if (existsSync(commandsDir)) {
      for (const file of readdirSync(commandsDir)) {
        if (!file.endsWith('.md')) continue;
        const content = readFileSync(join(commandsDir, file), 'utf-8');
        const parsed = this.parseCommandFile(file, content);
        if (parsed) commands.push(parsed);
      }
    }

    const references = new Map<string, string>();
    const refsDir = join(pluginPath, 'references');
    if (existsSync(refsDir)) {
      for (const file of readdirSync(refsDir)) {
        if (!file.endsWith('.md')) continue;
        const content = readFileSync(join(refsDir, file), 'utf-8');
        references.set(file.replace('.md', ''), content);
      }
    }

    return {
      manifest,
      commands,
      references,
      installPath: pluginPath,
      source: sourceId,
    };
  }

  /** Find plugin directories within a root directory. */
  findPluginDirs(rootDir: string): string[] {
    const found: string[] = [];

    if (existsSync(join(rootDir, '.claude-plugin'))) {
      found.push(rootDir);
      return found;
    }

    const pluginsSubdir = join(rootDir, 'plugins');
    if (existsSync(pluginsSubdir)) {
      for (const entry of readdirSync(pluginsSubdir)) {
        const dir = join(pluginsSubdir, entry);
        if (existsSync(join(dir, '.claude-plugin'))) {
          found.push(dir);
        }
      }
    }

    for (const entry of readdirSync(rootDir)) {
      if (entry.startsWith('.')) continue;
      const dir = join(rootDir, entry);
      try {
        if (existsSync(join(dir, '.claude-plugin'))) {
          found.push(dir);
        }
      } catch {
      }
    }

    return found;
  }

  /** Read the installed plugins manifest file. */
  readManifest(): InstalledPluginsFile {
    if (!existsSync(this._manifestPath)) {
      return { version: 1, plugins: {} };
    }
    try {
      return JSON.parse(readFileSync(this._manifestPath, 'utf-8'));
    } catch {
      return { version: 1, plugins: {} };
    }
  }

  /** Write the installed plugins manifest file. */
  writeManifest(manifest: InstalledPluginsFile): void {
    mkdirSync(this._pluginsDir, { recursive: true });
    writeFileSync(this._manifestPath, JSON.stringify(manifest, null, 2));
  }

  /** Parse a command markdown file into a PluginCommand. */
  parseCommandFile(filename: string, content: string): PluginCommand | null {
    const name = filename.replace('.md', '');
    let description = '';
    let keywords: string[] = [];

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const fm = frontmatterMatch[1];
      const descMatch = fm.match(/description:\s*"([^"]+)"/);
      if (descMatch) description = descMatch[1];
    }

    const kwSection = content.match(/## Keywords\n\n([^\n]+)/);
    if (kwSection) {
      keywords = kwSection[1].split(',').map(k => k.trim()).filter(Boolean);
    }

    return { name, description, keywords, content };
  }

  /** Get command content with the adapter preamble. */
  getCommandContent(commandName: string): string | null {
    const entry = this._commands.get(commandName);
    if (!entry) return null;
    return ARMAMENT_ADAPTER_PREAMBLE + entry.command.content;
  }

  /** Get command content with references listing. */
  getCommandWithReferences(commandName: string): string | null {
    const entry = this._commands.get(commandName);
    if (!entry) return null;

    const plugin = this._plugins.get(entry.plugin);
    if (!plugin) return null;

    let content = ARMAMENT_ADAPTER_PREAMBLE + entry.command.content;

    if (plugin.references.size > 0) {
      content += '\n\n---\n\n## Available Reference Documents\n\n';
      for (const [name] of plugin.references) {
        content += `- \`${name}\` — use "load reference ${name}" if needed\n`;
      }
    }

    return content;
  }

  /** Get a reference document by plugin ID and reference name. */
  getReference(pluginId: string, refName: string): string | null {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) return null;
    return plugin.references.get(refName) ?? null;
  }

  /** Match user input to a command by name or keywords. */
  matchCommand(input: string): string | null {
    const lower = input.toLowerCase().trim();
    for (const [name, entry] of this._commands) {
      if (lower === name || lower === `/${name}`) return name;
      for (const kw of entry.command.keywords) {
        if (lower.includes(kw.toLowerCase())) return name;
      }
    }
    return null;
  }
}
