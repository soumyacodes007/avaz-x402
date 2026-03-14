import type { MarketplaceAgent } from './discovery/marketplace.js';

/**
 * Classify agents by capability from name/description/registration metadata.
 * Returns 'research', 'statistical-analytics', or 'unknown'.
 */
export function classifyAgent(agent: MarketplaceAgent): string {
  const text = [
    agent.name,
    agent.description,
    (agent.registration as any)?.capability,
    (agent.registration as any)?.metadata?.agentType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (text.includes('research')) return 'research';
  if (
    text.includes('statistic') ||
    text.includes('stats') ||
    text.includes('analytics') ||
    text.includes('statistical-analytics')
  )
    return 'statistical-analytics';

  return 'unknown';
}

export interface SelectedAgents {
  research: MarketplaceAgent;
  stats: MarketplaceAgent;
}

/**
 * Select 1 research agent (highest reputation) and 1 stats agent (highest reputation).
 * Agents are already sorted by reputation from marketplace.ts.
 */
export function selectAgentsByCapability(
  agents: MarketplaceAgent[]
): SelectedAgents | null {
  const classified = agents.map((a) => ({
    agent: a,
    capability: classifyAgent(a),
  }));

  const researchAgents = classified
    .filter((c) => c.capability === 'research')
    .sort((a, b) => b.agent.reputationScore - a.agent.reputationScore);

  const statsAgents = classified
    .filter((c) => c.capability === 'statistical-analytics')
    .sort((a, b) => b.agent.reputationScore - a.agent.reputationScore);

  if (researchAgents.length === 0 || statsAgents.length === 0) {
    return null;
  }

  return {
    research: researchAgents[0].agent,
    stats: statsAgents[0].agent,
  };
}
