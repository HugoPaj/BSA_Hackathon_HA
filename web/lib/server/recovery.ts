import 'server-only';
// Recovery orchestration. This backend holds no guardian key: Swissquote's guardian runs as a separate service
// (services/guardian.ts) that re-checks every request on-chain and signs an EIP-712 approval only for a complete,
// structured request, after e-banking login and a vendor-signed liveness match. It never signs transactions.
import { isAddressEqual, recoverTypedDataAddress, type Hex } from 'viem';
import { NODE_RPC, RECOVERY_DELAY_LABEL } from '../config';
import { isValid1271, passkeySignerAddress, readWalletState, recoveryRequest, Safe, srm, type PublicKey, type WalletState } from '../chain';
import { addActivity, alert, audit, id, read, write, type RecoverySession, type WalletRecord } from './db';
import { guardianSafe, livenessVendor, passportAttestor, requestSwissquoteApproval } from './guardians';
import { checkAttestation, type LivenessAttestation } from '../liveness';
import { relay } from './aa';

export async function startRecovery(wallet: WalletRecord, newOwner: PublicKey & { credentialId: string }) {
  if (!wallet.bankAssisted) throw new Error('This wallet does not use bank-assisted recovery. Ask your trusted contact to approve instead.');
  const state = await readWalletState(NODE_RPC, wallet.address);
  if (!state.deployed) throw new Error('This wallet was never deployed, so there is nothing to recover');
  if (state.recovery) throw new Error('A recovery is already pending for this wallet');
  const signer = passkeySignerAddress(newOwner);
  if (state.owners.some((o) => isAddressEqual(o as Hex, signer))) throw new Error('This passkey already owns the wallet');
  const nonce = await srm.nonce(NODE_RPC, wallet.address);
  const { hash } = await recoveryRequest(NODE_RPC, wallet.address, signer, nonce);
  const session: RecoverySession = {
    id: id(), clientId: wallet.clientId, wallet: wallet.address, newOwner: { ...newOwner, signer }, hash, nonce: nonce.toString(), createdAt: Date.now(), status: 'collecting',
  };
  await write((db) => { db.recoveries[session.id] = session; });
  await alert(wallet.address, { severity: 'warning', title: 'Recovery started on a new device', body: `Someone started replacing your wallet passkey. If this wasn't you, open your wallet on a device you trust and cancel.` });
  await audit({ actor: 'Recovery service', action: 'Recovery requested', wallet: wallet.address, detail: `New signer ${signer}`, outcome: 'info' });
  return session;
}

/** The on-chain guardian list is the source of truth: a recovery factor only counts if the module knows it. */
export async function isOnChainGuardian(wallet: string, guardian: string) {
  const state = await readWalletState(NODE_RPC, wallet);
  return state.guardians.some((g) => isAddressEqual(g as Hex, guardian as Hex));
}

export async function approveGuardianB(session: RecoverySession, wallet: WalletRecord, signature: Hex) {
  if (session.status !== 'collecting') throw new Error('This recovery request is closed');
  const gB = wallet.guardianB;
  const verify = async () => {
    if (gB.type === 'passkey') return isValid1271(NODE_RPC, gB.address, session.hash as Hex, signature);
    const { typedData } = await recoveryRequest(NODE_RPC, session.wallet, session.newOwner.signer, BigInt(session.nonce));
    const addr = await recoverTypedDataAddress({ ...typedData, signature }).catch(() => null);
    return !!addr && isAddressEqual(addr, gB.address as Hex);
  };
  const ok = (await isOnChainGuardian(wallet.address, gB.address)) && (await verify());
  if (!ok) {
    await audit({ actor: 'Recovery service', action: 'Recovery factor rejected', wallet: wallet.address, detail: 'Signature did not match the registered recovery factor', outcome: 'declined' });
    await alert(wallet.address, { severity: 'error', title: 'Recovery attempt blocked', body: 'Someone tried to recover your wallet with the wrong recovery factor. Your wallet is safe.' });
    throw new Error('That signature does not come from the recovery factor registered for this wallet');
  }
  await write((db) => { db.recoveries[session.id].guardianB = { signature, verifiedAt: Date.now() }; });
  await audit({ actor: 'Recovery service', action: 'Guardian B approved', wallet: wallet.address, detail: `${gB.label} signed the EIP-712 recovery request`, outcome: 'approved' });
  return maybeSubmit(session.id);
}

