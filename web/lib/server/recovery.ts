import 'server-only';
// Recovery orchestration. Swissquote's guardian key (HSM in production) signs an EIP-712 approval
// only for a complete, structured request, after e-banking login and a liveness match. It never signs transactions.
import { hashTypedData, isAddressEqual, recoverTypedDataAddress, type Hex } from 'viem';
import { CHAIN_ID, NODE_RPC, RECOVERY_DELAY_LABEL } from '../config';
import { isValid1271, passkeySignerAddress, readWalletState, Safe, srm, type PublicKey, type WalletState } from '../chain';
import { addActivity, alert, audit, id, read, write, type RecoverySession, type WalletRecord } from './db';
import { guardianAccount } from './keys';
import { relay } from './aa';

const PRIMARY = 'ExecuteRecovery' as const;

export async function typedData(wallet: string, newOwnerSigner: string, nonce: bigint) {
  const ed = await srm.getRecoveryRequestEip712Data(NODE_RPC, CHAIN_ID, wallet, [newOwnerSigner], 1n, { recoveryNonce: nonce });
  return { domain: ed.domain, types: ed.types, primaryType: PRIMARY, message: ed.messageValue } as const;
}

export async function startRecovery(wallet: WalletRecord, newOwner: PublicKey & { credentialId: string }) {
  if (!wallet.bankAssisted) throw new Error('This wallet does not use bank-assisted recovery. Ask your trusted contact to approve instead.');
  const state = await readWalletState(NODE_RPC, wallet.address);
  if (!state.deployed) throw new Error('This wallet was never deployed, so there is nothing to recover');
  if (state.recovery) throw new Error('A recovery is already pending for this wallet');
  const signer = passkeySignerAddress(newOwner);
  if (state.owners.some((o) => isAddressEqual(o as Hex, signer))) throw new Error('This passkey already owns the wallet');
  const nonce = await srm.nonce(NODE_RPC, wallet.address);
  const td = await typedData(wallet.address, signer, nonce);
  const hash = hashTypedData(td as Parameters<typeof hashTypedData>[0]);
  const session: RecoverySession = {
    id: id(), clientId: wallet.clientId, wallet: wallet.address, newOwner: { ...newOwner, signer }, hash, nonce: nonce.toString(), createdAt: Date.now(), status: 'collecting',
  };
  write((db) => { db.recoveries[session.id] = session; });
  alert(wallet.address, { severity: 'warning', title: 'Recovery started on a new device', body: `Someone started replacing your wallet passkey. If this wasn't you, open your wallet on a device you trust and cancel.` });
  audit({ actor: 'Recovery service', action: 'Recovery requested', wallet: wallet.address, detail: `New signer ${signer}`, outcome: 'info' });
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
    const td = await typedData(session.wallet, session.newOwner.signer, BigInt(session.nonce));
    const addr = await recoverTypedDataAddress({ ...(td as Parameters<typeof hashTypedData>[0]), signature }).catch(() => null);
    return !!addr && isAddressEqual(addr, gB.address as Hex);
  };
  const ok = (await isOnChainGuardian(wallet.address, gB.address)) && (await verify());
  if (!ok) {
    audit({ actor: 'Recovery service', action: 'Recovery factor rejected', wallet: wallet.address, detail: 'Signature did not match the registered recovery factor', outcome: 'declined' });
    alert(wallet.address, { severity: 'error', title: 'Recovery attempt blocked', body: 'Someone tried to recover your wallet with the wrong recovery factor. Your wallet is safe.' });
    throw new Error('That signature does not come from the recovery factor registered for this wallet');
  }
  write((db) => { db.recoveries[session.id].guardianB = { signature, verifiedAt: Date.now() }; });
  audit({ actor: 'Recovery service', action: 'Guardian B approved', wallet: wallet.address, detail: `${gB.label} signed the EIP-712 recovery request`, outcome: 'approved' });
  return maybeSubmit(session.id);
}

/** Mocked liveness check against the KYC file, then the HSM policy. */
export async function liveness(session: RecoverySession, wallet: WalletRecord, result: 'match' | 'mismatch') {
  if (session.status !== 'collecting') throw new Error('This recovery request is closed');
  write((db) => { db.recoveries[session.id].liveness = { result, at: Date.now() }; });
  if (result === 'mismatch') {
    write((db) => { db.recoveries[session.id].status = 'refused'; });
    audit({ actor: 'KYC liveness (mock)', action: 'Face match failed', wallet: wallet.address, detail: 'Live selfie does not match the KYC file', outcome: 'declined' });
    audit({ actor: 'Guardian HSM', action: 'Refused to sign', wallet: wallet.address, detail: 'Policy: liveness match required', outcome: 'declined' });
    alert(wallet.address, { severity: 'error', title: 'Recovery attempt blocked', body: 'A recovery attempt failed the face check against your ID. Swissquote refused to approve it. Your wallet is safe.' });
    throw new Error('The face check did not match the ID on file. Swissquote will not approve this recovery.');
  }
  const pending = read((db) => Object.values(db.recoveries).some((r) => r.wallet === wallet.address && r.id !== session.id && r.status === 'pending'));
  if (pending) throw new Error('HSM policy: another recovery is already pending for this wallet');
  audit({ actor: 'KYC liveness (mock)', action: 'Face match passed', wallet: wallet.address, detail: 'Live selfie matches the KYC file', outcome: 'approved' });
  return maybeSubmit(session.id);
}

