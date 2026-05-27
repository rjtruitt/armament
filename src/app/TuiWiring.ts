import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { UserConfig } from '../config/index.js';
import { logInfo, type IReplConfig } from '../core/index.js';
import { TuiRenderer as TuiMode } from './TuiRenderer.js';
import type { ProviderPool, CatalogManager, AskUserHandler } from '../providers/index.js';
import type { McpIntegration } from './McpIntegration.js';
import type { McpServer } from './McpManager.js';
import type { SessionPersistence, IChannelManifestEntry, IChannelStateFile } from '../session/index.js';
import type { SessionState } from './SessionState.js';
import type { DriftManager } from '../drift/index.js';
import type { ChannelInfo } from './ChannelLifecycle.js';
import type { CommandDispatch } from './CommandDispatch.js';

/**
 * Tui wiring deps interface.
 */
export interface TuiWiringDeps {
  config: IReplConfig;
  mcpIntegration: McpIntegration;
  providerPool: ProviderPool;
  sessionPersistence: SessionPersistence;
  sessionState: SessionState;
  catalogManager: CatalogManager;
  driftManager: DriftManager;
  askUserHandler: AskUserHandler;
  getMcpServers: () => Map<string, McpServer>;
  getChannelManagerInternal: () => ChannelInfo[];
  getActiveToolNames: () => string[];
  setActiveToolNames: (names: string[]) => void;
  setActiveChannel: (name: string) => void;
  getActiveChannel: () => string | undefined;
  resumeChannel: (entry: IChannelManifestEntry, state: IChannelStateFile) => Promise<void>;
  handleInput: (text: string) => Promise<void>;
  stop: () => void;
  interrupt: () => void;
  isProcessing: () => boolean;
  formatPrompt: () => string;
  getAvailableModels: () => { provider: string; model: string; region?: string; profile?: string }[];
  switchChannelModel: (ch: string, model: string, provider?: string) => Promise<void>;
  joinChannel: (name: string) => void;
  getChannelStatus: (channel: string) => any;
  getCommandDispatch: () => CommandDispatch | null;
}

/**
 * Builds the TuiMode options object from REPL dependencies.
 */
