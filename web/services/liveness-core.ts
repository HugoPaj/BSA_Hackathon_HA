// Identity-verification vendor (mock). A separate process with its own signing key and storage, standing in for a
// KYC/liveness provider. Its verdict is an EIP-712 attestation bound to one recovery request, which Swissquote's
// guardian verifies against the vendor's pinned key. The web backend only relays it and cannot forge it.
// Runs locally as its own process (liveness.ts), or deployed as a function of the separate services project.
//
// What is mocked: the face analysis. A real vendor compares live camera frames with the ID photo in the KYC file;
// here the demo chooses the outcome. Everything after that verdict (signing, binding, verification) is real.
import path from 'node:path';
import { getAddress, isAddress, isHex, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { DEMO_CLIENT } from '../lib/config';
import { attestationTypedData, type LivenessAttestation } from '../lib/liveness';
import { createStore, ServiceError, type Routes } from './store';

const SESSION_TTL_MS = 10 * 60_000;

// KYC files the vendor holds for Swissquote (in production: the ID document and face template from onboarding).
const KYC: Record<string, { name: string; document: string }> = {
  [DEMO_CLIENT.clientId]: { name: DEMO_CLIENT.name, document: 'Swiss passport (mock)' },
};

type Session = { id: string; subject: string; wallet: Hex; request: Hex; createdAt: number; completed?: boolean };
type Entry = { id: string; ts: number; action: string; wallet?: string; detail: string; outcome: 'approved' | 'declined' | 'info' };

class BadRequest extends ServiceError {
  constructor(message: string) { super(message, 400); }
}

export function createLiveness(opts: { dir?: string } = {}) {
  const store = createStore('liveness', opts.dir ?? path.join(process.cwd(), '.data', 'liveness'));
  let loaded: Promise<ReturnType<typeof privateKeyToAccount>> | undefined;
  const vendor = () => (loaded ??= store.update<{ signer: Hex }>('key', (k) => k ?? { signer: generatePrivateKey() }).then((k) => privateKeyToAccount(k.signer)).catch((e) => { loaded = undefined; throw e; }));

  async function log(e: Omit<Entry, 'id' | 'ts'>) {
    await store.update<Entry[]>('log', (all = []) => [{ id: crypto.randomUUID(), ts: Date.now(), ...e }, ...all].slice(0, 500));
    console.log(`[liveness] ${e.outcome.padEnd(8)} ${e.action}: ${e.detail}`);
  }

  /** The client's browser opens a session for one recovery request, the way a vendor SDK would. */
  async function createSession(b: { subject: string; wallet: string; request: string }) {
    if (!KYC[b.subject]) throw new BadRequest('No KYC file for this client');
    if (!isAddress(b.wallet ?? '') || !isHex(b.request) || b.request.length !== 66) throw new BadRequest('Invalid wallet or request hash');
    const s: Session = { id: crypto.randomUUID(), subject: b.subject, wallet: getAddress(b.wallet), request: b.request as Hex, createdAt: Date.now() };
    await store.update<Record<string, Session>>('sessions', (all = {}) => {
      for (const [k, v] of Object.entries(all)) if (v.createdAt + SESSION_TTL_MS < Date.now()) delete all[k];
      return { ...all, [s.id]: s };
    });
    return { session: s.id, expiresAt: s.createdAt + SESSION_TTL_MS, kycFile: KYC[b.subject].document };
  }

  /** Mock face analysis, then a signed verdict. One verdict per session. */
  async function complete(b: { session: string; result: 'match' | 'mismatch' }) {
    if (b.result !== 'match' && b.result !== 'mismatch') throw new BadRequest('Invalid result');
    // Claim the session atomically: one verdict per session, even with concurrent requests.
    let s: Session | undefined, already = false;
    await store.update<Record<string, Session>>('sessions', (all = {}) => {
      s = all[b.session];
      already = !!s?.completed;
      return s && !already ? { ...all, [s.id]: { ...s, completed: true } } : all;
    });
    if (!s || s.createdAt + SESSION_TTL_MS < Date.now()) throw new BadRequest('Unknown or expired liveness session');
    if (already) throw new BadRequest('This liveness session already has a verdict');
    const a = { session: s.id, subject: s.subject, wallet: s.wallet, request: s.request, match: b.result === 'match', issuedAt: Math.floor(Date.now() / 1000) };
    const attestation: LivenessAttestation = { ...a, signature: await (await vendor()).signTypedData(attestationTypedData(a)) };
    await log({ action: a.match ? 'Face matches KYC file' : 'Face does not match KYC file', wallet: s.wallet, detail: `Client ${s.subject} (${KYC[s.subject].document}). Signed verdict for recovery request ${s.request.slice(0, 10)}…`, outcome: a.match ? 'approved' : 'declined' });
    return { attestation };
  }

  const routes: Routes = {
    'GET /info': async () => ({ name: 'Liveness vendor (mock)', address: (await vendor()).address }),
    'GET /audit': async () => (await store.get<Entry[]>('log')) ?? [],
    'POST /sessions': createSession,
    'POST /sessions/complete': complete,
  };
  return { routes, vendor };
}
