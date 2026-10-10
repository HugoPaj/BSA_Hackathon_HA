// Identity-verification vendor (mock). A separate process with its own signing key and storage, standing in for a
// KYC/liveness provider. Its verdict is an EIP-712 attestation bound to one recovery request, which Swissquote's
// guardian verifies against the vendor's pinned key. The web backend only relays it and cannot forge it.
//
// What is mocked: the face analysis. A real vendor compares live camera frames with the ID photo in the KYC file;
// here the demo chooses the outcome. Everything after that verdict (signing, binding, verification) is real.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { getAddress, isAddress, isHex, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { DEMO_CLIENT } from '../lib/config';
import { attestationTypedData, type LivenessAttestation } from '../lib/liveness';

const PORT = Number(process.env.PORT ?? 4103);
const DIR = process.env.LIVENESS_DATA_DIR ?? path.join(process.cwd(), '.data', 'liveness');
const SESSION_TTL_MS = 10 * 60_000;

// KYC files the vendor holds for Swissquote (in production: the ID document and face template from onboarding).
const KYC: Record<string, { name: string; document: string }> = {
  [DEMO_CLIENT.clientId]: { name: DEMO_CLIENT.name, document: 'Swiss passport (mock)' },
};

type Session = { id: string; subject: string; wallet: Hex; request: Hex; createdAt: number; completed?: boolean };
type Entry = { id: string; ts: number; action: string; wallet?: string; detail: string; outcome: 'approved' | 'declined' | 'info' };
fs.mkdirSync(DIR, { recursive: true });
const keyFile = path.join(DIR, 'key.json');
const logFile = path.join(DIR, 'log.json');
const key: { signer: Hex } = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, 'utf8')) : { signer: generatePrivateKey() };
fs.writeFileSync(keyFile, JSON.stringify(key, null, 2), { mode: 0o600 });
const vendor = privateKeyToAccount(key.signer);
const sessions = new Map<string, Session>();

function log(e: Omit<Entry, 'id' | 'ts'>) {
  const all: Entry[] = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
  all.unshift({ id: crypto.randomUUID(), ts: Date.now(), ...e });
  fs.writeFileSync(logFile, JSON.stringify(all.slice(0, 500), null, 2));
  console.log(`[liveness] ${e.outcome.padEnd(8)} ${e.action}: ${e.detail}`);
}

class BadRequest extends Error {}

/** The client's browser opens a session for one recovery request, the way a vendor SDK would. */
async function createSession(b: { subject: string; wallet: string; request: string }) {
  if (!KYC[b.subject]) throw new BadRequest('No KYC file for this client');
  if (!isAddress(b.wallet ?? '') || !isHex(b.request) || b.request.length !== 66) throw new BadRequest('Invalid wallet or request hash');
  const s: Session = { id: crypto.randomUUID(), subject: b.subject, wallet: getAddress(b.wallet), request: b.request as Hex, createdAt: Date.now() };
  sessions.set(s.id, s);
  return { session: s.id, expiresAt: s.createdAt + SESSION_TTL_MS, kycFile: KYC[b.subject].document };
}

/** Mock face analysis, then a signed verdict. One verdict per session. */
async function complete(b: { session: string; result: 'match' | 'mismatch' }) {
  const s = sessions.get(b.session);
  if (!s || s.createdAt + SESSION_TTL_MS < Date.now()) throw new BadRequest('Unknown or expired liveness session');
  if (s.completed) throw new BadRequest('This liveness session already has a verdict');
  if (b.result !== 'match' && b.result !== 'mismatch') throw new BadRequest('Invalid result');
  s.completed = true;
  const a = { session: s.id, subject: s.subject, wallet: s.wallet, request: s.request, match: b.result === 'match', issuedAt: Math.floor(Date.now() / 1000) };
  const attestation: LivenessAttestation = { ...a, signature: await vendor.signTypedData(attestationTypedData(a)) };
  log({ action: a.match ? 'Face matches KYC file' : 'Face does not match KYC file', wallet: s.wallet, detail: `Client ${s.subject} (${KYC[s.subject].document}). Signed verdict for recovery request ${s.request.slice(0, 10)}…`, outcome: a.match ? 'approved' : 'declined' });
  return { attestation };
}

const routes: Record<string, (body: never) => Promise<unknown>> = {
  'GET /info': async () => ({ name: 'Liveness vendor (mock)', address: vendor.address }),
  'GET /audit': async () => (fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : []),
  'POST /sessions': createSession,
  'POST /sessions/complete': complete,
};

http.createServer(async (req, res) => {
  const route = routes[`${req.method} ${new URL(req.url ?? '/', 'http://x').pathname}`];
  const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  if (!route) return send(404, { error: 'Not found' });
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    send(200, await route((raw ? JSON.parse(raw) : {}) as never));
  } catch (e) {
    if (!(e instanceof BadRequest)) console.error('[liveness]', e);
    send(e instanceof BadRequest ? 400 : 500, { error: (e as Error).message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`[liveness] Liveness vendor on http://127.0.0.1:${PORT} · signing key ${vendor.address} · storage ${DIR}`));
