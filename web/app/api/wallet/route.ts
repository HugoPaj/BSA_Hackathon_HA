import { isAddressEqual, type Hex } from 'viem';
import { NODE_RPC } from '@/lib/config';
import { counterfactualAddress, passkeySignerAddress, readWalletState, type GuardianB } from '@/lib/chain';
import { audit, publicSession, read, write, type WalletRecord } from '@/lib/server/db';
import { guardianSafe, passportEnrollment } from '@/lib/server/guardians';
import { body, currentClient, fail, json } from '@/lib/server/session';
import { syncRecoveries } from '@/lib/server/recovery';

export async function GET() {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  let wallet = await read((db) => db.wallets[client.clientId]);
  if (!wallet) return json({ wallet: null });
  const state = await readWalletState(NODE_RPC, wallet.address);
  if (state.deployed && !wallet.deployedAt) wallet = await write((db) => { db.wallets[client.clientId].deployedAt = Date.now(); return db.wallets[client.clientId]; });
  await syncRecoveries(wallet, state);
  wallet = await read((db) => db.wallets[client.clientId]);
  const recovery = publicSession(await read((db) => Object.values(db.recoveries).filter((r) => r.wallet === wallet.address).sort((a, b) => b.createdAt - a.createdAt)[0]));
  return json({ wallet, state, recovery });
}

type Register = {
  owner: { x: bigint; y: bigint; credentialId: string };
  guardianB: GuardianB & { label: string };
  bankAssisted: boolean;
  contact?: string;
};

export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const existing = await read((db) => db.wallets[client.clientId]);
  if (existing && (existing.deployedAt || (await readWalletState(NODE_RPC, existing.address)).deployed)) return fail('This client already has a wallet. Its guardians can only change on-chain, signed by the owner passkey.', 409);
  const r = await body<Register>(req);
  const address = counterfactualAddress(r.owner);
  if (r.guardianB.type === 'passkey' && !isAddressEqual(r.guardianB.address as Hex, passkeySignerAddress(r.guardianB))) return fail('Recovery passkey address mismatch');
  if (r.guardianB.type === 'passport') {
    // Take the enrolment from the passport guardian's own record, never from the browser.
    let e;
    try { e = await passportEnrollment(r.guardianB.enrollId); } catch (err) { return fail((err as Error).message); }
    if (!isAddressEqual(e.wallet, address as Hex)) return fail('This passport was enrolled for another wallet');
    r.guardianB = { type: 'passport', enrollId: e.id, address: e.address, simulated: e.simulated, label: e.label };
  }
  if (!r.bankAssisted && !/^0x[0-9a-fA-F]{40}$/.test(r.contact ?? '')) return fail('A trusted contact address is needed when bank-assisted recovery is off');
  const guardianA: WalletRecord['guardianA'] = r.bankAssisted
    ? { type: 'swissquote', address: (await guardianSafe()).address, label: 'Swissquote, or the independent partner if Swissquote cannot' }
    : { type: 'contact', address: r.contact!, label: 'Trusted contact' };
  const record: WalletRecord = {
    clientId: client.clientId,
    address,
    createdAt: Date.now(),
    owner: { ...r.owner, signer: passkeySignerAddress(r.owner) },
    previousOwners: [],
    guardianA,
    guardianB: r.guardianB,
    bankAssisted: r.bankAssisted,
  };
  await write((db) => { db.wallets[client.clientId] = record; });
  await audit({ actor: 'Wallet service', action: 'Wallet registered', wallet: address, detail: `Client ${client.clientId}. Guardian A: ${guardianA.label}. Guardian B: ${r.guardianB.label}.`, outcome: 'info' });
  return json({ wallet: record });
}
