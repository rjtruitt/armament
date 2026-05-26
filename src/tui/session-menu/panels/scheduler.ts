/**
 * Panel definitions for the scheduler system: workflows, pollers, triggers.
 */

import type { MenuPanel } from '../types.js';

/** Registers all scheduler-related panels into the given map. */
export function registerSchedulerPanels(panels: Map<string, MenuPanel>): void {
  panels.set('scheduler', {
    id: 'scheduler',
    title: 'Scheduler',
    parent: 'root',
    items: [
      { id: 'scheduler.enabled', label: 'Enabled', description: 'Run scheduled workflows', type: 'toggle', value: true },
      { id: 'scheduler.workflows', label: 'Workflows', description: 'Manage workflow definitions', type: 'submenu' },
      { id: 'scheduler.pollers', label: 'Pollers', description: 'External service polling', type: 'submenu' },
      { id: 'scheduler.triggers', label: 'Triggers', description: 'Event-driven workflow triggers', type: 'submenu' },
      { id: 'scheduler.defaults', label: 'Defaults', description: 'Default schedule & agent config', type: 'submenu' },
      { id: 'scheduler.history', label: 'Run history', description: 'View past executions', type: 'submenu' },
    ],
  });

  registerWorkflowPanels(panels);
  registerPollerPanels(panels);
  registerTriggerPanels(panels);
  registerSchedulerDefaultsPanels(panels);
}

