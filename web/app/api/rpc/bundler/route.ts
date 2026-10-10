import { BUNDLER_RPC } from '@/lib/config';

// Bundler proxy for estimation and receipts. Paymaster methods are not exposed: sponsorship goes through /api/sponsor.
const ALLOWED = new Set(['eth_estimateUserOperationGas', 'eth_sendUserOperation', 'eth_getUserOperationReceipt', 'eth_getUserOperationByHash', 'eth_supportedEntryPoints', 'eth_chainId']);

export async function POST(req: Request) {
  const payload = await req.json();
  const calls = Array.isArray(payload) ? payload : [payload];
  if (calls.some((c) => !ALLOWED.has(c.method))) return Response.json({ jsonrpc: '2.0', id: calls[0]?.id ?? 1, error: { code: -32601, message: 'Method not available through this proxy' } });
  const res = await fetch(BUNDLER_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
}
