import type { Hex } from 'viem';
import { NODE_RPC } from '@/lib/config';
import { readWalletState } from '@/lib/chain';
import { publicSession, read } from '@/lib/server/db';
import { approveGuardianB, finalize, liveness, startRecovery, syncRecoveries } from '@/lib/server/recovery';
import { body, currentClient, fail, json } from '@/lib/server/session';

type Req =
  | { action: 'start'; newOwner: { x: bigint; y: bigint; credentialId: string } }
  | { action: 'guardian'; id: string; signature: Hex }
  | { action: 'liveness'; id: string; result: 'match' | 'mismatch' }
  | { action: 'finalize'; id: string };

export async function GET(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const wallet = read((db) => db.wallets[client.clientId]);
  if (!wallet) return json({ wallet: null });
  const rid = new URL(req.url).searchParams.get('id');
  const state = await readWalletState(NODE_RPC, wallet.address);
  await syncRecoveries(wallet, state);
  const session = rid ? publicSession(read((db) => db.recoveries[rid])) : null;
  return json({
    wallet: { address: wallet.address, guardianA: wallet.guardianA, guardianB: wallet.guardianB, bankAssisted: wallet.bankAssisted, deployed: state.deployed },
    state,
    session,
  });
}

export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Log in to Swissquote first', 401);
  const wallet = read((db) => db.wallets[client.clientId]);
  if (!wallet) return fail('No wallet found for this client');
  const b = await body<Req>(req);
  try {
    if (b.action === 'start') return json({ session: publicSession(await startRecovery(wallet, b.newOwner)) });
    const session = read((db) => db.recoveries[b.id]);
    if (!session || session.clientId !== client.clientId) return fail('Unknown recovery request', 404);
    if (b.action === 'guardian') return json({ session: publicSession(await approveGuardianB(session, wallet, b.signature)) });
    if (b.action === 'liveness') return json({ session: publicSession(await liveness(session, wallet, b.result)) });
    if (b.action === 'finalize') return json({ session: publicSession(await finalize(session)) });
    return fail('Unknown action');
  } catch (e) {
    return fail((e as Error).message);
  }
}
