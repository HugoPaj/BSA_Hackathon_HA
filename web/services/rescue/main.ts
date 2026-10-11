// Rescue page: reach a Swissquote wallet with no Swissquote server involved.
//   Passkey still works → sign a USDC transfer and send it through a public bundler.
//   Passkey lost        → recovery card, recovery passkey or passport (Guardian B) + the independent partner (Guardian A).
import { CandidePaymaster, fromSafeWebauthn, type UserOperationV7 } from 'abstractionkit';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { formatUnits, getAddress, isAddress, isAddressEqual, parseUnits, type Hex } from 'viem';
import { BUNDLER_RPC, CHAIN_ID, EXPLORER, NODE_RPC, RECOVERY_DELAY_LABEL, USDC } from '@/lib/config';
import { passkeySignerAddress, readWalletState, recoveryRequest, Safe, transferTx, type WalletState } from '@/lib/chain';
import { readGuardianSafe } from '@/lib/guardian-safe';
import { b64url, createPasskey, hexToBytes, parseDer, signWithPasskey, toBig, type Passkey } from '@/lib/passkey';
import { unlockRecoveryCard } from '@/lib/card';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const link = (kind: 'tx' | 'address', v: string) => `<a target="_blank" href="${EXPLORER}/${kind}/${v}">${short(v)}</a>`;
const usdc = (v: bigint) => formatUnits(v, USDC.decimals);

function say(logId: string, text: string, tone: '' | 'ok' | 'err' | 'warn' = '') {
  const div = document.createElement('div');
  div.className = tone;
  div.innerHTML = text;
  $(logId).append(div);
}
const errText = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e);
  return (e as Error)?.name === 'NotAllowedError' ? 'The passkey prompt was cancelled or timed out.' : m;
};

async function busy(btn: HTMLButtonElement, fn: () => Promise<void>) {
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

async function post<T>(base: '/partner' | '/passport', path: string, body: unknown): Promise<T> {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error ?? `${base === '/partner' ? 'Partner' : 'Passport guardian'} error ${res.status}`);
  return out as T;
}
const partner = <T>(path: string, body: unknown) => post<T>('/partner', path, body);
// The passport guardian is not Swissquote's either: it keeps signing for enrolled passports when Swissquote is gone.
const passport = <T>(path: string, body: unknown) => post<T>('/passport', path, body);

// ── State ────────────────────────────────────────────────────────────────────────────────────────────────────
let wallet: string | null = null;
let state: WalletState | null = null;
let guardianA: string | null = null; // the 1-of-2 Safe guardian
let guardianB: string | null = null; // the client's own factor
let signer: Passkey | null = null; // a passkey that owns the wallet (identified or newly recovered)
let newKey: Passkey | null = null;
let bSignature: Hex | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

async function lookup() {
  const raw = $<HTMLInputElement>('address').value.trim();
  if (!isAddress(raw)) throw new Error('That is not a valid address');
  wallet = getAddress(raw);
  state = await readWalletState(NODE_RPC, wallet);
  if (!state.deployed) throw new Error('No wallet is deployed at this address on Base Sepolia');
  guardianA = guardianB = null;
  for (const g of state.guardians) {
    if (await readGuardianSafe(NODE_RPC, g)) guardianA = g;
    else guardianB = g;
  }
  renderWallet();
}

function renderWallet() {
  if (!state || !wallet) return;
  const box = $('walletInfo');
  box.classList.remove('hidden');
  box.innerHTML = `<dl>
    <dt>Wallet</dt><dd class="mono">${link('address', wallet)}</dd>
    <dt>Balance</dt><dd>${usdc(state.usdc)} USDC · ${formatUnits(state.eth, 18)} ETH</dd>
    <dt>Owner</dt><dd class="mono">${state.owners.map((o) => link('address', o)).join(', ')} (passkey signer)</dd>
    <dt>Guardian A</dt><dd>${guardianA ? `${link('address', guardianA)} · Swissquote or the partner (1-of-2 Safe)` : 'not found'}</dd>
    <dt>Guardian B</dt><dd>${guardianB ? `${link('address', guardianB)} · your recovery factor` : 'not found'}</dd>
    <dt>Recovery</dt><dd>${state.threshold} of ${state.guardians.length} guardians, then ${RECOVERY_DELAY_LABEL} delay</dd>
  </dl>`;
  $('actions').classList.remove('hidden');
  $<HTMLInputElement>('amount').value = usdc(state.usdc);
  renderPending();
}

