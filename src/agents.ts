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
 */
export async function callAgent(
  endpointUrl: string,
  payload: { subtask: string },
  fetchWithPayment: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): Promise<AgentCallResult> {
  const url = new URL(endpointUrl);
  url.searchParams.set('subtask', payload.subtask);

  const res = await fetchWithPayment(url.toString(), { method: 'GET' });
  const body = await res.text();

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
