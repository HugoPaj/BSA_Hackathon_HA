import 'server-only';
// Swissquote's side of ERC-4337: the gas sponsor and the operations Safe (relayer, treasury, fee collector).
import { CandidePaymaster, type MetaTransaction, type UserOperationV7 } from 'abstractionkit';
import { BUNDLER_RPC, CHAIN_ID, NODE_RPC, PAYMASTER_RPC } from '../config';
import { Safe } from '../chain';
import { createRelayer } from '../relayer';
import { opsSigner } from './keys';

const paymaster = new CandidePaymaster(PAYMASTER_RPC);
const sponsorshipPolicyId = process.env.SPONSORSHIP_POLICY_ID || undefined;

// The demo-only dummy WebAuthn signature is shorter than a real browser one, so pad the estimates.
const GAS_PADDING = { verificationGasLimitPercentageMultiplier: 30, preVerificationGasPercentageMultiplier: 25, callGasLimitPercentageMultiplier: 15 };

/** Attach Swissquote's paymaster to a client-built UserOperation. Only called after the policy says yes. */
export async function sponsor(op: UserOperationV7) {
  const account = new Safe(op.sender);
  const { userOperation } = await paymaster.createSponsorPaymasterUserOperation(account, op, BUNDLER_RPC, sponsorshipPolicyId, undefined, GAS_PADDING);
  return userOperation as UserOperationV7;
}

const ops = () => (relayer ??= createRelayer({ key: opsSigner(), nodeRpc: NODE_RPC, bundlerRpc: BUNDLER_RPC, paymasterRpc: PAYMASTER_RPC, chainId: CHAIN_ID, sponsorshipPolicyId }));
let relayer: ReturnType<typeof createRelayer> | undefined;

export function opsAddress() {
  return ops().address;
}

/** Send transactions from Swissquote's operations Safe, gas-sponsored. */
export function relay(txs: MetaTransaction[]) {
  return ops().relay(txs);
}

export async function bundlerRequest(method: string, params: unknown[]) {
  const res = await fetch(BUNDLER_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'Bundler error');
  return json.result;
}
