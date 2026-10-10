import type { Hex } from 'viem';
import { NODE_RPC } from '@/lib/config';
import { readWalletState } from '@/lib/chain';
import { audit, publicSession, read } from '@/lib/server/db';
import { approveGuardianB, finalize, liveness, startRecovery, syncRecoveries } from '@/lib/server/recovery';
import { bindRecovery, body, checkCredentials, createRecoverySession, destroyRecoverySession, fail, json, recoveryClient, upgradeRecoverySession } from '@/lib/server/session';

type Req =
  | { action: 'identify'; clientId: string; password: string }
  | { action: 'start'; newOwner: { x: bigint; y: bigint; credentialId: string } }
  | { action: 'guardian'; id: string; signature: Hex }
  | { action: 'liveness'; id: string; result: 'match' | 'mismatch' }
  | { action: 'finalize'; id: string };

export async function GET(req: Request) {
  const client = await recoveryClient();
  if (!client) return fail('Identify yourself first', 401);
  const who = { clientId: client.clientId, name: client.name };
  const wallet = read((db) => db.wallets[client.clientId]);
  if (!wallet) return json({ client: who, wallet: null });
  const rid = new URL(req.url).searchParams.get('id');
  const state = await readWalletState(NODE_RPC, wallet.address);
  await syncRecoveries(wallet, state);
  const session = rid ? publicSession(read((db) => db.recoveries[rid])) : null;
  return json({
    client: who,
    wallet: { address: wallet.address, guardianA: wallet.guardianA, guardianB: wallet.guardianB, bankAssisted: wallet.bankAssisted, deployed: state.deployed },
    state,
    session,
  });
}

export async function POST(req: Request) {
  const b = await body<Req>(req);
  if (b.action === 'identify') {
    // Same credentials as the e-banking login, but the session it creates can only drive this recovery.
    const c = checkCredentials(b.clientId ?? '', b.password ?? '');
    if (!c) return fail('Client number or password is wrong', 401);
    await createRecoverySession(c.clientId);
    audit({ actor: 'E-banking', action: 'Recovery identification', detail: `Client ${c.clientId} identified to recover their wallet (recovery access only)`, outcome: 'info' });
    return json({ client: { clientId: c.clientId, name: c.name } });
  }
  const client = await recoveryClient();
  if (!client) return fail('Identify yourself first', 401);
  const wallet = read((db) => db.wallets[client.clientId]);
  if (!wallet) return fail('No wallet found for this client');
  try {
    if (b.action === 'start') {
      const started = await startRecovery(wallet, b.newOwner);
      if (client.sid) bindRecovery(client.sid, started.id);
      return json({ session: publicSession(started) });
    }
    const session = read((db) => db.recoveries[b.id]);
    if (!session || session.clientId !== client.clientId) return fail('Unknown recovery request', 404);
    if (b.action === 'guardian') return json({ session: publicSession(await approveGuardianB(session, wallet, b.signature)) });
    if (b.action === 'liveness') return json({ session: publicSession(await liveness(session, wallet, b.result)) });
    if (b.action === 'finalize') {
      const done = await finalize(session);
      // This device now holds the wallet's only passkey: the recovery session becomes a normal login.
      if (client.sid && done.status === 'finalized') await upgradeRecoverySession(client.sid, session.id);
      return json({ session: publicSession(done) });
    }
    return fail('Unknown action');
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Back to step 1: forget the recovery identification. */
export async function DELETE() {
  await destroyRecoverySession();
  return json({ ok: true });
}
