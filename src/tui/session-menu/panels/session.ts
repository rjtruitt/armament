/**
 * Panel definitions for session budget, rate limiting, and context.
 */

import type { MenuPanel, SessionMenuConfig } from '../types.js';

/** Registers session and context panels into the given map. */
export function registerSessionPanels(panels: Map<string, MenuPanel>, config: SessionMenuConfig): void {
  panels.set('session', {
    id: 'session',
    title: 'Session',
    parent: 'root',
    items: [
      { id: 'session.budget', label: 'Budget', description: 'Spending limit', type: 'submenu' },
      { id: 'session.maxRetries', label: 'Max retries', description: '0-10', type: 'text', value: '3' },
      { id: 'session.streaming', label: 'Streaming', description: 'Stream responses', type: 'toggle', value: true },
      { id: 'session.autoSave', label: 'Auto-save', description: 'Save conversation', type: 'toggle', value: true },
      { id: 'session.promptCaching', label: 'Prompt caching', description: 'Cache system prompts', type: 'toggle', value: true },
      { id: 'session.maxTurns', label: 'Orchestrator max turns', description: '0 = infinite', type: 'text', value: '100' },
      { id: 'session.workerMaxTurns', label: 'Worker max turns', description: '0 = infinite', type: 'text', value: '250' },
      { id: 'session.conversationTimeout', label: 'Conversation timeout', description: 'Minutes', type: 'text', value: '60' },
      { id: 'session.ratelimit', label: 'Rate limiting', description: 'RPM, TPM, burst', type: 'submenu' },
      { id: 'history', label: 'History Management', description: 'Nudge & scribe settings', type: 'submenu' },
    ],
  });

  panels.set('session.budget', {
    id: 'session.budget',
    title: 'Budget',
    parent: 'session',
    items: [
      { id: 'session.budget.enabled', label: 'Enabled', description: 'Enforce spending limit', type: 'toggle', value: true },
      { id: 'session.budget.amount', label: 'Limit', description: 'Session spending cap ($)', type: 'text', value: config.budget },
    ],
  });

  panels.set('session.ratelimit', {
    id: 'session.ratelimit',
    title: 'Rate Limiting',
    parent: 'session',
    items: [
      { id: 'session.ratelimit.enabled', label: 'Enabled', description: 'Enable rate limiting', type: 'toggle', value: true },
      { id: 'session.ratelimit.rpm', label: 'RPM', description: 'Requests per minute', type: 'text', value: '60' },
      { id: 'session.ratelimit.tpm', label: 'TPM', description: 'Tokens per minute', type: 'text', value: '100000' },
      { id: 'session.ratelimit.burst', label: 'Burst allowance', description: 'Extra burst capacity', type: 'text', value: '10' },
      { id: 'session.ratelimit.cooldown', label: 'Cooldown period', description: 'Seconds', type: 'text', value: '5' },
    ],
  });

  panels.set('context', {
    id: 'context',
    title: 'Context Window',
    parent: 'root',
    items: [
      { id: 'context.maxTokens', label: 'Max tokens', description: 'Total context window size', type: 'text', value: '200000' },
      { id: 'context.compactThreshold', label: 'Compact threshold', description: '0.0 - 1.0', type: 'text', value: '0.85' },
      { id: 'context.recentMessages', label: 'Recent messages to keep', description: 'On compaction', type: 'text', value: '10' },
      { id: 'context.summaryRatio', label: 'Summary target ratio', description: '0.0 - 1.0', type: 'text', value: '0.12' },
      { id: 'context.antiThrash', label: 'Anti-thrash attempts', description: 'Max compact retries', type: 'text', value: '3' },
      { id: 'context.maxSnapshots', label: 'Max snapshots', description: 'Context snapshots kept', type: 'text', value: '50' },
      { id: 'context.autoCompact', label: 'Auto-compact', description: 'Compact on threshold', type: 'toggle', value: true },
      {
        id: 'context.strategy', label: 'Compaction strategy', type: 'choice', value: 'summary',
        choices: [
          { id: 'summary', label: 'summary', description: 'Summarize older messages' },
          { id: 'sliding', label: 'sliding', description: 'Drop oldest messages' },
          { id: 'hybrid', label: 'hybrid', description: 'Summary + sliding window' },
        ],
      },
    ],
  });

  panels.set('history', {
    id: 'history',
    title: 'History Management',
    parent: 'root',
    items: [
      { id: 'history.recurringPromptEnabled', label: 'Recurring Prompt', description: 'Recurring prompt from reminder_prompt.md', type: 'toggle', value: true },
      { id: 'history.recurringPromptInterval', label: 'Prompt Interval', description: 'Minutes', type: 'text', value: '5' },
      { id: 'history.historyScribeEnabled', label: 'Scribe Worker', description: 'Background documentation worker', type: 'toggle', value: true },
      { id: 'history.scribeOnPrune', label: 'Scribe on Prune', description: 'Fire on state file rollover', type: 'toggle', value: true },
      { id: 'history.scribeOnIdle', label: 'Scribe on Idle', description: 'Fire after idle timeout', type: 'toggle', value: true },
      { id: 'history.historyScribeTimeout', label: 'Idle Timeout', description: 'Minutes', type: 'text', value: '15' },
      { id: 'history.scribeIntervalEnabled', label: 'Scribe on Timer ⚠', description: 'Full state injection, expensive!', type: 'toggle', value: false },
      { id: 'history.scribeIntervalMinutes', label: 'Timer Interval', description: 'Minutes', type: 'text', value: '60' },
      { id: 'history.historyScribeMaxMessages', label: 'Max Messages', description: '0 = all', type: 'text', value: '50' },
      { id: 'history.historyScribeModel', label: 'Scribe Model', description: 'Empty = default', type: 'text', value: '' },
    ],
  });
}