function renderPending() {
  clearInterval(timer);
  const rec = state?.recovery;
  $('pending').classList.toggle('hidden', !rec);
  if (!rec) return;
  const tick = () => {
    const left = Number(rec.executeAfter) - Math.floor(Date.now() / 1000);
    const ready = left <= 0;
    $('pendingText').innerHTML = `Both guardians approved replacing the owner with ${link('address', rec.newOwners[0])}. ${ready ? 'The delay is over: anyone can finish it now.' : `The current passkey can still cancel for <b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b>.`}`;
    $<HTMLButtonElement>('finish').disabled = !ready;
  };
  tick();
  timer = setInterval(tick, 1000);
}

// ── Passkey still works ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Find which passkey on this device owns the wallet, without any stored data: sign a random challenge, recover
 * the two possible P-256 public keys from the signature, and keep the one whose signer contract is an owner.
 */
async function identifyOwner(): Promise<Passkey> {
  const cred = (await navigator.credentials.get({
    publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname, userVerification: 'required', timeout: 120_000 },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was chosen');
  const res = cred.response as AuthenticatorAssertionResponse;
  const authData = new Uint8Array(res.authenticatorData);
  const msgHash = sha256(new Uint8Array([...authData, ...sha256(new Uint8Array(res.clientDataJSON))]));
  const { r, s } = parseDer(new Uint8Array(res.signature));
  for (const bit of [0, 1]) {
    try {
      const pt = new p256.Signature(r, s).addRecoveryBit(bit).recoverPublicKey(msgHash).toBytes(false);
      const key = { credentialId: b64url.encode(cred.rawId), x: toBig(pt.slice(1, 33)), y: toBig(pt.slice(33, 65)) };
      if (state!.owners.some((o) => isAddressEqual(o as Hex, passkeySignerAddress(key)))) return key;
    } catch { /* not this candidate */ }
  }
  throw new Error('This passkey does not own the wallet. If it was replaced by a recovery, use the new passkey.');
}

async function sponsorOrSelfPay(account: Safe, op: UserOperationV7): Promise<{ op: UserOperationV7; how: string }> {
  try {
    const pm = new CandidePaymaster(BUNDLER_RPC);
    const { userOperation } = await pm.createSponsorPaymasterUserOperation(account, op, BUNDLER_RPC, undefined, undefined, { verificationGasLimitPercentageMultiplier: 30, preVerificationGasPercentageMultiplier: 25, callGasLimitPercentageMultiplier: 15 });
    return { op: userOperation as UserOperationV7, how: 'gas sponsored by a public paymaster (not Swissquote)' };
  } catch {
    const cost = (op.callGasLimit + op.verificationGasLimit + op.preVerificationGas) * op.maxFeePerGas;
    if (state!.eth < cost) throw new Error(`No public paymaster available and the wallet holds too little ETH for gas (needs ~${formatUnits(cost, 18)} ETH)`);
    return { op, how: 'gas paid by the wallet in ETH' };
  }
}

async function send() {
  const dest = $<HTMLInputElement>('dest').value.trim();
  if (!isAddress(dest)) throw new Error('Enter a valid destination address');
  const amount = parseUnits($<HTMLInputElement>('amount').value || '0', USDC.decimals);
  if (amount <= 0n || amount > state!.usdc) throw new Error(`Enter an amount between 0 and ${usdc(state!.usdc)} USDC`);
  if (!signer) {
    say('sendLog', 'Choose the passkey for this wallet…');
    signer = await identifyOwner();
    say('sendLog', `Passkey identified: signer ${link('address', passkeySignerAddress(signer))}`, 'ok');
  }
  const account = new Safe(wallet!);
  const key = { x: signer.x, y: signer.y };
  const built = await account.createUserOperation([transferTx(dest, amount)], NODE_RPC, BUNDLER_RPC, { expectedSigners: [key] });
  const { op, how } = await sponsorOrSelfPay(account, built);
  say('sendLog', `Transfer of ${usdc(amount)} USDC to ${short(dest)} built, ${how}. Approve it with your passkey…`);
  const credentialId = signer.credentialId;
  op.signature = await account.signUserOperationWithSigners(op, [fromSafeWebauthn({ publicKey: key, isInit: false, getAssertion: (ch) => signWithPasskey([credentialId], ch), accountClass: Safe })], CHAIN_ID);
  const sent = await account.sendUserOperation(op, BUNDLER_RPC);
  say('sendLog', 'Sent to the public bundler. Waiting for the block…');
  const receipt = await sent.included();
  if (!receipt?.success) throw new Error('The transaction was included but reverted');
  say('sendLog', `Done: ${link('tx', receipt.receipt.transactionHash)}`, 'ok');
  const before = state!.usdc;
  await refreshUntil(() => state!.usdc !== before);
}

// ── Passkey lost ─────────────────────────────────────────────────────────────────────────────────────────────

const newSigner = () => passkeySignerAddress(newKey!);
const requestHash = async () => (await recoveryRequest(NODE_RPC, wallet!, newSigner())).hash;
function unlock(id: string, done?: string) {
  if (done) $(done).classList.add('done');
  $(id).classList.remove('locked');
}

async function createNewKey() {
  if (state!.recovery) throw new Error('A recovery is already pending for this wallet');
  newKey = await createPasskey({ userName: 'Wallet', displayName: 'Swissquote Wallet', purpose: 'wallet' });
  say('newLog', `New passkey ready. Its signer contract will be ${short(newSigner())}.`, 'ok');
  $('request').textContent = `move wallet ${short(wallet!)} to the new passkey you just created. Your old passkey will stop working.`;
  $('requestRaw').textContent = `ExecuteRecovery(wallet ${short(wallet!)}, newOwners [${short(newSigner())}], newThreshold 1)`;
  unlock('s-factor', 's-new');
}

async function approveWith(sign: (hash: Hex) => Promise<Hex>, label: string) {
  bSignature = await sign(await requestHash());
  say('factorLog', `${label} signed the request. The partner will check it on-chain.`, 'ok');
  unlock('s-partner', 's-factor');
}

async function identify(result: 'match' | 'mismatch') {
  if (!bSignature || !newKey || !guardianA) throw new Error('Complete the previous steps first');
  say('partnerLog', result === 'match' ? 'Partner verifying and signing…' : 'Simulating someone else at the video identification…');
  const out = await partner<{ txHash: string; executeAfter: number }>('/approve', {
    wallet, guardian: guardianA, newOwner: newSigner(), newOwnerKey: { x: newKey.x.toString(), y: newKey.y.toString() },
    guardianBSignature: bSignature, identity: { method: 'video-ident', result }, relay: true,
  });
  $('s-partner').classList.add('done');
  $('identRow').classList.add('hidden');
  say('partnerLog', `Partner approved as Guardian A and submitted the recovery: ${link('tx', out.txHash)}`, 'ok');
  await refreshUntil(() => !!state?.recovery);
}

/** The public RPC can lag a block behind the relayer's receipt. */
async function refreshUntil(done: () => boolean) {
  for (let i = 0; i < 15; i++) {
    await lookup();
    if (done()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function finish() {
  const { txHash } = await partner<{ txHash: string }>('/finalize', { wallet });
  say('pendingLog', `Recovery finished: ${link('tx', txHash)}. The new passkey is now the only owner.`, 'ok');
  await refreshUntil(() => !state?.recovery);
  if (newKey && state!.owners.some((o) => isAddressEqual(o as Hex, newSigner()))) {
    signer = newKey;
    showTab('send');
    say('sendLog', 'Your new passkey owns the wallet. You can move your funds now.', 'ok');
  }
}

// ── Wiring ───────────────────────────────────────────────────────────────────────────────────────────────────
function showTab(tab: 'send' | 'recover') {
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('tab-send').classList.toggle('hidden', tab !== 'send');
  $('tab-recover').classList.toggle('hidden', tab !== 'recover');
}
document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab as 'send' | 'recover')));

const on = (id: string, log: string, fn: () => Promise<void>) =>
  $<HTMLButtonElement>(id).addEventListener('click', (e) => busy(e.currentTarget as HTMLButtonElement, () => fn().catch((err) => say(log, errText(err), 'err'))));

on('lookup', 'sendLog', async () => {
  try { await lookup(); } catch (e) { $('walletInfo').classList.remove('hidden'); $('walletInfo').innerHTML = `<div class="log"><div class="err">${errText(e)}</div></div>`; }
});
on('max', 'sendLog', async () => { $<HTMLInputElement>('amount').value = usdc(state?.usdc ?? 0n); });
on('send', 'sendLog', send);
on('newKey', 'newLog', createNewKey);
on('factorPasskey', 'factorLog', () => approveWith(async (hash) => Safe.createWebAuthnSignature(await signWithPasskey([], hexToBytes(hash))) as Hex, 'Your recovery passkey'));
on('factorCard', 'factorLog', async () => {
  const card = await unlockRecoveryCard($<HTMLTextAreaElement>('cardCode').value, $<HTMLInputElement>('cardPin').value);
  if (guardianB && !isAddressEqual(card.address, guardianB as Hex)) throw new Error('This card is not the recovery factor registered for this wallet');
  await approveWith((hash) => card.sign({ hash }), 'Your recovery card');
});
on('factorPassport', 'factorLog', async () => {
  type Scan = { status: 'pending' | 'retry' | 'refused' | 'done'; reason?: string; signature?: Hex; hash?: Hex };
  const expected = await requestHash();
  const s = await passport<{ scan: string; link: string | null; simulated: boolean }>('/recover', { wallet, newOwner: newSigner(), callback: `${location.origin}/?wallet=${wallet}` });
  let r: Scan;
  if (s.simulated) {
    // Simulated passports live in the browser that enrolled them (the wallet's origin), so usually not here.
    const secret = localStorage.getItem('sq.simpassport.v1');
    if (!secret) throw new Error('The passport guardian runs simulated, and this browser holds no simulated passport');
    r = await passport<Scan>('/scan/simulate', { scan: s.scan, secret });
  } else {
    say('factorLog', `Open <a href="${s.link}">this ReadID Ready link</a> on your phone and scan your passport. This page waits for the result.`);
    do {
      await new Promise((ok) => setTimeout(ok, 2500));
      r = await passport<Scan>('/scan', { scan: s.scan });
    } while (r.status === 'pending');
  }
  if (r.status !== 'done') throw new Error(r.reason ?? 'The passport check failed');
  if (r.hash?.toLowerCase() !== expected.toLowerCase()) throw new Error('The passport guardian signed a different request');
  await approveWith(async () => r.signature!, 'Your passport guardian');
});
on('identOk', 'partnerLog', () => identify('match'));
on('identBad', 'partnerLog', () => identify('mismatch'));
on('finish', 'pendingLog', finish);

const fromUrl = new URLSearchParams(location.search).get('wallet');
if (fromUrl) { $<HTMLInputElement>('address').value = fromUrl; $('lookup').click(); }
