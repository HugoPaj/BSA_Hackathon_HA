// Passport guardian: Guardian B backed by the client's ePassport. A separate process with its own key and storage,
// like the other guardians. Runs locally as its own process (passport.ts), or deployed as a function of the separate
// services project (app/api/svc).
//
// A passport chip cannot sign our recovery request: Active Authentication only signs a random challenge the reader
// picks. So this service holds the signing key and lends it to the passport. It signs a wallet's EIP-712 recovery
// request only after the client scanned the same passport they enrolled with, in Signicat's ReadID Ready app:
//   enrolment   scan the passport once when the wallet is created. The service keeps its document number and
//               country, and derives a key for this wallet (its address becomes Guardian B on-chain).
//   recovery    the service computes the recovery request from the chain itself, opens a ReadID session for it, and
//               signs only if the chip is authentic (Passive Authentication), not a clone (Active or Chip
//               Authentication, see readid.ts), the holder passed iProov's live face check against the chip photo,
//               and it is the enrolled passport. From the same scan it also signs a liveness attestation for this
//               request, which Swissquote's guardian accepts in place of its own face check.
// It has no other signing endpoint, and its signature is useless without Guardian A's (Swissquote or the partner).
//
// Without Signicat credentials it runs simulated: a random secret kept in the enrolling browser stands in for the
// passport, and its hash for the document number. Everything after the scan result (matching, signing, on-chain
// checks) is the same.
import path from 'node:path';
import { concat, getAddress, isAddress, isAddressEqual, keccak256, toHex, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { NODE_RPC } from '../lib/config';
import { readWalletState, recoveryRequest } from '../lib/chain';
import { attestationTypedData, type LivenessAttestation } from '../lib/liveness';
import { enrollmentTypedData } from '../lib/guardian-keys';
import { cloneCheck, createReadidProcess, readidConfigured, readidResult, type PassportResult, type ReadidProcess } from './readid';
import { createStore, ServiceError, type Routes } from './store';

const SCAN_TTL_MS = 30 * 60_000;

// Any ICAO eMRTD chip: a passport (document code P) or a national ID card with a chip (I), such as the Spanish DNI.
type Passport = { number: string; code?: string; country?: string; name: string; expiry?: string };
type Enrollment = { id: string; wallet: Hex; createdAt: number; address?: Hex; passport?: Passport; simulated: boolean };
type Scan = {
  id: string; purpose: 'enroll' | 'recover'; enrollment: string; createdAt: number;
  process?: ReadidProcess; // absent when simulated
  newOwner?: Hex; hash?: Hex; // recovery: the request, as this service computed it from the chain
  outcome?: { status: 'done' | 'refused'; reason: string; signature?: Hex; attestation?: LivenessAttestation };
};
type Entry = { id: string; ts: number; action: string; wallet?: string; detail: string; outcome: 'approved' | 'declined' | 'info' };
export type ScanStatus =
  | { status: 'pending' }
  | { status: 'retry'; reason: string }
  | { status: 'refused'; reason: string }
  | { status: 'done'; reason: string; enrollment?: PublicEnrollment; signature?: Hex; hash?: Hex; attestation?: LivenessAttestation };
// certificate: this guardian's identity key (published, the attestor) vouching that `address` is its key for this wallet.
export type PublicEnrollment = { id: string; wallet: Hex; address: Hex; label: string; passport: { number: string; country?: string; name: string }; simulated: boolean; certificate: Hex };

class BadRequest extends ServiceError {
  constructor(message: string, status = 400) { super(message, status); }
}

const docNumber = (n: string) => n.replace(/[\s<-]/g, '').toUpperCase();
const masked = (n: string) => '•••' + n.slice(-3);
const label = (p: Passport, simulated: boolean) => `${simulated ? 'Simulated passport' : p.code?.startsWith('I') ? 'ID card' : 'Passport'}${p.country ? ` (${p.country})` : ''} ${masked(p.number)}`;

export function createPassportGuardian(opts: { dir?: string } = {}) {
  const store = createStore('passport', opts.dir ?? path.join(process.cwd(), '.data', 'passport'));
  const master = () => store.update<{ master: Hex }>('keys', (k) => k ?? { master: generatePrivateKey() }).then((k) => k.master);
  /** One key per enrolment, so the wallets this service guards cannot be linked on-chain. */
  const keyFor = async (enrollment: string) => privateKeyToAccount(keccak256(concat([await master(), toHex(enrollment)])));
  /** This guardian's identity: signs liveness attestations and certifies enrolment keys. One key for all wallets, published. */
  const attestor = async () => privateKeyToAccount(keccak256(concat([await master(), toHex('liveness-attestor')])));

  async function log(e: Omit<Entry, 'id' | 'ts'>) {
    await store.update<Entry[]>('log', (all = []) => [{ id: crypto.randomUUID(), ts: Date.now(), ...e }, ...all].slice(0, 500));
    console.log(`[passport] ${e.outcome.padEnd(8)} ${e.action}: ${e.detail}`);
  }

  const enrollments = async () => (await store.get<Record<string, Enrollment>>('enrollments')) ?? {};
  const putEnrollment = (e: Enrollment) => store.update<Record<string, Enrollment>>('enrollments', (all = {}) => ({ ...all, [e.id]: e }));
  async function getScan(id: string) {
    const s = (await store.get<Record<string, Scan>>('scans'))?.[id];
    if (!s || s.createdAt + SCAN_TTL_MS < Date.now()) throw new BadRequest('Unknown or expired passport scan');
    return s;
  }
  async function putScan(s: Scan) {
    await store.update<Record<string, Scan>>('scans', (all = {}) => {
      for (const [k, v] of Object.entries(all)) if (v.createdAt + SCAN_TTL_MS < Date.now()) delete all[k];
      return { ...all, [s.id]: s };
    });
  }
  const publicEnrollment = async (e: Enrollment): Promise<PublicEnrollment> => ({
    id: e.id, wallet: e.wallet, address: e.address!, label: label(e.passport!, e.simulated), simulated: e.simulated,
    passport: { number: masked(e.passport!.number), country: e.passport!.country, name: e.passport!.name },
    certificate: await (await attestor()).signTypedData(enrollmentTypedData({ enrollment: e.id, wallet: e.wallet, guardian: e.address! })),
  });

  async function openScan(purpose: Scan['purpose'], enrollment: string, callback: string | undefined, extra: Partial<Scan> = {}) {
    const s: Scan = { id: crypto.randomUUID(), purpose, enrollment, createdAt: Date.now(), ...extra };
    if (readidConfigured()) {
      let url: URL;
      try { url = new URL(callback ?? ''); } catch { throw new BadRequest('Invalid callback URL'); }
      if (url.protocol !== 'https:') throw new BadRequest('ReadID Ready can only return to an https page. Open the wallet through its https address.');
      s.process = await createReadidProcess(s.id, url.href);
    }
    await putScan(s);
    return { scan: s.id, link: s.process?.universalLink ?? null, simulated: !s.process };
  }

  /** Start enrolling a passport for a wallet that is being created (its counterfactual address). */
  async function enroll(b: { wallet: string; callback?: string }) {
    if (!isAddress(b.wallet ?? '')) throw new BadRequest('Invalid wallet address');
    const e: Enrollment = { id: crypto.randomUUID(), wallet: getAddress(b.wallet), createdAt: Date.now(), simulated: !readidConfigured() };
    const scan = await openScan('enroll', e.id, b.callback);
    await putEnrollment(e);
    return scan;
  }

  /** Start a recovery approval. The request is computed here from the chain, never taken from the caller. */
  async function recover(b: { wallet: string; newOwner: string; callback?: string }) {
    if (!isAddress(b.wallet ?? '') || !isAddress(b.newOwner ?? '')) throw new BadRequest('Invalid wallet or new owner address');
    const wallet = getAddress(b.wallet);
    const state = await readWalletState(NODE_RPC, wallet);
    if (!state.deployed) throw new BadRequest('Wallet is not deployed', 403);
    if (state.recovery) throw new BadRequest('A recovery is already pending on-chain', 403);
    if (state.owners.some((o) => isAddressEqual(o as Hex, b.newOwner as Hex))) throw new BadRequest('The new signer already owns the wallet', 403);
    // Which enrolment guards this wallet: the one whose derived address the recovery module lists as guardian.
    let enrollment: Enrollment | undefined;
    for (const e of Object.values(await enrollments())) {
      if (e.address && isAddressEqual(e.wallet, wallet) && state.guardians.some((g) => isAddressEqual(g as Hex, e.address!))) enrollment = e;
    }
    if (!enrollment) throw new BadRequest('No passport is enrolled as a guardian of this wallet', 404);
    const { hash } = await recoveryRequest(NODE_RPC, wallet, b.newOwner);
    const out = await openScan('recover', enrollment.id, b.callback, { newOwner: getAddress(b.newOwner), hash });
    await log({ action: 'Recovery scan started', wallet, detail: `New signer ${getAddress(b.newOwner)}. Waiting for ${label(enrollment.passport!, enrollment.simulated)}`, outcome: 'info' });
    return { ...out, hash, passport: (await publicEnrollment(enrollment)).passport };
  }

  /** Apply a scan result once: enrol the passport, or check it against the enrolment and sign the request. */
  async function settle(s: Scan, r: PassportResult): Promise<ScanStatus> {
    if (r.status !== 'done') return r;
    const e = (await enrollments())[s.enrollment];
    if (!e) throw new BadRequest('Unknown enrolment');
    let outcome: NonNullable<Scan['outcome']>;
    // Expiry only matters when enrolling: an expired passport's chip still proves you hold the enrolled document.
    const expired = !!r.document?.expiry && new Date(r.document.expiry).getTime() < Date.now();
    const chip = `PA ${r.chip.pa}${r.chip.aa ? `, AA ${r.chip.aa}` : ''}${r.chip.ca ? `, ${cloneCheck() === 'aa' ? 'CA' : 'clone check'} ${r.chip.ca}` : ''}${r.chip.face ? `, face ${r.chip.face}` : ''}`;
    if (!r.verified || !r.document) outcome = { status: 'refused', reason: r.reason };
    else if (s.purpose === 'enroll' && expired) outcome = { status: 'refused', reason: 'This passport has expired' };
    else if (s.purpose === 'enroll') {
      const passport = { number: docNumber(r.document.number), code: r.document.code, country: r.document.country, name: r.document.name, expiry: r.document.expiry };
      const address = (await keyFor(e.id)).address;
      await putEnrollment({ ...e, passport, address });
      outcome = { status: 'done', reason: 'Passport enrolled' };
      await log({ action: 'Passport enrolled', wallet: e.wallet, detail: `${label(passport, e.simulated)}. Chip: ${chip}. Guardian B address ${address}`, outcome: 'approved' });
    } else if (!e.passport || docNumber(r.document.number) !== e.passport.number || (e.passport.country && r.document.country && r.document.country !== e.passport.country)) {
      outcome = { status: 'refused', reason: 'This is not the passport enrolled for this wallet' };
    } else {
      // Fresh from the chain: the request must still be the next one (no recovery started or executed meanwhile).
      const state = await readWalletState(NODE_RPC, e.wallet);
      const { typedData, hash } = await recoveryRequest(NODE_RPC, e.wallet, s.newOwner!);
      if (state.recovery || hash !== s.hash) outcome = { status: 'refused', reason: 'The recovery request changed on-chain since the scan started. Start again.' };
      else {
        const a = { session: s.id, subject: `passport:${e.id}`, wallet: e.wallet, request: hash, match: true, issuedAt: Math.floor(Date.now() / 1000) };
        const attestation: LivenessAttestation = { ...a, signature: await (await attestor()).signTypedData(attestationTypedData(a)) };
        outcome = { status: 'done', reason: 'Passport matches the enrolment', signature: await (await keyFor(e.id)).signTypedData(typedData), attestation };
      }
      if (outcome.signature) await log({ action: 'Signed recovery approval', wallet: e.wallet, detail: `${label(e.passport, e.simulated)} scanned. Chip: ${chip}. Request: owner → ${s.newOwner}, threshold 1`, outcome: 'approved' });
    }
    if (outcome.status === 'refused') await log({ action: s.purpose === 'enroll' ? 'Enrolment refused' : 'Refused to sign', wallet: e.wallet, detail: `${outcome.reason}.${r.document ? ` Scanned ${r.document.country ?? ''} passport ${masked(docNumber(r.document.number))}.` : ''} Chip: ${chip}`, outcome: 'declined' });
    // One outcome per scan, even if two polls race: the first one stored wins.
    let stored: Scan['outcome'];
    await store.update<Record<string, Scan>>('scans', (all = {}) => {
      stored = all[s.id]?.outcome ?? outcome;
      return all[s.id] ? { ...all, [s.id]: { ...all[s.id], outcome: stored } } : all;
    });
    return view(s, stored!);
  }

  async function view(s: Scan, o: NonNullable<Scan['outcome']>): Promise<ScanStatus> {
    if (o.status === 'refused') return { status: 'refused', reason: o.reason };
    const e = (await enrollments())[s.enrollment];
    return s.purpose === 'enroll' ? { status: 'done', reason: o.reason, enrollment: await publicEnrollment(e) } : { status: 'done', reason: o.reason, signature: o.signature, hash: s.hash, attestation: o.attestation };
  }

  /** Poll a scan. The result comes from Signicat, fetched by this service, never from the caller. */
  async function status(b: { scan: string }): Promise<ScanStatus> {
    const s = await getScan(b.scan);
    if (s.outcome) return view(s, s.outcome);
    if (!s.process) return { status: 'pending' };
    return settle(s, await readidResult(s.process));
  }

  /** Simulated mode only: the browser presents its simulated passport, a secret whose hash is the document number. */
  async function simulate(b: { scan: string; secret: string }) {
    if (readidConfigured()) throw new BadRequest('Simulated scans are off: this service uses ReadID', 403);
    if (!/^0x[0-9a-f]{64}$/i.test(b.secret ?? '')) throw new BadRequest('Invalid simulated passport');
    const s = await getScan(b.scan);
    if (s.outcome) return view(s, s.outcome);
    const number = 'SIM' + keccak256(b.secret as Hex).slice(2, 8).toUpperCase();
    return settle(s, { status: 'done', verified: true, reason: 'Chip authentic and not cloned', document: { number, country: 'UTO', name: 'Simulated holder' }, chip: { pa: 'SIMULATED', aa: 'SIMULATED', face: 'SIMULATED' } });
  }

  /** For the wallet backend: the enrolment it is about to register, from this service's own record. */
  async function enrollment(b: { id: string }) {
    const e = (await enrollments())[b.id];
    if (!e?.address || !e.passport) throw new BadRequest('This passport is not enrolled yet', 404);
    return publicEnrollment(e);
  }

  const routes: Routes = {
    'GET /info': async () => ({ name: 'Passport guardian', mode: readidConfigured() ? 'readid' : 'simulated', cloneCheck: cloneCheck(), attestor: (await attestor()).address }),
    'GET /audit': async () => (await store.get<Entry[]>('log')) ?? [],
    'POST /enroll': enroll,
    'POST /recover': recover,
    'POST /scan': status,
    'POST /scan/simulate': simulate,
    'POST /enrollment': enrollment,
  };
  return { routes };
}
