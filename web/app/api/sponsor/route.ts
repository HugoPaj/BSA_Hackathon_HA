import type { UserOperationV7 } from 'abstractionkit';
import { audit, read, walletByAddress, write } from '@/lib/server/db';
import { evaluate } from '@/lib/server/policy';
import { sponsor } from '@/lib/server/aa';
import { formatUsdc } from '@/lib/format';
import { stringify } from '@/lib/json';
import { body, currentClient, fail } from '@/lib/server/session';

// The client builds and signs. Swissquote only decides whether to attach its paymaster.
export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const { userOp, stepUpId } = await body<{ userOp: UserOperationV7; stepUpId?: string }>(req);
  const wallet = await read((db) => walletByAddress(db, userOp.sender));
  if (!wallet || wallet.clientId !== client.clientId) return fail('Swissquote only sponsors wallets of its own clients', 403);

  const run = async (send: (msg: unknown) => void) => {
    const evaluation = await evaluate(userOp, wallet, stepUpId, send);
    const summary = evaluation.effects.map((e) => e.label + (e.amount ? ` ${formatUsdc(e.amount)} USDC` : '')).join('; ');
    if (evaluation.decision !== 'sponsor') {
      await audit({ actor: 'Paymaster policy', action: evaluation.decision === 'decline' ? 'Declined to sponsor' : 'Step-up requested', wallet: wallet.address, detail: `${summary}. ${evaluation.reason ?? 'High-value check required'}`, outcome: evaluation.decision === 'decline' ? 'declined' : 'info' });
      return send({ result: { evaluation } });
    }
    try {
      const sponsored = await sponsor(userOp);
      if (stepUpId) await write((db) => { delete db.stepUps[stepUpId]; }); // a confirmation covers one operation only
      await audit({ actor: 'Paymaster policy', action: 'Sponsored gas', wallet: wallet.address, detail: summary, outcome: 'approved' });
      return send({ result: { evaluation, userOp: sponsored } });
    } catch (e) {
      const msg = String((e as Error & { cause?: Error }).cause?.message ?? (e as Error).message);
      evaluation.decision = 'decline';
      evaluation.reason = 'Bundler simulation failed: ' + msg.slice(0, 160);
      evaluation.checks = evaluation.checks.map((c) => (c.id === 'simulation' ? { ...c, status: 'fail', detail: evaluation.reason! } : c));
      await audit({ actor: 'Paymaster policy', action: 'Declined to sponsor', wallet: wallet.address, detail: evaluation.reason, outcome: 'declined' });
      return send({ result: { evaluation } });
    }
  };

  // Stream newline-delimited JSON: the planned checks, each check as it is decided, then the result.
  return new Response(new ReadableStream({
    start(controller) {
      // Not awaited: start() must return so the runtime can flush each line as it is sent.
      const send = (msg: unknown) => controller.enqueue(new TextEncoder().encode(stringify(msg) + '\n'));
      run(send).catch((e) => send({ error: (e as Error).message })).finally(() => controller.close());
    },
  }), { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}
