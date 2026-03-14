import { createPublicClient, http, parseAbi } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { ERC8004, FUJI_RPC } from '../config.js';

const identityAbi = parseAbi([
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function tokenByIndex(uint256 index) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]);

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(FUJI_RPC),
});

export interface AgentRegistration {
  type?: string;
  name: string;
  description?: string;
  image?: string;
  services?: Array<{ name: string; endpoint: string; version?: string }>;
  x402Support?: boolean;
  active?: boolean;
  registrations?: Array<{ agentId: number; agentRegistry: string }>;
}

export async function getTotalSupply(): Promise<bigint> {
  return publicClient.readContract({
    address: ERC8004.IDENTITY_REGISTRY,
    abi: identityAbi,
    functionName: 'totalSupply',
  });
}

export async function getAgentIdByIndex(index: number): Promise<bigint> {
  return publicClient.readContract({
    address: ERC8004.IDENTITY_REGISTRY,
    abi: identityAbi,
    functionName: 'tokenByIndex',
    args: [BigInt(index)],
  });
}

export async function getAgentURI(agentId: bigint): Promise<string> {
  return publicClient.readContract({
    address: ERC8004.IDENTITY_REGISTRY,
    abi: identityAbi,
    functionName: 'tokenURI',
    args: [agentId],
  });
}

export async function fetchRegistration(uri: string): Promise<AgentRegistration | null> {
  try {
    const url = uri.startsWith('ipfs://')
      ? `https://ipfs.io/ipfs/${uri.slice(7)}`
      : uri;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as AgentRegistration;
    return json?.name ? json : null;
  } catch {
    return null;
  }
}

/**
 * List agent IDs from the Identity Registry.
 * Requires ERC-721 Enumerable extension (totalSupply, tokenByIndex).
 * If the registry does not support enumeration, returns [].
 */
export async function listAgentIds(maxAgents = 50): Promise<bigint[]> {
  try {
    const total = await getTotalSupply();
    const count = Number(total > BigInt(maxAgents) ? maxAgents : total);
    const ids: bigint[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const id = await getAgentIdByIndex(i);
        ids.push(id);
      } catch {
        break;
      }
    }
    return ids;
  } catch {
    return [];
  }
}