/**
 * A signed liveness verdict, relayed by the client's browser: from the liveness vendor, or for a passport wallet from
 * the passport guardian (ReadID's live face check against the chip photo, done during the same scan). We check it so we can explain a refusal
 * and alert the owner, but our check grants nothing: the guardian verifies the same attestation independently.
 */
export async function liveness(session: RecoverySession, wallet: WalletRecord, attestation: LivenessAttestation) {
  if (session.status !== 'collecting') throw new Error('This recovery request is closed');
  const issuers = wallet.guardianB.type === 'passport'
    ? [{ address: await passportAttestor(), name: 'passport guardian' }]
    : [{ address: await livenessVendor(), name: 'liveness vendor', subject: wallet.clientId }];
  const actor = wallet.guardianB.type === 'passport' ? 'Passport guardian (ReadID face check)' : 'KYC liveness vendor';
  const problem = await checkAttestation(attestation, { issuers, wallet: wallet.address, request: session.hash });
  if (problem) {
    await audit({ actor: 'Recovery service', action: 'Liveness attestation rejected', wallet: wallet.address, detail: problem, outcome: 'declined' });
    throw new Error(`${problem}. Run the face check again.`);
  }
  const result = attestation.match ? 'match' : 'mismatch';
  await write((db) => { db.recoveries[session.id].liveness = { result, at: Date.now(), attestation }; });
  if (result === 'mismatch') {
    await write((db) => { db.recoveries[session.id].status = 'refused'; });
    await audit({ actor, action: 'Face match failed', wallet: wallet.address, detail: 'Signed verdict: the live selfie does not match the KYC file', outcome: 'declined' });
    await audit({ actor: 'Recovery service', action: 'Not sent to the guardian', wallet: wallet.address, detail: 'Swissquote\'s guardian signs only after a liveness match', outcome: 'declined' });
    await alert(wallet.address, { severity: 'error', title: 'Recovery attempt blocked', body: 'A recovery attempt failed the face check against your ID. Swissquote refused to approve it. Your wallet is safe.' });
    throw new Error('The face check did not match the ID on file. Swissquote will not approve this recovery.');
  }
  const pending = await read((db) => Object.values(db.recoveries).some((r) => r.wallet === wallet.address && r.id !== session.id && r.status === 'pending'));
  if (pending) throw new Error('HSM policy: another recovery is already pending for this wallet');
  await audit({ actor, action: 'Face match passed', wallet: wallet.address, detail: `Signed verdict for ${wallet.guardianB.type === 'passport' ? 'the enrolled document' : `client ${attestation.subject}`}, bound to this recovery request`, outcome: 'approved' });
  return maybeSubmit(session.id);
}

/** Once the request is complete, hand the evidence to the guardian service. It verifies all of it itself before signing. */
async function hsmSign(s: RecoverySession) {
  if (s.swissquote || s.status !== 'collecting' || !s.guardianB || s.liveness?.result !== 'match' || !s.liveness.attestation) return;
  const wallet = await read((db) => db.wallets[s.clientId]);
  try {
    // The guardian learns whose KYC file this wallet belongs to from the owner's own passkey signature, not from us.
    if (!wallet.proof?.signature) throw new Error('Swissquote\'s guardian needs the wallet ownership proof your passkey signed when you opened the wallet. Without it, recover with the independent partner instead.');
    await guardianSafe(); // normally deployed long before; this only covers a fresh demo setup
    const { signature } = await requestSwissquoteApproval({
      wallet: s.wallet, guardian: wallet.guardianA.address, newOwner: s.newOwner.signer, guardianBSignature: s.guardianB.signature,
      attestation: s.liveness.attestation, ownershipProof: { message: wallet.proof.message, signature: wallet.proof.signature },
    });
    await write((db) => { db.recoveries[s.id].swissquote = { signature, signedAt: Date.now() }; });
    await audit({ actor: 'Guardian HSM', action: 'Signed recovery approval', wallet: s.wallet, detail: `Separate guardian service verified on its own: the recovery factor on-chain, the vendor-signed liveness verdict for this request, and the owner-signed ownership proof. Structured request: owner → ${s.newOwner.signer}, threshold 1`, outcome: 'approved' });
  } catch (e) {
    await audit({ actor: 'Guardian HSM', action: 'Refused to sign', wallet: s.wallet, detail: (e as Error).message, outcome: 'declined' });
    // A stale verdict (older than its TTL, or already used) can be replaced by a fresh face check.
    if (/attestation (expired|was already used)/.test((e as Error).message)) await write((db) => { delete db.recoveries[s.id].liveness; });
    throw e;
  }
}

