import { DebugMode } from '../debug/index.js';
import { homedir } from 'node:os';
import { LoadingBarController, type IReplConfig } from '../core/index.js';
import { animateLoadingScreen, type AnimationSpeed } from '../rendering/index.js';
import type { McpServer } from './McpManager.js';
import type { CatalogManager } from '../providers/index.js';
import type { McpIntegration } from './McpIntegration.js';

/**
 * Startup deps interface.
 */
export interface StartupDeps {
  config: IReplConfig;
  mcpIntegration: McpIntegration;
  catalogManager: CatalogManager;
  getMcpServers: () => Map<string, McpServer>;
  driftManager: { prune: (opts?: { days?: number; staleOnly?: boolean; maxSizeBytes?: number }) => Promise<number> };
  webUrl?: string;
}

/**
 * Runs the welcome/loading screen animation during REPL startup.
 * Pre-connects configured MCP servers and displays provider status.
 */
export async function printWelcome(deps: StartupDeps): Promise<void> {
  const debug = DebugMode.instance();
  const isDebug = debug.isActive();

  const savedMcpNames = isDebug
    ? debug.getMcpServers().map(s => s.name)
    : deps.mcpIntegration.loadMcpConfig().map(c => c.name);

  // Check for optional tools on this system
  let toolsAvailable: string[] = [];
  try {
    const { execSync } = await import('child_process');
    const curlCI = execSync(
      `ls /usr/local/bin/curl_chrome* ~/.local/bin/curl_chrome* 2>/dev/null || type curl_chrome116 2>/dev/null || which curl_chrome 2>/dev/null`,
      { encoding: 'utf-8', timeout: 2000 }
    ).trim();
    if (curlCI) toolsAvailable.push('curl-impersonate');
  } catch {}
  // Future: check for other optional tools here
  // if (hasPython()) toolsAvailable.push('python');
  // if (hasPlaywright()) toolsAvailable.push('playwright');

  const loader = new LoadingBarController({
    providers: isDebug ? debug.getProviders() : deps.config.providers.map(p => p.name ?? p.type),
    mcpServers: savedMcpNames,
    workspace: isDebug ? debug.getWorkspace() : process.cwd(),
  });

  loader.setConfigLoaded(true);

  if (isDebug) {
    for (const p of debug.getProviders()) {
      loader.setProviderStatus(p, !debug.shouldFailAuth());
    }
  } else {
    for (const p of deps.config.providers) {
      loader.setProviderStatus(p.name ?? p.type, true);
    }
  }

  const mcpServers = deps.getMcpServers();

  if (isDebug) {
    for (const s of debug.getMcpServers()) {
      loader.setMcpStatus(s.name, s.status === 'connected', s.tools.length);
    }
  } else {
    const savedMcp = deps.mcpIntegration.loadMcpConfig();
    // Pre-populate mcpServers so persistMcpConfig won't clobber entries for servers not yet connected
    for (const entry of savedMcp) {
      if (!mcpServers.has(entry.name)) {
        mcpServers.set(entry.name, {
          name: entry.name, config: entry.config, status: 'disconnected', tools: [],
        });
      }
    }
    for (const entry of savedMcp) {
      try {
        await deps.mcpIntegration.connectMcp(entry.name, entry.config, { nonInteractive: true });
        const toolCount = mcpServers.get(entry.name)?.tools.length ?? 0;
        loader.setMcpStatus(entry.name, true, toolCount);
      } catch {
        mcpServers.set(entry.name, {
          name: entry.name, config: entry.config, status: 'needs_auth', tools: [],
        });
        loader.setMcpStatus(entry.name, false, 0);
      }
    }
  }

  loader.setWorkspaceScanned(loader.getData().workspace);
  loader.markReady();

  const data = loader.getData();
  const providerResult = data.providersStatus
    .filter(p => p.ok)
    .map(p => `${p.name} ✓`)
    .join('  ');
  const mcpOk = data.mcpStatus.filter(m => m.ok).map(m => `${m.name} ✓`);
  const mcpFail = data.mcpStatus.filter(m => !m.ok).map(m => `${m.name} ○`);
  const mcpResult = [...mcpOk, ...mcpFail].join('  ');

  const mcpToolCount = [...mcpServers.values()]
    .filter(s => s.status === 'connected')
    .reduce((sum, s) => sum + s.tools.length, 0);
  const catalogToolCount = deps.catalogManager.catalog.totalToolCount;
  const totalTools = mcpToolCount + catalogToolCount;

  const steps = [
    { label: 'loading config', result: 'ok', status: 'ok' as const },
    {
      label: 'providers',
      result: providerResult || 'none configured',
      status: (providerResult ? 'ok' : 'warn') as 'ok' | 'warn',
    },
    {
      label: 'MCP servers',
      result: mcpResult || 'none',
      status: (mcpOk.length > 0 ? (mcpFail.length > 0 ? 'warn' : 'ok') : 'skip') as 'ok' | 'warn' | 'skip',
    },
    ...(toolsAvailable.length > 0 ? [{
      label: 'extras',
      result: toolsAvailable.join(', '),
      status: 'ok' as const,
    }] : []),
  ];

  // Run drift pruning during loading screen
  let driftResult = 'ok';
  let driftPruneCount = 0;
  const driftCfg = deps.config.drift || {};
  if (deps.driftManager && (driftCfg.autoPruneStaleOnStart !== false || (driftCfg.retentionDays ?? 0) > 0 || (driftCfg.maxSizeBytes ?? 0) > 0)) {
    try {
      driftPruneCount = await deps.driftManager.prune({
        staleOnly: driftCfg.autoPruneStaleOnStart !== false,
        days: (driftCfg.retentionDays ?? 0) > 0 ? driftCfg.retentionDays : undefined,
        maxSizeBytes: (driftCfg.maxSizeBytes ?? 0) > 0 ? driftCfg.maxSizeBytes : undefined,
      });
    } catch {
      driftResult = 'error';
    }
  }

  steps.push({
    label: 'drift',
    result: driftPruneCount > 0 ? `pruned ${driftPruneCount}` : driftResult,
    status: driftResult === 'error' ? 'warn' as const : 'ok' as const,
  });

  steps.push(
    {
      label: 'tools',
      result: totalTools > 0 ? `${totalTools} loaded${mcpToolCount > 0 ? ` (${mcpToolCount} MCP)` : ''}` : 'none',
      status: (totalTools > 0 ? 'ok' : 'skip') as 'ok' | 'skip',
    },
    {
      label: 'web interface',
      result: deps.webUrl ? `${deps.webUrl} ✓` : 'not active',
      status: deps.webUrl ? 'ok' as const : 'skip' as const,
    },
    { label: 'workspace', result: data.workspace.replace(homedir(), '~'), status: 'ok' as const },
  );

  const isTTY = process.stdout?.isTTY ?? false;
  const speed: AnimationSpeed = (isDebug || !isTTY) ? 'instant' : 'normal';

  await animateLoadingScreen({
    theme: deps.config.theme,
    noColor: deps.config.noColor,
    speed,
    steps,
    version: '0.1.0',
  });
}

/**
 * Non-interactive mode stub.
 */
export async function runNonInteractive(): Promise<string> {
  return 'Non-interactive execution complete';
}

/**
 * Setup wizard stub.
 */
export async function runSetupWizard(): Promise<void> {
  // Simulated setup wizard - no-op for non-interactive
}
