#!/usr/bin/env node

import { Command } from 'commander';
import { ArmamentApp } from './app/ArmamentApp.js';
import { renderBanner, renderLoadingScreen } from './rendering/ansi/banner.js';
import { RESET } from './rendering/ansi/colors.js';
import { DebugMode } from './debug/DebugMode.js';
import { runDebugShell } from './debug/DebugShell.js';
import { UserConfig } from './config/UserConfig.js';
import { getGlobalEventBus } from './app/EventBus.js';
import { getPermissionStore } from './app/PermissionStore.js';
import { getDefaultTools } from './providers/BuiltinTools.js';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join as pathJoin, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { cwd } from 'process';
import { armaDataDir, getNotesPath } from './app/ChannelPaths.js';

interface CliArgs {
  agent?: string;
  model?: string;
  provider?: string;
  profile?: string;
  region?: string;
  verbose?: boolean;
  compact?: boolean;
  noColor?: boolean;
  noStream?: boolean;
  noTui?: boolean;
  maxBudget?: number;
  maxTurns?: number;
  temperature?: number;
  systemPrompt?: string;
  prompt?: string;
  context?: string;
  outputFormat?: string;
  setup?: boolean;
  version?: boolean;
  help?: boolean;
  debug?: boolean;
  web?: boolean;
  theme?: string;
  clearSession?: boolean;
  godMode?: boolean;
  debugArgs?: string[];
  jsonFlag?: boolean;
  shell?: boolean;
}

function parseArgs(): CliArgs {
  const program = new Command();

  program
    .allowExcessArguments(true)
    .name('arma')
    .description('Enterprise AI terminal — ACiD/BBS-style interactive agent loop CLI')
    .configureHelp({ showGlobalOptions: false })
    .helpOption(false)
    .option('-a, --agent <name>', 'Agent name')
    .option('-m, --model <id>', 'Model to use')
    .option('--provider <type>', 'Provider (anthropic|openai|bedrock|ollama|gemini|openrouter|replicate)')
    .option('--profile <name>', 'AWS profile')
    .option('--region <region>', 'AWS region')
    .option('-v, --verbose', 'Show thinking + tool details')
    .option('-c, --compact', 'Compact output')
    .option('--no-color', 'Disable ANSI colors')
    .option('--no-tui', 'Disable TUI (use simple REPL)')
    .option('--theme <name>', 'Color theme (red|fire|ice|green|purple|synthwave|midnight|pro|random)')
    .option('--no-stream', 'Disable streaming')
    .option('--max-budget <usd>', 'Budget limit per session', parseFloat)
    .option('--max-turns <n>', 'Max conversation turns', parseInt)
    .option('-t, --temperature <f>', 'Sampling temperature', parseFloat)
    .option('-s, --system-prompt <p>', 'System prompt text')
    .option('-p, --prompt <prompt>', 'Non-interactive: run prompt and exit')
    .option('--context <name>', 'Load a saved context at startup')
    .option('--load-context <name>', 'Load a saved context at startup (alias)')
    .option('--output-format <fmt>', 'Output format (text|json|stream-json)')
    .option('--setup', 'Run interactive setup wizard')
    .option('--clear-session', 'Clear current session data')
    .option('--version', 'Show version')
    .option('-h, --help', 'Show this help')
    .option('--debug', 'Enable debug mode (with optional command: arma --debug <subsystem> <command>)')
    .option('--json', 'JSON output mode (default in debug mode)')
    .option('--shell', 'Start interactive debug shell (armament subsystem CLI)')
    .option('--web', 'Start web UI server (armament-web-ui)')
    .option('--godmode', 'Enable god mode for all channels — bypasses all permission prompts (temporary, resets on restart)');

  program.parse(process.argv);

  const opts = program.opts();

  const args: CliArgs = {};
  if (opts.agent !== undefined) args.agent = opts.agent;
  if (opts.model !== undefined) args.model = opts.model;
  if (opts.provider !== undefined) args.provider = opts.provider;
  if (opts.profile !== undefined) args.profile = opts.profile;
  if (opts.region !== undefined) args.region = opts.region;
  if (opts.verbose === true) args.verbose = true;
  if (opts.compact === true) args.compact = true;
  // Commander handles --no-X flags by setting the positive form to false
  if (opts.color === false) args.noColor = true;
  if (opts.stream === false) args.noStream = true;
  if (opts.tui === false) args.noTui = true;
  if (opts.theme !== undefined) args.theme = opts.theme;
  if (opts.maxBudget !== undefined) args.maxBudget = opts.maxBudget;
  if (opts.maxTurns !== undefined) args.maxTurns = opts.maxTurns;
  if (opts.temperature !== undefined) args.temperature = opts.temperature;
  if (opts.systemPrompt !== undefined) args.systemPrompt = opts.systemPrompt;
  if (opts.prompt !== undefined) args.prompt = opts.prompt;
  if (opts.context !== undefined) args.context = opts.context;
  if (opts.loadContext !== undefined) args.context = opts.loadContext;
  if (opts.outputFormat !== undefined) args.outputFormat = opts.outputFormat;
  if (opts.setup === true) args.setup = true;
  if (opts.clearSession === true) args.clearSession = true;
  if (opts.version === true) args.version = true;
  if (opts.help === true) args.help = true;
  if (opts.debug === true) args.debug = true;
  if (opts.json === true) args.jsonFlag = true;
  if (opts.web === true) args.web = true;
  // Capture remaining args after flags (for --debug channel list etc.)
  if (opts.shell === true) { args.shell = true; args.noTui = true; }
  args.debugArgs = program.args;
  if (opts.web) args.noTui = true; // --web implies --no-tui

  return args;
}

