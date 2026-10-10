'use client';
// Client side of every transaction: build the UserOperation, ask Swissquote to sponsor it, sign it with the passkey, submit.
import { fromSafeWebauthn, type MetaTransaction, type UserOperationV7 } from 'abstractionkit';
import { keccak256, type Hex } from 'viem';
import { CHAIN_ID } from './config';
import { Safe, decodeCalls } from './chain';
import { hexToBytes, signWithPasskey } from './passkey';
import { api, ApiError } from './api';
import { parse, stringify } from './json';
import type { Evaluation, Progress } from './server/policy';
import type { Activity } from './server/db';

export type { Evaluation, Progress };
export const rpcUrls = () => ({ node: `${window.location.origin}/api/rpc/node`, bundler: `${window.location.origin}/api/rpc/bundler` });

export type Signer = { credentialId: string; x: bigint; y: bigint };

function accountFor(wallet: string, owner: Signer, deployed: boolean) {
  if (deployed) return new Safe(wallet);
  const acc = Safe.initializeNewAccount([{ x: owner.x, y: owner.y }]);
  if (acc.accountAddress.toLowerCase() !== wallet.toLowerCase()) throw new Error('This passkey does not match the wallet address');
  return acc;
}

export async function buildOp(wallet: string, owner: Signer, deployed: boolean, txs: MetaTransaction[]) {
  const { node, bundler } = rpcUrls();
  const account = accountFor(wallet, owner, deployed);
  const expectedSigners = [{ x: owner.x, y: owner.y }];
  try {
    return await account.createUserOperation(txs, node, bundler, { expectedSigners });
  } catch {
    // Estimation reverts when the transaction itself would fail (e.g. balance too low). Build it anyway so
    // Swissquote's policy can simulate it and explain why; the paymaster re-estimates gas if it sponsors.
    return account.createUserOperation(txs, node, bundler, { expectedSigners, skipGasEstimation: true });
  }
}

type Sponsorship = { evaluation: Evaluation; userOp?: UserOperationV7 };

/** Ask Swissquote to sponsor. The policy streams its progress: the planned checks, then each one as it is decided. */
export async function requestSponsorship(userOp: UserOperationV7, stepUpId?: string, onProgress?: (p: Progress) => void): Promise<Sponsorship> {
  const res = await fetch('/api/sponsor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stringify({ userOp, stepUpId }), cache: 'no-store' });
  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('ndjson')) {
    const out = await res.json().catch(() => null);
    throw new ApiError(out?.error ?? `Server error (${res.status})`, res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop()!;
    for (const line of lines.filter(Boolean)) {
      const msg = parse<Progress | { result: Sponsorship } | { error: string }>(line);
      if ('result' in msg) return msg.result;
      if ('error' in msg) throw new ApiError(msg.error, 500);
      onProgress?.(msg);
    }
  }
  throw new ApiError('The sponsorship check ended without a result', 500);
}

/** The passkey prompt. Face ID / Touch ID / Windows Hello / device PIN approves the SafeOp hash. */
export async function signOp(wallet: string, owner: Signer, deployed: boolean, userOp: UserOperationV7) {
  const account = accountFor(wallet, owner, deployed);
  const signer = fromSafeWebauthn({
    publicKey: { x: owner.x, y: owner.y },
    isInit: !deployed,
    getAssertion: (challenge) => signWithPasskey([owner.credentialId], challenge),
    accountClass: Safe,
  });
  return account.signUserOperationWithSigners(userOp, [signer], CHAIN_ID);
}

export async function submit(userOp: UserOperationV7, meta: Pick<Activity, 'type' | 'title' | 'amount' | 'counterparty' | 'fee' | 'sponsored'>) {
  const { userOpHash } = await api<{ userOpHash: string }>('/api/tx', { userOp, meta });
  return userOpHash;
}

export async function waitForReceipt(userOpHash: string, timeoutMs = 90_000): Promise<{ status: string; txHash?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await api<{ status: string; txHash?: string }>(`/api/tx?hash=${userOpHash}`);
    if (r.status !== 'pending') return r;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return { status: 'pending' };
}

/** Self-paid path: no paymaster, the wallet pays gas in ETH. Always available, so Swissquote can decline but never block. */
export async function selfPaidCost(userOp: UserOperationV7) {
  const gas = userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
  return gas * userOp.maxFeePerGas;
}

export function callDataHash(userOp: UserOperationV7) {
  return keccak256(userOp.callData as Hex);
}

/** The client checks that sponsorship did not change what it is about to sign. */
export function assertSameCalls(a: UserOperationV7, b: UserOperationV7) {
  if (a.callData !== b.callData || a.sender.toLowerCase() !== b.sender.toLowerCase()) throw new Error('Sponsored operation differs from what you reviewed');
  decodeCalls(b.callData);
}

export async function stepUpWithPasskey(wallet: string, userOp: UserOperationV7, credentialId: string) {
  const { id, challenge } = await api<{ id: string; challenge: Hex }>('/api/stepup', { action: 'create', wallet, callData: userOp.callData });
  const sig = await signWithPasskey([credentialId], hexToBytes(challenge));
  await api('/api/stepup', { action: 'verify', id, signature: Safe.createWebAuthnSignature(sig) });
  return id;
}
