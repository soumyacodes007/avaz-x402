/**
 * Call an x402-paid agent endpoint and return the result plus transaction hash from payment response.
 */

export interface AgentCallResult {
  body: string;
  txHash: string | null;
  success: boolean;
}

/**
 * Call agent at endpointUrl with the given payload (e.g. subtask description).
 * fetchWithPayment: result of createPaymentFetch().
 * Returns response body, and tx hash from PAYMENT-RESPONSE or X-PAYMENT-RESPONSE header if present.
 * 
 * Falls back to direct fetch if x402 payment fails (e.g. unsupported chain/asset on testnet).
 */
export async function callAgent(
  endpointUrl: string,
  payload: { subtask: string },
  fetchWithPayment: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): Promise<AgentCallResult> {
  const url = new URL(endpointUrl);
  url.searchParams.set('subtask', payload.subtask);

  let res: Response;
  let paymentAttempted = false;

  try {
    // Try with x402 payment
    res = await fetchWithPayment(url.toString(), { method: 'GET' });
    paymentAttempted = true;
  } catch (paymentError: any) {
    // x402 payment failed (e.g. unsupported chain/asset) — fall back to direct call
    console.log(`  ⚠️  x402 payment failed: ${paymentError.message?.slice(0, 100)}`);
    console.log(`  🔄 Falling back to direct call...`);

    // Direct fetch — worker will return 402 first, then we call with a dummy header
    res = await fetch(url.toString(), { method: 'GET' });

    if (res.status === 402) {
      // Worker returned 402 — try calling directly without x402 (demo mode)
      // The worker's x402Paywall will proceed in demo mode if facilitator is unreachable
      const headers: Record<string, string> = {
        'X-PAYMENT': Buffer.from(JSON.stringify({
          scheme: 'exact',
          network: 'avalanche-fuji',
          payload: { type: 'demo-payment' }
        })).toString('base64'),
      };
      res = await fetch(url.toString(), { method: 'GET', headers });
    }
  }

  const body = await res.text();

  // Extract tx hash from payment response header
  const paymentHeader =
    res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('X-PAYMENT-RESPONSE');
  let txHash: string | null = null;
  if (paymentHeader) {
    try {
      const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'));
      txHash = decoded?.transaction ?? decoded?.txHash ?? null;
    } catch {
      // keep txHash null
    }
  }

  return {
    body,
    txHash,
    success: res.ok,
  };
}
