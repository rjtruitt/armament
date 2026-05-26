/**
 * TDD test suite for Armament status bar.
 * The persistent info bar at the bottom — like BitchX/LiCe status line but for AI.
 * Shows model, agents, latency, context, cost, pending prompts, git, providers.
 * All tests RED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStatusBar, stripAnsi } from '../core/StatusBar';

describe('Status Bar', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // FULL BAR RENDERING
  // ─────────────────────────────────────────────────────────────────────────

  describe('full bar rendering', () => {
    it('should render to exactly terminal width', () => {
      const bar = createStatusBar({ width: 120 });
      const rendered = bar.render();
      expect(stripAnsi(rendered).length).toBe(120);
    });

    it('should separate segments with pipe', () => {
      const bar = createStatusBar({});
      const rendered = bar.render();
      expect(rendered).toContain('│');
    });

    it('should use background color for bar', () => {
      const bar = createStatusBar({});
      const rendered = bar.render();
      expect(rendered).toContain('\x1b[48;5;'); // bg256
    });

    it('should pad segments to fill width', () => {
      const bar = createStatusBar({ width: 100 });
      const rendered = bar.render();
      expect(stripAnsi(rendered).length).toBe(100);
    });

    it('should truncate gracefully when terminal too narrow', () => {
      const bar = createStatusBar({ width: 40 });
      const rendered = bar.render();
      expect(stripAnsi(rendered).length).toBeLessThanOrEqual(40);
    });

    it('should collapse segments by priority when space is tight', () => {
      const bar = createStatusBar({ width: 50 });
      const rendered = bar.render();
      // essential segments (model, agents) should still show
      expect(rendered).toContain('sonnet');
    });

    it('should update when terminal resizes', () => {
      const bar = createStatusBar({ width: 120 });
      bar.resize(80);
      const rendered = bar.render();
      expect(stripAnsi(rendered).length).toBe(80);
    });

    it('should render double-height bar when configured', () => {
      const bar = createStatusBar({ doubleHeight: true });
      const rendered = bar.renderMultiLine();
      expect(rendered).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MODEL SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('model segment', () => {
    it('should show current model name', () => {
      const bar = createStatusBar({ model: 'claude-sonnet' });
      const segment = bar.getSegment('model');
      expect(segment).toContain('sonnet');
    });

    it('should abbreviate long model names', () => {
      const bar = createStatusBar({ model: 'claude-3-5-sonnet-20241022' });
      const segment = bar.getSegment('model');
      expect(stripAnsi(segment).length).toBeLessThan(20);
    });

    it('should show model with provider prefix', () => {
      const bar = createStatusBar({ model: 'sonnet', provider: 'bedrock' });
      const segment = bar.getSegment('model');
      expect(segment).toMatch(/bedrock|br/i);
    });

    it('should colorize model name', () => {
      const bar = createStatusBar({ model: 'sonnet' });
      const segment = bar.getSegment('model');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should show model icon/bracket style', () => {
      const bar = createStatusBar({ model: 'sonnet' });
      const segment = bar.getSegment('model');
      expect(segment).toMatch(/[\[\]()]/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AGENT COUNT SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('agent count segment', () => {
    it('should show number of active agents', () => {
      const bar = createStatusBar({ activeAgents: 3 });
      const segment = bar.getSegment('agents');
      expect(segment).toContain('3');
    });

    it('should show active/total ratio', () => {
      const bar = createStatusBar({ activeAgents: 3, totalAgents: 5 });
      const segment = bar.getSegment('agents');
      expect(segment).toMatch(/3\/5|3.+5/);
    });

    it('should color green when all healthy', () => {
      const bar = createStatusBar({ activeAgents: 3, errorAgents: 0 });
      const segment = bar.getSegment('agents');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color yellow when some errored', () => {
      const bar = createStatusBar({ activeAgents: 3, errorAgents: 1 });
      const segment = bar.getSegment('agents');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color red when majority errored', () => {
      const bar = createStatusBar({ activeAgents: 1, errorAgents: 4 });
      const segment = bar.getSegment('agents');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should show agent status dot', () => {
      const bar = createStatusBar({ activeAgents: 2 });
      const segment = bar.getSegment('agents');
      expect(segment).toMatch(/[●○◉]/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LATENCY SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('latency segment', () => {
    it('should show last request latency', () => {
      const bar = createStatusBar({ latencyMs: 450 });
      const segment = bar.getSegment('latency');
      expect(segment).toMatch(/450|0\.4/);
    });

    it('should format as seconds when > 1000ms', () => {
      const bar = createStatusBar({ latencyMs: 2100 });
      const segment = bar.getSegment('latency');
      expect(segment).toMatch(/2\.1s/);
    });

    it('should format as ms when < 1000', () => {
      const bar = createStatusBar({ latencyMs: 350 });
      const segment = bar.getSegment('latency');
      expect(segment).toMatch(/350ms/);
    });

    it('should color green when fast (< 500ms)', () => {
      const bar = createStatusBar({ latencyMs: 200 });
      const segment = bar.getSegment('latency');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color yellow when moderate (500-2000ms)', () => {
      const bar = createStatusBar({ latencyMs: 1200 });
      const segment = bar.getSegment('latency');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color red when slow (> 2000ms)', () => {
      const bar = createStatusBar({ latencyMs: 5000 });
      const segment = bar.getSegment('latency');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should show timer icon', () => {
      const bar = createStatusBar({ latencyMs: 450 });
      const segment = bar.getSegment('latency');
      expect(segment).toMatch(/[⏱⌛◷]/);
    });

    it('should show "—" when no requests yet', () => {
      const bar = createStatusBar({ latencyMs: undefined });
      const segment = bar.getSegment('latency');
      expect(segment).toMatch(/[—-]/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONTEXT WINDOW SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('context window segment', () => {
    it('should show used/total tokens', () => {
      const bar = createStatusBar({ contextUsed: 45000, contextCapacity: 200000 });
      const segment = bar.getSegment('context');
      expect(segment).toMatch(/45k.*200k/);
    });

    it('should show percentage filled', () => {
      const bar = createStatusBar({ contextUsed: 100000, contextCapacity: 200000 });
      const segment = bar.getSegment('context');
      expect(segment).toContain('50%');
    });

    it('should show mini progress bar', () => {
      const bar = createStatusBar({ contextUsed: 100000, contextCapacity: 200000 });
      const segment = bar.getSegment('context');
      expect(segment).toMatch(/[█░▓▒]/);
    });

    it('should color green when < 60%', () => {
      const bar = createStatusBar({ contextUsed: 50000, contextCapacity: 200000 });
      const segment = bar.getSegment('context');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color yellow when 60-80%', () => {
      const bar = createStatusBar({ contextUsed: 150000, contextCapacity: 200000 });
      const segment = bar.getSegment('context');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color red when > 80%', () => {
      const bar = createStatusBar({ contextUsed: 180000, contextCapacity: 200000 });
      const segment = bar.getSegment('context');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should flash/blink when > 95%', () => {
      const bar = createStatusBar({ contextUsed: 196000, contextCapacity: 200000 });
      const segment = bar.getSegment('context');
      expect(segment).toContain('\x1b[5m'); // blink
    });

    it('should abbreviate large numbers (k suffix)', () => {
      const bar = createStatusBar({ contextUsed: 123456, contextCapacity: 200000 });
      const segment = bar.getSegment('context');
      expect(segment).toMatch(/123k|123\.4k/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COST SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('cost segment', () => {
    it('should show session cost', () => {
      const bar = createStatusBar({ cost: 0.23 });
      const segment = bar.getSegment('cost');
      expect(segment).toContain('$0.23');
    });

    it('should show cost with 2 decimal places', () => {
      const bar = createStatusBar({ cost: 1.5 });
      const segment = bar.getSegment('cost');
      expect(segment).toContain('$1.50');
    });

    it('should color green when within budget', () => {
      const bar = createStatusBar({ cost: 0.50, budget: 5.00 });
      const segment = bar.getSegment('cost');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color yellow when approaching budget (> 70%)', () => {
      const bar = createStatusBar({ cost: 4.00, budget: 5.00 });
      const segment = bar.getSegment('cost');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color red when over budget', () => {
      const bar = createStatusBar({ cost: 5.50, budget: 5.00 });
      const segment = bar.getSegment('cost');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should show cost/budget ratio when budget set', () => {
      const bar = createStatusBar({ cost: 2.00, budget: 10.00 });
      const segment = bar.getSegment('cost');
      expect(segment).toMatch(/\$2\.00.*\$10|2\/10/);
    });

    it('should show tokens per minute rate', () => {
      const bar = createStatusBar({ tokensPerMin: 1200 });
      const segment = bar.getSegment('cost');
      expect(segment).toMatch(/1\.?2k?\s*t(ok)?\/m(in)?/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PENDING PROMPTS SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('pending prompts segment', () => {
    it('should show pending prompt count', () => {
      const bar = createStatusBar({ pendingPrompts: 3 });
      const segment = bar.getSegment('prompts');
      expect(segment).toContain('3');
    });

    it('should show question mark icon', () => {
      const bar = createStatusBar({ pendingPrompts: 1 });
      const segment = bar.getSegment('prompts');
      expect(segment).toContain('?');
    });

    it('should be hidden when no pending prompts', () => {
      const bar = createStatusBar({ pendingPrompts: 0 });
      const segment = bar.getSegment('prompts');
      expect(segment).toBe('');
    });

    it('should flash when new prompt arrives', () => {
      const bar = createStatusBar({ pendingPrompts: 1, promptsFlash: true });
      const segment = bar.getSegment('prompts');
      expect(segment).toMatch(/\x1b\[5m|\x1b\[1m/); // blink or bold
    });

    it('should show which agent is asking', () => {
      const bar = createStatusBar({ pendingPrompts: 1, promptAgent: 'Coder' });
      const segment = bar.getSegment('prompts');
      expect(segment).toContain('Coder');
    });

    it('should color yellow for waiting prompts', () => {
      const bar = createStatusBar({ pendingPrompts: 2 });
      const segment = bar.getSegment('prompts');
      expect(segment).toContain('\x1b[38;5;');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GIT SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('git segment', () => {
    it('should show branch name', () => {
      const bar = createStatusBar({ gitBranch: 'feat/auth' });
      const segment = bar.getSegment('git');
      expect(segment).toContain('feat/auth');
    });

    it('should show ahead/behind indicators', () => {
      const bar = createStatusBar({ gitBranch: 'main', gitAhead: 2, gitBehind: 1 });
      const segment = bar.getSegment('git');
      expect(segment).toContain('↑2');
      expect(segment).toContain('↓1');
    });

    it('should color green for clean branch', () => {
      const bar = createStatusBar({ gitBranch: 'main', gitDirty: false });
      const segment = bar.getSegment('git');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color yellow for dirty branch', () => {
      const bar = createStatusBar({ gitBranch: 'main', gitDirty: true });
      const segment = bar.getSegment('git');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should show uncommitted count', () => {
      const bar = createStatusBar({ gitBranch: 'main', gitUncommitted: 5 });
      const segment = bar.getSegment('git');
      expect(segment).toContain('5');
    });

    it('should show branch icon', () => {
      const bar = createStatusBar({ gitBranch: 'main' });
      const segment = bar.getSegment('git');
      expect(segment).toMatch(/[⎇⑂]/);
    });

    it('should indicate shadow mode active', () => {
      const bar = createStatusBar({ gitBranch: 'main', gitShadow: true });
      const segment = bar.getSegment('git');
      expect(segment).toMatch(/shadow|◐/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PROVIDER HEALTH SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('provider health segment', () => {
    it('should show provider status dot', () => {
      const bar = createStatusBar({ providerStatus: 'healthy' });
      const segment = bar.getSegment('provider');
      expect(segment).toContain('●');
    });

    it('should color green when healthy', () => {
      const bar = createStatusBar({ providerStatus: 'healthy' });
      const segment = bar.getSegment('provider');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color yellow when rate-limited', () => {
      const bar = createStatusBar({ providerStatus: 'rate-limited' });
      const segment = bar.getSegment('provider');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color red when down', () => {
      const bar = createStatusBar({ providerStatus: 'down' });
      const segment = bar.getSegment('provider');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should show provider name when rate-limited', () => {
      const bar = createStatusBar({ providerStatus: 'rate-limited', provider: 'bedrock' });
      const segment = bar.getSegment('provider');
      expect(segment).toContain('bedrock');
    });

    it('should show retry countdown when rate-limited', () => {
      const bar = createStatusBar({ providerStatus: 'rate-limited', retryInMs: 5000 });
      const segment = bar.getSegment('provider');
      expect(segment).toMatch(/5s|retry/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MCP SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('mcp segment', () => {
    it('should show connected server count', () => {
      const bar = createStatusBar({ mcpConnected: 3, mcpTotal: 4 });
      const segment = bar.getSegment('mcp');
      expect(segment).toMatch(/3\/4|3.+4/);
    });

    it('should be hidden when no MCP servers configured', () => {
      const bar = createStatusBar({ mcpTotal: 0 });
      const segment = bar.getSegment('mcp');
      expect(segment).toBe('');
    });

    it('should color green when all connected', () => {
      const bar = createStatusBar({ mcpConnected: 3, mcpTotal: 3 });
      const segment = bar.getSegment('mcp');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should color yellow when some disconnected', () => {
      const bar = createStatusBar({ mcpConnected: 2, mcpTotal: 4 });
      const segment = bar.getSegment('mcp');
      expect(segment).toContain('\x1b[38;5;');
    });

    it('should show mcp label', () => {
      const bar = createStatusBar({ mcpConnected: 2, mcpTotal: 3 });
      const segment = bar.getSegment('mcp');
      expect(segment).toMatch(/mcp/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CLOCK / UPTIME SEGMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe('clock segment', () => {
    it('should show session uptime', () => {
      const bar = createStatusBar({ uptimeMs: 3600000 });
      const segment = bar.getSegment('clock');
      expect(segment).toMatch(/1h|1:00:00|60m/);
    });

    it('should format short durations as minutes', () => {
      const bar = createStatusBar({ uptimeMs: 300000 });
      const segment = bar.getSegment('clock');
      expect(segment).toMatch(/5m|5:00/);
    });

    it('should show current time when configured', () => {
      const bar = createStatusBar({ showClock: true });
      const segment = bar.getSegment('clock');
      expect(segment).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SEGMENT ORDERING & CUSTOMIZATION
  // ─────────────────────────────────────────────────────────────────────────

  describe('customization', () => {
    it('should allow custom segment order', () => {
      const bar = createStatusBar({
        segmentOrder: ['git', 'model', 'cost'],
      });
      const rendered = bar.render();
      const gitPos = rendered.indexOf('main');
      const modelPos = rendered.indexOf('sonnet');
      expect(gitPos).toBeLessThan(modelPos);
    });

    it('should allow hiding segments', () => {
      const bar = createStatusBar({ hiddenSegments: ['clock', 'mcp'] });
      const rendered = bar.render();
      expect(rendered).not.toMatch(/mcp/i);
    });

    it('should allow custom separator char', () => {
      const bar = createStatusBar({ separator: ' ┃ ' });
      const rendered = bar.render();
      expect(rendered).toContain('┃');
    });

    it('should support compact mode (shorter labels)', () => {
      const bar = createStatusBar({ compact: true, model: 'sonnet' });
      const segment = bar.getSegment('model');
      expect(stripAnsi(segment).length).toBeLessThan(10);
    });

    it('should support verbose mode (longer labels)', () => {
      const bar = createStatusBar({ compact: false, model: 'sonnet' });
      const segment = bar.getSegment('model');
      expect(segment).toMatch(/model|claude/i);
    });

    it('should respond to /statusbar config command', () => {
      const bar = createStatusBar({});
      bar.configure({ hiddenSegments: ['clock'] });
      const rendered = bar.render();
      expect(rendered).not.toMatch(/\d{1,2}:\d{2}/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE ANIMATION
  // ─────────────────────────────────────────────────────────────────────────

  describe('update animation', () => {
    it('should flash segment briefly when value changes', () => {
      const bar = createStatusBar({ cost: 0.20 });
      bar.update({ cost: 0.25 });
      const segment = bar.getSegment('cost');
      expect(segment).toContain('\x1b[1m'); // bold flash
    });

    it('should animate context bar filling', () => {
      const bar = createStatusBar({ contextUsed: 50000, contextCapacity: 200000 });
      bar.update({ contextUsed: 60000 });
      const segment = bar.getSegment('context');
      expect(segment).toContain('█');
    });

    it('should pulse pending prompts when new one arrives', () => {
      const bar = createStatusBar({ pendingPrompts: 1 });
      bar.update({ pendingPrompts: 2 });
      const segment = bar.getSegment('prompts');
      expect(segment).toMatch(/\x1b\[5m|\x1b\[1m/);
    });
  });
});

