import { body, checkCredentials, createSession, currentClient, destroySession, fail, json } from '@/lib/server/session';
import { audit, read } from '@/lib/server/db';

export async function GET() {
  const client = await currentClient();
  if (!client) return json({ client: null });
  const wallet = await read((db) => db.wallets[client.clientId]);
  return json({ client, wallet: wallet ? { address: wallet.address, deployed: !!wallet.deployedAt } : null });
}

export async function POST(req: Request) {
  const { clientId, password } = await body<{ clientId: string; password: string }>(req);
  const client = checkCredentials(clientId ?? '', password ?? '');
  if (!client) return fail('Client number or password is wrong', 401);
  await createSession(client.clientId);
  await audit({ actor: 'E-banking', action: 'Login', detail: `Client ${client.clientId} logged in`, outcome: 'info' });
  return json({ client });
}

export async function DELETE() {
  await destroySession();
  return json({ ok: true });
}
