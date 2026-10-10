import 'server-only';
// Swissquote's side of ERC-4337: the gas sponsor and the operations Safe (relayer, treasury, fee collector).
import { CandidePaymaster, fromPrivateKey, type MetaTransaction, type UserOperationV7 } from 'abstractionkit';
import { getAddress } from 'viem';
import { BUNDLER_RPC, CHAIN_ID, NODE_RPC, PAYMASTER_RPC } from '../config';
import { Safe } from '../chain';
import { opsOwnerAddress, opsSigner } from './keys';

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

export function opsAddress() {
  return getAddress(Safe.createAccountAddress([opsOwnerAddress()]));
}

let queue: Promise<unknown> = Promise.resolve();

/** Send transactions from Swissquote's operations Safe, gas-sponsored. Serialised to avoid nonce races. */
export function relay(txs: MetaTransaction[]): Promise<{ userOpHash: string; txHash: string }> {
  const run = async () => {
    const address = opsAddress();
    const deployed = await Safe.isDeployed(address, NODE_RPC);
    const account = deployed ? new Safe(address) : Safe.initializeNewAccount([opsOwnerAddress()]);
    let op = await account.createUserOperation(txs, NODE_RPC, BUNDLER_RPC);
    op = (await paymaster.createSponsorPaymasterUserOperation(account, op, BUNDLER_RPC, sponsorshipPolicyId)).userOperation;
    op.signature = await account.signUserOperationWithSigners(op, [fromPrivateKey(opsSigner())], CHAIN_ID);
    const res = await account.sendUserOperation(op, BUNDLER_RPC);
    const receipt = await res.included();
    if (!receipt?.success) throw new Error(`Relayed operation failed (${receipt?.receipt?.transactionHash ?? res.userOperationHash})`);
    return { userOpHash: res.userOperationHash, txHash: receipt.receipt.transactionHash };
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
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
