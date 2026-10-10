import 'server-only';
// The sponsored lane. Swissquote decides whether to PAY GAS for a client-built UserOperation.
// It never decides whether the client may transact: a declined operation can still be sent with the client's own gas.
import type { UserOperationV7 } from 'abstractionkit';
import { isAddressEqual, keccak256, type Hex } from 'viem';
import { NODE_RPC, PERMIT2, SERVICE_FEE, STEP_UP_THRESHOLD, UNIVERSAL_ROUTER, USDC } from '../config';
import { classifyCall, client, decodeCalls, erc20Abi, type DecodedCall } from '../chain';
import { formatUsdc, shortAddress } from '../format';
import { read, type WalletRecord } from './db';
import { opsAddress } from './aa';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'required';
export type Check = { id: 'allowlist' | 'simulation' | 'sanctions' | 'stepup' | 'fee'; label: string; status: CheckStatus; detail: string };
export type Effect = { label: string; amount?: bigint; direction: 'out' | 'none' };
export type Evaluation = {
  decision: 'sponsor' | 'decline' | 'step-up';
  reason?: string;
  checks: Check[];
  effects: Effect[];
  outgoing: bigint;
  fee: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
  security: boolean;
};

// Mock screening provider. The entry is a real OFAC SDN address (Lazarus Group, Ronin bridge exploit).
const SANCTIONED = new Map<string, string>([['0x098b716b8aaf21512996dc57eb0615e2383e2f96', 'OFAC SDN list · Lazarus Group']]);
export const ALLOWLIST = new Map<string, string>([
  [PERMIT2.toLowerCase(), 'Uniswap Permit2'],
  [UNIVERSAL_ROUTER.toLowerCase(), 'Uniswap Universal Router'],
]);
const UNLIMITED = 2n ** 255n;

export function screen(address: string) {
  return SANCTIONED.get(address.toLowerCase()) ?? null;
}