/** HSM policy: sign only an open request with a verified Guardian B and a passed liveness check. */
async function hsmSign(s: RecoverySession) {
  if (s.swissquote || s.status !== 'collecting' || !s.guardianB || s.liveness?.result !== 'match') return;
  const td = await typedData(s.wallet, s.newOwner.signer, BigInt(s.nonce));
  const signature = await guardianAccount().signTypedData(td as Parameters<ReturnType<typeof guardianAccount>['signTypedData']>[0]);
  write((db) => { db.recoveries[s.id].swissquote = { signature, signedAt: Date.now() }; });
  audit({ actor: 'Guardian HSM', action: 'Signed recovery approval', wallet: s.wallet, detail: `Four-eyes: recovery factor verified, liveness passed, operator 2 approved. Structured request: owner → ${s.newOwner.signer}, threshold 1`, outcome: 'approved' });
}

async function maybeSubmit(sessionId: string) {
  await hsmSign(read((db) => db.recoveries[sessionId]));
  const s = read((db) => db.recoveries[sessionId]);
  const wallet = read((db) => db.wallets[s.clientId]);
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
  write((db) => { Object.assign(db.recoveries[sessionId], { status: 'pending', submittedTx: txHash, executeAfter: Number(req.executeAfter) }); });
  addActivity({ wallet: s.wallet, type: 'recovery', title: 'Recovery approved by both guardians', txHash, status: 'confirmed', sponsored: true });
  alert(s.wallet, { severity: 'warning', title: 'Recovery approved, executes in ' + RECOVERY_DELAY_LABEL, body: 'Both guardians approved a new passkey. It becomes the owner when the delay ends. If this was not you, tap "This wasn\'t me" on a device that still has your passkey.' });
  audit({ actor: 'Recovery service', action: 'Recovery submitted on-chain', wallet: s.wallet, detail: `multiConfirmRecovery with 2 of 2 guardian signatures. Delay until ${new Date(Number(req.executeAfter) * 1000).toISOString()}`, outcome: 'info' });
  return read((db) => db.recoveries[sessionId]);
}

export async function finalize(session: RecoverySession) {
  const state = await readWalletState(NODE_RPC, session.wallet);
  if (session.status !== 'pending') throw new Error('This recovery request is not pending');
  if (!state.recovery) throw new Error('No recovery is pending on-chain');
  if (state.recovery.newOwners.length !== 1 || !isAddressEqual(state.recovery.newOwners[0] as Hex, session.newOwner.signer as Hex)) throw new Error('The pending on-chain recovery is for a different passkey');
  if (Number(state.recovery.executeAfter) * 1000 > Date.now()) throw new Error('The delay has not ended yet');
  const { txHash } = await relay([srm.createFinalizeRecoveryMetaTransaction(session.wallet)]);
  write((db) => {
    const w = db.wallets[session.clientId];
    w.previousOwners.push({ ...w.owner, revokedAt: Date.now() });
    w.owner = session.newOwner;
    delete w.proof; // re-attest ownership with the new passkey
    Object.assign(db.recoveries[session.id], { status: 'finalized', finalizedTx: txHash });
  });
  addActivity({ wallet: session.wallet, type: 'recovery', title: 'Recovery completed: new passkey is the owner', txHash, status: 'confirmed', sponsored: true });
  alert(session.wallet, { severity: 'success', title: 'Recovery completed', body: 'Your new passkey now controls the wallet. The old passkey can no longer sign.' });
  audit({ actor: 'Recovery service', action: 'Recovery finalized', wallet: session.wallet, detail: `Owner swapped to ${session.newOwner.signer}. Old signer revoked on-chain.`, outcome: 'info' });
  return read((db) => db.recoveries[session.id]);
}

/** Detect cancellations by the owner (on-chain request cleared while our session is pending). */
export async function syncRecoveries(wallet: WalletRecord, state?: WalletState) {
  const pending = read((db) => Object.values(db.recoveries).filter((r) => r.wallet === wallet.address && r.status === 'pending'));
  if (!pending.length) return;
  const st = state ?? (await readWalletState(NODE_RPC, wallet.address));
  for (const r of pending) {
    const isOwner = st.owners.some((o) => isAddressEqual(o as Hex, r.newOwner.signer as Hex));
    if (!st.recovery && !isOwner) {
      write((db) => { db.recoveries[r.id].status = 'cancelled'; });
      alert(wallet.address, { severity: 'success', title: 'Recovery cancelled', body: 'The pending recovery was cancelled with your passkey. Nothing changed.' });
      audit({ actor: 'Recovery service', action: 'Recovery cancelled by owner', wallet: wallet.address, detail: 'cancelRecovery signed by the current passkey', outcome: 'info' });
    }
  }
}
