/**
 * Panel definitions for distributed agent configuration.
 */

import type { MenuPanel } from '../types.js';

/** Registers all agent-related panels into the given map. */
export function registerAgentPanels(panels: Map<string, MenuPanel>): void {
  panels.set('agents', {
    id: 'agents',
    title: 'Agents',
    parent: 'root',
    items: [
      {
        id: 'agents.topology', label: 'Topology', type: 'choice', value: 'local-only',
        choices: [
          { id: 'local-only', label: 'local-only', description: 'Single machine' },
          { id: 'hub-spoke', label: 'hub-spoke', description: 'Central coordinator' },
          { id: 'mesh', label: 'mesh', description: 'Peer-to-peer' },
          { id: 'hierarchical', label: 'hierarchical', description: 'Tree of agents' },
        ],
      },
      { id: 'agents.maxConcurrent', label: 'Max concurrent agents', description: '1-64', type: 'text', value: '4' },
      {
        id: 'agents.defaultModel', label: 'Default agent model', type: 'choice', value: 'sonnet-4',
        choices: [
          { id: 'sonnet-4', label: 'sonnet-4' },
          { id: 'haiku-4', label: 'haiku-4' },
          { id: 'opus-4', label: 'opus-4' },
        ],
      },
      { id: 'agents.memory', label: 'Agent memory', description: 'Context sharing & persistence', type: 'submenu' },
      { id: 'agents.queue', label: 'Queue settings', description: 'Task queue & retry policy', type: 'submenu' },
      { id: 'agents.distributed', label: 'Distributed', description: 'Multi-node networking', type: 'submenu' },
    ],
  });

  panels.set('agents.memory', {
    id: 'agents.memory',
    title: 'Agent Memory',
    parent: 'agents',
    items: [
      {
        id: 'agents.memory.contextSharing', label: 'Context sharing', type: 'choice', value: 'none',
        choices: [
          { id: 'none', label: 'none', description: 'Isolated agents' },
          { id: 'shared-summary', label: 'shared-summary', description: 'Share summaries only' },
          { id: 'full-context', label: 'full-context', description: 'Full context shared' },
        ],
      },
      { id: 'agents.memory.persistence', label: 'Memory persistence', description: 'Persist across sessions', type: 'toggle', value: false },
      {
        id: 'agents.memory.backend', label: 'Memory backend', type: 'choice', value: 'in-memory',
        choices: [
          { id: 'in-memory', label: 'in-memory', description: 'Volatile, fast' },
          { id: 'sqlite', label: 'sqlite', description: 'Local disk' },
          { id: 'redis', label: 'redis', description: 'Distributed cache' },
        ],
      },
      { id: 'agents.memory.maxPerAgent', label: 'Max memory per agent', description: 'MB', type: 'text', value: '256' },
      { id: 'agents.memory.ttl', label: 'TTL', description: 'Seconds, 0 = forever', type: 'text', value: '0' },
    ],
  });

  panels.set('agents.queue', {
    id: 'agents.queue',
    title: 'Queue Settings',
    parent: 'agents',
    items: [
      {
        id: 'agents.queue.backend', label: 'Queue backend', type: 'choice', value: 'in-memory',
        choices: [
          { id: 'in-memory', label: 'in-memory', description: 'Local queue' },
          { id: 'redis', label: 'redis', description: 'Redis pub/sub' },
          { id: 'rabbitmq', label: 'rabbitmq', description: 'AMQP broker' },
        ],
      },
      { id: 'agents.queue.maxDepth', label: 'Max queue depth', description: 'Tasks', type: 'text', value: '100' },
      { id: 'agents.queue.priorityLevels', label: 'Priority levels', description: 'Number of levels', type: 'text', value: '3' },
      {
        id: 'agents.queue.retryPolicy', label: 'Retry policy', type: 'choice', value: 'exponential',
        choices: [
          { id: 'none', label: 'none', description: 'No retries' },
          { id: 'linear', label: 'linear', description: 'Fixed delay' },
          { id: 'exponential', label: 'exponential', description: 'Exponential backoff' },
        ],
      },
      { id: 'agents.queue.deadLetter', label: 'Dead letter queue', description: 'Store failed tasks', type: 'toggle', value: true },
      { id: 'agents.queue.taskTimeout', label: 'Timeout per task', description: 'Seconds', type: 'text', value: '300' },
    ],
  });

  panels.set('agents.distributed', {
    id: 'agents.distributed',
    title: 'Distributed',
    parent: 'agents',
    items: [
      { id: 'agents.distributed.enabled', label: 'Enabled', description: 'Enable multi-node', type: 'toggle', value: false },
      { id: 'agents.distributed.hubUrl', label: 'Lead hub URL', description: 'Central coordinator', type: 'text', value: '' },
      {
        id: 'agents.distributed.discovery', label: 'Node discovery', type: 'choice', value: 'static',
        choices: [
          { id: 'static', label: 'static', description: 'Manual node list' },
          { id: 'mdns', label: 'mdns', description: 'Multicast DNS' },
          { id: 'consul', label: 'consul', description: 'HashiCorp Consul' },
          { id: 'kubernetes', label: 'kubernetes', description: 'K8s service discovery' },
        ],
      },
      {
        id: 'agents.distributed.authMethod', label: 'Auth method', type: 'choice', value: 'none',
        choices: [
          { id: 'none', label: 'none', description: 'No authentication' },
          { id: 'jwt', label: 'jwt', description: 'JWT tokens' },
          { id: 'mtls', label: 'mtls', description: 'Mutual TLS' },
        ],
      },
      { id: 'agents.distributed.tls', label: 'TLS config', description: 'Certificates & verification', type: 'submenu' },
      { id: 'agents.distributed.proxy', label: 'Reverse proxy', description: 'Load balancer config', type: 'submenu' },
      { id: 'agents.distributed.heartbeat', label: 'Heartbeat interval', description: 'Seconds', type: 'text', value: '10' },
      { id: 'agents.distributed.nodeTimeout', label: 'Node timeout', description: 'Seconds', type: 'text', value: '30' },
    ],
  });

  panels.set('agents.distributed.tls', {
    id: 'agents.distributed.tls',
    title: 'TLS Config',
    parent: 'agents.distributed',
    items: [
      { id: 'agents.distributed.tls.enabled', label: 'Enabled', description: 'Enable TLS', type: 'toggle', value: false },
      { id: 'agents.distributed.tls.caCert', label: 'CA cert path', type: 'text', value: '' },
      { id: 'agents.distributed.tls.clientCert', label: 'Client cert path', type: 'text', value: '' },
      { id: 'agents.distributed.tls.clientKey', label: 'Client key path', type: 'text', value: '' },
      { id: 'agents.distributed.tls.verifyPeers', label: 'Verify peers', description: 'Validate peer certificates', type: 'toggle', value: true },
    ],
  });

  panels.set('agents.distributed.proxy', {
    id: 'agents.distributed.proxy',
    title: 'Reverse Proxy',
    parent: 'agents.distributed',
    items: [
      { id: 'agents.distributed.proxy.enabled', label: 'Enabled', description: 'Enable reverse proxy', type: 'toggle', value: false },
      {
        id: 'agents.distributed.proxy.type', label: 'Type', type: 'choice', value: 'nginx',
        choices: [
          { id: 'nginx', label: 'nginx' },
          { id: 'envoy', label: 'envoy' },
          { id: 'haproxy', label: 'haproxy' },
          { id: 'traefik', label: 'traefik' },
        ],
      },
      { id: 'agents.distributed.proxy.listen', label: 'Listen address', description: 'host:port', type: 'text', value: '0.0.0.0:8080' },
      { id: 'agents.distributed.proxy.upstreams', label: 'Upstream targets', description: 'Comma-separated', type: 'text', value: '' },
      { id: 'agents.distributed.proxy.healthCheck', label: 'Health check path', type: 'text', value: '/health' },
      {
        id: 'agents.distributed.proxy.loadBalancing', label: 'Load balancing', type: 'choice', value: 'round-robin',
        choices: [
          { id: 'round-robin', label: 'round-robin' },
          { id: 'least-conn', label: 'least-conn' },
          { id: 'ip-hash', label: 'ip-hash' },
        ],
      },
    ],
  });
}