function registerWorkflowPanels(panels: Map<string, MenuPanel>): void {
  panels.set('scheduler.workflows', {
    id: 'scheduler.workflows',
    title: 'Workflows',
    parent: 'scheduler',
    items: [
      { id: 'scheduler.workflows.slackTriage', label: 'slack-triage', description: 'Poll Slack → agent triage', type: 'submenu' },
      { id: 'scheduler.workflows.docGen', label: 'doc-generation', description: 'Scheduled documentation builds', type: 'submenu' },
      { id: 'scheduler.workflows.healthCheck', label: 'health-check', description: 'Periodic system health checks', type: 'submenu' },
      { id: 'scheduler.workflows.new', label: '+ New workflow', description: 'Create a workflow definition', type: 'submenu' },
      { id: 'scheduler.workflows.json', label: '{ } Edit JSON', description: 'Edit all workflows directly', type: 'json' },
    ],
  });

  panels.set('scheduler.workflows.slackTriage', {
    id: 'scheduler.workflows.slackTriage',
    title: 'Slack Triage Workflow',
    parent: 'scheduler.workflows',
    items: [
      { id: 'scheduler.workflows.slackTriage.enabled', label: 'Enabled', description: 'Active', type: 'toggle', value: true },
      {
        id: 'scheduler.workflows.slackTriage.schedule', label: 'Schedule type', type: 'choice', value: 'interval',
        choices: [
          { id: 'interval', label: 'interval', description: 'Fixed interval' },
          { id: 'cron', label: 'cron', description: 'Cron expression' },
          { id: 'event', label: 'event', description: 'On poller items' },
        ],
      },
      { id: 'scheduler.workflows.slackTriage.interval', label: 'Interval', description: 'e.g. 5m, 1h, 30s', type: 'text', value: '5m' },
      { id: 'scheduler.workflows.slackTriage.cron', label: 'Cron', description: '*/5 * * * *', type: 'text', value: '' },
      { id: 'scheduler.workflows.slackTriage.channel', label: 'Target channel', description: 'Agent channel to receive items', type: 'text', value: 'sec-ops' },
      { id: 'scheduler.workflows.slackTriage.pollSource', label: 'Poll source', description: 'Poller ID to consume from', type: 'text', value: 'slack-messages' },
      {
        id: 'scheduler.workflows.slackTriage.priority', label: 'Priority', type: 'choice', value: 'normal',
        choices: [
          { id: 'low', label: 'low' },
          { id: 'normal', label: 'normal' },
          { id: 'high', label: 'high' },
          { id: 'critical', label: 'critical' },
        ],
      },
      { id: 'scheduler.workflows.slackTriage.maxRuns', label: 'Max runs', description: '0 = unlimited', type: 'text', value: '0' },
      { id: 'scheduler.workflows.slackTriage.budget', label: 'Budget per run', description: '$', type: 'text', value: '0.50' },
      { id: 'scheduler.workflows.slackTriage.steps', label: 'Steps', description: 'Configure workflow steps', type: 'submenu' },
    ],
  });

  panels.set('scheduler.workflows.slackTriage.steps', {
    id: 'scheduler.workflows.slackTriage.steps',
    title: 'Slack Triage Steps',
    parent: 'scheduler.workflows.slackTriage',
    items: [
      { id: 'scheduler.workflows.slackTriage.steps.fetch', label: '1. Fetch messages', description: 'slack_get_messages', type: 'display' },
      { id: 'scheduler.workflows.slackTriage.steps.classify', label: '2. Classify urgency', description: 'Agent classifies messages', type: 'display' },
      { id: 'scheduler.workflows.slackTriage.steps.route', label: '3. Route to channel', description: 'Forward to appropriate agent', type: 'display' },
      { id: 'scheduler.workflows.slackTriage.steps.respond', label: '4. Auto-respond', description: 'Send acknowledgement', type: 'toggle', value: true },
      { id: 'scheduler.workflows.slackTriage.steps.notify', label: '5. Notify on critical', description: 'Alert on urgent items', type: 'toggle', value: true },
    ],
  });

  panels.set('scheduler.workflows.docGen', {
    id: 'scheduler.workflows.docGen',
    title: 'Doc Generation Workflow',
    parent: 'scheduler.workflows',
    items: [
      { id: 'scheduler.workflows.docGen.enabled', label: 'Enabled', description: 'Active', type: 'toggle', value: false },
      {
        id: 'scheduler.workflows.docGen.schedule', label: 'Schedule type', type: 'choice', value: 'cron',
        choices: [
          { id: 'interval', label: 'interval' },
          { id: 'cron', label: 'cron' },
          { id: 'manual', label: 'manual', description: 'Only run on demand' },
        ],
      },
      { id: 'scheduler.workflows.docGen.cron', label: 'Cron', description: 'Cron expression', type: 'text', value: '0 2 * * *' },
      { id: 'scheduler.workflows.docGen.source', label: 'Source', description: 'Code paths to document', type: 'text', value: 'src/' },
      {
        id: 'scheduler.workflows.docGen.output', label: 'Output target', type: 'choice', value: 'confluence',
        choices: [
          { id: 'confluence', label: 'confluence', description: 'Publish to Confluence' },
          { id: 'markdown', label: 'markdown', description: 'Write to docs/' },
          { id: 'notion', label: 'notion', description: 'Publish to Notion' },
        ],
      },
      { id: 'scheduler.workflows.docGen.spaceKey', label: 'Confluence space', description: 'Target space key', type: 'text', value: 'ARCH' },
      { id: 'scheduler.workflows.docGen.budget', label: 'Budget per run', description: '$', type: 'text', value: '2.00' },
    ],
  });

  panels.set('scheduler.workflows.healthCheck', {
    id: 'scheduler.workflows.healthCheck',
    title: 'Health Check Workflow',
    parent: 'scheduler.workflows',
    items: [
      { id: 'scheduler.workflows.healthCheck.enabled', label: 'Enabled', description: 'Active', type: 'toggle', value: true },
      {
        id: 'scheduler.workflows.healthCheck.schedule', label: 'Schedule type', type: 'choice', value: 'interval',
        choices: [
          { id: 'interval', label: 'interval' },
          { id: 'cron', label: 'cron' },
        ],
      },
      { id: 'scheduler.workflows.healthCheck.interval', label: 'Interval', description: 'e.g. 10m, 1h', type: 'text', value: '10m' },
      { id: 'scheduler.workflows.healthCheck.targets', label: 'Check targets', description: 'Comma-separated services', type: 'text', value: 'providers,mcp,agents,memory' },
      { id: 'scheduler.workflows.healthCheck.alertChannel', label: 'Alert channel', description: 'Agent channel for alerts', type: 'text', value: 'alerts' },
      { id: 'scheduler.workflows.healthCheck.autoRecover', label: 'Auto-recover', description: 'Attempt recovery on failure', type: 'toggle', value: true },
    ],
  });

  panels.set('scheduler.workflows.new', {
    id: 'scheduler.workflows.new',
    title: 'New Workflow',
    parent: 'scheduler.workflows',
    items: [
      { id: 'scheduler.workflows.new.id', label: 'Workflow ID', description: 'kebab-case identifier', type: 'text', value: '' },
      { id: 'scheduler.workflows.new.name', label: 'Display name', description: 'Human-readable name', type: 'text', value: '' },
      {
        id: 'scheduler.workflows.new.schedule', label: 'Schedule type', type: 'choice', value: 'interval',
        choices: [
          { id: 'interval', label: 'interval' },
          { id: 'cron', label: 'cron' },
          { id: 'event', label: 'event' },
          { id: 'manual', label: 'manual' },
        ],
      },
      { id: 'scheduler.workflows.new.interval', label: 'Interval', description: 'e.g. 5m, 1h, 30s', type: 'text', value: '1h' },
      { id: 'scheduler.workflows.new.cron', label: 'Cron', description: '* * * * *', type: 'text', value: '' },
      { id: 'scheduler.workflows.new.channel', label: 'Target channel', description: 'Agent channel', type: 'text', value: '' },
      { id: 'scheduler.workflows.new.budget', label: 'Budget per run', description: '$', type: 'text', value: '1.00' },
      { id: 'scheduler.workflows.new.save', label: '+ Create workflow', description: '', type: 'submenu' },
    ],
  });
}