export async function evaluate(op: UserOperationV7, wallet: WalletRecord, stepUpId?: string): Promise<Evaluation> {
  const checks: Check[] = [];
  const effects: Effect[] = [];
  const treasury = opsAddress();
  let decoded: DecodedCall[];
  try {
    decoded = decodeCalls(op.callData).map((c) => classifyCall(c, wallet.address));
  } catch {
    return { decision: 'decline', reason: 'Swissquote could not read this transaction', checks: [{ id: 'allowlist', label: 'Allowlist', status: 'fail', detail: 'Unreadable call data' }], effects, outgoing: 0n, fee: 0n, balanceBefore: 0n, balanceAfter: 0n, security: false };
  }

  // 1. Allowlist: only USDC, approved dApp spenders, and the wallet's own security settings.
  const unknown = decoded.filter((d) => d.kind === 'unknown');
  const badSpenders = decoded.filter((d) => d.kind === 'approve' && !ALLOWLIST.has(d.spender.toLowerCase()));
  const unlimited = decoded.filter((d) => d.kind === 'approve' && d.amount >= UNLIMITED);
  const largeApproval = decoded.some((d) => d.kind === 'approve' && d.amount >= STEP_UP_THRESHOLD);
  if (unknown.length) checks.push({ id: 'allowlist', label: 'Allowlist', status: 'fail', detail: `Contract ${shortAddress((unknown[0] as { to: string }).to)} is not on Swissquote's allowlist` });
  else if (badSpenders.length) checks.push({ id: 'allowlist', label: 'Allowlist', status: 'fail', detail: `Approval to unverified contract ${shortAddress((badSpenders[0] as { spender: string }).spender)}` });
  else if (unlimited.length) checks.push({ id: 'allowlist', label: 'Allowlist', status: 'warn', detail: 'Allowlisted dApp, but the approval is unlimited' });
  else checks.push({ id: 'allowlist', label: 'Allowlist', status: 'pass', detail: decoded.some((d) => d.kind === 'approve') ? `${ALLOWLIST.get((decoded.find((d) => d.kind === 'approve') as { spender: string }).spender.toLowerCase())} is allowlisted` : 'USDC and wallet settings only' });

  // 2. Sanctions screen on every counterparty.
  const counterparties = decoded.flatMap((d) => (d.kind === 'transfer' ? (isAddressEqual(d.to as Hex, treasury) ? [] : [d.to]) : d.kind === 'approve' ? [d.spender] : d.kind === 'unknown' ? [d.to] : []));
  const hit = counterparties.map((a) => ({ a, list: screen(a) })).find((x) => x.list);
  checks.push(hit
    ? { id: 'sanctions', label: 'Sanctions screen', status: 'fail', detail: `${shortAddress(hit.a)} is on the ${hit.list}` }
    : { id: 'sanctions', label: 'Sanctions screen', status: 'pass', detail: counterparties.length ? `${counterparties.length} counterpart${counterparties.length > 1 ? 'ies' : 'y'} screened, no match` : 'No counterparties' });

  // 3. Simulation against the latest Base Sepolia state, from the wallet's own address.
  const c = client(NODE_RPC);
  const balanceBefore = await c.readContract({ address: USDC.address, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address as Hex] });
  const transfers = decoded.filter((d): d is Extract<DecodedCall, { kind: 'transfer' }> => d.kind === 'transfer');
  const feeTransfers = transfers.filter((t) => isAddressEqual(t.to as Hex, treasury));
  const fee = feeTransfers.reduce((s, t) => s + t.amount, 0n);
  const outgoing = transfers.reduce((s, t) => s + t.amount, 0n) - fee;
  let simOk = balanceBefore >= outgoing + fee;
  let simDetail = simOk ? '' : `Balance ${formatUsdc(balanceBefore)} USDC is too low`;
  if (simOk) {
    for (const call of decodeCalls(op.callData)) {
      if (!isAddressEqual(call.to as Hex, USDC.address)) continue;
      try {
        await c.call({ account: wallet.address as Hex, to: call.to as Hex, data: call.data });
      } catch (e) {
        simOk = false;
        simDetail = 'The transaction would revert: ' + String((e as Error).message).split('\n')[0].slice(0, 120);
        break;
      }
    }
  }
  for (const d of decoded) {
    if (d.kind === 'transfer' && !isAddressEqual(d.to as Hex, treasury)) effects.push({ label: `Send to ${shortAddress(d.to)}`, amount: d.amount, direction: 'out' });
    if (d.kind === 'approve') effects.push({ label: `${ALLOWLIST.get(d.spender.toLowerCase()) ?? shortAddress(d.spender)} may spend ${d.amount >= UNLIMITED ? 'unlimited' : formatUsdc(d.amount)} USDC`, direction: 'none' });
    if (d.kind === 'security') effects.push({ label: d.action, direction: 'none' });
    if (d.kind === 'unknown') effects.push({ label: `Unknown call to ${shortAddress(d.to)} (${d.selector})`, direction: 'none' });
  }
  if (fee > 0n) effects.push({ label: 'Swissquote service fee, gas included', amount: fee, direction: 'out' });
  const balanceAfter = balanceBefore - outgoing - fee;
  checks.push(simOk
    ? { id: 'simulation', label: 'Simulation', status: 'pass', detail: outgoing + fee > 0n ? `Balance ${formatUsdc(balanceBefore)} → ${formatUsdc(balanceAfter)} USDC` : 'No balance change' }
    : { id: 'simulation', label: 'Simulation', status: 'fail', detail: simDetail });

  // 4. Service fee: value-moving operations pay a small USDC fee in the same batch. Security actions are free.
  const security = decoded.every((d) => d.kind === 'security');
  if (!security) {
    checks.push(fee >= SERVICE_FEE
      ? { id: 'fee', label: 'Service fee', status: 'pass', detail: `${formatUsdc(fee)} USDC batched into this transaction` }
      : { id: 'fee', label: 'Service fee', status: 'fail', detail: 'Sponsored transactions must include the service fee' });
  }

  // 5. High-value step-up: the client's recovery factor confirms large transfers and large approvals.
  if (outgoing >= STEP_UP_THRESHOLD || largeApproval) {
    const verified = stepUpId && read((db) => {
      const s = db.stepUps[stepUpId];
      return s && s.verified && s.wallet.toLowerCase() === wallet.address.toLowerCase() && s.callDataHash === keccak256(op.callData as Hex) && s.expires > Date.now();
    });
    checks.push(verified
      ? { id: 'stepup', label: 'High-value check', status: 'pass', detail: `Confirmed with your ${wallet.guardianB.type === 'passkey' ? 'recovery device' : 'recovery card'}` }
      : { id: 'stepup', label: 'High-value check', status: 'required', detail: `${unlimited.length ? 'Unlimited approvals need' : largeApproval && outgoing < STEP_UP_THRESHOLD ? `Approvals above ${formatUsdc(STEP_UP_THRESHOLD)} USDC need` : `Above ${formatUsdc(STEP_UP_THRESHOLD)} USDC,`} your ${wallet.guardianB.type === 'passkey' ? 'recovery device' : 'recovery card'} ${largeApproval && outgoing < STEP_UP_THRESHOLD ? 'too' : 'confirms too'}` });
  }

  const failed = checks.find((c) => c.status === 'fail');
  const decision = failed ? 'decline' : checks.some((c) => c.status === 'required') ? 'step-up' : 'sponsor';
  return { decision, reason: failed?.detail, checks, effects, outgoing, fee, balanceBefore, balanceAfter, security };
}
