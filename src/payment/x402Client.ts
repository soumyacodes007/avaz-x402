import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { toClientEvmSigner } from '@x402/evm';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';

/**
 * Create a fetch-like function that automatically handles 402 and attaches X-PAYMENT.
 * Uses Avalanche Fuji (eip155:43113) via EVM wildcard eip155:*.
 */
export function createPaymentFetch(getPrivateKey: () => string): ReturnType<typeof wrapFetchWithPayment> {
  const key = getPrivateKey().replace(/^0x/, '').trim();
  const hexKey = (`0x${key}` as `0x${string}`);
  const account = privateKeyToAccount(hexKey);

  // toClientEvmSigner needs a publicClient for readContract capability
  const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc'),
  });

  const signer = toClientEvmSigner(account, publicClient);
  const client = registerExactEvmScheme(new x402Client(), { signer });
  return wrapFetchWithPayment(fetch, client);
}
