'use client';
import { useCallback, useState } from 'react';
import type { MetaTransaction, UserOperationV7 } from 'abstractionkit';
import type { Hex } from 'viem';
import { api } from './api';
import { Safe } from './chain';
import { hexToBytes, signWithPasskey } from './passkey';
import {
  assertSameCalls, buildOp, requestSponsorship, rpcUrls, signOp, submit, waitForReceipt, type Evaluation, type Signer,
} from './wallet-client';
import type { Activity, WalletRecord } from './server/db';
import type { DnieRequest } from '@/components/dnie-sign';

export type Phase = 'idle' | 'preparing' | 'review' | 'declined' | 'stepup' | 'signing' | 'submitting' | 'confirming' | 'done' | 'error';
type Meta = Pick<Activity, 'type' | 'title' | 'amount' | 'counterparty' | 'fee'>;
export type CardSigner = { signMessage?: unknown; sign: (args: { hash: Hex }) => Promise<Hex> };

export function useTxFlow(opts: { wallet: Pick<WalletRecord, 'address' | 'owner' | 'guardianB'>; deployed: boolean; signer?: Signer }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [op, setOp] = useState<UserOperationV7 | null>(null);
  const [sponsored, setSponsored] = useState<UserOperationV7 | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const signer = opts.signer ?? opts.wallet.owner;

  const reset = useCallback(() => { setPhase('idle'); setEvaluation(null); setError(null); setTxHash(null); setOp(null); setSponsored(null); }, []);

  const prepare = useCallback(async (txs: MetaTransaction[], m: Meta) => {
    reset();
    setMeta(m);
    setPhase('preparing');
    try {
      const built = await buildOp(opts.wallet.address, signer, opts.deployed, txs);
      setOp(built);
      const r = await requestSponsorship(built);
      setEvaluation(r.evaluation);
      if (r.userOp) { assertSameCalls(built, r.userOp); setSponsored(r.userOp); }
      setPhase(r.evaluation.decision === 'decline' ? 'declined' : 'review');
      return r.evaluation;
    } catch (e) {
      setError(friendly(e));
      setPhase('error');
      return null;
    }
  }, [opts.wallet.address, opts.deployed, signer, reset]);

  const signAndSend = useCallback(async (userOp: UserOperationV7, isSponsored: boolean) => {
    setPhase('signing');
    const signature = await signOp(opts.wallet.address, signer, opts.deployed, userOp);
    setPhase('submitting');
    const hash = await submit({ ...userOp, signature }, { ...meta!, sponsored: isSponsored });
    setPhase('confirming');
    const r = await waitForReceipt(hash);
    if (r.status !== 'confirmed') throw new Error(r.status === 'failed' ? 'The transaction reverted on-chain' : 'Still pending. Check the activity list in a moment.');
    setTxHash(r.txHash ?? null);
    setPhase('done');
    return r.txHash;
  }, [opts.wallet.address, opts.deployed, signer, meta]);

  /** A step-up for this transaction that a DNI confirms on the phone. /api/dnie marks it verified once the card signs. */
  const dnieStepUp = useCallback(async () => {
    const { id } = await api<{ id: string }>('/api/stepup', { action: 'create', wallet: opts.wallet.address, callData: op!.callData });
    const { request } = await api<{ request: DnieRequest }>('/api/stepup', { action: 'dnie', id });
    return { stepUpId: id, request };
  }, [opts.wallet.address, op]);

  /** Confirm. If the policy asks for a high-value step-up, the recovery factor co-signs first (a DNI already has). */
  const confirm = useCallback(async (card?: CardSigner, verifiedStepUp?: string) => {
    try {
      let userOp = sponsored;
      if (evaluation?.decision === 'step-up') {
        setPhase('stepup');
        let id = verifiedStepUp;
        if (!id) {
          const s = await api<{ id: string; challenge: Hex }>('/api/stepup', { action: 'create', wallet: opts.wallet.address, callData: op!.callData });
          id = s.id;
          let signature: Hex;
          const gB = opts.wallet.guardianB;
          if (gB.type === 'passkey') signature = Safe.createWebAuthnSignature(await signWithPasskey([gB.credentialId], hexToBytes(s.challenge))) as Hex;
          else if (gB.type === 'card' && card) signature = await card.sign({ hash: s.challenge });
          else throw new Error(gB.type === 'dnie' ? 'Confirm with your DNI first' : 'Unlock your recovery card first');
          await api('/api/stepup', { action: 'verify', id, signature });
        }
        const r = await requestSponsorship(op!, id);
        setEvaluation(r.evaluation);
        if (!r.userOp) { setPhase('declined'); return; }
        assertSameCalls(op!, r.userOp);
        userOp = r.userOp;
        setSponsored(userOp);
      }
      if (!userOp) throw new Error('Not sponsored');
      await signAndSend(userOp, true);
    } catch (e) {
      setError(friendly(e));
      setPhase('error');
    }
  }, [sponsored, evaluation, op, opts.wallet, signAndSend]);

  /** Self-paid fallback: same transaction without Swissquote's paymaster. Needs ETH in the wallet. */
  const payOwnGas = useCallback(async (txs: MetaTransaction[]) => {
    try {
      setPhase('preparing');
      const { node, bundler } = rpcUrls();
      const account = opts.deployed ? new Safe(opts.wallet.address) : Safe.initializeNewAccount([{ x: signer.x, y: signer.y }]);
      const userOp = await account.createUserOperation(txs, node, bundler, { expectedSigners: [{ x: signer.x, y: signer.y }] });
      await signAndSend(userOp, false);
    } catch (e) {
      setError(friendly(e));
      setPhase('error');
    }
  }, [opts.deployed, opts.wallet.address, signer, signAndSend]);

  return { phase, evaluation, error, txHash, prepare, confirm, dnieStepUp, payOwnGas, reset };
}

export function friendly(e: unknown) {
  const err = e as Error & { cause?: Error; name?: string };
  const msg = String(err?.cause?.message ?? err?.message ?? e);
  if (err?.name === 'NotAllowedError' || /not allowed|cancel|abort/i.test(msg)) return 'The passkey prompt was cancelled or timed out.';
  if (/AA21|prefund|insufficient funds/i.test(msg)) return 'Your wallet has no ETH to pay its own gas. Swissquote only sponsors transactions that pass its checks.';
  if (/429|too many requests|rate limit|rpc call failed|fetch failed|network ?error/i.test(msg)) return 'The Base Sepolia network did not answer (the public node may be rate-limiting). Close this and try again in a few seconds.';
  if (/estimateUserOperationGas|revert/i.test(msg)) return 'The network simulation says this transaction would fail.';
  return msg;
}
