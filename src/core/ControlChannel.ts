/** Creates the #control meta-channel that shows agent events, stats, and status. */
export function createControlChannel(config: any = {}) {
  const events: any[] = [];
  let stats: any = {};
  let agents: any[] = [];
  return {
    addEvent(event: any): void {
      events.push(event);
    },
    setStats(s: any): void {
      stats = s;
    },
    setAgents(a: any[]): void {
      agents = a;
    },
    renderFeed(width: number, height: number, opts: any = {}): string[] {
      let filtered = events;
      if (opts.filterType) {
        filtered = events.filter(e => e.type === opts.filterType);
      }
      const lines: string[] = [];
      for (const event of filtered) {
        if (event.type === 'spawn') {
          lines.push(`[spawn] Agent ${event.agent} started`);
        } else if (event.type === 'status-change') {
          lines.push(`[status] ${event.agent}: ${event.from} → ${event.to} streaming`);
        } else if (event.type === 'git:commit') {
          lines.push(`[git] ${event.agent} committed ${event.hash}: ${event.message}`);
        } else if (event.type === 'cost-milestone') {
          lines.push(`[cost] Milestone reached: $${event.amount.toFixed(2)}`);
        } else if (event.type === 'error') {
          lines.push(`\x1b[38;5;196m[error] ${event.agent}: ${event.message}\x1b[0m`);
        } else if (event.type === 'hitl') {
          lines.push(`[hitl] ${event.agent}: ${event.title} (${event.promptType}) Deploy?`);
        }
      }
      return lines;
    },
    renderHeader(width: number): string[] {
      const lines: string[] = [];
      lines.push(`Agents: ${stats.agents || 0} | Tokens: ${stats.tokens || 0} | Cost: $${(stats.cost || 0).toFixed(2)} | Uptime: ${stats.uptime || 0}ms`);
      return lines;
    },
    renderAgentSummary(width: number): string[] {
      const lines: string[] = [];
      for (const agent of agents) {
        lines.push(`${agent.name}: ${agent.status} streaming`);
      }
      return lines;
    },
  };
}