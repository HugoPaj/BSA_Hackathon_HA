import 'server-only';
// Mocked Swissquote e-banking login. Production: the existing Swissquote login with its own MFA.
import { cookies } from 'next/headers';
import { DEMO_CLIENT } from '../config';
import { stringify } from '../json';
import { id, read, write } from './db';

const COOKIE = 'sq_session';
export type Client = { clientId: string; name: string; email: string };
const CLIENTS: Record<string, Client & { password: string }> = {
  [DEMO_CLIENT.clientId]: DEMO_CLIENT,
};

export function checkCredentials(clientId: string, password: string) {
  const c = CLIENTS[clientId.trim()];
  return c && c.password === password ? { clientId: c.clientId, name: c.name, email: c.email } : null;
}

export async function createSession(clientId: string) {
  const sid = id();
  write((db) => { db.sessions[sid] = { clientId, createdAt: Date.now() }; });
  (await cookies()).set(COOKIE, sid, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 12 });
}

export async function destroySession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) write((db) => { delete db.sessions[sid]; });
  jar.delete(COOKIE);
}

export async function currentClient(): Promise<Client | null> {
  const sid = (await cookies()).get(COOKIE)?.value;
  if (!sid) return null;
  const s = read((db) => db.sessions[sid]);
  if (!s) return null;
  const c = CLIENTS[s.clientId];
  return c ? { clientId: c.clientId, name: c.name, email: c.email } : null;
}

export function json(data: unknown, status = 200) {
  return new Response(stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

export async function body<T>(req: Request): Promise<T> {
  const { parse } = await import('../json');
  return parse<T>(await req.text());
}
