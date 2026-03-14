/**
 * Direct on-chain USDC payment module for Avalanche Fuji.
 * Used when Permit2 proxy is not available (e.g. Fuji testnet).
 * Sends a real USDC transfer from the payer to the worker's payTo address.
 */
import { createPublicClient, createWalletClient, http, parseAbi, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

const USDC_FUJI = '0x5425890298aed601595a70AB815c96711a31Bc65' as const;
const RPC_URL = process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';

const erc20Abi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

export interface PaymentResult {
  txHash: string;
  amount: bigint;
  to: string;
  network: string;
}

/**
 * Send USDC payment on Fuji from the payer to the specified address.
 * @param payTo - Recipient wallet address
 * @param amountTokenUnits - Amount in USDC token units (e.g. 1000 = 0.001 USDC)
 * @returns PaymentResult with real on-chain tx hash
 */
export async function sendUSDCPayment(
  payTo: `0x${string}`,
  amountTokenUnits: bigint,
): Promise<PaymentResult> {
  const pk = process.env.EVM_PRIVATE_KEY;
  if (!pk) throw new Error('EVM_PRIVATE_KEY not set');

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);
  const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: avalancheFuji, transport: http(RPC_URL) });

  // Check balance
  const balance = await publicClient.readContract({
    address: USDC_FUJI,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  });

  if (balance < amountTokenUnits) {
    throw new Error(
      `Insufficient USDC balance: have ${balance}, need ${amountTokenUnits}`
    );
  }

  // Send transfer
  const txHash = await walletClient.writeContract({
    address: USDC_FUJI,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [getAddress(payTo), amountTokenUnits],
  });

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error(`USDC transfer failed (reverted). txHash: ${txHash}`);
  }

  return {
    txHash,
    amount: amountTokenUnits,
    to: payTo,
    network: 'eip155:43113',
  };
}
