// End-to-end test of the backend API with software passkeys (same signature format as a browser authenticator).
// Usage: node scripts/e2e-api.mjs [baseUrl]   (dev server must be running)
import { SafeAccountV0_3_0 as Safe, SocialRecoveryModule, fromSafeWebauthn } from 'abstractionkit';
import { encodeFunctionData, parseAbi } from 'viem';
import { createSoftPasskey } from './webauthn-sim.mjs';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const MODULE = '0x949d01d424bE050D09C16025dd007CB59b3A8c66';
const srm = new SocialRecoveryModule(MODULE);
const NODE = BASE + '/api/rpc/node', BUNDLER = BASE + '/api/rpc/bundler';
const t0 = Date.now(); const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`, ...a);
let cookie = '';
const stringify = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? { $big: x.toString() } : x));
const parse = (t) => JSON.parse(t, (_k, v) => (v && typeof v === 'object' && typeof v.$big === 'string' ? BigInt(v.$big) : v));
async function api(path, data) {
  const res = await fetch(BASE + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie }, body: data === undefined ? undefined : stringify(data) });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const out = parse(await res.text());
  if (!res.ok) throw Object.assign(new Error(out.error), { status: res.status });
  return out;
}
const expectFail = async (p, label) => { try { await p; throw new Error('expected failure: ' + label); } catch (e) { if (e.message.startsWith('expected failure')) throw e; log('  ✓ refused:', label, '→', e.message.slice(0, 110)); } };
const opts = { rpId: 'localhost', origin: BASE };
const mk = () => createSoftPasskey(opts.rpId, opts.origin);

await api('/api/session', { clientId: '2162953', password: 'demo' });
await api('/api/demo/reset', {});
const cfg = await api('/api/config');
const owner = mk(), gB = mk();
const ownerPk = { ...owner.publicKey, credentialId: 'owner' };
const gBAddr = Safe.createWebAuthnSignerVerifierAddress(gB.publicKey.x, gB.publicKey.y);
const { wallet } = await api('/api/wallet', { owner: ownerPk, guardianB: { type: 'passkey', ...gB.publicKey, credentialId: 'gb', address: gBAddr, label: 'Laptop passkey' }, bankAssisted: true });
log('1 registered wallet', wallet.address);

async function run(account, txs, signerKey, isInit, meta, stepUpKey) {
  const es = { expectedSigners: [signerKey.publicKey] };
  let op = await account.createUserOperation(txs, NODE, BUNDLER, es).catch(() => account.createUserOperation(txs, NODE, BUNDLER, { ...es, skipGasEstimation: true }));
  let r = await api('/api/sponsor', { userOp: op });
  if (r.evaluation.decision === 'step-up' && stepUpKey) {
    const { id, challenge } = await api('/api/stepup', { action: 'create', wallet: account.accountAddress, callData: op.callData });
    const sig = Safe.createWebAuthnSignature(await stepUpKey.getAssertion(Buffer.from(challenge.slice(2), 'hex')));
    await api('/api/stepup', { action: 'verify', id, signature: sig });
    r = await api('/api/sponsor', { userOp: op, stepUpId: id });
  }
  if (r.evaluation.decision !== 'sponsor') return { evaluation: r.evaluation };
  op = r.userOp;
  op.signature = await account.signUserOperationWithSigners(op, [fromSafeWebauthn({ publicKey: signerKey.publicKey, isInit, getAssertion: signerKey.getAssertion, accountClass: Safe })], 84532n);
  const { userOpHash } = await api('/api/tx', { userOp: op, meta });
  for (;;) { const s = await api('/api/tx?hash=' + userOpHash); if (s.status !== 'pending') return { ...s, evaluation: r.evaluation }; await new Promise((r) => setTimeout(r, 2000)); }
}

// 2. Deploy with recovery on, sponsored
const initAcc = Safe.initializeNewAccount([owner.publicKey]);
const setup = [
  Safe.createDeployWebAuthnVerifierMetaTransaction(gB.publicKey.x, gB.publicKey.y),
  Safe.createEnableModuleMetaTransaction(MODULE, wallet.address),
  srm.createAddGuardianWithThresholdMetaTransaction(cfg.swissquoteGuardian, 1n),
  srm.createAddGuardianWithThresholdMetaTransaction(gBAddr, 2n),
];
const dep = await run(initAcc, setup, owner, true, { type: 'deploy', title: 'Wallet created', sponsored: true });
log('2 deployed:', dep.status, dep.txHash, '| checks', dep.evaluation.checks.map((c) => `${c.id}:${c.status}`).join(' '));

// 3. Ownership proof via EIP-1271
const ch = await api('/api/wallet/proof', { stage: 'challenge' });
const proofSig = Safe.createWebAuthnSignature(await owner.getAssertion(Buffer.from(ch.hash.slice(2), 'hex')));
const { proof } = await api('/api/wallet/proof', { stage: 'verify', challengeId: ch.challengeId, signature: proofSig });
log('3 ownership proof:', proof.method);
const attackerCard = '0x000000000000000000000000000000000000dEaD';
await expectFail(api('/api/wallet', { owner: ownerPk, guardianB: { type: 'card', address: attackerCard, label: 'Attacker card' }, bankAssisted: true }), 're-registering a deployed wallet to swap Guardian B');

// 4. Policy declines
const acc = new Safe(wallet.address);
const erc20 = parseAbi(['function transfer(address,uint256)', 'function approve(address,uint256)']);
const usdc = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const t = (to, amt) => ({ to: usdc, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [to, amt] }) });
const ap = (to, amt) => ({ to: usdc, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: 'approve', args: [to, amt] }) });
const fee = t(cfg.treasury, 50000n);
for (const [label, txs] of [
  ['sanctioned recipient', [t('0x098B716B8Aaf21512996dC57EB0615e2383E2f96', 1000000n), fee]],
  ['unlimited approval to unknown contract', [ap('0x1111111111111111111111111111111111111111', 2n ** 256n - 1n), fee]],
  ['transfer without fee', [t('0x3C36F1ac17b9818b4e45bD4909b04bd3adEcfB3b', 1000000n)]],
  ['allowlisted Permit2 approval (sponsor if balance allows)', [ap('0x000000000022D473030F116dDEE9F6B43aC78BA3', 1000000n), fee]],
]) {
  const r = await run(acc, txs, owner, false, { type: 'send', title: label, sponsored: true });
  log('4', label, '→', r.evaluation.decision, r.status ?? '', '|', r.evaluation.checks.filter((c) => c.status !== 'pass').map((c) => `${c.id}:${c.status} (${c.detail})`).join('; ') || 'all pass');
}

// 5. Attack: wrong recovery factor, failed liveness
const attackerKey = mk();
const s1 = (await api('/api/recovery', { action: 'start', newOwner: { ...attackerKey.publicKey, credentialId: 'attacker' } })).session;
const bad = Safe.createWebAuthnSignature(await attackerKey.getAssertion(Buffer.from(s1.hash.slice(2), 'hex')));
await expectFail(api('/api/recovery', { action: 'guardian', id: s1.id, signature: bad }), 'attacker signs as Guardian B');
await expectFail(api('/api/recovery', { action: 'liveness', id: s1.id, result: 'mismatch' }), 'attacker face vs KYC file');
await expectFail(api('/api/recovery', { action: 'liveness', id: s1.id, result: 'match' }), 'retrying liveness on a refused request');
await expectFail(api('/api/recovery', { action: 'finalize', id: s1.id }), 'finalizing a refused request');

// 6. Legit recovery
const newOwner = mk();
const s = (await api('/api/recovery', { action: 'start', newOwner: { ...newOwner.publicKey, credentialId: 'new' } })).session;
const gSig = Safe.createWebAuthnSignature(await gB.getAssertion(Buffer.from(s.hash.slice(2), 'hex')));
const early = (await api('/api/recovery', { action: 'liveness', id: s.id, result: 'match' })).session;
if (early.swissquote || early.status !== 'collecting') throw new Error('HSM signed before Guardian B approved');
log('  ✓ liveness first: HSM waits for Guardian B');
const after = (await api('/api/recovery', { action: 'guardian', id: s.id, signature: gSig })).session;
if (after.guardianB?.signature || after.swissquote?.signature) throw new Error('guardian signature leaked to the client');
log('6 recovery submitted', after.status, after.submittedTx, 'executeAfter', new Date(after.executeAfter * 1000).toISOString());
const waitMs = after.executeAfter * 1000 - Date.now() + 8000;
log('  waiting', Math.round(waitMs / 1000), 's for the delay');
await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));
const fin = (await api('/api/recovery', { action: 'finalize', id: s.id })).session;
log('7 finalized', fin.status, fin.finalizedTx);
const st = await api('/api/wallet');
log('  owners', st.state.owners, 'expected', Safe.createWebAuthnSignerVerifierAddress(newOwner.publicKey.x, newOwner.publicKey.y));

// 8. Old passkey rejected, new passkey proves ownership
const old = await run(acc, [ap('0x000000000022D473030F116dDEE9F6B43aC78BA3', 0n), fee], owner, false, { type: 'approve', title: 'old key', sponsored: true }).catch((e) => ({ error: e.message }));
log('8 old passkey:', old.error ?? old.evaluation?.decision ?? old.status);
const ch2 = await api('/api/wallet/proof', { stage: 'challenge' });
const p2 = await api('/api/wallet/proof', { stage: 'verify', challengeId: ch2.challengeId, signature: Safe.createWebAuthnSignature(await newOwner.getAssertion(Buffer.from(ch2.hash.slice(2), 'hex'))) });
log('  new passkey ownership proof ok:', !!p2.proof);
const bo = await api('/api/backoffice');
log('9 audit entries', bo.audit.length, '| last:', bo.audit.slice(0, 4).map((a) => a.action).join(' · '));