async function maybeSubmit(sessionId: string) {
  await hsmSign(await read((db) => db.recoveries[sessionId]));
  const s = await read((db) => db.recoveries[sessionId]);
  const wallet = await read((db) => db.wallets[s.clientId]);
  if (!s.guardianB || !s.swissquote || s.status !== 'collecting') return s;
  const signatures = [
    { signer: wallet.guardianA.address, signature: s.swissquote.signature },
    { signer: wallet.guardianB.address, signature: s.guardianB.signature },
  ];
  const { txHash } = await relay([
    Safe.createDeployWebAuthnVerifierMetaTransaction(s.newOwner.x, s.newOwner.y),
    srm.createMultiConfirmRecoveryMetaTransaction(s.wallet, [s.newOwner.signer], 1, signatures, true),
  ]);
  const req = await srm.getRecoveryRequest(NODE_RPC, s.wallet);
  await write((db) => { Object.assign(db.recoveries[sessionId], { status: 'pending', submittedTx: txHash, executeAfter: Number(req.executeAfter) }); });
  await addActivity({ wallet: s.wallet, type: 'recovery', title: 'Recovery approved by both guardians', txHash, status: 'confirmed', sponsored: true });
  await alert(s.wallet, { severity: 'warning', title: 'Recovery approved, executes in ' + RECOVERY_DELAY_LABEL, body: 'Both guardians approved a new passkey. It becomes the owner when the delay ends. If this was not you, tap "This wasn\'t me" on a device that still has your passkey.' });
  await audit({ actor: 'Recovery service', action: 'Recovery submitted on-chain', wallet: s.wallet, detail: `multiConfirmRecovery with 2 of 2 guardian signatures. Delay until ${new Date(Number(req.executeAfter) * 1000).toISOString()}`, outcome: 'info' });
  return await read((db) => db.recoveries[sessionId]);
}

export async function finalize(session: RecoverySession) {
  const state = await readWalletState(NODE_RPC, session.wallet);
  if (session.status !== 'pending') throw new Error('This recovery request is not pending');
  if (!state.recovery) throw new Error('No recovery is pending on-chain');
  if (state.recovery.newOwners.length !== 1 || !isAddressEqual(state.recovery.newOwners[0] as Hex, session.newOwner.signer as Hex)) throw new Error('The pending on-chain recovery is for a different passkey');
  if (Number(state.recovery.executeAfter) * 1000 > Date.now()) throw new Error('The delay has not ended yet');
  const { txHash } = await relay([srm.createFinalizeRecoveryMetaTransaction(session.wallet)]);
  await write((db) => {
    const w = db.wallets[session.clientId];
    w.previousOwners.push({ ...w.owner, revokedAt: Date.now() });
    w.owner = session.newOwner;
    delete w.proof; // re-attest ownership with the new passkey
    Object.assign(db.recoveries[session.id], { status: 'finalized', finalizedTx: txHash });
  });
  await addActivity({ wallet: session.wallet, type: 'recovery', title: 'Recovery completed: new passkey is the owner', txHash, status: 'confirmed', sponsored: true });
  await alert(session.wallet, { severity: 'success', title: 'Recovery completed', body: 'Your new passkey now controls the wallet. The old passkey can no longer sign.' });
  await audit({ actor: 'Recovery service', action: 'Recovery finalized', wallet: session.wallet, detail: `Owner swapped to ${session.newOwner.signer}. Old signer revoked on-chain.`, outcome: 'info' });
  return await read((db) => db.recoveries[session.id]);
}

/** Detect cancellations by the owner (on-chain request cleared while our session is pending). */
export async function syncRecoveries(wallet: WalletRecord, state?: WalletState) {
  const pending = await read((db) => Object.values(db.recoveries).filter((r) => r.wallet === wallet.address && r.status === 'pending'));
  if (!pending.length) return;
  const st = state ?? (await readWalletState(NODE_RPC, wallet.address));
  for (const r of pending) {
    const isOwner = st.owners.some((o) => isAddressEqual(o as Hex, r.newOwner.signer as Hex));
    if (!st.recovery && !isOwner) {
      await write((db) => { db.recoveries[r.id].status = 'cancelled'; });
      await alert(wallet.address, { severity: 'success', title: 'Recovery cancelled', body: 'The pending recovery was cancelled with your passkey. Nothing changed.' });
      await audit({ actor: 'Recovery service', action: 'Recovery cancelled by owner', wallet: wallet.address, detail: 'cancelRecovery signed by the current passkey', outcome: 'info' });
    }
  }
}
