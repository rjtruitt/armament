/** Projects budget exhaustion time and detects cost spikes. */
export function createCostProjector(config: any = {}) {
  const budget = config.budget ?? Infinity;
  let currentCost = config.currentCost ?? 0;
  let costRate = 0; // $ per minute
  const costLog: Array<{ cost: number; time: number }> = [];
  const agentCostLog = new Map<string, Array<{ cost: number; time: number }>>();
  const turnCosts: number[] = [];
  const warningListeners: Function[] = [];
  return {
    logCost(cost: number, time: number) {
      costLog.push({ cost, time });
      currentCost += cost;
    },
    logAgentCost(agent: string, cost: number, time: number) {
      if (!agentCostLog.has(agent)) agentCostLog.set(agent, []);
      agentCostLog.get(agent)!.push({ cost, time });
    },
    logTurnCost(cost: number) {
      turnCosts.push(cost);
    },
    setCostRate(rate: number) {
      costRate = rate;
    },
    getCostPerMinute() {
      if (costLog.length < 2) return 0;
      const first = costLog[0];
      const last = costLog[costLog.length - 1];
      const minutes = (last.time - first.time) / 60000;
      if (minutes === 0) return 0;
      // Rate = sum of costs after the first entry / elapsed time
      const costAfterFirst = costLog.slice(1).reduce((sum, entry) => sum + entry.cost, 0);
      return costAfterFirst / minutes;
    },
    getMinutesRemaining() {
      if (costRate <= 0) return Infinity;
      const remaining = budget - currentCost;
      return remaining / costRate;
    },
    getAgentCostRate(agent: string) {
      const log = agentCostLog.get(agent) || [];
      if (log.length < 2) return 0;
      const first = log[0];
      const last = log[log.length - 1];
      const minutes = (last.time - first.time) / 60000;
      if (minutes === 0) return 0;
      return (last.cost - first.cost) / minutes;
    },
    getAverageTurnCost() {
      if (turnCosts.length === 0) return 0;
      return turnCosts.reduce((s, c) => s + c, 0) / turnCosts.length;
    },
    detectSpike() {
      if (costLog.length < 2) return false;
      const last = costLog[costLog.length - 1];
      const previous = costLog.slice(0, -1);
      const avgPrevious = previous.reduce((s, e) => s + e.cost, 0) / previous.length;
      return last.cost > avgPrevious * 5; // 5x spike
    },
    check() {
      if (costRate > 0) {
        const minutesLeft = (budget - currentCost) / costRate;
        if (minutesLeft <= 5 && minutesLeft > 0) {
          for (const listener of warningListeners) {
            listener(`Budget exhaustion in ~${Math.round(minutesLeft)} min`);
          }
        }
      }
      if (this.detectSpike()) {
        for (const listener of warningListeners) {
          listener('Cost spike detected - unusual spending rate');
        }
      }
    },
    onWarning(listener: Function) {
      warningListeners.push(listener);
    },
    renderProjection() {
      if (costRate <= 0) return '';
      const minutesLeft = (budget - currentCost) / costRate;
      return `~${Math.round(minutesLeft)}m remaining`;
    },
  };
}
/** Batches, prioritizes, and filters notifications with bell/sound support. */
export function createSmartNotifier(config: any = {}) {
  const notifications: any[] = [];
  const batchWindow = config.batchWindow ?? 100;
  const viewMode = config.viewMode ?? 'all';
  const focusedAgent = config.focusedAgent ?? null;
  const mutedAgents: string[] = config.mutedAgents ?? [];
  const muteConfig: Record<string, any> = config.muteConfig ?? {};
  const soundEnabled = config.soundEnabled ?? false;
  let bellCount = 0;
  let lastBell = false;
  let lastBellTime = 0;
  let lastBellPattern: string | undefined;
  const pending: any[] = [];
  const batchStore = new Map<number, any[]>(); // batchId -> items
  let idCounter = 0;
  let lastEmitTime = 0;
  const bellPatterns: Record<string, string> = {
    'agent:error': 'urgent',
    'agent:done': 'complete',
    'hitl:prompt': 'attention',
    'budget:warning': 'warning',
  };
  function getPriority(type: string) {
    if (type.includes('error')) return 'high';
    if (type.includes('prompt') || type.includes('budget')) return 'high';
    if (type.includes('thinking')) return 'low';
    return 'normal';
  }
  function shouldBatch(type: string) {
    if (type.includes('error')) return false;
    if (type.includes('hitl:prompt')) return false;
    return true;
  }
  function getTarget(type: string) {
    if (type.includes('error')) return 'chat';
    return 'chat';
  }
  function ringBell(type: string) {
    if (!soundEnabled) return;
    const now = Date.now();
    if (now - lastBellTime < 3000 && bellCount > 0) return; // rate limit: 1 per 3s
    const priority = getPriority(type);
    if (priority === 'high' || bellPatterns[type]) {
      lastBell = true;
      lastBellTime = now;
      lastBellPattern = bellPatterns[type] || 'default';
      bellCount++;
    } else {
      lastBell = false;
    }
  }
  return {
    emit(type: string, data: any) {
      const priority = getPriority(type);
      const id = ++idCounter;
      const now = Date.now();
      const notification = {
        id,
        type,
        data,
        priority,
        target: getTarget(type),
        timestamp: now,
        expandable: false,
      };
      ringBell(type);
      if (!shouldBatch(type)) {
        notifications.push(notification);
      } else {
        // If enough time has passed since the last emit, flush pending to notifications individually
        if (pending.length > 0 && (now - lastEmitTime) > batchWindow) {
          for (const p of pending) {
            notifications.push(p);
          }
          pending.length = 0;
        }
        pending.push(notification);
        lastEmitTime = now;
      }
    },
    flush() {
      if (pending.length === 0) return [];
      const groups = new Map<string, any[]>();
      for (const n of pending) {
        const key = n.type;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(n);
      }
      const batched: any[] = [];
      for (const [type, items] of groups.entries()) {
        const id = ++idCounter;
        let message = '';
        if (type === 'agent:done') {
          message = `${items.length} agents done`;
        } else if (type === 'tool:done') {
          message = `${items.length} tools completed`;
        } else {
          message = `${items.length} ${type} events`;
        }
        const batch = {
          id,
          type: 'batch',
          message,
          items: [...items],
          expandable: items.length > 2,
          count: items.length,
        };
        batched.push(batch);
        batchStore.set(id, [...items]);
      }
      pending.length = 0;
      return batched;
    },
    expand(batchId: number) {
      return batchStore.get(batchId) || [];
    },
    getAll() {
      return [...notifications, ...pending];
    },
    getVisible() {
      const all = [...notifications, ...pending];
      return all.filter(n => {
        const agent = n.data?.agent;
        // Muted agent filter
        if (agent && mutedAgents.includes(agent)) {
          if (n.priority === 'high' && muteConfig[agent]?.allowErrors) return true;
          return false;
        }
        if (viewMode === 'focus' && focusedAgent) {
          if (n.priority === 'high') return true; // always show high priority
          if (agent && agent !== focusedAgent) return false;
        }
        return true;
      });
    },
    getLastBell() {
      return lastBell;
    },
    getLastBellPattern() {
      return lastBellPattern;
    },
    getBellCount() {
      return bellCount;
    },
  };
}
/** Records and renders a chronological event timeline with color-coded icons. */
export function createTimeline(config: any = {}) {
  const events: Array<{ type: string; data: any; timestamp: number }> = [];
  const typeColors: Record<string, number> = {
    'agent:error': 196,
    'agent:spawn': 82,
    'agent:done': 39,
    'tool:call': 214,
    'hitl:prompt': 226,
  };
  const typeIcons: Record<string, string> = {
    'agent:spawn': '●',
    'tool:call': '⚙',
    'hitl:prompt': '?',
    'agent:done': '✓',
    'agent:error': '✗',
  };
  return {
    log(type: string, data: any, timestamp?: number) {
      events.push({ type, data, timestamp: timestamp ?? Date.now() });
    },
    getAll() {
      return [...events];
    },
    getByAgent(agent: string) {
      return events.filter(e => e.data?.agent === agent);
    },
    getByType(type: string) {
      return events.filter(e => e.type === type);
    },
    getSince(since: number) {
      return events.filter(e => e.timestamp >= since);
    },
    render(width: number, height: number) {
      const lines: string[] = [];
      for (const event of events.slice(-height)) {
        const time = new Date(event.timestamp);
        const timeStr = `${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
        const icon = typeIcons[event.type] || '·';
        const color = typeColors[event.type] || 7;
        lines.push(`\x1b[38;5;${color}m${timeStr} ${icon} ${event.type}\x1b[0m`);
      }
      return lines;
    },
    renderBreadcrumb(count: number, maxWidth: number) {
      const recent = events.slice(-count);
      const parts = recent.map(e => typeIcons[e.type] || '·');
      const result = parts.join(' ');
      return result.slice(0, maxWidth);
    },
  };
}
/** Full-text search over agent conversation and tool call history. */
export function createSearchableHistory(config: any = {}) {
  const entries: Array<{ agent: string; content: string; turn: number; tool?: string; input?: any }> = [];
  let isSearchMode = false;
  let lastQuery: string | RegExp = '';
  return {
    isSearchMode,
    index(entry: { agent: string; content: string; turn: number }) {
      entries.push(entry);
    },
    indexTool(entry: { agent: string; tool: string; input: any }) {
      entries.push({ ...entry, content: JSON.stringify(entry.input), turn: 0 });
    },
    search(query: string | RegExp) {
      lastQuery = query;
      return entries.filter(e => {
        if (typeof query === 'string') {
          return e.content.includes(query);
        }
        return query.test(e.content);
      }).map(e => ({ ...e, _query: query }));
    },
    renderResult(result: any, width: number) {
      const content = result.content || '';
      const query = result._query || lastQuery;
      if (typeof query === 'string' && query) {
        return content.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (match: string) => {
          return `\x1b[7m${match}\x1b[0m`;
        });
      } else if (query instanceof RegExp) {
        return content.replace(query, (match: string) => {
          return `\x1b[7m${match}\x1b[0m`;
        });
      }
      return content;
    },
    canNavigate(results: any[]) {
      return results.length > 1;
    },
    getMatchCount(results: any[]) {
      return results.length;
    },
    renderSearchBar(query: string, width: number) {
      const results = this.search(query);
      return `Search: ${query} | ${results.length} result${results.length !== 1 ? 's' : ''}`;
    },
    export() {
      return { entries: [...entries] };
    },
  };
}