/**
 * TDD test suite for agent health monitoring, coordination intelligence,
 * and smart notification system.
 * Handles: watchdog, dependency graphs, bottleneck detection, cost projection,
 * notification batching, sound, timeline, and searchable history.
 * All tests RED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWatchdog,
  createDependencyGraph,
  createBottleneckDetector,
  createRateLimitCoordinator,
  createCostProjector,
  createSmartNotifier,
  createTimeline,
  createSearchableHistory,
  stripAnsi,
} from '../core/HealthMonitor';

describe('Agent Health & Coordination', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // WATCHDOG (stuck/spinning detection)
  // ─────────────────────────────────────────────────────────────────────────

  describe('watchdog', () => {
    it('should detect agent with no activity for N seconds', () => {
      const watchdog = createWatchdog({ timeout: 30000 });
      watchdog.logActivity('coder', Date.now() - 60000); // 60s ago
      expect(watchdog.isStuck('coder')).toBe(true);
    });

    it('should not flag active agents as stuck', () => {
      const watchdog = createWatchdog({ timeout: 30000 });
      watchdog.logActivity('coder', Date.now() - 5000); // 5s ago
      expect(watchdog.isStuck('coder')).toBe(false);
    });

    it('should distinguish "thinking" (expected) from "stuck" (problem)', () => {
      const watchdog = createWatchdog({ timeout: 30000 });
      watchdog.setStatus('coder', 'thinking');
      watchdog.logActivity('coder', Date.now() - 45000);
      // Thinking is allowed longer
      expect(watchdog.isStuck('coder')).toBe(false);
    });

    it('should flag stuck after extended thinking period', () => {
      const watchdog = createWatchdog({ thinkingTimeout: 120000 });
      watchdog.setStatus('coder', 'thinking');
      watchdog.logActivity('coder', Date.now() - 150000);
      expect(watchdog.isStuck('coder')).toBe(true);
    });

    it('should emit warning before marking as stuck', () => {
      const watchdog = createWatchdog({ timeout: 30000, warnAt: 20000 });
      const warnings: string[] = [];
      watchdog.onWarning((w: string) => warnings.push(w));
      watchdog.logActivity('coder', Date.now() - 25000);
      watchdog.check();
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should show stuck agents with special indicator in sidebar', () => {
      const watchdog = createWatchdog({ timeout: 30000 });
      watchdog.logActivity('coder', Date.now() - 60000);
      const visual = watchdog.getVisualStatus('coder');
      expect(visual).toMatch(/stuck|waiting|⏳/i);
    });

    it('should offer "poke" action for stuck agents', () => {
      const watchdog = createWatchdog({});
      watchdog.logActivity('coder', Date.now() - 60000);
      expect(watchdog.canPoke('coder')).toBe(true);
    });

    it('should poke stuck agent (resend last message)', async () => {
      const watchdog = createWatchdog({});
      await watchdog.poke('coder');
      expect(watchdog.getPokeCount('coder')).toBe(1);
    });

    it('should escalate to kill after N pokes', async () => {
      const watchdog = createWatchdog({ maxPokes: 3 });
      await watchdog.poke('coder');
      await watchdog.poke('coder');
      await watchdog.poke('coder');
      expect(watchdog.shouldEscalate('coder')).toBe(true);
    });

    it('should track all agents simultaneously', () => {
      const watchdog = createWatchdog({ timeout: 30000 });
      watchdog.logActivity('coder', Date.now() - 60000);
      watchdog.logActivity('reviewer', Date.now() - 5000);
      watchdog.logActivity('tester', Date.now() - 60000);
      const stuck = watchdog.getStuckAgents();
      expect(stuck).toContain('coder');
      expect(stuck).toContain('tester');
      expect(stuck).not.toContain('reviewer');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DEPENDENCY GRAPH (who's waiting on whom)
  // ─────────────────────────────────────────────────────────────────────────

  describe('dependency graph', () => {
    it('should track when agent waits on another agent', () => {
      const graph = createDependencyGraph();
      graph.addDependency('reviewer', 'coder'); // reviewer waits for coder
      expect(graph.getDependencies('reviewer')).toContain('coder');
    });

    it('should track when agent waits on HITL response', () => {
      const graph = createDependencyGraph();
      graph.addDependency('coder', 'hitl:prompt-1');
      expect(graph.getDependencies('coder')).toContain('hitl:prompt-1');
    });

    it('should track when agent waits on MCP server', () => {
      const graph = createDependencyGraph();
      graph.addDependency('coder', 'mcp:github');
      expect(graph.getDependencies('coder')).toContain('mcp:github');
    });

    it('should detect circular dependencies', () => {
      const graph = createDependencyGraph();
      graph.addDependency('a', 'b');
      graph.addDependency('b', 'c');
      graph.addDependency('c', 'a');
      expect(graph.hasCircular()).toBe(true);
    });

    it('should find critical path (longest dependency chain)', () => {
      const graph = createDependencyGraph();
      graph.addDependency('d', 'c');
      graph.addDependency('c', 'b');
      graph.addDependency('b', 'a');
      expect(graph.getCriticalPath()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('should remove dependency when resolved', () => {
      const graph = createDependencyGraph();
      graph.addDependency('reviewer', 'coder');
      graph.resolve('coder');
      expect(graph.getDependencies('reviewer')).not.toContain('coder');
    });

    it('should render dependency graph as ASCII', () => {
      const graph = createDependencyGraph();
      graph.addDependency('reviewer', 'coder');
      graph.addDependency('tester', 'coder');
      const rendered = graph.renderAscii(60);
      const output = rendered.join('\n');
      expect(output).toContain('coder');
      expect(output).toContain('reviewer');
      expect(output).toMatch(/[→←↓↑├└─│]/);
    });

    it('should show blocked agents in sidebar with dependency info', () => {
      const graph = createDependencyGraph();
      graph.addDependency('reviewer', 'coder');
      const tooltip = graph.getBlockedTooltip('reviewer');
      expect(tooltip).toContain('coder');
    });

    it('should show /deps command output', () => {
      const graph = createDependencyGraph();
      graph.addDependency('reviewer', 'coder');
      const rendered = graph.renderFull(80, 24);
      expect(rendered.join('\n')).toContain('reviewer');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BOTTLENECK DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  describe('bottleneck detection', () => {
    it('should detect when one agent blocks multiple others', () => {
      const detector = createBottleneckDetector();
      detector.addWaiter('reviewer', 'coder');
      detector.addWaiter('tester', 'coder');
      detector.addWaiter('deployer', 'coder');
      expect(detector.getBottlenecks()).toContain('coder');
    });

    it('should calculate bottleneck severity (number blocked)', () => {
      const detector = createBottleneckDetector();
      detector.addWaiter('a', 'coder');
      detector.addWaiter('b', 'coder');
      detector.addWaiter('c', 'coder');
      expect(detector.getSeverity('coder')).toBe(3);
    });

    it('should detect provider rate-limit as bottleneck', () => {
      const detector = createBottleneckDetector();
      detector.markProviderThrottled('bedrock', ['coder', 'reviewer', 'tester']);
      expect(detector.getBottlenecks()).toContain('provider:bedrock');
    });

    it('should detect HITL queue as bottleneck', () => {
      const detector = createBottleneckDetector();
      detector.markHitlBlocking(['coder', 'reviewer']);
      expect(detector.getBottlenecks()).toContain('hitl');
    });

    it('should recommend action for bottleneck', () => {
      const detector = createBottleneckDetector();
      detector.addWaiter('a', 'coder');
      detector.addWaiter('b', 'coder');
      const recommendation = detector.getRecommendation('coder');
      expect(recommendation).toBeDefined();
      expect(recommendation.length).toBeGreaterThan(0);
    });

    it('should render bottleneck alert in control channel', () => {
      const detector = createBottleneckDetector();
      detector.addWaiter('a', 'coder');
      detector.addWaiter('b', 'coder');
      const rendered = detector.renderAlert('coder');
      expect(rendered).toMatch(/bottleneck|blocking/i);
    });

    it('should auto-resolve bottleneck when blocker completes', () => {
      const detector = createBottleneckDetector();
      detector.addWaiter('reviewer', 'coder');
      detector.resolve('coder');
      expect(detector.getBottlenecks()).not.toContain('coder');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RATE-LIMIT COORDINATION
  // ─────────────────────────────────────────────────────────────────────────

  describe('rate-limit coordination', () => {
    it('should track shared rate limit across agents', () => {
      const coordinator = createRateLimitCoordinator({ rpm: 60 });
      coordinator.logRequest('coder');
      coordinator.logRequest('reviewer');
      expect(coordinator.getRequestsThisMinute()).toBe(2);
    });

    it('should throttle agents when approaching limit', () => {
      const coordinator = createRateLimitCoordinator({ rpm: 10 });
      for (let i = 0; i < 9; i++) {
        coordinator.logRequest('coder');
      }
      expect(coordinator.shouldThrottle()).toBe(true);
    });

    it('should distribute remaining capacity fairly', () => {
      const coordinator = createRateLimitCoordinator({ rpm: 10 });
      for (let i = 0; i < 6; i++) coordinator.logRequest('coder');
      const allocation = coordinator.getAllocation(['coder', 'reviewer', 'tester']);
      expect(allocation.coder + allocation.reviewer + allocation.tester).toBeLessThanOrEqual(4);
    });

    it('should prioritize high-priority agents for rate budget', () => {
      const coordinator = createRateLimitCoordinator({ rpm: 10 });
      coordinator.setPriority('coder', 'high');
      coordinator.setPriority('tester', 'low');
      for (let i = 0; i < 8; i++) coordinator.logRequest('tester');
      const allocation = coordinator.getAllocation(['coder', 'tester']);
      expect(allocation.coder).toBeGreaterThan(allocation.tester);
    });

    it('should show rate limit status per agent', () => {
      const coordinator = createRateLimitCoordinator({ rpm: 60 });
      coordinator.logRequest('coder');
      const status = coordinator.getAgentRateStatus('coder');
      expect(status.requestsUsed).toBe(1);
      expect(status.remaining).toBeDefined();
    });

    it('should queue requests when at limit', () => {
      const coordinator = createRateLimitCoordinator({ rpm: 2 });
      coordinator.logRequest('coder');
      coordinator.logRequest('coder');
      coordinator.queueRequest('reviewer');
      expect(coordinator.getQueueLength()).toBe(1);
    });

    it('should drain queue as rate window resets', () => {
      const coordinator = createRateLimitCoordinator({ rpm: 2 });
      coordinator.logRequest('coder');
      coordinator.logRequest('coder');
      coordinator.queueRequest('reviewer');
      coordinator.tick(60000); // 1 minute passes
      expect(coordinator.getQueueLength()).toBe(0);
    });

    it('should show rate status in status bar segment', () => {
      const coordinator = createRateLimitCoordinator({ rpm: 60 });
      for (let i = 0; i < 50; i++) coordinator.logRequest('coder');
      const segment = coordinator.renderStatusSegment();
      expect(segment).toMatch(/50\/60|83%/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COST PROJECTIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe('cost projections', () => {
    it('should project cost per minute based on recent usage', () => {
      const projector = createCostProjector();
      projector.logCost(0.10, Date.now() - 60000);
      projector.logCost(0.10, Date.now());
      expect(projector.getCostPerMinute()).toBeCloseTo(0.10);
    });

    it('should project time to budget exhaustion', () => {
      const projector = createCostProjector({ budget: 5.00, currentCost: 2.00 });
      projector.setCostRate(0.10); // $0.10/min
      expect(projector.getMinutesRemaining()).toBeCloseTo(30);
    });

    it('should show projection in status bar', () => {
      const projector = createCostProjector({ budget: 5.00, currentCost: 2.00 });
      projector.setCostRate(0.10);
      const segment = projector.renderProjection();
      expect(segment).toMatch(/30m|30 min/i);
    });

    it('should warn when projected to exhaust budget within 5 minutes', () => {
      const projector = createCostProjector({ budget: 5.00, currentCost: 4.50 });
      projector.setCostRate(0.15);
      const warnings: string[] = [];
      projector.onWarning((w: string) => warnings.push(w));
      projector.check();
      expect(warnings[0]).toMatch(/3.*min|budget.*soon/i);
    });

    it('should project per-agent cost trajectory', () => {
      const projector = createCostProjector({});
      projector.logAgentCost('coder', 0.50, 60000);
      projector.logAgentCost('coder', 1.00, 120000);
      const rate = projector.getAgentCostRate('coder');
      expect(rate).toBeGreaterThan(0);
    });

    it('should show cost-per-turn metric', () => {
      const projector = createCostProjector({});
      projector.logTurnCost(0.05);
      projector.logTurnCost(0.08);
      projector.logTurnCost(0.06);
      expect(projector.getAverageTurnCost()).toBeCloseTo(0.063, 2);
    });

    it('should detect cost spikes (sudden increase in rate)', () => {
      const projector = createCostProjector({});
      projector.logCost(0.01, Date.now() - 60000);
      projector.logCost(0.01, Date.now() - 30000);
      projector.logCost(0.50, Date.now()); // spike!
      expect(projector.detectSpike()).toBe(true);
    });

    it('should notify user of cost spike', () => {
      const projector = createCostProjector({});
      const notifications: string[] = [];
      projector.onWarning((n: string) => notifications.push(n));
      projector.logCost(0.01, Date.now() - 30000);
      projector.logCost(0.50, Date.now());
      projector.check();
      expect(notifications[0]).toMatch(/spike|surge|unusual/i);
    });
  });
});

describe('Smart Notifications', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // NOTIFICATION BATCHING
  // ─────────────────────────────────────────────────────────────────────────

  describe('batching', () => {
    it('should batch rapid-fire "done" notifications', () => {
      const notifier = createSmartNotifier();
      notifier.emit('agent:done', { agent: 'coder' });
      notifier.emit('agent:done', { agent: 'reviewer' });
      notifier.emit('agent:done', { agent: 'tester' });
      const batched = notifier.flush();
      expect(batched).toHaveLength(1); // one batched notification
      expect(batched[0].message).toMatch(/3 agents.*done|3.*completed/i);
    });

    it('should not batch if notifications are spaced apart', async () => {
      const notifier = createSmartNotifier({ batchWindow: 500 });
      notifier.emit('agent:done', { agent: 'coder' });
      await delay(600);
      notifier.emit('agent:done', { agent: 'reviewer' });
      const all = notifier.getAll();
      expect(all).toHaveLength(2); // separate notifications
    });

    it('should batch tool completion notifications', () => {
      const notifier = createSmartNotifier();
      for (let i = 0; i < 5; i++) {
        notifier.emit('tool:done', { agent: 'coder', tool: `Tool${i}` });
      }
      const batched = notifier.flush();
      expect(batched[0].message).toMatch(/5 tools/i);
    });

    it('should never batch error notifications (always show immediately)', () => {
      const notifier = createSmartNotifier();
      notifier.emit('agent:error', { agent: 'coder', error: 'crashed' });
      notifier.emit('agent:error', { agent: 'reviewer', error: 'timeout' });
      const all = notifier.getAll();
      expect(all).toHaveLength(2); // each error shown separately
    });

    it('should never batch HITL prompts', () => {
      const notifier = createSmartNotifier();
      notifier.emit('hitl:prompt', { agent: 'coder' });
      notifier.emit('hitl:prompt', { agent: 'reviewer' });
      const all = notifier.getAll();
      expect(all).toHaveLength(2);
    });

    it('should show batch summary with expand option', () => {
      const notifier = createSmartNotifier();
      for (let i = 0; i < 10; i++) {
        notifier.emit('agent:done', { agent: `agent-${i}` });
      }
      const batched = notifier.flush();
      expect(batched[0].expandable).toBe(true);
    });

    it('should expand batch on user action', () => {
      const notifier = createSmartNotifier();
      for (let i = 0; i < 5; i++) {
        notifier.emit('tool:done', { agent: 'coder', tool: `T${i}` });
      }
      const batched = notifier.flush();
      const expanded = notifier.expand(batched[0].id);
      expect(expanded).toHaveLength(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NOTIFICATION PRIORITY & ROUTING
  // ─────────────────────────────────────────────────────────────────────────

  describe('priority and routing', () => {
    it('should assign priority levels to notifications', () => {
      const notifier = createSmartNotifier();
      notifier.emit('agent:error', { agent: 'coder' });
      const all = notifier.getAll();
      expect(all[0].priority).toBe('high');
    });

    it('should assign low priority to routine events', () => {
      const notifier = createSmartNotifier();
      notifier.emit('agent:thinking', { agent: 'coder' });
      const all = notifier.getAll();
      expect(all[0].priority).toBe('low');
    });

    it('should filter notifications by current view mode', () => {
      const notifier = createSmartNotifier({ viewMode: 'focus', focusedAgent: 'coder' });
      notifier.emit('agent:done', { agent: 'reviewer' });
      const visible = notifier.getVisible();
      expect(visible).toHaveLength(0); // filtered out in focus mode
    });

    it('should always show high-priority notifications regardless of filter', () => {
      const notifier = createSmartNotifier({ viewMode: 'focus', focusedAgent: 'coder' });
      notifier.emit('agent:error', { agent: 'reviewer' });
      const visible = notifier.getVisible();
      expect(visible).toHaveLength(1); // errors always show
    });

    it('should suppress notifications from muted agents', () => {
      const notifier = createSmartNotifier({ mutedAgents: ['noisy'] });
      notifier.emit('agent:done', { agent: 'noisy' });
      const visible = notifier.getVisible();
      expect(visible).toHaveLength(0);
    });

    it('should show error notifications from muted agents (allowErrors)', () => {
      const notifier = createSmartNotifier({ mutedAgents: ['noisy'], muteConfig: { noisy: { allowErrors: true } } });
      notifier.emit('agent:error', { agent: 'noisy' });
      const visible = notifier.getVisible();
      expect(visible).toHaveLength(1);
    });

    it('should route notifications to appropriate view area', () => {
      const notifier = createSmartNotifier();
      notifier.emit('agent:done', { agent: 'coder' });
      const all = notifier.getAll();
      expect(all[0].target).toMatch(/chat|statusbar|sidebar/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SOUND / BELL
  // ─────────────────────────────────────────────────────────────────────────

  describe('sound and bell', () => {
    it('should ring terminal bell for high-priority events', () => {
      const notifier = createSmartNotifier({ soundEnabled: true });
      notifier.emit('agent:error', { agent: 'coder' });
      expect(notifier.getLastBell()).toBe(true);
    });

    it('should not ring bell for low-priority events', () => {
      const notifier = createSmartNotifier({ soundEnabled: true });
      notifier.emit('agent:thinking', { agent: 'coder' });
      expect(notifier.getLastBell()).toBe(false);
    });

    it('should ring bell for HITL prompt arrival', () => {
      const notifier = createSmartNotifier({ soundEnabled: true });
      notifier.emit('hitl:prompt', { agent: 'coder' });
      expect(notifier.getLastBell()).toBe(true);
    });

    it('should ring bell for budget warning', () => {
      const notifier = createSmartNotifier({ soundEnabled: true });
      notifier.emit('budget:warning', { percentage: 90 });
      expect(notifier.getLastBell()).toBe(true);
    });

    it('should respect sound disable config', () => {
      const notifier = createSmartNotifier({ soundEnabled: false });
      notifier.emit('agent:error', { agent: 'coder' });
      expect(notifier.getLastBell()).toBe(false);
    });

    it('should rate-limit bell (no more than 1 per 3 seconds)', () => {
      const notifier = createSmartNotifier({ soundEnabled: true });
      notifier.emit('agent:error', { agent: 'a' });
      notifier.emit('agent:error', { agent: 'b' });
      notifier.emit('agent:error', { agent: 'c' });
      expect(notifier.getBellCount()).toBe(1); // rate limited
    });

    it('should support custom bell patterns per event type', () => {
      const notifier = createSmartNotifier({ soundEnabled: true });
      notifier.emit('agent:done', { agent: 'coder' });
      expect(notifier.getLastBellPattern()).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVITY TIMELINE
  // ─────────────────────────────────────────────────────────────────────────

  describe('activity timeline', () => {
    it('should record all events with timestamps', () => {
      const timeline = createTimeline();
      timeline.log('agent:spawn', { agent: 'coder' });
      timeline.log('tool:call', { agent: 'coder', tool: 'Read' });
      expect(timeline.getAll()).toHaveLength(2);
    });

    it('should render timeline with time column', () => {
      const timeline = createTimeline();
      timeline.log('agent:spawn', { agent: 'coder' });
      const rendered = timeline.render(80, 24);
      expect(rendered.join('\n')).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should filter timeline by agent', () => {
      const timeline = createTimeline();
      timeline.log('tool:call', { agent: 'coder', tool: 'Read' });
      timeline.log('tool:call', { agent: 'reviewer', tool: 'Search' });
      const filtered = timeline.getByAgent('coder');
      expect(filtered).toHaveLength(1);
    });

    it('should filter timeline by event type', () => {
      const timeline = createTimeline();
      timeline.log('agent:spawn', { agent: 'coder' });
      timeline.log('tool:call', { agent: 'coder' });
      timeline.log('agent:done', { agent: 'coder' });
      const filtered = timeline.getByType('tool:call');
      expect(filtered).toHaveLength(1);
    });

    it('should filter timeline by time range', () => {
      const timeline = createTimeline();
      timeline.log('event-a', {}, Date.now() - 60000);
      timeline.log('event-b', {}, Date.now() - 30000);
      timeline.log('event-c', {}, Date.now());
      const filtered = timeline.getSince(Date.now() - 45000);
      expect(filtered).toHaveLength(2);
    });

    it('should show timeline with /timeline command', () => {
      const timeline = createTimeline();
      timeline.log('agent:spawn', { agent: 'coder' });
      const rendered = timeline.render(80, 24);
      expect(rendered.length).toBeGreaterThan(0);
    });

    it('should color-code events by type', () => {
      const timeline = createTimeline();
      timeline.log('agent:error', { agent: 'coder' });
      const rendered = timeline.render(80, 24);
      expect(rendered.join('\n')).toContain('\x1b[38;5;196m'); // red for error
    });

    it('should show event icons', () => {
      const timeline = createTimeline();
      timeline.log('agent:spawn', {});
      timeline.log('tool:call', {});
      timeline.log('hitl:prompt', {});
      const rendered = timeline.render(80, 24);
      const output = rendered.join('\n');
      expect(output).toMatch(/[●⚙?✓✗⚠]/);
    });

    it('should support breadcrumb mode (last N events as single line)', () => {
      const timeline = createTimeline();
      for (let i = 0; i < 10; i++) timeline.log(`event-${i}`, {});
      const breadcrumb = timeline.renderBreadcrumb(5, 80);
      expect(stripAnsi(breadcrumb).length).toBeLessThanOrEqual(80);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SEARCHABLE HISTORY
  // ─────────────────────────────────────────────────────────────────────────

  describe('searchable history', () => {
    it('should search across all agent output', () => {
      const search = createSearchableHistory();
      search.index({ agent: 'coder', content: 'implemented the auth module', turn: 1 });
      search.index({ agent: 'reviewer', content: 'looks good to me', turn: 1 });
      const results = search.search('auth');
      expect(results).toHaveLength(1);
      expect(results[0].agent).toBe('coder');
    });

    it('should search tool inputs and outputs', () => {
      const search = createSearchableHistory();
      search.indexTool({ agent: 'coder', tool: 'Read', input: { file_path: 'src/auth/login.ts' } });
      const results = search.search('login.ts');
      expect(results).toHaveLength(1);
    });

    it('should support regex search', () => {
      const search = createSearchableHistory();
      search.index({ agent: 'coder', content: 'error: ENOENT at line 42', turn: 1 });
      search.index({ agent: 'coder', content: 'all tests passing', turn: 2 });
      const results = search.search(/error:.*line \d+/);
      expect(results).toHaveLength(1);
    });

    it('should highlight matches in results', () => {
      const search = createSearchableHistory();
      search.index({ agent: 'coder', content: 'fixed the auth bug', turn: 1 });
      const results = search.search('auth');
      const rendered = search.renderResult(results[0], 80);
      expect(rendered).toContain('\x1b[7m'); // inverse for highlight
    });

    it('should show context around match', () => {
      const search = createSearchableHistory();
      search.index({ agent: 'coder', content: 'line before\nthe matching line here\nline after', turn: 1 });
      const results = search.search('matching');
      const rendered = search.renderResult(results[0], 80);
      expect(rendered).toContain('line before');
    });

    it('should navigate between search results', () => {
      const search = createSearchableHistory();
      search.index({ agent: 'coder', content: 'auth first', turn: 1 });
      search.index({ agent: 'coder', content: 'auth second', turn: 2 });
      const results = search.search('auth');
      expect(results).toHaveLength(2);
      expect(search.canNavigate(results)).toBe(true);
    });

    it('should show match count', () => {
      const search = createSearchableHistory();
      search.index({ agent: 'coder', content: 'auth', turn: 1 });
      search.index({ agent: 'coder', content: 'auth', turn: 2 });
      const results = search.search('auth');
      expect(search.getMatchCount(results)).toBe(2);
    });

    it('should search with /search or Ctrl+F command', () => {
      const search = createSearchableHistory();
      expect(search.isSearchMode).toBeDefined();
    });

    it('should render search bar with live results', () => {
      const search = createSearchableHistory();
      search.index({ agent: 'coder', content: 'test content', turn: 1 });
      const rendered = search.renderSearchBar('test', 80);
      expect(rendered).toContain('1 result');
    });

    it('should persist search index across session restore', () => {
      const search = createSearchableHistory();
      search.index({ agent: 'coder', content: 'important', turn: 1 });
      const exported = search.export();
      expect(exported.entries).toHaveLength(1);
    });
  });
});

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
