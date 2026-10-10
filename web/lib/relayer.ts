// A gas-sponsored relayer: a 4337 Safe owned by one software key. Swissquote's operations Safe and the
// independent partner's relayer each run one with their own key. Relaying is a convenience: anyone can submit
// guardian-signed recovery calls, so a relayer can delay but never forge or redirect a recovery.
import { CandidePaymaster, fromPrivateKey, type MetaTransaction } from 'abstractionkit';
import { getAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Safe } from './chain';

export function createRelayer(opts: { key: Hex; nodeRpc: string; bundlerRpc: string; paymasterRpc: string; chainId: bigint; sponsorshipPolicyId?: string }) {
  const paymaster = new CandidePaymaster(opts.paymasterRpc);
  const owner = privateKeyToAccount(opts.key).address;
  const address = getAddress(Safe.createAccountAddress([owner]));
  let queue: Promise<unknown> = Promise.resolve();

  /** Send transactions from the relayer Safe. Serialised to avoid nonce races. */
  function relay(txs: MetaTransaction[]): Promise<{ userOpHash: string; txHash: string }> {
    const run = async () => {
      const deployed = await Safe.isDeployed(address, opts.nodeRpc);
      const account = deployed ? new Safe(address) : Safe.initializeNewAccount([owner]);
      let op = await account.createUserOperation(txs, opts.nodeRpc, opts.bundlerRpc);
      op = (await paymaster.createSponsorPaymasterUserOperation(account, op, opts.bundlerRpc, opts.sponsorshipPolicyId)).userOperation;
      op.signature = await account.signUserOperationWithSigners(op, [fromPrivateKey(opts.key)], opts.chainId);
      const res = await account.sendUserOperation(op, opts.bundlerRpc);
      const receipt = await res.included();
      if (!receipt?.success) throw new Error(`Relayed operation failed (${receipt?.receipt?.transactionHash ?? res.userOperationHash})`);
      return { userOpHash: res.userOperationHash, txHash: receipt.receipt.transactionHash };
    };
    const p = queue.then(run, run);
    queue = p.catch(() => undefined);
    return p;
  }

  return { address, owner, relay };
}
