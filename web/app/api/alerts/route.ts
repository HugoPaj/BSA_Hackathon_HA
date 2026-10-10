import { read, write } from '@/lib/server/db';
import { body, currentClient, fail, json } from '@/lib/server/session';

export async function GET() {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const wallet = read((db) => db.wallets[client.clientId]);
  const alerts = wallet ? read((db) => db.alerts.filter((a) => a.wallet === wallet.address).slice(0, 50)) : [];
  return json({ alerts });
}

export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const { ids } = await body<{ ids: string[] }>(req);
  write((db) => { for (const a of db.alerts) if (ids.includes(a.id)) a.read = true; });
  return json({ ok: true });
}
