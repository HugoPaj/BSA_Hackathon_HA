import { isAddressEqual, keccak256, recoverAddress, toBytes, type Hex } from 'viem';
import { NODE_RPC } from '@/lib/config';
import { isValid1271 } from '@/lib/chain';
import { audit, id, read, walletByAddress, write } from '@/lib/server/db';
import { isOnChainGuardian } from '@/lib/server/recovery';
import { body, currentClient, fail, json } from '@/lib/server/session';

// High-value step-up: the client's recovery factor (second device or card) co-confirms a specific call batch.
export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const b = await body<{ action: 'create'; wallet: string; callData: Hex } | { action: 'verify'; id: string; signature: Hex }>(req);
  if (b.action === 'create') {
    const wallet = await read((db) => walletByAddress(db, b.wallet));
    if (!wallet || wallet.clientId !== client.clientId) return fail('Unknown wallet', 404);
    const sid = id();
    const callDataHash = keccak256(b.callData);
    const challenge = keccak256(toBytes(`Swissquote high-value confirmation|${wallet.address}|${callDataHash}|${sid}`));
    await write((db) => { db.stepUps[sid] = { id: sid, wallet: wallet.address, challenge, callDataHash, expires: Date.now() + 10 * 60_000 }; });
    return json({ id: sid, challenge, guardianB: wallet.guardianB });
  }
  const s = await read((db) => db.stepUps[b.id]);
  if (!s || s.expires < Date.now()) return fail('Confirmation expired');
  const wallet = await read((db) => walletByAddress(db, s.wallet));
  if (!wallet || wallet.clientId !== client.clientId) return fail('Unknown wallet', 404);
  const gB = wallet.guardianB;
  if (gB.type === 'passport') return fail('A passport only approves recovery, never transactions');
  const ok = (await isOnChainGuardian(wallet.address, gB.address)) && (gB.type === 'passkey'
    ? await isValid1271(NODE_RPC, gB.address, s.challenge as Hex, b.signature)
    : await recoverAddress({ hash: s.challenge as Hex, signature: b.signature }).then((a) => isAddressEqual(a, gB.address as Hex)).catch(() => false));
  if (!ok) return fail('That confirmation did not come from your recovery factor');
  await write((db) => { db.stepUps[b.id].verified = true; });
  await audit({ actor: 'Paymaster policy', action: 'High-value step-up confirmed', wallet: wallet.address, detail: `${gB.label} co-signed the transaction`, outcome: 'approved' });
  return json({ ok: true });
}
