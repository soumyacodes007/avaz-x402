import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { toClientEvmSigner } from '@x402/evm';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';
/**
 * Create a fetch-like function that automatically handles 402 and attaches X-PAYMENT.
 * Uses Avalanche Fuji (eip155:43113) via EVM wildcard eip155:*.
 */
export function createPaymentFetch(getPrivateKey: () => string): ReturnType<typeof wrapFetchWithPayment> {
  const key = getPrivateKey().replace(/^0x/, '').trim();
  const hexKey = (`0x${key}` as `0x${string}`);
  const account = privateKeyToAccount(hexKey);
  const signer = toClientEvmSigner(account);
  const client = registerExactEvmScheme(new x402Client(), { signer });
  return wrapFetchWithPayment(fetch, client);
}
