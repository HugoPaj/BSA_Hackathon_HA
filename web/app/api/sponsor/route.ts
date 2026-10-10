import type { UserOperationV7 } from 'abstractionkit';
import { audit, read, walletByAddress, write } from '@/lib/server/db';
import { evaluate } from '@/lib/server/policy';
import { sponsor } from '@/lib/server/aa';
import { formatUsdc } from '@/lib/format';
import { body, currentClient, fail, json } from '@/lib/server/session';

// The client builds and signs. Swissquote only decides whether to attach its paymaster.
export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const { userOp, stepUpId } = await body<{ userOp: UserOperationV7; stepUpId?: string }>(req);
  const wallet = read((db) => walletByAddress(db, userOp.sender));
  if (!wallet || wallet.clientId !== client.clientId) return fail('Swissquote only sponsors wallets of its own clients', 403);

  const evaluation = await evaluate(userOp, wallet, stepUpId);
  const summary = evaluation.effects.map((e) => e.label + (e.amount ? ` ${formatUsdc(e.amount)} USDC` : '')).join('; ');
  if (evaluation.decision !== 'sponsor') {
    audit({ actor: 'Paymaster policy', action: evaluation.decision === 'decline' ? 'Declined to sponsor' : 'Step-up requested', wallet: wallet.address, detail: `${summary}. ${evaluation.reason ?? 'High-value check required'}`, outcome: evaluation.decision === 'decline' ? 'declined' : 'info' });
    return json({ evaluation });
  }
  try {
    const sponsored = await sponsor(userOp);
    if (stepUpId) write((db) => { delete db.stepUps[stepUpId]; }); // a confirmation covers one operation only
    audit({ actor: 'Paymaster policy', action: 'Sponsored gas', wallet: wallet.address, detail: summary, outcome: 'approved' });
    return json({ evaluation, userOp: sponsored });
  } catch (e) {
    const msg = String((e as Error & { cause?: Error }).cause?.message ?? (e as Error).message);
    evaluation.decision = 'decline';
    evaluation.reason = 'Bundler simulation failed: ' + msg.slice(0, 160);
    evaluation.checks = evaluation.checks.map((c) => (c.id === 'simulation' ? { ...c, status: 'fail', detail: evaluation.reason! } : c));
    audit({ actor: 'Paymaster policy', action: 'Declined to sponsor', wallet: wallet.address, detail: evaluation.reason, outcome: 'declined' });
    return json({ evaluation });
  }
}
