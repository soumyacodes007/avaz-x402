import * as identity from './identity.js';
import * as reputation from './reputation.js';
import type { AgentRegistration } from './identity.js';

export interface MarketplaceAgent {
  agentId: bigint;
  name: string;
  description?: string;
  endpoint?: string;
  reputationScore: number;
  registration: AgentRegistration | null;
}

/**
 * List agents from ERC-8004 Identity registry, attach reputation, filter by x402Support, sort by highest reputation.
 * clientAddresses: non-empty list for getSummary (e.g. orchestrator wallet or known clients).
 */
export async function listMarketplaceAgents(
  clientAddresses: `0x${string}`[],
  maxAgents = 20
): Promise<MarketplaceAgent[]> {
  const ids = await identity.listAgentIds(maxAgents);
  const agents: MarketplaceAgent[] = [];

  for (const agentId of ids) {
    let uri: string;
    try {
      uri = await identity.getAgentURI(agentId);
    } catch {
      continue;
    }

    const registration = await identity.fetchRegistration(uri);
    if (!registration) continue;
    if (registration.x402Support === false) continue;

    const endpoint = registration.services?.find(
      (s) => s.name === 'web' || s.name === 'A2A' || s.name === 'MCP' || s.name === 'OASF'
    )?.endpoint;

    let reputationScore = 0;
    try {
      const summary = await reputation.getAgentSummary(agentId, clientAddresses);
      reputationScore = reputation.summaryToScore(
        summary.summaryValue,
        summary.summaryValueDecimals
      );
    } catch {
      // no feedback yet
    }

    agents.push({
      agentId,
      name: registration.name ?? `Agent #${agentId}`,
      description: registration.description,
      endpoint,
      reputationScore,
      registration,
    });
  }

  agents.sort((a, b) => b.reputationScore - a.reputationScore);
  return agents;
}
