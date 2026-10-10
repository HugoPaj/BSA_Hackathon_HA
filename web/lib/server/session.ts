import 'server-only';
// Mocked Swissquote e-banking login. Production: the existing Swissquote login with its own MFA.
// Two scopes: a full e-banking session, and a recovery session that only identifies the client to the recovery flow.
// The recovery cookie is only sent to /api/recovery, and nothing else accepts it, so identifying for recovery
// on a new device never opens the account; it becomes a full session only once the recovery it started completes.
import { cookies } from 'next/headers';
import { DEMO_CLIENT } from '../config';
import { stringify } from '../json';
import { id, read, write } from './db';

const COOKIE = 'sq_session';
const RECOVERY_COOKIE = 'sq_recovery';
const RECOVERY_PATH = '/api/recovery';
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
  await write((db) => { db.sessions[sid] = { clientId, createdAt: Date.now() }; });
  (await cookies()).set(COOKIE, sid, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 12 });
}

/** Identify the client for recovery only. An hour covers the demo's 3-minute delay; a resumed recovery just identifies again. */
export async function createRecoverySession(clientId: string) {
  const sid = id();
  await write((db) => { db.sessions[sid] = { clientId, createdAt: Date.now(), scope: 'recovery' }; });
  (await cookies()).set(RECOVERY_COOKIE, sid, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: RECOVERY_PATH, maxAge: 60 * 60 });
}

export async function destroySession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) await write((db) => { delete db.sessions[sid]; });
  jar.delete(COOKIE);
}

export async function destroyRecoverySession() {
  const jar = await cookies();
  const sid = jar.get(RECOVERY_COOKIE)?.value;
  if (sid) await write((db) => { if (db.sessions[sid]?.scope === 'recovery') delete db.sessions[sid]; });
  jar.set(RECOVERY_COOKIE, '', { path: RECOVERY_PATH, maxAge: 0 });
}

export function toClient(clientId: string): Client | null {
  const c = CLIENTS[clientId];
  return c ? { clientId: c.clientId, name: c.name, email: c.email } : null;
}

/** The client of a full e-banking session. Recovery sessions don't count. */
export async function currentClient(): Promise<Client | null> {
  const sid = (await cookies()).get(COOKIE)?.value;
  const s = sid ? await read((db) => db.sessions[sid]) : undefined;
  return s && s.scope !== 'recovery' ? toClient(s.clientId) : null;
}

/** Who is recovering: a full session, or failing that a recovery session (`sid` set). */
export async function recoveryClient(): Promise<(Client & { sid?: string }) | null> {
  const full = await currentClient();
  if (full) return full;
  const sid = (await cookies()).get(RECOVERY_COOKIE)?.value;
  const s = sid ? await read((db) => db.sessions[sid]) : undefined;
  const c = s?.scope === 'recovery' ? toClient(s.clientId) : null;
  return c && { ...c, sid };
}

/** Remember which recovery request a recovery session started: only that one can upgrade it. */
export async function bindRecovery(sid: string, recoveryId: string) {
  await write((db) => { if (db.sessions[sid]) db.sessions[sid].recoveryId = recoveryId; });
}

/** The recovery this session started is complete: swap the recovery session for a full one. */
export async function upgradeRecoverySession(sid: string, recoveryId: string) {
  const s = await read((db) => db.sessions[sid]);
  if (s?.scope !== 'recovery' || s.recoveryId !== recoveryId) return false;
  await destroyRecoverySession();
  await createSession(s.clientId);
  return true;
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
