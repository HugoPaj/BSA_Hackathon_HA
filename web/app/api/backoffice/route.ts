import type { Hex } from 'viem';
import { NODE_RPC, USDC } from '@/lib/config';
import { client as rpc, erc20Abi } from '@/lib/chain';
import { publicSession, read } from '@/lib/server/db';
import { guardianAccount } from '@/lib/server/keys';
import { opsAddress } from '@/lib/server/aa';
import { json } from '@/lib/server/session';

// Swissquote operations view (mock). Shows what Swissquote can see and do, which is deliberately limited.
export async function GET() {
  const treasury = opsAddress();
  const c = rpc(NODE_RPC);
  const [usdc, eth] = await Promise.all([
    c.readContract({ address: USDC.address, abi: erc20Abi, functionName: 'balanceOf', args: [treasury as Hex] }),
    c.getBalance({ address: treasury as Hex }),
  ]);
  const data = read((db) => ({
    audit: db.audit.slice(0, 200),
    wallets: Object.values(db.wallets).map((w) => ({ clientId: w.clientId, address: w.address, deployed: !!w.deployedAt, owner: w.owner.signer, guardianA: w.guardianA, guardianB: { type: w.guardianB.type, address: w.guardianB.address, label: w.guardianB.label }, proof: w.proof ?? null, previousOwners: w.previousOwners.length })),
    recoveries: Object.values(db.recoveries).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(publicSession),
  }));
  return json({ ...data, treasury: { address: treasury, usdc, eth }, guardian: guardianAccount().address });
}
