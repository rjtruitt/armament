/** Detects agents or providers blocking multiple other agents. */
export function createBottleneckDetector(config: any = {}) {
  const waiters = new Map<string, string[]>(); // blocker -> list of waiters
  const providerThrottled = new Map<string, string[]>();
  let hitlBlocking: string[] = [];
  return {
    addWaiter(waiter: string, blocker: string) {
      if (!waiters.has(blocker)) waiters.set(blocker, []);
      waiters.get(blocker)!.push(waiter);
    },
    markProviderThrottled(provider: string, agents: string[]) {
      providerThrottled.set(provider, agents);
    },
    markHitlBlocking(agents: string[]) {
      hitlBlocking = agents;
    },
    resolve(blocker: string) {
      waiters.delete(blocker);
    },
    getBottlenecks() {
      const bottlenecks: string[] = [];
      for (const [blocker, waiterList] of waiters.entries()) {
        if (waiterList.length >= 2) bottlenecks.push(blocker);
      }
      for (const [provider] of providerThrottled.entries()) {
        bottlenecks.push(`provider:${provider}`);
      }
      if (hitlBlocking.length >= 2) bottlenecks.push('hitl');
      return bottlenecks;
    },
    getSeverity(blocker: string) {
      return (waiters.get(blocker) || []).length;
    },
    getRecommendation(blocker: string) {
      const count = (waiters.get(blocker) || []).length;
      if (count >= 3) return `Consider splitting work assigned to ${blocker}`;
      if (count >= 2) return `${blocker} is blocking ${count} agents`;
      return '';
    },
    renderAlert(blocker: string) {
      const count = (waiters.get(blocker) || []).length;
      return `⚠ bottleneck: ${blocker} blocking ${count} agents`;
    },
  };
}
/** Coordinates RPM allocation across agents with priority-weighted distribution. */
export function createRateLimitCoordinator(config: any = {}) {
  const rpm = config.rpm ?? 60;
  let requests = 0;
  const queue: string[] = [];
  const priorities = new Map<string, string>();
  const agentRequests = new Map<string, number>();
  return {
    logRequest(agent: string) {
      requests++;
      agentRequests.set(agent, (agentRequests.get(agent) || 0) + 1);
    },
    queueRequest(agent: string) {
      queue.push(agent);
    },
    getRequestsThisMinute() {
      return requests;
    },
    getQueueLength() {
      return queue.length;
    },
    shouldThrottle() {
      return requests >= rpm * 0.9;
    },
    getAllocation(agents: string[]) {
      const remaining = Math.max(0, rpm - requests);
      const allocation: Record<string, number> = {};
      const highPriority = agents.filter(a => priorities.get(a) === 'high');
      const lowPriority = agents.filter(a => priorities.get(a) === 'low');
      const normalPriority = agents.filter(a => !highPriority.includes(a) && !lowPriority.includes(a));
      // High priority gets 2x share, low gets 0.5x share
      const totalWeight = highPriority.length * 2 + normalPriority.length * 1 + lowPriority.length * 0.5;
      if (totalWeight === 0) return allocation;
      for (const agent of highPriority) {
        allocation[agent] = Math.floor(remaining * 2 / totalWeight);
      }
      for (const agent of normalPriority) {
        allocation[agent] = Math.floor(remaining * 1 / totalWeight);
      }
      for (const agent of lowPriority) {
        allocation[agent] = Math.floor(remaining * 0.5 / totalWeight);
      }
      return allocation;
    },
    setPriority(agent: string, priority: string) {
      priorities.set(agent, priority);
    },
    getAgentRateStatus(agent: string) {
      const used = agentRequests.get(agent) || 0;
      return { requestsUsed: used, remaining: rpm - requests };
    },
    tick(ms: number) {
      if (ms >= 60000) {
        requests = 0;
        queue.length = 0;
      }
    },
    renderStatusSegment() {
      const pct = Math.round((requests / rpm) * 100);
      return `${requests}/${rpm} (${pct}%)`;
    },
  };
}