function printHelp(noColor: boolean): void {
  const helpThemes = ['red', 'fire', 'ice', 'green', 'purple', 'synthwave', 'midnight', 'pro'];
  const randomTheme = helpThemes[Math.floor(Math.random() * helpThemes.length)];
  process.stdout.write(renderBanner(randomTheme, noColor) + '\n');
  process.stdout.write('\nUsage: arma [options]\n');
  process.stdout.write('\nOptions:\n');
  process.stdout.write('  -a, --agent <name>        Agent name\n');
  process.stdout.write('  -m, --model <id>          Model to use\n');
  process.stdout.write('      --provider <type>     Provider (anthropic|openai|bedrock|ollama|gemini|openrouter|replicate)\n');
  process.stdout.write('      --profile <name>      AWS profile\n');
  process.stdout.write('      --region <region>     AWS region\n');
  process.stdout.write('  -v, --verbose             Show thinking + tool details\n');
  process.stdout.write('  -c, --compact             Compact output\n');
  process.stdout.write('      --no-color            Disable ANSI colors\n');
  process.stdout.write('      --no-tui              Disable TUI (use simple REPL)\n');
  process.stdout.write('      --theme <name>        Color theme (red|fire|ice|green|purple|synthwave|midnight|pro|random)\n');
  process.stdout.write('      --no-stream           Disable streaming\n');
  process.stdout.write('      --max-budget <usd>    Budget limit per session\n');
  process.stdout.write('      --max-turns <n>       Max conversation turns\n');
  process.stdout.write('  -t, --temperature <f>     Sampling temperature\n');
  process.stdout.write('  -s, --system-prompt <p>   System prompt text\n');
  process.stdout.write('  -p, --prompt <prompt>     Non-interactive: run prompt and exit\n');
  process.stdout.write('      --context <name>      Load a saved context at startup\n');
  process.stdout.write('      --output-format <fmt> Output format (text|json|stream-json)\n');
  process.stdout.write('      --setup               Run interactive setup wizard\n');
  process.stdout.write('      --version             Show version\n');
  process.stdout.write('  -h, --help                Show this help\n');
  process.stdout.write('\n');
  process.stdout.write('IRC-style commands (inside REPL):\n');
  process.stdout.write('  /join <name>       Create/switch to agent channel\n');
  process.stdout.write('  /part [name]       Leave/close an agent channel\n');
  process.stdout.write('  /spawn <name>      Spawn a new agent in its own channel\n');
  process.stdout.write('  /kill <name>       Kill a running agent\n');
  process.stdout.write('  /list              List all channels/agents\n');
  process.stdout.write('  /switch <n|name>   Switch active channel (Alt+1..9)\n');
  process.stdout.write('  /msg <agent> <m>   Send message to specific agent\n');
  process.stdout.write('  /whois <agent>     Show agent info (model, tokens, cost)\n');
  process.stdout.write('  /nick <name>       Rename current agent\n');
  process.stdout.write('  /topic <prompt>    Set system prompt for current channel\n');
  process.stdout.write('\n');
  process.stdout.write('Standard commands:\n');
  process.stdout.write('  /help /quit /clear /status /tools /model /cost /context\n');
  process.stdout.write('  /history /undo /retry /save_context /load_context /plan /run\n');
  process.stdout.write('  /compact /thinking /verbose /permissions /mcp /theme /config /set\n');
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp(args.noColor ?? false);
    process.exit(0);
  }

  if (args.version) {
    process.stdout.write('armament v0.1.0\n');
    process.exit(0);
  }

  if (args.debug) {
    const debug = DebugMode.instance();
    debug.activate();
  }

  // Lazy-loaded web server
  let _startWebServer: ((deps: any, opts?: any) => Promise<void>) | null = null;
  if (args.web) {
    const scriptDir = pathDirname(fileURLToPath(import.meta.url));
    try {
      const mod = await import('armament-web-ui');
      _startWebServer = mod.startWebServer;
    } catch {
      const candidates = [
        pathJoin(process.cwd(), '..', 'armament-web-ui', 'dist', 'server', 'index.js'),
        pathJoin(scriptDir, '..', '..', '..', 'armament-web-ui', 'dist', 'server', 'index.js'),
        pathJoin(scriptDir, '..', 'armament-web-ui', 'dist', 'server', 'index.js'),
      ];
      for (const entry of candidates) {
        if (!existsSync(entry)) continue;
        try { const mod = await import(entry); _startWebServer = mod.startWebServer; break; } catch {}
      }
      if (!_startWebServer) {
        process.stderr.write('armament-web-ui not found. Clone + build it first.\n');
        process.exit(1);
      }
    }
  }

  if (args.clearSession) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sessionDir = path.join(armaDataDir(), 'sessions');
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      process.stdout.write('Session cleared.\n');
    } else {
      process.stdout.write('No session to clear.\n');
    }
    process.exit(0);
  }

  const userConfig = UserConfig.instance();
  const THEME_NAMES = ['red', 'fire', 'ice', 'green', 'purple', 'synthwave', 'midnight', 'pro'];
  const configuredTheme = args.theme ?? userConfig.theme;
  const isValidTheme = configuredTheme && THEME_NAMES.includes(configuredTheme);
  const theme = (configuredTheme === 'random' || !configuredTheme || !isValidTheme)
    ? THEME_NAMES[Math.floor(Math.random() * THEME_NAMES.length)]
    : configuredTheme;

  const repl = new ArmamentApp({
    agentName: args.agent ?? 'armament',
    verbose: args.verbose ?? false,
    compact: args.compact ?? false,
    noColor: args.noColor ?? false,
    noTui: args.noTui ?? false,
    streaming: !(args.noStream ?? false),
    maxBudget: args.maxBudget ?? userConfig.budget,
    maxTurns: args.maxTurns ?? Infinity,
    theme,
    providers: userConfig.providers,
    defaultProvider: userConfig.defaultProvider,
    defaultModel: userConfig.defaultModel ?? userConfig.model,
    modelConfig: {
      temperature: args.temperature ?? 0.7,
      maxTokens: 16384,
      topP: 1.0,
      stop: [],
    },
    systemPrompt: args.systemPrompt,
  });

  // Global god mode from CLI flag
  if (args.godMode) {
    getPermissionStore().setGlobalGodMode(true);
  }

  if (args.setup) {
    await repl.runSetupWizard();
    process.exit(0);
  }

  if (args.context) {
    try {
      repl.loadContext(args.context);
    } catch (err: unknown) {
      process.stderr.write(`Failed to load context: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  }

  if (args.prompt) {
    const result = await repl.runNonInteractive();
    process.stdout.write(result + '\n');
    process.exit(0);
  }

  // Start web server after app is initialized
  if (_startWebServer) {
    (globalThis as any).__armamentWebUrl = 'http://localhost:3584';
    await _startWebServer({
      getChannels: () => {
        const chs: { name: string; active: boolean; provider?: string; model?: string; agents?: number; children?: { id: string; label: string; status: string }[] }[] = [];
        const chAgents = (repl as any)._channelAgents;
        if (chAgents) {
          for (const [name, agent] of chAgents) {
            chs.push({ name, active: true, provider: agent?.providerType, model: agent?.model, agents: 1 });
          }
        }
        const chLifecycle = (repl as any)._channelLifecycle;
        if (chLifecycle) {
          const allChs = chLifecycle.getChannels?.() || [];
          for (const ch of allChs) {
            if (!chs.find(c => c.name === ch.name)) {
              chs.push({ name: ch.name, active: ch.active, agents: 0 });
            }
          }
        }
        // Group worker channels under their parent channels
        const parents = new Map<string, string[]>(); // parentId → workerIds
        for (const ch of chs) {
          if (ch.name.startsWith('#worker-') || ch.name.startsWith('worker-')) {
            // Find parent: the bare channel name
            const workerName = ch.name.replace(/^#/, '').replace(/^worker-/, '').replace(/-\d+$/, '');
            for (const parent of chs) {
              const parentBare = parent.name.replace(/^#/, '');
              if (parentBare === workerName || (parentBare && workerName.startsWith(parentBare))) {
                if (!parents.has(parent.name)) parents.set(parent.name, []);
                parents.get(parent.name)!.push(ch.name);
                break;
              }
            }
          }
        }
        // Remove workers from top-level and add as children
        const workerNames = new Set<string>();
        for (const [parentName, workers] of parents) {
          workerNames.add(parentName);
          for (const w of workers) {
            const parent = chs.find(c => c.name === w);
            if (parent) workerNames.add(w);
          }
        }
        // Attach children to parents
        for (const ch of chs) {
          if (parents.has(ch.name)) {
            const workerIds = parents.get(ch.name)!;
            ch.children = workerIds.map(id => {
              const worker = chs.find(c => c.name === id);
              const label = (worker?.name || id).replace(/^#?worker-/, '').replace(/-\d+$/, '').slice(0, 15);
              return { id, label, status: worker?.agents && worker.agents > 0 ? 'working' : 'idle' };
            });
          }
        }
        // Return only non-worker channels at top level
                // Filter out flow-spawned channels from chat sidebar
        const flowAgents = new Set<string>();
        try {
          const flowsDir = pathJoin(armaDataDir(), 'flows');
          if (existsSync(flowsDir)) {
            for (const d of readdirSync(flowsDir, { withFileTypes: true })) {
              if (!d.isDirectory() || d.name.startsWith('.')) continue;
              const jsonFile = pathJoin(flowsDir, d.name, `${d.name}.armaflow.json`);
              if (!existsSync(jsonFile)) continue;
              try {
                const fj = JSON.parse(readFileSync(jsonFile, 'utf-8'));
                for (const n of (fj.nodes || [])) {
                  if (n.type === 'spawn' && n.config?.agentName) {
                    flowAgents.add(`#${n.config.agentName}`);
                  }
                }
              } catch {}
            }
          }
        } catch {}
        // Populate children for flow channels from their JSON
        for (const ch of chs) {
          if (!ch.name.startsWith('#flow-')) continue;
          const flowName = ch.name.replace('#flow-', '');
          try {
            const f = pathJoin(armaDataDir(), 'flows', flowName, `${flowName}.armaflow.json`);
            const fj = JSON.parse(readFileSync(f, 'utf-8'));
            const kids: any[] = [];
            for (const n of (fj.nodes || [])) {
              if (n.type === 'spawn' && n.config?.agentName) {
                const agentChan = `#${n.config.agentName}`;
                const ac = chs.find(c => c.name === agentChan);
                if (ac) kids.push({ id: agentChan, label: n.config.agentName, status: (ac.agents && ac.agents > 0) ? 'working' : 'idle' });
              }
            }
            if (kids.length > 0) ch.children = kids;
          } catch {}
        }
        return chs.filter(c => !(c.name.startsWith('#worker-') || c.name.startsWith('worker-') || flowAgents.has(c.name)));
      },
      getMessages: (ch: string) => {
        const name = ch.startsWith('#') ? ch : `#${ch}`;
        const agent = (repl as any)._channelAgents?.get?.(name);
        if (agent) {
          const mm = agent._loop?.getMessageManager?.();
          if (mm) {
            const raw = mm.getMessages() || [];
            if (raw.length > 0) {
              return raw.map((m: any) => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                thinking: m.reasoning || m.thinking,
                tool_calls: m.tool_calls,
                timestamp: Date.now(),
              }));
            }
          }
        }
        return Array.from((repl as any).messages || []).filter((m: any) => {
          // Only return messages for this channel (or system messages)
          return m.channel === ch || !m.channel;
        });
      },
      getProviders: () => userConfig.providers ?? [],
      getConfig: () => ({ defaultModel: userConfig.defaultModel, defaultProvider: userConfig.defaultProvider, theme: userConfig.theme }),
      updateConfig: (cfg: any) => { if (cfg.providers) userConfig.set('providers', cfg.providers); },
      sendMessage: (ch: string, text: string) => {
        repl.joinChannel(ch);
        // Wait for agent to be ready before sending the message
        const readyPromise = (repl as any)._channelLifecycle?.getChannelReadyPromises?.()?.get?.(ch);
        if (readyPromise) {
          readyPromise.then(() => repl.handleInput(text)).catch(() => repl.handleInput(text).catch(() => {}));
        } else {
          repl.handleInput(text).catch(() => {});
        }
      },
      getChannelNotes: (ch: string) => {
        try { return readFileSync(getNotesPath(ch), 'utf-8'); }
        catch { return ''; }
      },
      saveChannelNotes: (ch: string, content: string) => {
        const notesPath = getNotesPath(ch);
        mkdirSync(pathDirname(notesPath), { recursive: true });
        writeFileSync(notesPath, content, 'utf-8');
      },
      getChannelTools: (ch: string) => {
        const name = ch.startsWith('#') ? ch : `#${ch}`;
        const agent = (repl as any)._channelAgents?.get?.(name);
        const registered: Set<string> = new Set();
        const registeredTools: { name: string; description: string }[] = [];
        if (agent?._loop) {
          const tools = agent._loop.getToolDefinitions?.() || agent._loop.getTools?.() || [];
          for (const t of tools) {
            const name = t.name || t.function?.name || '';
            if (name && !registered.has(name)) {
              registered.add(name);
              registeredTools.push({ name, description: t.description || t.function?.description || '' });
            }
          }
        }
        // Merge catalog tools with registered tools
        const allTools = new Map<string, { category: string; description: string }>();
        // Add registered tools first (as 'default' category)
        for (const t of registeredTools) {
          allTools.set(t.name, { category: 'default', description: t.description });
        }
        // Add catalog tools (overwrites or adds)
        try {
          const catalog = (repl as any)._services?.catalogManager?.catalog;
          if (catalog) {
            const all = catalog.getCategorySummaries?.() || [];
            for (const cat of all) {
              for (const name of cat.tools || []) {
                if (!allTools.has(name)) {
                  allTools.set(name, { category: cat.category || 'other', description: cat.description || '' });
                } else {
                  // Update category if registered
                  allTools.get(name)!.category = cat.category || 'other';
                }
              }
            }
          }
        } catch {}
        return Array.from(allTools.entries()).map(([name, info]) => ({
          name,
          category: info.category,
          description: info.description,
          enabled: registered.has(name),
        }));
      },
      toggleTool: (ch: string, toolName: string, enabled: boolean) => {
        const name = ch.startsWith('#') ? ch : `#${ch}`;
        const agent = (repl as any)._channelAgents?.get?.(name);
        if (!agent) return;
        if (enabled) {
          try {
            const catalog = (repl as any)._services?.catalogManager?.catalog;
            if (catalog) {
              const registry = (catalog as any)._fullRegistry;
              const tool = registry?.get?.(toolName) || catalog.getActiveTool?.(toolName);
              if (tool) { agent.registerTool(tool); return; }
            }
            const defaults = getDefaultTools();
            const found = defaults.find((t: any) => t.name === toolName);
            if (found) agent.registerTool(found);
          } catch {}
        } else {
          try { agent.deregisterTool(toolName); } catch {}
        }
      },
      listWorkspace: (ch: string, dir?: string) => {
        const bare = ch.startsWith('#') ? ch.slice(1) : ch;
        const base = pathJoin(armaDataDir(), 'channels', bare, 'workspace');
        const target = dir ? pathJoin(base, dir) : base;
        try {
          const entries = readdirSync(target, { withFileTypes: true });
          return entries.map(e => ({
            name: e.name,
            path: (dir ? dir + '/' + e.name : e.name),
            type: e.isDirectory() ? 'dir' as const : 'file' as const,
            size: e.isFile() ? (() => { try { return readFileSync(pathJoin(target, e.name)).length; } catch { return 0; } })() : undefined,
          }));
        } catch { return []; }
      },
      readWorkspaceFile: (ch: string, filePath: string) => {
        const bare = ch.startsWith('#') ? ch.slice(1) : ch;
        const full = pathJoin(armaDataDir(), 'channels', bare, 'workspace', filePath);
        try { return readFileSync(full, 'utf-8'); }
        catch { return ''; }
      },
      writeWorkspaceFile: (ch: string, filePath: string, content: string) => {
        const bare = ch.startsWith('#') ? ch.slice(1) : ch;
        const full = pathJoin(armaDataDir(), 'channels', bare, 'workspace', filePath);
        try { mkdirSync(pathDirname(full), { recursive: true }); writeFileSync(full, content, 'utf-8'); }
        catch {}
      },
      addWorkspace: (ch: string, dir: string) => {
        const bare = ch.startsWith('#') ? ch.slice(1) : ch;
        const agent = (repl as any)._channelAgents?.get?.(`#${bare}`);
        if (!agent) return;
        const resolved = pathJoin(cwd(), dir);
        const dirsFile = pathJoin(armaDataDir(), 'channels', bare, 'workspace-dirs.json');
        let dirs: string[] = [];
        try { dirs = JSON.parse(readFileSync(dirsFile, 'utf-8')); } catch {}
        if (!dirs.includes(resolved)) {
          dirs.push(resolved);
          mkdirSync(pathDirname(dirsFile), { recursive: true });
          writeFileSync(dirsFile, JSON.stringify(dirs), 'utf-8');
        }
        // Re-set workspace with all folders
        const sandbox = pathJoin(armaDataDir(), 'channels', bare, 'workspace');
        const allWorkspaces = [sandbox, ...dirs].join(':');
        agent.setWorkspace?.(allWorkspaces);
        getGlobalEventBus().emit({ type: 'workspace:updated', channel: ch });
      },
      removeWorkspace: (ch: string, dir: string) => {
        const bare = ch.startsWith('#') ? ch.slice(1) : ch;
        const agent = (repl as any)._channelAgents?.get?.(`#${bare}`);
        if (!agent) return;
        const resolved = pathJoin(cwd(), dir);
        const dirsFile = pathJoin(armaDataDir(), 'channels', bare, 'workspace-dirs.json');
        let dirs: string[] = [];
        try { dirs = JSON.parse(readFileSync(dirsFile, 'utf-8')); } catch {}
        dirs = dirs.filter(d => d !== resolved);
        writeFileSync(dirsFile, JSON.stringify(dirs), 'utf-8');
        const sandbox = pathJoin(armaDataDir(), 'channels', bare, 'workspace');
        const allWorkspaces = [sandbox, ...dirs].join(':');
        agent.setWorkspace?.(allWorkspaces);
        getGlobalEventBus().emit({ type: 'workspace:updated', channel: ch });
      },
      getWorkspaceDirs: (ch: string) => {
        const bare = ch.startsWith('#') ? ch.slice(1) : ch;
        const dirsFile = pathJoin(armaDataDir(), 'channels', bare, 'workspace-dirs.json');
        try { return JSON.parse(readFileSync(dirsFile, 'utf-8')); } catch { return []; }
      },
      getFlowNames: () => {
        const dir = pathJoin(armaDataDir(), 'flows');
        if (!existsSync(dir)) return [];
        return readdirSync(dir, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.startsWith('.'))
          .map(d => d.name);
      },
      getFlowContent: (name: string) => {
        const flowDir = pathJoin(armaDataDir(), 'flows', name);
        const jsonFile = pathJoin(flowDir, `${name}.armaflow.json`);
        try { return readFileSync(jsonFile, 'utf-8'); } catch {}
        const legacyFile = pathJoin(flowDir, `${name}.armaflow`);
        try { return readFileSync(legacyFile, 'utf-8'); } catch {}
        return '';
      },
      saveFlowContent: (name: string, content: string) => {
        const dir = pathJoin(armaDataDir(), 'flows', name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(pathJoin(dir, `${name}.armaflow`), content, 'utf-8');
      },
      getFlowJson: (name: string) => {
        const file = pathJoin(armaDataDir(), 'flows', name, `${name}.armaflow.json`);
        try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return null; }
      },
      saveFlowJson: async (name: string, json: any) => {
        const dir = pathJoin(armaDataDir(), 'flows', name);
        mkdirSync(dir, { recursive: true });
        mkdirSync(pathJoin(dir, 'scripts'), { recursive: true });
        mkdirSync(pathJoin(dir, 'docs'), { recursive: true });
        writeFileSync(pathJoin(dir, `${name}.armaflow.json`), JSON.stringify(json, null, 2), 'utf-8');
        try {
          const mod = await import('./scripting/ArmaFlowCompiler.js');
          const commands = mod.decompileGraphToCommands(json.nodes || [], json.edges || [], {
            name: json.name, description: json.description, trigger: json.trigger, budget: json.budget,
          });
          const text = commands.map((c: any) => `/${c.command.replace(/_/g, '-')} ${c.args.join(' ')}`).join('\n');
          const header = `/name ${json.name}\n/description ${json.description || ''}\n/trigger ${json.trigger || 'manual'}\n`;
          const budgetLine = json.budget ? `/budget ${json.budget}\n` : '';
          const timeoutLine = json.timeout ? `/timeout ${json.timeout}\n` : '';
          const allowLine = (json.allowPaths && json.allowPaths.length > 0) ? `/allow ${json.allowPaths.join(' ')}\n` : '';
          writeFileSync(pathJoin(dir, `${name}.armaflow`), header + budgetLine + timeoutLine + allowLine + '\n' + text, 'utf-8');
        } catch {}
        try { (repl as any)._services?.flowRuntime?.refresh?.(); } catch {}
      },
      runFlow: (name: string) => {
        const flowRuntime = (repl as any)._services?.flowRuntime;
        flowRuntime?.run?.(name);
      },
      onEvent: (handler: (event: any) => void) => getGlobalEventBus().on(handler),
      listPermissions: () => getPermissionStore().listPending(),
      approvePermission: (id: string) => getPermissionStore().approve(id),
      denyPermission: (id: string) => getPermissionStore().deny(id),
      onPermissionRequest: (fn: () => void) => getPermissionStore().onNewRequest(fn),
      resolveAskUser: (id: string, response: string): boolean => {
        const pending = (repl as any)._pendingApprovals?.get?.(id);
        if (!pending) return false;
        (repl as any)._pendingApprovals.delete(id);
        pending.resolve(response);
        return true;
      },
      listDrift: (ch: string) => {
        try {
          return (repl as any)._services?.driftManager?.getStats?.(ch) || null;
        } catch { return null; }
      },
      getAllDrift: () => {
        try {
          return [];
        } catch { return []; }
      },
      getChannelStats: (ch: string) => {
        try {
          const name = ch.startsWith('#') ? ch : `#${ch}`;
          const agent = (repl as any)._channelAgents?.get?.(name);
          if (!agent) return null;
          const loop = agent._loop;
          if (!loop) return null;
          // Get usage from the agent's message manager
          const mm = loop.getMessageManager?.();
          if (!mm) return null;
          const messages = mm.getMessages() || [];
          let inputTokens = 0;
          let outputTokens = 0;
          let cacheRead = agent.cacheRead ?? 0;
          let cacheWrite = agent.cacheWrite ?? 0;
          // Sum up tokens from messages (rough estimate)
          for (const m of messages) {
            if (m.role === 'user') inputTokens += (m.content?.length || 0) / 4;
            else if (m.role === 'assistant') outputTokens += (m.content?.length || 0) / 4;
          }
          // Get actual usage stats if available
          const stats = (repl as any)._sessionState?.getUsageStats?.();
          if (stats) {
            inputTokens = stats.inputTokens || inputTokens;
            outputTokens = stats.outputTokens || outputTokens;
            cacheRead = stats.cacheRead ?? cacheRead;
            cacheWrite = stats.cacheWrite ?? cacheWrite;
          }
          const cost = (repl as any)._services?.calculateCost?.(agent.model, inputTokens, outputTokens, cacheRead, cacheWrite) || 0;
          return {
            provider: agent.providerType || 'anthropic',
            model: agent.model || 'unknown',
            tokensIn: Math.round(inputTokens),
            tokensOut: Math.round(outputTokens),
            cacheRead: Math.round(cacheRead),
            cacheWrite: Math.round(cacheWrite),
            cost: cost,
          };
        } catch { return null; }
      },
    }, { port: 3584 }).catch((err: unknown) => process.stderr.write(`Web UI error: ${err instanceof Error ? err.message : String(err)}\n`));
  }

  await repl.start();
  // Run debug shell if there are remaining args (arma debug channel list)
  if (args.shell || (args.debugArgs && args.debugArgs.length > 0)) {
    await runDebugShell(repl, args.debugArgs ?? [], args.jsonFlag ?? false);
    await repl.stop();
    process.exit(0);
  }
  if (_startWebServer) {
    // Web-only: keep process alive (no REPL)
    await new Promise(() => {});
  }
  await repl.waitForClose();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`${RESET}Fatal: ${err.message}\n`);
  process.exit(1);
});