function registerPollerPanels(panels: Map<string, MenuPanel>): void {
  panels.set('scheduler.pollers', {
    id: 'scheduler.pollers',
    title: 'Pollers',
    parent: 'scheduler',
    items: [
      { id: 'scheduler.pollers.slack', label: 'slack-messages', description: 'Poll Slack channels', type: 'submenu' },
      { id: 'scheduler.pollers.confluence', label: 'confluence-changes', description: 'Poll Confluence pages', type: 'submenu' },
      { id: 'scheduler.pollers.github', label: 'github-events', description: 'Poll GitHub notifications', type: 'submenu' },
      { id: 'scheduler.pollers.new', label: '+ New poller', description: 'Add a service poller', type: 'submenu' },
    ],
  });

  panels.set('scheduler.pollers.slack', {
    id: 'scheduler.pollers.slack',
    title: 'Slack Poller',
    parent: 'scheduler.pollers',
    items: [
      { id: 'scheduler.pollers.slack.enabled', label: 'Enabled', description: 'Active', type: 'toggle', value: true },
      { id: 'scheduler.pollers.slack.interval', label: 'Poll interval', description: 'e.g. 30s, 2m', type: 'text', value: '30s' },
      { id: 'scheduler.pollers.slack.channels', label: 'Channels', description: 'Comma-separated Slack channels', type: 'text', value: 'general,sec-ops,alerts' },
      { id: 'scheduler.pollers.slack.maxErrors', label: 'Max errors', description: 'Auto-disable after N failures', type: 'text', value: '5' },
      { id: 'scheduler.pollers.slack.filterBots', label: 'Filter bot messages', description: 'Ignore bot-authored posts', type: 'toggle', value: true },
      {
        id: 'scheduler.pollers.slack.cursor', label: 'Cursor strategy', type: 'choice', value: 'timestamp',
        choices: [
          { id: 'timestamp', label: 'timestamp', description: 'Track last seen time' },
          { id: 'message-id', label: 'message-id', description: 'Track last message ID' },
        ],
      },
    ],
  });

  panels.set('scheduler.pollers.confluence', {
    id: 'scheduler.pollers.confluence',
    title: 'Confluence Poller',
    parent: 'scheduler.pollers',
    items: [
      { id: 'scheduler.pollers.confluence.enabled', label: 'Enabled', description: 'Active', type: 'toggle', value: false },
      { id: 'scheduler.pollers.confluence.interval', label: 'Poll interval', description: 'e.g. 5m, 1h', type: 'text', value: '5m' },
      { id: 'scheduler.pollers.confluence.spaceKeys', label: 'Space keys', description: 'Comma-separated', type: 'text', value: 'ARCH,ENG' },
      { id: 'scheduler.pollers.confluence.watchComments', label: 'Watch comments', description: 'Detect new comments', type: 'toggle', value: true },
      { id: 'scheduler.pollers.confluence.watchEdits', label: 'Watch edits', description: 'Detect page edits', type: 'toggle', value: true },
      { id: 'scheduler.pollers.confluence.maxErrors', label: 'Max errors', description: 'Auto-disable threshold', type: 'text', value: '3' },
    ],
  });

  panels.set('scheduler.pollers.github', {
    id: 'scheduler.pollers.github',
    title: 'GitHub Poller',
    parent: 'scheduler.pollers',
    items: [
      { id: 'scheduler.pollers.github.enabled', label: 'Enabled', description: 'Active', type: 'toggle', value: false },
      { id: 'scheduler.pollers.github.interval', label: 'Poll interval', description: 'e.g. 2m, 5m', type: 'text', value: '2m' },
      { id: 'scheduler.pollers.github.repos', label: 'Repositories', description: 'owner/repo, comma-separated', type: 'text', value: '' },
      {
        id: 'scheduler.pollers.github.events', label: 'Event types', type: 'choice', value: 'all',
        choices: [
          { id: 'all', label: 'all', description: 'All notifications' },
          { id: 'prs', label: 'prs', description: 'Pull requests only' },
          { id: 'issues', label: 'issues', description: 'Issues only' },
          { id: 'reviews', label: 'reviews', description: 'Review requests' },
        ],
      },
      { id: 'scheduler.pollers.github.maxErrors', label: 'Max errors', description: 'Auto-disable threshold', type: 'text', value: '5' },
    ],
  });

  panels.set('scheduler.pollers.new', {
    id: 'scheduler.pollers.new',
    title: 'New Poller',
    parent: 'scheduler.pollers',
    items: [
      { id: 'scheduler.pollers.new.id', label: 'Poller ID', description: 'Unique identifier', type: 'text', value: '' },
      { id: 'scheduler.pollers.new.name', label: 'Display name', type: 'text', value: '' },
      {
        id: 'scheduler.pollers.new.type', label: 'Service type', type: 'choice', value: 'http',
        choices: [
          { id: 'http', label: 'http', description: 'Generic HTTP endpoint' },
          { id: 'slack', label: 'slack', description: 'Slack API' },
          { id: 'confluence', label: 'confluence', description: 'Confluence API' },
          { id: 'github', label: 'github', description: 'GitHub API' },
        ],
      },
      { id: 'scheduler.pollers.new.interval', label: 'Poll interval', description: 'e.g. 30s, 5m', type: 'text', value: '5m' },
      { id: 'scheduler.pollers.new.endpoint', label: 'Endpoint URL', description: 'For HTTP pollers', type: 'text', value: '' },
      { id: 'scheduler.pollers.new.maxErrors', label: 'Max errors', description: 'Auto-disable threshold', type: 'text', value: '5' },
      { id: 'scheduler.pollers.new.save', label: '+ Create poller', description: '', type: 'submenu' },
    ],
  });
}

