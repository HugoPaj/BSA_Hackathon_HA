import { read } from '@/lib/server/db';
import { currentClient, fail, json } from '@/lib/server/session';

export async function GET() {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const wallet = read((db) => db.wallets[client.clientId]);
  return json({ activity: wallet ? read((db) => db.activity.filter((a) => a.wallet === wallet.address).slice(0, 50)) : [] });
}
