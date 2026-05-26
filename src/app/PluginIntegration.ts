import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { PluginLoader } from '../plugins/index.js';
import type { TuiRenderer } from './TuiRenderer.js';
import type { ChannelAgent } from '../providers/index.js';

/** Interface for PluginIntegrationDeps.
 * @property {PluginLoader} pluginLoader - Description of pluginLoader.
 */
export interface PluginIntegrationDeps {
  pluginLoader: PluginLoader;
  getTui: () => TuiRenderer | null;
  getChannelAgents: () => Map<string, ChannelAgent>;
  joinChannel: (name: string) => void;
}

/** Class representing PluginIntegration. */
export class PluginIntegration {
  private deps: PluginIntegrationDeps;

  constructor(deps: PluginIntegrationDeps) {
    this.deps = deps;
  }

  /**
   * Inject plugin context.
   */
  injectPluginContext(commandName: string, content: string, args: string[]): void {
    const channelName = `#${commandName}`;

    this.deps.joinChannel(channelName);

    const userInput = args.length > 0
      ? `Run the /${commandName} skill with these arguments: ${args.join(' ')}`
      : `Run the /${commandName} skill`;

    this.deps.getTui()?.writeMessage('system', 'plugin', `Activating skill: ${commandName}`, channelName);

    const poll = setInterval(() => {
      const agent = this.deps.getChannelAgents().get(channelName);
      if (agent) {
        clearInterval(poll);
        agent.sendMessage(`[SKILL CONTEXT — /${commandName}]\n\n${content}\n\n---\n\nUser request: ${userInput}`)
          .then((response) => {
            if (response) {
              this.deps.getTui()?.writeMessage('agent', agent.nick, response, channelName);
            }
          })
          .catch((err: Error) => {
            this.deps.getTui()?.writeMessage('system', 'error', `Skill error: ${err.message}`, channelName);
          });
      }
    }, 100);

    // Timeout after 10s if agent never connects
    setTimeout(() => {
      clearInterval(poll);
      if (!this.deps.getChannelAgents().get(channelName)) {
        this.deps.getTui()?.writeMessage('system', 'error',
          `No provider available to run skill. Configure one with /config`, channelName);
      }
    }, 10000);
  }

  /**
   * Handle plugin command.
   */
  async handlePluginCommand(args: string[]): Promise<void> {
    const sub = args[0]?.toLowerCase();
    const channel = '#control';
    const tui = this.deps.getTui();

    if (!sub || sub === 'list') {
      const plugins = this.deps.pluginLoader.listPlugins();
      if (plugins.length === 0) {
        tui?.writeMessage('system', 'plugin', 'No plugins installed. Use /plugin install <source>', channel);
        return;
      }
      const lines = plugins.map(p =>
        `  ${p.name} v${p.version} — ${p.description}\n    commands: ${p.commands.map(c => '/' + c).join(', ')}`
      );
      tui?.writeMessage('system', 'plugin', `Installed plugins:\n${lines.join('\n')}`, channel);
      return;
    }

    if (sub === 'install') {
      const source = args.slice(1).join(' ').trim();
      if (!source) {
        tui?.writeMessage('system', 'error', 'Usage: /plugin install <name@marketplace | git-url | /path>', channel);
        return;
      }
      tui?.writeMessage('system', 'plugin', `Installing "${source}"...`, channel);
      const result = await this.deps.pluginLoader.install(source);
      if (result.success) {
        tui?.writeMessage('system', 'plugin', `Installed "${result.pluginId}". Commands now available.`, channel);
        tui?.writeMessage('system', 'plugin',
          `${this.deps.pluginLoader.plugins.get(result.pluginId!)?.commands.map(c => '/' + c.name).join(', ') ?? ''}`, channel);
      } else {
        tui?.writeMessage('system', 'error', `Install failed: ${result.error}`, channel);
      }
      return;
    }

    if (sub === 'uninstall' || sub === 'remove') {
      const pluginId = args[1];
      if (!pluginId) {
        tui?.writeMessage('system', 'error', 'Usage: /plugin uninstall <plugin-name>', channel);
        return;
      }
      const removed = this.deps.pluginLoader.uninstall(pluginId);
      if (removed) {
        tui?.writeMessage('system', 'plugin', `Uninstalled "${pluginId}"`, channel);
      } else {
        tui?.writeMessage('system', 'error', `Plugin "${pluginId}" not found`, channel);
      }
      return;
    }

    if (sub === 'run') {
      this.showPluginRunPicker(args.slice(1));
      return;
    }

    if (sub === 'info') {
      const pluginId = args[1];
      if (!pluginId) {
        tui?.writeMessage('system', 'error', 'Usage: /plugin info <plugin-name>', channel);
        return;
      }
      const plugin = this.deps.pluginLoader.plugins.get(pluginId);
      if (!plugin) {
        tui?.writeMessage('system', 'error', `Plugin "${pluginId}" not found`, channel);
        return;
      }
      const info = [
        `Name: ${plugin.manifest.name}`,
        `Version: ${plugin.manifest.version}`,
        `Description: ${plugin.manifest.description}`,
        plugin.manifest.author ? `Author: ${plugin.manifest.author.name}` : '',
        plugin.manifest.repository ? `Repository: ${plugin.manifest.repository}` : '',
        `Commands: ${plugin.commands.map(c => '/' + c.name).join(', ')}`,
        `References: ${[...plugin.references.keys()].join(', ') || 'none'}`,
        `Path: ${plugin.installPath}`,
      ].filter(Boolean).join('\n');
      tui?.writeMessage('system', 'plugin', info, channel);
      return;
    }

    if (sub === 'marketplace') {
      const action = args[1]?.toLowerCase();
      if (action === 'add' && args[2]) {
        const repo = args[2];
        const name = repo.split('/').pop() ?? repo;
        this.addMarketplace(name, repo);
        tui?.writeMessage('system', 'plugin', `Added marketplace "${name}" → github.com/${repo}`, channel);
      } else if (action === 'list') {
        const marketplaces = this.listMarketplaces();
        if (marketplaces.length === 0) {
          tui?.writeMessage('system', 'plugin', 'No marketplaces configured', channel);
        } else {
          const lines = marketplaces.map(m => `  ${m.name} → ${m.repo}`);
          tui?.writeMessage('system', 'plugin', `Marketplaces:\n${lines.join('\n')}`, channel);
        }
      } else {
        tui?.writeMessage('system', 'error', 'Usage: /plugin marketplace add <owner/repo> | /plugin marketplace list', channel);
      }
      return;
    }

    if (sub === 'reload') {
      this.deps.pluginLoader.loadAll();
      const count = this.deps.pluginLoader.plugins.size;
      tui?.writeMessage('system', 'plugin', `Reloaded ${count} plugin(s)`, channel);
      return;
    }

    tui?.writeMessage('system', 'error',
      'Usage: /plugin [list|install|uninstall|info|marketplace|reload]', channel);
  }

