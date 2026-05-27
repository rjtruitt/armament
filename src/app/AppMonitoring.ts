/**
 * AppMonitoring — provider stats refresh, cache efficiency checks, exit summary, channel status.
 *
 * Extracted from ArmamentApp to isolate runtime monitoring concerns from the
 * composition root. These functions are called by ArmamentApp but the logic
 * lives here for readability and separation.
 */

import { extractNick, type ChannelAgent, type ProviderPool, type AskUserHandler } from '../providers/index.js';
import { renderExitSummary } from '../rendering/index.js';
import type { SessionState } from './SessionState.js';
import type { TuiRenderer } from './TuiRenderer.js';
import type { IReplConfig } from '../core/index.js';
import type { ThreadCoordinator } from '../threads/index.js';
import type { ChannelInfo, AgentInfo } from './ChannelLifecycle.js';

/**
 * Monitoring deps interface.
 */
export interface MonitoringDeps {
  getTui: () => TuiRenderer | null;
  getProviderPool: () => ProviderPool;
  getSessionState: () => SessionState;
  getChannelAgents: () => Map<string, ChannelAgent>;
  getThreadCoordinator: () => ThreadCoordinator | null;
  getConfig: () => IReplConfig;
  getAgentManagerInternal: () => AgentInfo[];
  getActiveProvider: () => string;
  calculateCost: (model: string, input: number, output: number, cacheRead: number, cacheWrite: number) => number;
}

/**
 * Refresh provider stats in the TUI sidebar.
 */
export function refreshProviderStats(deps: MonitoringDeps): void {
  const tui = deps.getTui();
  if (!tui) return;
  tui.clearProviders();
  const poolStats = deps.getProviderPool().getPerModelStats();

  const agentCounts = new Map<string, number>();
  for (const agent of deps.getChannelAgents().values()) {
    const key = `${agent.providerType}:${agent.model}`;
    agentCounts.set(key, (agentCounts.get(key) ?? 0) + 1);
  }

  // Show all configured models with usage stats if available (zero if not yet used)
  const config = deps.getConfig();
  for (const prov of config.providers) {
    for (const model of prov.models) {
      const modelName = typeof model === 'string' ? model : model.name;
      const key = `${prov.type}:${modelName}`;
      const displayName = prov.name ?? prov.type;
      const stats = poolStats.get(key);
      const nick = extractNick(modelName);
      const tokens = stats?.tokens ?? 0;
      const cost = deps.calculateCost(modelName, stats?.input ?? 0, stats?.output ?? 0, stats?.cacheRead ?? 0, stats?.cacheWrite ?? 0);
      const agents = agentCounts.get(key) ?? 0;
      tui.updateProvider(displayName, agents > 0, nick, { tokens, cost, cacheRead: stats?.cacheRead ?? 0, cacheWrite: stats?.cacheWrite ?? 0, agents }, prov.type);
    }
  }
}

/**
 * Check cache efficiency for an agent on a given channel.
 * Shows a warning if cache hit rate is too low.
 */
export function checkCacheEfficiency(
  agent: ChannelAgent,
  channel: string,
  deps: MonitoringDeps,
  cacheWarningShown: Set<string>,
  askUserHandler: AskUserHandler,
): void {
  if (cacheWarningShown.has(channel)) return;
  const sessionState = deps.getSessionState();
  const result = sessionState.checkCacheEfficiency(agent.totalTokens, agent.cacheRead, agent.turnCount);
  if (!result || result.efficient) return;
  cacheWarningShown.add(channel);
  askUserHandler.ask(
    `⚠️ Low cache efficiency on ${channel}: only ${result.pct}% of ${sessionState.formatTokenCount(agent.totalTokens)} tokens are cached reads. This model may not support prompt caching — you're paying full price for every token. Continue or quit?`,
    ['Continue', 'Quit'], channel,
  ).then((response) => {
    if (response.toLowerCase() === 'quit') {
      deps.getTui()?.writeMessage('system', '*', 'Session ended due to low cache efficiency.', channel);
      process.exit(0);
    }
  });
}

/**
 * Build the exit summary string for display on shutdown.
 */
export function buildExitSummary(deps: MonitoringDeps): string {
  const config = deps.getConfig();
  const sessionState = deps.getSessionState();
  const summaryData = sessionState.buildExitSummaryData(config.maxBudget ?? 5.0);
  const agentCount = deps.getAgentManagerInternal().length;
  const agents = agentCount > 0 ? `${agentCount} spawned` : '0 spawned';
  const providers = config.providers.map(p => p.type).join(', ') || deps.getActiveProvider();
  return renderExitSummary(config.theme, config.noColor, {
    duration: summaryData.duration, agents, tools: `${summaryData.requestCount}`,
    tokens: summaryData.tokens, cost: summaryData.cost, costByModel: summaryData.costByModel, files: 'none', providers,
  });
}

/**
 * Get the status info for a channel (agent or thread).
 */
export function getChannelStatus(
  channel: string,
  deps: MonitoringDeps,
): any {
  const channelAgents = deps.getChannelAgents();
  const agent = channelAgents.get(channel) ?? channelAgents.get(channel.replace(/^#/, ''));
  if (agent) {
    const ctx = agent.getContextUsage();
    return {
      tokens: agent.totalTokens, cacheRead: agent.cacheRead, cacheWrite: agent.cacheWrite,
      model: agent.model, provider: agent.providerName || agent.providerType, status: agent.status,
      contextPercent: ctx.percent, contextTokens: ctx.current,
    };
  }
  const threadInfo = deps.getThreadCoordinator()?.getThreadInfo(channel);
  if (threadInfo) {
    const statusMap: Record<string, string> = { streaming: 'thinking', dead: 'error' };
    return {
      tokens: threadInfo.totalTokens, cacheRead: threadInfo.cacheRead, cacheWrite: threadInfo.cacheWrite,
      model: threadInfo.model, provider: threadInfo.providerType,
      status: (statusMap[threadInfo.status] ?? threadInfo.status) as any,
      contextPercent: threadInfo.contextPercent, contextTokens: threadInfo.contextTokens,
    };
  }
  return null;
}
