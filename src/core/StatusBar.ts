/**
 * Persistent terminal status bar with configurable segments.
 *
 * Renders model, agents, latency, context usage, cost, pending prompts,
 * git status, provider health, MCP connections, and clock/uptime into
 * a fixed-width ANSI-colored bar with dynamic truncation and ordering.
 */

const GREEN = '\x1b[38;5;46m';
const YELLOW = '\x1b[38;5;214m';
const RED = '\x1b[38;5;196m';
const RESET = '\x1b[0m';
const BG = '\x1b[48;5;236m';
const BOLD = '\x1b[1m';
const BLINK = '\x1b[5m';

function abbreviateModel(model: string): string {
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('opus')) return 'opus';
  if (model.includes('haiku')) return 'haiku';
  return model.length > 15 ? model.slice(0, 15) : model;
}

function formatK(n: number): string {
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}

import { stripAnsi } from './stripAnsi.js';
export { stripAnsi };

/** Create status bar.
 * @param {any} state - Description of state.
 */
export function createStatusBar(state: any = {}) {
  const defaults: any = {
    width: 120,
    model: 'sonnet',
    provider: 'anthropic',
    activeAgents: 0,
    totalAgents: 0,
    errorAgents: 0,
    latencyMs: undefined,
    contextUsed: 0,
    contextCapacity: 200000,
    cost: 0,
    budget: undefined,
    tokensPerMin: 0,
    pendingPrompts: 0,
    promptsFlash: false,
    promptAgent: undefined,
    gitBranch: 'main',
    gitDirty: false,
    gitAhead: 0,
    gitBehind: 0,
    gitUncommitted: 0,
    gitShadow: false,
    providerStatus: 'healthy',
    retryInMs: undefined,
    mcpConnected: 0,
    mcpTotal: 0,
    uptimeMs: 0,
    showClock: false,
    segmentOrder: undefined,
    hiddenSegments: [] as string[],
    separator: ' │ ',
    compact: false,
    doubleHeight: false,
  };
  const s: any = { ...defaults, ...state };
  let _changed: Record<string, boolean> = {};

  function getSegment(name: string): string {
    if (s.hiddenSegments.includes(name)) return '';

    switch (name) {
      case 'model': {
        const short = abbreviateModel(s.model);
        let result = '';
        if (s.compact) {
          result = `\x1b[38;5;75m[${short}]${RESET}`;
        } else {
          const providerStr = s.provider && s.provider !== 'anthropic' ? `${s.provider}:` : 'model:';
          result = `\x1b[38;5;75m[${providerStr}${short}]${RESET}`;
        }
        return result;
      }
      case 'agents': {
        const total = s.totalAgents || s.activeAgents + s.errorAgents;
        const ratio = total > 0 ? `${s.activeAgents}/${total}` : `${s.activeAgents}`;
        let color: string;
        if (s.errorAgents > s.activeAgents) color = RED;
        else if (s.errorAgents > 0) color = YELLOW;
        else color = GREEN;
        return `${color}● ${ratio}${RESET}`;
      }
      case 'latency': {
        if (s.latencyMs === undefined || s.latencyMs === null) {
          return `⏱ —`;
        }
        let formatted: string;
        if (s.latencyMs >= 1000) {
          formatted = `${(s.latencyMs / 1000).toFixed(1)}s`;
        } else {
          formatted = `${s.latencyMs}ms`;
        }
        let color = GREEN;
        if (s.latencyMs >= 500 && s.latencyMs <= 2000) color = YELLOW;
        if (s.latencyMs > 2000) color = RED;
        return `${color}⏱ ${formatted}${RESET}`;
      }
      case 'context': {
        const pct = Math.round((s.contextUsed / s.contextCapacity) * 100);
        const usedK = formatK(s.contextUsed);
        const capK = formatK(s.contextCapacity);
        let color = GREEN;
        if (pct >= 60 && pct <= 80) color = YELLOW;
        if (pct > 80) color = RED;
        const barLen = 10;
        const filled = Math.round((pct / 100) * barLen);
        const miniBar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
        let prefix = '';
        if (pct > 95) prefix = BLINK;
        return `${prefix}${color}${usedK}/${capK} ${pct}% ${miniBar}${RESET}`;
      }
      case 'cost': {
        const costStr = `$${s.cost.toFixed(2)}`;
        let color = GREEN;
        if (s.budget !== undefined) {
          const ratio = s.cost / s.budget;
          if (ratio > 1) color = RED;
          else if (ratio > 0.7) color = YELLOW;
        }
        let result = `${color}${costStr}`;
        if (s.budget !== undefined) {
          result += `/$${s.budget.toFixed(0)}`;
        }
        if (s.tokensPerMin > 0) {
          let tpm: string;
          if (s.tokensPerMin >= 1000) {
            const val = s.tokensPerMin / 1000;
            tpm = val % 1 === 0 ? `${val}k` : `${val.toFixed(1)}k`;
          } else {
            tpm = `${s.tokensPerMin}`;
          }
          result += ` ${tpm} t/min`;
        }
        if (_changed['cost']) result = `${BOLD}${result}`;
        result += RESET;
        return result;
      }
      case 'prompts': {
        if (s.pendingPrompts === 0) return '';
        let color = YELLOW;
        let prefix = '';
        if (s.promptsFlash || _changed['prompts']) prefix = BLINK;
        let agentStr = s.promptAgent ? ` ${s.promptAgent}` : '';
        return `${prefix}${color}? ${s.pendingPrompts}${agentStr}${RESET}`;
      }
      case 'git': {
        let color = s.gitDirty ? YELLOW : GREEN;
        let icon = '⎇';
        let result = `${color}${icon} ${s.gitBranch}`;
        if (s.gitAhead > 0) result += ` ↑${s.gitAhead}`;
        if (s.gitBehind > 0) result += ` ↓${s.gitBehind}`;
        if (s.gitUncommitted > 0) result += ` ${s.gitUncommitted}`;
        if (s.gitShadow) result += ' ◐shadow';
        result += RESET;
        return result;
      }
      case 'provider': {
        let color = GREEN;
        if (s.providerStatus === 'rate-limited') color = YELLOW;
        if (s.providerStatus === 'down') color = RED;
        let result = `${color}●`;
        if (s.providerStatus === 'rate-limited') {
          result += ` ${s.provider}`;
          if (s.retryInMs) {
            result += ` retry ${Math.round(s.retryInMs / 1000)}s`;
          }
        }
        result += RESET;
        return result;
      }
      case 'mcp': {
        if (s.mcpTotal === 0) return '';
        let color = GREEN;
        if (s.mcpConnected < s.mcpTotal) color = YELLOW;
        return `${color}mcp ${s.mcpConnected}/${s.mcpTotal}${RESET}`;
      }
      case 'clock': {
        if (s.showClock) {
          const now = new Date();
          const h = now.getHours();
          const m = String(now.getMinutes()).padStart(2, '0');
          return `${h}:${m}`;
        }
        const totalMin = Math.floor(s.uptimeMs / 60000);
        if (totalMin >= 60) {
          const h = Math.floor(totalMin / 60);
          return `${h}h`;
        }
        return `${totalMin}m`;
      }
      default:
        return '';
    }
  }

  const segmentNames = ['model', 'agents', 'latency', 'context', 'cost', 'prompts', 'git', 'provider', 'mcp', 'clock'];

  function getOrderedSegments(): string[] {
    const order = s.segmentOrder || segmentNames;
    return order.filter((n: string) => !s.hiddenSegments.includes(n));
  }

  function render(): string {
    const ordered = getOrderedSegments();
    const parts = ordered.map((n: string) => getSegment(n)).filter((p: string) => p !== '');
    const sep = s.separator;
    const raw = parts.join(sep);
    const plainLen = stripAnsi(raw).length;
    const target = s.width;
    if (plainLen >= target) {
      let truncParts = [...parts];
      while (stripAnsi(truncParts.join(sep)).length > target && truncParts.length > 1) {
        truncParts.pop();
      }
      const truncRaw = truncParts.join(sep);
      const truncPlain = stripAnsi(truncRaw).length;
      if (truncPlain <= target) {
        return BG + truncRaw + ' '.repeat(target - truncPlain) + RESET;
      }
      return BG + truncRaw.slice(0, target) + RESET;
    }
    const padding = ' '.repeat(target - plainLen);
    return BG + raw + padding + RESET;
  }

  function renderMultiLine(): string[] {
    return [render(), render()];
  }

  return {
    render,
    renderMultiLine,
    getSegment: (name: string) => getSegment(name),
    resize(newWidth: number) { s.width = newWidth; },
    update(newState: any) {
      for (const key of Object.keys(newState)) {
        if (s[key] !== newState[key]) _changed[key] = true;
        if (key === 'cost') _changed['cost'] = true;
        if (key === 'pendingPrompts' && newState[key] > s[key]) _changed['prompts'] = true;
        if (key === 'contextUsed') _changed['context'] = true;
        s[key] = newState[key];
      }
    },
    configure(config: any) {
      Object.assign(s, config);
    },
  };
}
