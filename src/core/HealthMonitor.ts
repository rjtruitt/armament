/**
 * Watchdog and dependency graph for agent health monitoring.
 *
 * Exports factory functions: createWatchdog (stuck-agent detection),
 * createDependencyGraph (circular/critical-path analysis).
 *
 * Re-exports from sibling modules:
 * - HealthRateLimiting: createBottleneckDetector, createRateLimitCoordinator
 * - HealthNotifications: createCostProjector, createSmartNotifier, createTimeline, createSearchableHistory
 */

export { stripAnsi } from './stripAnsi.js';
export { createBottleneckDetector, createRateLimitCoordinator } from './HealthRateLimiting.js';
export { createCostProjector, createSmartNotifier, createTimeline, createSearchableHistory } from './HealthNotifications.js';

/** Creates a watchdog that detects stuck agents and supports poke/escalation. */
export function createWatchdog(config: any = {}) {
  const timeout = config.timeout ?? 30000;
  const thinkingTimeout = config.thinkingTimeout ?? 120000;
  const warnAt = config.warnAt ?? timeout * 0.7;
  const maxPokes = config.maxPokes ?? 3;
  const activities = new Map<string, number>();
  const statuses = new Map<string, string>();
  const pokeCounts = new Map<string, number>();
  const warningListeners: Function[] = [];

  return {
    logActivity(agent: string, timestamp: number) {
      activities.set(agent, timestamp);
    },

    setStatus(agent: string, status: string) {
      statuses.set(agent, status);
    },

    check() {
      const now = Date.now();
      for (const [agent, lastActivity] of activities.entries()) {
        const elapsed = now - lastActivity;
        const status = statuses.get(agent);
        const effectiveTimeout = status === 'thinking' ? thinkingTimeout : timeout;
        if (elapsed >= warnAt && elapsed < effectiveTimeout) {
          for (const listener of warningListeners) {
            listener(`${agent} may be stuck (${Math.round(elapsed / 1000)}s inactive)`);
          }
        }
      }
    },

    isStuck(agent: string) {
      const lastActivity = activities.get(agent);
      if (lastActivity === undefined) return false;
      const elapsed = Date.now() - lastActivity;
      const status = statuses.get(agent);
      const effectiveTimeout = status === 'thinking' ? thinkingTimeout : timeout;
      return elapsed > effectiveTimeout;
    },

    getStuckAgents() {
      const stuck: string[] = [];
      for (const [agent] of activities.entries()) {
        if (this.isStuck(agent)) stuck.push(agent);
      }
      return stuck;
    },

    getVisualStatus(agent: string) {
      if (this.isStuck(agent)) return '⏳ stuck';
      return 'idle';
    },

    canPoke(agent: string) {
      return this.isStuck(agent) || (activities.has(agent) && Date.now() - (activities.get(agent) || 0) > timeout);
    },

    async poke(agent: string) {
      pokeCounts.set(agent, (pokeCounts.get(agent) || 0) + 1);
    },

    getPokeCount(agent: string) {
      return pokeCounts.get(agent) || 0;
    },

    shouldEscalate(agent: string) {
      return (pokeCounts.get(agent) || 0) >= maxPokes;
    },

    onWarning(listener: Function) {
      warningListeners.push(listener);
    },
  };
}

/** Creates a dependency graph with circular detection, critical path, and ASCII rendering. */
export function createDependencyGraph(config: any = {}) {
  const deps = new Map<string, string[]>();

  function getAllNodes() {
    const nodes = new Set<string>();
    for (const [from, toList] of deps.entries()) {
      nodes.add(from);
      for (const to of toList) nodes.add(to);
    }
    return nodes;
  }

  return {
    addDependency(from: string, to: string) {
      if (!deps.has(from)) deps.set(from, []);
      deps.get(from)!.push(to);
    },

    getDependencies(agent: string) {
      return deps.get(agent) || [];
    },

    resolve(agent: string) {
      for (const [key, list] of deps.entries()) {
        deps.set(key, list.filter(d => d !== agent));
      }
    },

    hasCircular() {
      const visited = new Set<string>();
      const stack = new Set<string>();

      const dfs = (node: string): boolean => {
        if (stack.has(node)) return true;
        if (visited.has(node)) return false;
        visited.add(node);
        stack.add(node);
        for (const dep of (deps.get(node) || [])) {
          if (dfs(dep)) return true;
        }
        stack.delete(node);
        return false;
      };

      for (const node of getAllNodes()) {
        if (dfs(node)) return true;
      }
      return false;
    },

    getCriticalPath() {
      const inDegree = new Map<string, number>();
      const nodes = getAllNodes();
      for (const node of nodes) inDegree.set(node, 0);
      for (const [, toList] of deps.entries()) {
        for (const to of toList) {
          inDegree.set(to, (inDegree.get(to) || 0) + 1);
        }
      }

      // Critical path = longest path from a root (no dependencies) to a leaf
      // Using DFS to find longest path
      const memo = new Map<string, string[]>();

      const longestFrom = (node: string): string[] => {
        if (memo.has(node)) return memo.get(node)!;
        const waiters: string[] = [];
        for (const [from, toList] of deps.entries()) {
          if (toList.includes(node)) waiters.push(from);
        }
        if (waiters.length === 0) {
          memo.set(node, [node]);
          return [node];
        }
        let longest: string[] = [];
        for (const w of waiters) {
          const path = longestFrom(w);
          if (path.length > longest.length) longest = path;
        }
        const result = [node, ...longest];
        memo.set(node, result);
        return result;
      };

      const roots: string[] = [];
      for (const node of nodes) {
        if (!deps.has(node) || deps.get(node)!.length === 0) {
          roots.push(node);
        }
      }

      let longestPath: string[] = [];
      for (const root of roots) {
        const path = longestFrom(root);
        if (path.length > longestPath.length) longestPath = path;
      }

      return longestPath;
    },

    renderAscii(width: number) {
      const lines: string[] = [];
      for (const [from, toList] of deps.entries()) {
        for (const to of toList) {
          lines.push(`${from} ← ${to}`);
        }
      }
      if (lines.length === 0) return ['(no dependencies)'];
      return lines;
    },

    getBlockedTooltip(agent: string) {
      const agentDeps = deps.get(agent) || [];
      if (agentDeps.length === 0) return '';
      return `Waiting on: ${agentDeps.join(', ')}`;
    },

    renderFull(width: number, height: number) {
      const lines: string[] = ['Dependencies:'];
      for (const [from, toList] of deps.entries()) {
        for (const to of toList) {
          lines.push(`  ${from} → waits on ${to}`);
        }
      }
      return lines;
    },
  };
}
