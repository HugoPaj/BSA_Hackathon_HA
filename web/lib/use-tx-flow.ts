'use client';
import { useCallback, useState } from 'react';
import type { MetaTransaction, UserOperationV7 } from 'abstractionkit';
import type { Hex } from 'viem';
import { api } from './api';
import { Safe } from './chain';
import { hexToBytes, signWithPasskey } from './passkey';
import {
  assertSameCalls, buildOp, requestSponsorship, rpcUrls, signOp, submit, waitForReceipt, type Evaluation, type Progress, type Signer,
} from './wallet-client';
import type { Activity, WalletRecord } from './server/db';
import type { Check, PlannedCheck } from './server/policy';

export type Phase = 'idle' | 'preparing' | 'review' | 'declined' | 'stepup' | 'signing' | 'submitting' | 'confirming' | 'done' | 'error';
type Meta = Pick<Activity, 'type' | 'title' | 'amount' | 'counterparty' | 'fee'>;
export type CardSigner = { signMessage?: unknown; sign: (args: { hash: Hex }) => Promise<Hex> };

export function useTxFlow(opts: { wallet: Pick<WalletRecord, 'address' | 'owner' | 'guardianB'>; deployed: boolean; signer?: Signer }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  // Live policy progress while Swissquote decides: which checks run, and those already decided.
  const [plan, setPlan] = useState<PlannedCheck[] | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [checking, setChecking] = useState(false); // the sponsorship request is with Swissquote
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [op, setOp] = useState<UserOperationV7 | null>(null);
  const [sponsored, setSponsored] = useState<UserOperationV7 | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const signer = opts.signer ?? opts.wallet.owner;

  const reset = useCallback(() => { setPhase('idle'); setEvaluation(null); setPlan(null); setChecks([]); setChecking(false); setError(null); setTxHash(null); setOp(null); setSponsored(null); }, []);

  const sponsorLive = useCallback(async (userOp: UserOperationV7, stepUpId?: string) => {
    setChecking(true);
    try {
      return await requestSponsorship(userOp, stepUpId, (p: Progress) => {
        if ('plan' in p) { setPlan(p.plan); setChecks([]); } else setChecks((cs) => [...cs, p.check]);
      });
    } finally {
      setChecking(false);
    }
  }, []);

  const prepare = useCallback(async (txs: MetaTransaction[], m: Meta) => {
    reset();
    setMeta(m);
    setPhase('preparing');
    try {
      const built = await buildOp(opts.wallet.address, signer, opts.deployed, txs);
      setOp(built);
      const r = await sponsorLive(built);
      setEvaluation(r.evaluation);
      if (r.userOp) { assertSameCalls(built, r.userOp); setSponsored(r.userOp); }
      setPhase(r.evaluation.decision === 'decline' ? 'declined' : 'review');
      return r.evaluation;
    } catch (e) {
      setError(friendly(e));
      setPhase('error');
      return null;
    }
  }, [opts.wallet.address, opts.deployed, signer, reset, sponsorLive]);

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

  /** Confirm. If the policy asks for a high-value step-up, the recovery factor co-signs first. */
  const confirm = useCallback(async (card?: CardSigner) => {
    try {
      let userOp = sponsored;
      if (evaluation?.decision === 'step-up') {
        setPhase('stepup');
        const { id, challenge } = await api<{ id: string; challenge: Hex }>('/api/stepup', { action: 'create', wallet: opts.wallet.address, callData: op!.callData });
        let signature: Hex;
        const gB = opts.wallet.guardianB;
        if (gB.type === 'passkey') signature = Safe.createWebAuthnSignature(await signWithPasskey([gB.credentialId], hexToBytes(challenge))) as Hex;
        else if (gB.type === 'card' && card) signature = await card.sign({ hash: challenge });
        else throw new Error('Unlock your recovery card first');
        await api('/api/stepup', { action: 'verify', id, signature });
        const r = await sponsorLive(op!, id);
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
  }, [sponsored, evaluation, op, opts.wallet, signAndSend, sponsorLive]);

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

  return { phase, evaluation, plan, checks, checking, error, txHash, prepare, confirm, payOwnGas, reset };
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
