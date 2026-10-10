import { NODE_RPC } from '@/lib/config';

// Read-only proxy to the Base Sepolia node, so the browser has a single origin and no provider keys.
export async function POST(req: Request) {
  const payload = await req.json();
  const calls = Array.isArray(payload) ? payload : [payload];
  if (calls.some((c) => c.method === 'eth_sendRawTransaction')) return Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Not allowed' } });
  const res = await fetch(NODE_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
}