  /**
   * Add marketplace.
   */
  addMarketplace(name: string, repo: string): void {
    const configDir = path.join(homedir(), '.armament', 'plugins');
    fs.mkdirSync(configDir, { recursive: true });
    const mpPath = path.join(configDir, 'marketplaces.json');
    let data: Record<string, { repo: string }> = {};
    try {
      if (fs.existsSync(mpPath)) {
        data = JSON.parse(fs.readFileSync(mpPath, 'utf-8'));
      }
    } catch {}
    data[name] = { repo };
    fs.writeFileSync(mpPath, JSON.stringify(data, null, 2));
  }

  /**
   * List marketplaces.
   */
  listMarketplaces(): { name: string; repo: string }[] {
    const results: { name: string; repo: string }[] = [];
    const armaPath = path.join(homedir(), '.armament', 'plugins', 'marketplaces.json');
    try {
      if (fs.existsSync(armaPath)) {
        const data = JSON.parse(fs.readFileSync(armaPath, 'utf-8'));
        for (const [name, entry] of Object.entries(data)) {
          results.push({ name, repo: (entry as { repo: string }).repo });
        }
      }
    } catch {}
    return results;
  }

  /**
   * Show plugin run picker.
   */
  showPluginRunPicker(extraArgs: string[]): void {
    const tui = this.deps.getTui();
    if (!tui) return;
    const allCommands: Array<{ name: string; description: string; pluginName: string }> = [];
    for (const [, plugin] of this.deps.pluginLoader.plugins) {
      for (const cmd of plugin.commands) {
        allCommands.push({
          name: cmd.name,
          description: `${plugin.manifest.name} — ${cmd.description || cmd.name}`,
          pluginName: plugin.manifest.name,
        });
      }
    }
    if (allCommands.length === 0) {
      tui.writeMessage('system', 'plugin', 'No plugin commands available. Use /plugin install <source> first.');
      return;
    }
    const items = allCommands.map(c => ({
      name: c.name,
      description: c.description,
      category: 'config' as const,
    }));
    tui.showPicker('plugin commands', items, (selected) => {
      const content = this.deps.pluginLoader.getCommandWithReferences(selected.name);
      if (content) {
        this.injectPluginContext(selected.name, content, extraArgs);
      }
    });
  }
}
