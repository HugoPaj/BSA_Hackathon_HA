// End-to-end test of the "Swissquote is gone" path.
// Setup goes through the Swissquote app as usual (wallet with a recovery card as Guardian B). After that the test
// never calls the Swissquote app or its guardian again: only the public RPC, the public bundler and the partner.
// Usage: npx tsx scripts/e2e-rescue.mts [baseUrl] [partnerUrl]   (npm run dev must be running)
import { CandidePaymaster, fromSafeWebauthn, type MetaTransaction, type UserOperationV7 } from 'abstractionkit';
import { hashTypedData, isAddressEqual, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BUNDLER_RPC, CHAIN_ID, NODE_RPC } from '../lib/config';
import { passkeySignerAddress, readWalletState, recoveryRequest, Safe, setupTransactions, transferTx } from '../lib/chain';
import { parse, stringify } from '../lib/json';
import { createSoftPasskey } from './webauthn-sim.mjs';

type SoftKey = { publicKey: { x: bigint; y: bigint }; getAssertion: (c: Uint8Array) => Promise<Parameters<typeof Safe.createWebAuthnSignature>[0]> };
const BASE = process.argv[2] ?? 'http://localhost:3000';
const PARTNER = process.argv[3] ?? 'http://127.0.0.1:4102';
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`, ...a);
const mk = (): SoftKey => createSoftPasskey('localhost', BASE);
const BOB = '0x3C36F1ac17b9818b4e45bD4909b04bd3adEcfB3b';

// ── Phase 1: normal life with Swissquote ─────────────────────────────────────────────────────────────────────
const jar: Record<string, string> = {};
async function sq<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(BASE + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: data === undefined ? undefined : stringify(data) });
  for (const sc of res.headers.getSetCookie()) { const [k, v] = sc.split(';')[0].split('='); if (v) jar[k] = v; else delete jar[k]; }
  const out = parse<T & { error?: string }>(await res.text());
  if (!res.ok) throw new Error(out.error);
  return out;
}
await sq('/api/session', { clientId: '2162953', password: 'demo' });
await sq('/api/demo/reset', {});
const cfg = await sq<{ swissquoteGuardian: string }>('/api/config');
const owner = mk();
const card = privateKeyToAccount(generatePrivateKey()); // the recovery card's offline key
const { wallet } = await sq<{ wallet: { address: string } }>('/api/wallet', { owner: { ...owner.publicKey, credentialId: 'owner' }, guardianB: { type: 'card', address: card.address, label: 'Recovery card' }, bankAssisted: true });
const address = wallet.address;

async function viaSwissquote(txs: MetaTransaction[]) {
  const acc = Safe.initializeNewAccount([owner.publicKey]);
  let op = await acc.createUserOperation(txs, NODE_RPC, BUNDLER_RPC, { expectedSigners: [owner.publicKey] });
  const r = await sq<{ evaluation: { decision: string }; userOp: UserOperationV7 }>('/api/sponsor', { userOp: op });
  if (r.evaluation.decision !== 'sponsor') throw new Error('Swissquote declined the setup: ' + r.evaluation.decision);
  op = r.userOp;
  op.signature = await acc.signUserOperationWithSigners(op, [fromSafeWebauthn({ publicKey: owner.publicKey, isInit: true, getAssertion: owner.getAssertion, accountClass: Safe })], CHAIN_ID);
  const { userOpHash } = await sq<{ userOpHash: string }>('/api/tx', { userOp: op, meta: { type: 'deploy', title: 'Wallet created', sponsored: true } });
  for (;;) { const s = await sq<{ status: string }>('/api/tx?hash=' + userOpHash); if (s.status !== 'pending') return s; await new Promise((r) => setTimeout(r, 2000)); }
}
const dep = await viaSwissquote(setupTransactions(address, cfg.swissquoteGuardian, { type: 'card', address: card.address }));
log('1 wallet deployed with Swissquote:', address, dep.status, '| Guardian A Safe', cfg.swissquoteGuardian);
const funded = await sq('/api/fund', { amount: 1_000_000n }).then(() => true, (e) => { log('  (no USDC funding:', e.message.slice(0, 80), ')'); return false; });
if (funded) log('  funded with 1 USDC from the Swissquote treasury');

// ── Phase 2: Swissquote is gone. No more calls to BASE from here on. ─────────────────────────────────────────
for (const k of Object.keys(jar)) delete jar[k];
log('── Swissquote is gone: only public RPC, public bundler and the partner from here ──');

async function sendViaPublicBundler(key: SoftKey, amount: bigint) {
  const acc = new Safe(address);
  let op = await acc.createUserOperation([transferTx(BOB, amount)], NODE_RPC, BUNDLER_RPC, { expectedSigners: [key.publicKey] });
  op = (await new CandidePaymaster(BUNDLER_RPC).createSponsorPaymasterUserOperation(acc, op, BUNDLER_RPC, undefined, undefined, { verificationGasLimitPercentageMultiplier: 30, preVerificationGasPercentageMultiplier: 25, callGasLimitPercentageMultiplier: 15 })).userOperation as UserOperationV7;
  op.signature = await acc.signUserOperationWithSigners(op, [fromSafeWebauthn({ publicKey: key.publicKey, isInit: false, getAssertion: key.getAssertion, accountClass: Safe })], CHAIN_ID);
  const receipt = await (await acc.sendUserOperation(op, BUNDLER_RPC)).included();
  if (!receipt?.success) throw new Error('transfer reverted');
  return receipt.receipt.transactionHash;
}
const amount = funded ? 100_000n : 0n;
log('2 passkey still works → transfer without Swissquote:', await sendViaPublicBundler(owner, amount));

async function partner(path: string, body: unknown) {
  const res = await fetch(PARTNER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw Object.assign(new Error(out.error), { status: res.status });
  return out;
}
const expectRefused = async (p: Promise<unknown>, label: string) => {
  try { await p; } catch (e) { log('  ✓ refused:', label, '→', (e as Error).message.slice(0, 100)); return; }
  throw new Error('expected a refusal: ' + label);
};

// Passkey lost. New passkey on a new device; the card signs the structured request.
const newOwner = mk();
const newSigner = passkeySignerAddress(newOwner.publicKey);
const { hash, typedData } = await recoveryRequest(NODE_RPC, address, newSigner);
const req = (over: Record<string, unknown>) => ({ wallet: address, guardian: cfg.swissquoteGuardian, newOwner: newSigner, newOwnerKey: { x: newOwner.publicKey.x.toString(), y: newOwner.publicKey.y.toString() }, guardianBSignature: '0x', identity: { method: 'video-ident', result: 'match' }, relay: true, ...over });

const thief = privateKeyToAccount(generatePrivateKey());
await expectRefused(partner('/approve', req({ guardianBSignature: await thief.sign({ hash }) })), 'thief with phone + e-mail but no recovery card');
await expectRefused(partner('/approve', req({ guardianBSignature: await card.sign({ hash }), identity: { method: 'video-ident', result: 'mismatch' } })), 'stolen card, face does not match');
const otherHash = hashTypedData({ ...typedData, message: { ...typedData.message, newOwners: [thief.address] } });
await expectRefused(partner('/approve', req({ guardianBSignature: await card.sign({ hash: otherHash }) })), 'card signature for a different new owner');

const approved = await partner('/approve', req({ guardianBSignature: await card.sign({ hash }) }));
log('3 partner approved as Guardian A and relayed:', approved.txHash, 'executeAfter', new Date(approved.executeAfter * 1000).toISOString());
await expectRefused(partner('/finalize', { wallet: address }), 'finalizing before the delay');
const waitMs = approved.executeAfter * 1000 - Date.now() + 8000;
log('  waiting', Math.round(waitMs / 1000), 's for the delay');
await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));
const fin = await partner('/finalize', { wallet: address });
const st = await readWalletState(NODE_RPC, address);
if (st.owners.length !== 1 || !isAddressEqual(st.owners[0] as Hex, newSigner)) throw new Error('owner was not replaced: ' + st.owners.join(','));
log('4 finalized', fin.txHash, '→ new passkey is the only owner');
log('5 new passkey moves funds without Swissquote:', await sendViaPublicBundler(newOwner, funded ? st.usdc : 0n));
await sendViaPublicBundler(owner, 0n).then(() => { throw new Error('old passkey still works'); }, (e) => log('  ✓ old passkey rejected →', (e as Error).message.slice(0, 80)));
log('done');
