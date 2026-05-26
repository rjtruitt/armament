/**
 * ProviderAgentMap — agent-to-provider assignment tracking.
 *
 * Extracted from ProviderRegistry to separate the agent assignment concern.
 * Maps agent IDs to provider IDs, supports suggestion for load balancing.
 */

import type { ProviderConfig } from './ProviderRegistry.js';

/**
 * Provider agent map class.
 */
export class ProviderAgentMap {
  private _agentMap: Map<string, string> = new Map();

  /** Assign an agent to a specific provider. */
  assign(agentId: string, providerId: string): void {
    this._agentMap.set(agentId, providerId);
  }

  /** Remove provider assignment for an agent. */
  unassign(agentId: string): void {
    this._agentMap.delete(agentId);
  }

  /** Get the provider ID assigned to an agent (or undefined). */
  getAssignedId(agentId: string): string | undefined {
    return this._agentMap.get(agentId);
  }

  /** Get all agent IDs assigned to a specific provider. */
  getAgentsByProvider(providerId: string): string[] {
    const agents: string[] = [];
    for (const [agentId, pId] of this._agentMap.entries()) {
      if (pId === providerId) agents.push(agentId);
    }
    return agents;
  }

  /** Remove all agent mappings for a given provider. */
  removeProvider(providerId: string): void {
    for (const [agentId, pId] of this._agentMap.entries()) {
      if (pId === providerId) this._agentMap.delete(agentId);
    }
  }
}