function registerTriggerPanels(panels: Map<string, MenuPanel>): void {
  panels.set('scheduler.triggers', {
    id: 'scheduler.triggers',
    title: 'Triggers',
    parent: 'scheduler',
    items: [
      { id: 'scheduler.triggers.pollerItems', label: 'On poller items', description: 'Fire when poller finds data', type: 'submenu' },
      { id: 'scheduler.triggers.agentEvent', label: 'On agent event', description: 'Fire on agent lifecycle events', type: 'submenu' },
      { id: 'scheduler.triggers.budgetAlert', label: 'On budget alert', description: 'Fire on budget thresholds', type: 'submenu' },
      { id: 'scheduler.triggers.custom', label: 'Custom events', description: 'User-defined event triggers', type: 'submenu' },
    ],
  });

  panels.set('scheduler.triggers.pollerItems', {
    id: 'scheduler.triggers.pollerItems',
    title: 'Poller Item Trigger',
    parent: 'scheduler.triggers',
    items: [
      { id: 'scheduler.triggers.pollerItems.enabled', label: 'Enabled', type: 'toggle', value: true },
      { id: 'scheduler.triggers.pollerItems.pollerId', label: 'Source poller', description: 'Which poller to watch', type: 'text', value: 'slack-messages' },
      { id: 'scheduler.triggers.pollerItems.targetWorkflow', label: 'Target workflow', description: 'Workflow to trigger', type: 'text', value: 'slack-triage' },
      { id: 'scheduler.triggers.pollerItems.minItems', label: 'Min items', description: 'Minimum batch size to fire', type: 'text', value: '1' },
      { id: 'scheduler.triggers.pollerItems.debounceMs', label: 'Debounce', description: 'Milliseconds', type: 'text', value: '0' },
      { id: 'scheduler.triggers.pollerItems.rateLimit', label: 'Rate limit', description: 'Max triggers per minute', type: 'text', value: '10' },
    ],
  });

  panels.set('scheduler.triggers.agentEvent', {
    id: 'scheduler.triggers.agentEvent',
    title: 'Agent Event Trigger',
    parent: 'scheduler.triggers',
    items: [
      { id: 'scheduler.triggers.agentEvent.enabled', label: 'Enabled', type: 'toggle', value: false },
      {
        id: 'scheduler.triggers.agentEvent.event', label: 'Event', type: 'choice', value: 'agent:error',
        choices: [
          { id: 'agent:error', label: 'agent:error', description: 'Agent failed' },
          { id: 'agent:complete', label: 'agent:complete', description: 'Agent finished' },
          { id: 'agent:spawned', label: 'agent:spawned', description: 'New agent created' },
          { id: 'agent:idle', label: 'agent:idle', description: 'Agent went idle' },
        ],
      },
      { id: 'scheduler.triggers.agentEvent.targetWorkflow', label: 'Target workflow', description: 'Workflow to trigger', type: 'text', value: '' },
      { id: 'scheduler.triggers.agentEvent.filter', label: 'Filter', description: 'Regex filter on event data', type: 'text', value: '' },
    ],
  });

  panels.set('scheduler.triggers.budgetAlert', {
    id: 'scheduler.triggers.budgetAlert',
    title: 'Budget Alert Trigger',
    parent: 'scheduler.triggers',
    items: [
      { id: 'scheduler.triggers.budgetAlert.enabled', label: 'Enabled', type: 'toggle', value: false },
      {
        id: 'scheduler.triggers.budgetAlert.threshold', label: 'Threshold', type: 'choice', value: 'warn',
        choices: [
          { id: 'warn', label: 'warn', description: 'At warning percent' },
          { id: 'freeze', label: 'freeze', description: 'At freeze percent' },
        ],
      },
      { id: 'scheduler.triggers.budgetAlert.targetWorkflow', label: 'Target workflow', description: 'Workflow to trigger', type: 'text', value: '' },
      { id: 'scheduler.triggers.budgetAlert.notifyChannel', label: 'Notify channel', description: 'Agent channel to alert', type: 'text', value: 'alerts' },
    ],
  });

  panels.set('scheduler.triggers.custom', {
    id: 'scheduler.triggers.custom',
    title: 'Custom Event Triggers',
    parent: 'scheduler.triggers',
    items: [
      { id: 'scheduler.triggers.custom.none', label: '(none configured)', description: '', type: 'display', readonly: true },
      { id: 'scheduler.triggers.custom.new', label: '+ Add trigger', description: 'Map custom event → workflow', type: 'submenu' },
    ],
  });

  panels.set('scheduler.triggers.custom.new', {
    id: 'scheduler.triggers.custom.new',
    title: 'New Custom Trigger',
    parent: 'scheduler.triggers.custom',
    items: [
      { id: 'scheduler.triggers.custom.new.event', label: 'Event name', description: 'Event to listen for', type: 'text', value: '' },
      { id: 'scheduler.triggers.custom.new.workflow', label: 'Target workflow', description: 'Workflow to trigger', type: 'text', value: '' },
      { id: 'scheduler.triggers.custom.new.filter', label: 'Filter regex', description: 'Optional data filter', type: 'text', value: '' },
      { id: 'scheduler.triggers.custom.new.debounce', label: 'Debounce', description: 'Milliseconds', type: 'text', value: '0' },
      { id: 'scheduler.triggers.custom.new.dedup', label: 'Deduplicate', description: 'Prevent duplicate fires', type: 'toggle', value: true },
      { id: 'scheduler.triggers.custom.new.save', label: '+ Create trigger', description: '', type: 'submenu' },
    ],
  });
}

