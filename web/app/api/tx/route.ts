import { Bundler, ENTRYPOINT_V7, type UserOperationV7 } from 'abstractionkit';
import { BUNDLER_RPC } from '@/lib/config';
import { addActivity, read, updateActivity, walletByAddress, write, type Activity } from '@/lib/server/db';
import { body, currentClient, fail, json } from '@/lib/server/session';

const bundler = new Bundler(BUNDLER_RPC);

function explainAaError(msg: string) {
  if (/AA24|signature/i.test(msg)) return 'Rejected on-chain: this passkey is not an owner of the wallet (AA24 signature error).';
  if (/AA21|prefund|funds/i.test(msg)) return 'Your wallet has no ETH to pay its own gas.';
  if (/AA25|nonce/i.test(msg)) return 'Another transaction was sent at the same time. Try again.';
  return msg.slice(0, 200);
}

type Meta = Pick<Activity, 'type' | 'title' | 'amount' | 'counterparty' | 'fee'> & { sponsored: boolean };

export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const { userOp, meta } = await body<{ userOp: UserOperationV7; meta: Meta }>(req);
  const wallet = read((db) => walletByAddress(db, userOp.sender));
  if (!wallet || wallet.clientId !== client.clientId) return fail('Unknown wallet', 403);
  try {
    const userOpHash = await bundler.sendUserOperation(userOp, ENTRYPOINT_V7);
    addActivity({ wallet: wallet.address, ...meta, sponsored: !!userOp.paymaster, userOpHash, status: 'pending' });
    return json({ userOpHash });
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return fail(explainAaError(String(err.cause?.message ?? err.message) + ' ' + JSON.stringify((err as { context?: unknown }).context ?? '')));
  }
}

export async function GET(req: Request) {
  const hash = new URL(req.url).searchParams.get('hash');
  if (!hash) return fail('hash required');
  const receipt = await bundler.getUserOperationReceipt(hash).catch(() => null);
  if (!receipt) return json({ status: 'pending' });
  const txHash = receipt.receipt.transactionHash;
  const status = receipt.success ? 'confirmed' : 'failed';
  updateActivity((a) => a.userOpHash === hash, { status, txHash });
  const act = read((db) => db.activity.find((a) => a.userOpHash === hash));
  if (act?.type === 'deploy' && receipt.success) write((db) => { const w = walletByAddress(db, act.wallet); if (w && !w.deployedAt) w.deployedAt = Date.now(); });
  return json({ status, txHash });
}
