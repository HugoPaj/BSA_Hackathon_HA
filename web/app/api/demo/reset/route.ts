import { audit, write } from '@/lib/server/db';
import { currentClient, fail, json } from '@/lib/server/session';

// Forget this client's wallet so onboarding can be shown again. The old wallet stays on-chain.
export async function POST() {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  await write((db) => {
    const w = db.wallets[client.clientId];
    if (!w) return;
    delete db.wallets[client.clientId];
    for (const [k, r] of Object.entries(db.recoveries)) if (r.wallet === w.address) delete db.recoveries[k];
  });
  await audit({ actor: 'Demo', action: 'Demo reset', detail: `Client ${client.clientId} wallet record cleared`, outcome: 'info' });
  return json({ ok: true });
}
