/**
 * Panel definitions for output process configuration (Slack, email, SMS, etc.).
 */

import type { MenuPanel } from '../types.js';

/** Registers all output-related panels into the given map. */
export function registerOutputPanels(panels: Map<string, MenuPanel>): void {
  panels.set('outputs', {
    id: 'outputs',
    title: 'Output Processes',
    parent: 'root',
    items: [
      { id: 'outputs.slack', label: 'Slack', description: 'Post results to Slack', type: 'submenu' },
      { id: 'outputs.email', label: 'Email', description: 'Send results via email', type: 'submenu' },
      { id: 'outputs.sms', label: 'SMS', description: 'Send results via SMS', type: 'submenu' },
      { id: 'outputs.whatsapp', label: 'WhatsApp', description: 'Send results via WhatsApp', type: 'submenu' },
      { id: 'outputs.toolChain', label: 'Tool chain', description: 'Pipe results through tools', type: 'submenu' },
      { id: 'outputs.webhook', label: 'Webhook', description: 'POST results to URL', type: 'submenu' },
    ],
  });

  panels.set('outputs.slack', {
    id: 'outputs.slack',
    title: 'Slack Output',
    parent: 'outputs',
    items: [
      { id: 'outputs.slack.enabled', label: 'Enabled', type: 'toggle', value: false },
      { id: 'outputs.slack.channel', label: 'Channel', description: '#channel-name', type: 'text', value: '' },
      { id: 'outputs.slack.username', label: 'Bot username', description: 'Display name', type: 'text', value: 'armament-bot' },
      { id: 'outputs.slack.iconEmoji', label: 'Icon emoji', description: ':robot_face:', type: 'text', value: ':robot_face:' },
      { id: 'outputs.slack.threadReplies', label: 'Thread replies', description: 'Reply in thread', type: 'toggle', value: true },
      {
        id: 'outputs.slack.format', label: 'Format', type: 'choice', value: 'blocks',
        choices: [
          { id: 'blocks', label: 'blocks', description: 'Rich block layout' },
          { id: 'plain', label: 'plain', description: 'Plain text' },
          { id: 'code', label: 'code', description: 'Code block' },
        ],
      },
    ],
  });

  panels.set('outputs.email', {
    id: 'outputs.email',
    title: 'Email Output',
    parent: 'outputs',
    items: [
      { id: 'outputs.email.enabled', label: 'Enabled', type: 'toggle', value: false },
      { id: 'outputs.email.to', label: 'To', description: 'Recipient email(s)', type: 'text', value: '' },
      { id: 'outputs.email.from', label: 'From', description: 'Sender address', type: 'text', value: '' },
      { id: 'outputs.email.subject', label: 'Subject template', description: 'Use ${workflow} vars', type: 'text', value: '[armament] ${workflow} complete' },
      {
        id: 'outputs.email.transport', label: 'Transport', type: 'choice', value: 'smtp',
        choices: [
          { id: 'smtp', label: 'smtp', description: 'SMTP server' },
          { id: 'ses', label: 'ses', description: 'AWS SES' },
          { id: 'sendgrid', label: 'sendgrid', description: 'SendGrid API' },
        ],
      },
      { id: 'outputs.email.smtpHost', label: 'SMTP host', type: 'text', value: '' },
      { id: 'outputs.email.smtpPort', label: 'SMTP port', type: 'text', value: '587' },
    ],
  });

  panels.set('outputs.sms', {
    id: 'outputs.sms',
    title: 'SMS Output',
    parent: 'outputs',
    items: [
      { id: 'outputs.sms.enabled', label: 'Enabled', type: 'toggle', value: false },
      { id: 'outputs.sms.to', label: 'To', description: 'Phone number(s)', type: 'text', value: '' },
      { id: 'outputs.sms.from', label: 'From', description: 'Sender number', type: 'text', value: '' },
      { id: 'outputs.sms.maxLength', label: 'Max length', description: 'Characters', type: 'text', value: '160' },
      {
        id: 'outputs.sms.provider', label: 'Provider', type: 'choice', value: 'twilio',
        choices: [
          { id: 'twilio', label: 'twilio' },
          { id: 'vonage', label: 'vonage' },
          { id: 'aws-sns', label: 'aws-sns' },
        ],
      },
    ],
  });

  panels.set('outputs.whatsapp', {
    id: 'outputs.whatsapp',
    title: 'WhatsApp Output',
    parent: 'outputs',
    items: [
      { id: 'outputs.whatsapp.enabled', label: 'Enabled', type: 'toggle', value: false },
      { id: 'outputs.whatsapp.to', label: 'To', description: 'Phone number(s)', type: 'text', value: '' },
      { id: 'outputs.whatsapp.from', label: 'From', description: 'Business number', type: 'text', value: '' },
      {
        id: 'outputs.whatsapp.provider', label: 'Provider', type: 'choice', value: 'twilio',
        choices: [
          { id: 'twilio', label: 'twilio' },
          { id: 'meta-api', label: 'meta-api', description: 'Meta Business API' },
        ],
      },
    ],
  });

  panels.set('outputs.toolChain', {
    id: 'outputs.toolChain',
    title: 'Tool Chain Output',
    parent: 'outputs',
    items: [
      { id: 'outputs.toolChain.enabled', label: 'Enabled', type: 'toggle', value: false },
      { id: 'outputs.toolChain.tools', label: 'Tool pipeline', description: 'Comma-separated tool names', type: 'text', value: '' },
      { id: 'outputs.toolChain.transform', label: 'Transform between steps', description: 'Apply transforms', type: 'toggle', value: false },
      { id: 'outputs.toolChain.stopOnError', label: 'Stop on error', description: 'Halt chain on failure', type: 'toggle', value: true },
    ],
  });

  panels.set('outputs.webhook', {
    id: 'outputs.webhook',
    title: 'Webhook Output',
    parent: 'outputs',
    items: [
      { id: 'outputs.webhook.enabled', label: 'Enabled', type: 'toggle', value: false },
      { id: 'outputs.webhook.url', label: 'URL', description: 'POST endpoint', type: 'text', value: '' },
      {
        id: 'outputs.webhook.method', label: 'Method', type: 'choice', value: 'POST',
        choices: [
          { id: 'POST', label: 'POST' },
          { id: 'PUT', label: 'PUT' },
          { id: 'PATCH', label: 'PATCH' },
        ],
      },
      { id: 'outputs.webhook.headers', label: 'Custom headers', description: 'JSON key:value pairs', type: 'text', value: '' },
      { id: 'outputs.webhook.secret', label: 'HMAC secret', description: 'Signing key', type: 'text', value: '' },
      { id: 'outputs.webhook.retries', label: 'Retries', description: '0-5', type: 'text', value: '3' },
      { id: 'outputs.webhook.timeout', label: 'Timeout', description: 'Seconds', type: 'text', value: '30' },
    ],
  });
}