function registerSchedulerDefaultsPanels(panels: Map<string, MenuPanel>): void {
  panels.set('scheduler.defaults', {
    id: 'scheduler.defaults',
    title: 'Scheduler Defaults',
    parent: 'scheduler',
    items: [
      {
        id: 'scheduler.defaults.model', label: 'Agent model', type: 'choice', value: 'sonnet-4',
        choices: [
          { id: 'haiku-4', label: 'haiku-4', description: 'Fast, cheap' },
          { id: 'sonnet-4', label: 'sonnet-4', description: 'Balanced' },
          { id: 'opus-4', label: 'opus-4', description: 'Most capable' },
        ],
      },
      {
        id: 'scheduler.defaults.provider', label: 'Provider', type: 'choice', value: 'anthropic',
        choices: [
          { id: 'anthropic', label: 'anthropic' },
          { id: 'bedrock', label: 'bedrock' },
          { id: 'openai', label: 'openai' },
        ],
      },
      { id: 'scheduler.defaults.budgetPerRun', label: 'Default budget per run', description: '$', type: 'text', value: '1.00' },
      { id: 'scheduler.defaults.maxConcurrent', label: 'Max concurrent workflows', description: '1-10', type: 'text', value: '3' },
      { id: 'scheduler.defaults.retryPolicy', label: 'Retry policy', type: 'choice', value: 'exponential',
        choices: [
          { id: 'none', label: 'none' },
          { id: 'linear', label: 'linear' },
          { id: 'exponential', label: 'exponential' },
        ],
      },
      { id: 'scheduler.defaults.maxRetries', label: 'Max retries', description: '0-10', type: 'text', value: '3' },
      { id: 'scheduler.defaults.timeout', label: 'Workflow timeout', description: 'Seconds, 0 = none', type: 'text', value: '600' },
      { id: 'scheduler.defaults.logLevel', label: 'Log level', type: 'choice', value: 'info',
        choices: [
          { id: 'debug', label: 'debug' },
          { id: 'info', label: 'info' },
          { id: 'warn', label: 'warn' },
          { id: 'error', label: 'error' },
        ],
      },
    ],
  });

  panels.set('scheduler.history', {
    id: 'scheduler.history',
    title: 'Run History',
    parent: 'scheduler',
    items: [
      { id: 'scheduler.history.maxEntries', label: 'Keep last N runs', description: '0 = unlimited', type: 'text', value: '100' },
      { id: 'scheduler.history.autoClean', label: 'Auto-clean', description: 'Remove old entries', type: 'toggle', value: true },
      { id: 'scheduler.history.retainDays', label: 'Retain days', description: 'Days to keep history', type: 'text', value: '7' },
      { id: 'scheduler.history.recent', label: '(no runs yet)', description: 'Runs will appear here', type: 'display', readonly: true },
    ],
  });
}