export function buildTuiOptions(deps: TuiWiringDeps): ConstructorParameters<typeof TuiMode>[0] {
  return {
    theme: deps.config.theme,
    noColor: deps.config.noColor,
    mouse: deps.config.mouse ?? true,
    showThinkingInBuffer: UserConfig.instance().settings.session.showThinkingInBuffer,
    menuConfig: {
      providers: deps.config.providers.map((p: any) => ({
        type: p.type ?? p, models: (p.models ?? []).map((m: any) => typeof m === 'string' ? m : m.name),
        region: p.region, profile: p.profile,
      })),
      mcpServers: deps.mcpIntegration.loadMcpConfig().map(e => e.name),
      mcpConfigs: deps.mcpIntegration.loadMcpConfig(),
      model: deps.config.defaultModel ?? '',
      budget: deps.config.maxBudget ? `$${deps.config.maxBudget.toFixed(2)}` : '$5.00',
      mcpClientName: UserConfig.instance().mcpClientName,
    },
    onSubmit: async (text: string) => { await deps.handleInput(text); },
    onExit: () => { deps.stop(); },
    onInterrupt: () => { deps.interrupt(); },
    isProcessing: () => deps.isProcessing(),
    onMcpAdd: (name: string, config: any) => {
      deps.mcpIntegration.connectMcp(name, config).then(() => {
        const toolCount = deps.getMcpServers().get(name)?.tools.length ?? 0;
        // TUI message written by caller after tui is set
        (deps as any)._tuiRef?.writeMessage('system', 'mcp', `✓ ${name} connected (${toolCount} tools)`, '#control');
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        (deps as any)._tuiRef?.writeMessage('system', 'mcp', `✗ ${name} failed: ${msg}`, '#control');
      });
    },
    onMcpConfigChange: (serverName: string, fieldPath: string, value: any) => {
      const configs = deps.mcpIntegration.loadMcpConfig();
      const entry = configs.find(c => c.name === serverName);
      if (entry) {
        const parts = fieldPath.split('.');
        let target = entry.config;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        // Parse env string "KEY=val;KEY2=val2" into object { KEY: "val", KEY2: "val2" }
        if (parts[parts.length - 1] === 'env' && typeof value === 'string') {
          const obj: Record<string, string> = {};
          if (value.trim()) {
            for (const pair of value.split(';')) {
              const eqIdx = pair.indexOf('=');
              if (eqIdx > 0) {
                obj[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
              }
            }
          }
          target.env = obj;
        // Parse args string into array
        } else if (parts[parts.length - 1] === 'args' && typeof value === 'string') {
          target.args = value.trim() ? value.trim().split(/\s+/) : [];
        // Parse autoApprove comma-separated string into array
        } else if (parts[parts.length - 1] === 'autoApprove' && typeof value === 'string') {
          target.autoApprove = value.trim() ? value.trim().split(/\s*,\s*/) : [];
        } else {
          target[parts[parts.length - 1]] = value;
        }
        const file = path.join(homedir(), '.arma', 'mcp.json');
        fs.writeFileSync(file, JSON.stringify(configs, null, 2), 'utf8');
      }
    },
    onMcpShow: () => { deps.mcpIntegration.showMcpPicker(); },
    onMcpRemove: (serverName: string) => {
      deps.mcpIntegration.disconnectMcp(serverName).then(() => {
        const configs = deps.mcpIntegration.loadMcpConfig().filter(c => c.name !== serverName);
        const file = path.join(homedir(), '.arma', 'mcp.json');
        fs.writeFileSync(file, JSON.stringify(configs, null, 2), 'utf8');
        (deps as any)._tuiRef?.writeMessage('system', 'mcp', `✓ ${serverName} removed`, '#control');
        (deps as any)._tuiRef?.rebuildMcpMenu(configs.map(e => e.name), configs);
      }).catch(() => {});
    },
    onChannelSwitch: (channel: string) => { deps.setActiveChannel(channel); },
    getChannelStatus: (channel: string) => deps.getChannelStatus(channel),
    getMcpStatus: () => [...deps.getMcpServers().values()].map(s => ({ name: s.name, status: s.status })),
    onMcpAuth: (serverName: string) => { deps.mcpIntegration.triggerMcpAuth(serverName); },
    formatPrompt: () => deps.formatPrompt(),
    getAvailableModels: () => deps.getAvailableModels(),
    onModelSelect: (provider: string, model: string) => {
      const ch = deps.getActiveChannel() ?? '#control';
      deps.switchChannelModel(ch, model, provider);
    },
    onNewChannel: (channel: string) => { deps.joinChannel(channel.replace(/^#/, '')); },
    getCommandDispatch: () => deps.getCommandDispatch(),
  };
}

/**
 * Post-TUI-creation setup: display config, provider pool, logging.
 */
export function configureTuiPostCreate(tui: TuiMode, deps: TuiWiringDeps): void {
  const displayCfg = UserConfig.instance().settings.display;
  if (displayCfg.renderInterval && displayCfg.renderInterval !== 33) {
    tui.setRenderInterval(displayCfg.renderInterval);
  }
  logInfo('repl', 'TUI session started');

  deps.providerPool.setConfig({
    onDeviceCode: (info) => {
      tui.writeMessage('system', '*', 'AWS SSO authentication required:');
      tui.writeMessage('system', '*', `Open: ${info.verificationUrlComplete || info.verificationUrl}`);
      tui.writeMessage('system', '*', `Code: ${info.userCode}`);
      import('child_process').then(cp => {
        cp.exec(`open "${info.verificationUrlComplete || info.verificationUrl}"`);
      });
    },
    onBrowserAuth: async (url: string, manualUrl?: string) => {
      tui.writeMessage('system', '*', 'Browser authentication required:');
      tui.writeMessage('system', '*', `Opening: ${url}`);
      import('child_process').then(cp => {
        cp.exec(`open "${url}"`);
      });
      // Ask user for the authorization code returned by the browser redirect
      const result = await deps.askUserHandler.ask(
        'Enter the authorization code from the browser (or paste the full redirect URL):',
        [],
        '#control',
        'freeform',
      );
      // If user pasted a full URL, extract the code param
      if (result && result.includes('code=')) {
        const parsed = new URL(result);
        return parsed.searchParams.get('code') || result;
      }
      return result || '';
    },
    onRefreshPrompt: async (message: string) => {
      const result = await deps.askUserHandler.ask(
        `${message}\nRefresh credentials?`,
        ['Refresh', 'Skip'],
        '#control',
        'radio',
      );
      return result === 'Refresh';
    },
  });

  const uc = UserConfig.instance();
  const defaultProvider = uc.providers?.[0] ?? deps.config.providers?.[0];
  const defaultModel = uc.defaultModel || deps.config.defaultModel || '';
  const defaultProviderName = defaultProvider?.name ?? defaultProvider?.type ?? defaultProvider ?? 'none';

  // Extract effort from model config options
  let defaultEffort = '';
  if (defaultModel && defaultProvider) {
    const models = defaultProvider.models ?? [];
    const matched = models.find((m: any) => (typeof m === 'string' ? m : m.name) === defaultModel);
    if (matched && typeof matched === 'object' && !Array.isArray(matched)) {
      const opts = (matched as any).options ?? {};
      defaultEffort = opts.reasoning_effort ?? opts.output_config?.effort ?? '';
    }
  }
  tui.updateStatus({ provider: defaultProviderName as string, model: defaultModel || 'none', effort: defaultEffort });

  if (defaultProvider && defaultModel) {
    deps.providerPool.getOrCreate(
      defaultProvider.type ?? defaultProvider,
      defaultModel,
      {
        region: defaultProvider.region,
        profile: defaultProvider.profile,
        apiKey: defaultProvider.apiKey,
        baseURL: defaultProvider.baseUrl,
        streaming: defaultProvider.streaming,
      }
    ).then(() => {
      tui.writeMessage('system', '*', `Connected to ${defaultProvider.type ?? defaultProvider} (${defaultModel})`);
    }).catch((err: Error) => {
      tui.writeMessage('system', '*', `Provider connection failed: ${err.message}`);
    });
  }
}

/**
 * Restore session state from persistence after TUI is created.
 */
export async function restoreSession(tui: TuiMode, deps: TuiWiringDeps): Promise<void> {
  await deps.sessionPersistence.initialize(process.cwd());
  const cfgs = deps.mcpIntegration.loadMcpConfig();

  tui.rebuildMcpMenu(cfgs.map(c => c.name), cfgs);

  const manifest = await deps.sessionPersistence.loadManifest();
  if (manifest) {
    if (manifest.stickyNotes) {
      deps.sessionState.stickyNotes = manifest.stickyNotes.map((n: any) => {
        if (typeof n === 'string' && n.includes(':')) {
          const colon = n.indexOf(':');
          const pos = n.slice(0, colon) as 'top' | 'bottom' | 'both';
          return { text: n.slice(colon + 1), position: ['top', 'bottom', 'both'].includes(pos) ? pos : 'top' };
        }
        return typeof n === 'string' ? { text: n, position: 'top' } : n;
      });
    }
    if (manifest.activeTools) {
      deps.catalogManager.restoreTools(manifest.activeTools);
      deps.setActiveToolNames(deps.catalogManager.activeToolNames);
    }
    for (const ch of manifest.channels) {
      const state = await deps.sessionPersistence.loadChannelState(ch.name);
      if (state) {
        await deps.resumeChannel(ch, state);
      } else {
        tui.writeMessage('system', 'info', `○ Suspended (no state): ${ch.name} (${ch.model})`, '#control');
      }
    }
    if (manifest.activeChannel) {
      const channels = deps.getChannelManagerInternal();
      const existing = channels.find(c => c.name === manifest.activeChannel);
      if (existing) {
        channels.forEach(c => c.active = false);
        existing.active = true;
        deps.setActiveChannel(manifest.activeChannel);
        tui.setActiveChannel(manifest.activeChannel);
      }
    }
  }
}
