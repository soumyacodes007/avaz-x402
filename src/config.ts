/**
 * Configuration for Avalanche Fuji, ERC-8004 (official Avalanche Testnet), and x402.
 * @see https://github.com/erc-8004/erc-8004-contracts
 */

export const FUJI_CHAIN_ID = 43113;

/** Official ERC-8004 Avalanche Testnet (Fuji) - from erc-8004-contracts README */
export const ERC8004 = {
  /** Identity Registry - testnet.snowtrace.io */
  IDENTITY_REGISTRY: (process.env.IDENTITY_REGISTRY_ADDRESS as `0x${string}`) ||
    '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  /** Reputation Registry - testnet.snowtrace.io */
  REPUTATION_REGISTRY: (process.env.REPUTATION_REGISTRY_ADDRESS as `0x${string}`) ||
    '0x8004B663056A597Dffe9eCcC1965A193B7388713',
} as const;

export const FUJI_RPC =
  process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';

export const NETWORK_NAME = 'avalanche-fuji' as const;

export function getEnvVar(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}
