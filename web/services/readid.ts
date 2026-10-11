// ReadID Ready through Signicat's Assure API: the identity vendor's real passport check. The client's phone reads
// the passport chip (NFC) in Signicat's ReadID Ready app, opened from a universal link or QR code, so no app of our
// own is needed. Only the vendor process holds the API credentials; it fetches the result from Signicat itself and
// never trusts what the browser says about it.
//
// Env (vendor process only):
//   SIGNICAT_CLIENT_ID, SIGNICAT_CLIENT_SECRET   API client with "Assure API" access (Signicat Dashboard)
//   PASSPORT_CLONE_CHECK=aa                       aa: Active Authentication must have succeeded (default)
//                                                 chip: accept Signicat's chipCloneDetection (AA or Chip Authentication)
// Every scan must also pass iProov's live face check against the photo on the chip (Signicat add-on, on this account).
// Docs: https://developer.signicat.com/apis/id-document-and-biometric-verification/
import { ServiceError } from './store';

const AUTH_URL = 'https://api.signicat.com/auth/open/connect/token';
const API = 'https://api.signicat.com/assure';

export const readidConfigured = () => !!(process.env.SIGNICAT_CLIENT_ID && process.env.SIGNICAT_CLIENT_SECRET);
export const cloneCheck = () => (process.env.PASSPORT_CLONE_CHECK === 'chip' ? 'chip' : 'aa');

let token: { value: string; expires: number } | undefined;
async function accessToken() {
  if (token && token.expires > Date.now() + 30_000) return token.value;
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'signicat-api', client_id: process.env.SIGNICAT_CLIENT_ID!, client_secret: process.env.SIGNICAT_CLIENT_SECRET! }),
  });
  if (!res.ok) throw new ServiceError(`Signicat login failed (${res.status}). Check SIGNICAT_CLIENT_ID and SIGNICAT_CLIENT_SECRET`, 502);
  const t = await res.json();
  token = { value: t.access_token, expires: Date.now() + t.expires_in * 1000 };
  return token.value;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${await accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new ServiceError(`Signicat ${method} ${path.replace(/\/[0-9a-f-]{20,}/g, '/…')} failed (${res.status}): ${text.slice(0, 300)}`, 502);
  return (text ? JSON.parse(text) : {}) as T;
}

export type ReadidProcess = { dossierId: string; processId: string; universalLink: string };

/** One dossier and one ReadID Ready process per recovery check. `callback` is where the app sends the user back. */
export async function createReadidProcess(externalReference: string, callback: string): Promise<ReadidProcess> {
  const { dossierId } = await call<{ dossierId: string }>('POST', '/dossiers', { externalReference });
  const p = await call<{ processId: string; universalLink?: string }>('POST', `/dossiers/${dossierId}/processes`, { provider: 'readid', processType: 'ready' });
  if (!p.universalLink) throw new ServiceError('Signicat did not return a ReadID Ready link. ReadID Ready may not be enabled on this account yet (ask Signicat support)', 502);
  // "You must append a callback query parameter to the universal link": the app returns the user there when done.
  const universalLink = `${p.universalLink}${p.universalLink.includes('?') ? '&' : '?'}callback=${encodeURIComponent(callback)}`;
  // Signicat also returns base64QRCode, but without our callback; the page draws its own QR code of this link.
  return { dossierId, processId: p.processId, universalLink };
}

type Consolidated = {
  chipVerification?: 'SUCCEEDED' | 'FAILED';
  chipCloneDetection?: 'SUCCEEDED' | 'FAILED' | 'NOT_AVAILABLE';
  documentNumber?: string; documentCode?: string; issuingCountry?: string; nationality?: string;
  firstName?: string; lastName?: string; dateOfExpiry?: string;
};
type Iproov = { finished?: boolean; passed?: boolean; hasError?: boolean; enrollmentImageSource?: string; iProovAssuranceType?: string };
type Process = { status: 'pending' | 'processing' | 'accepted' | 'rejected' | 'inconclusive' | 'canceled' | 'failed'; providerSpecific?: { consolidatedIdentityData?: Consolidated; iproovSession?: Iproov } };
type Raw = { nfcSession?: { verificationStatus?: { AA?: string; AAReason?: string; EACCA?: string } } };

export type PassportResult =
  | { status: 'pending' }
  | { status: 'retry'; reason: string } // nothing was proven either way: the user can scan again
  | { status: 'done'; verified: boolean; reason: string; document?: { number: string; code?: string; country?: string; expiry?: string; name: string }; chip: { pa: string; aa?: string; ca?: string; face?: string } };

/** Signicat's verdict on the chip, plus the AA flag from the raw ReadID session when AA is required. */
export async function readidResult(p: { dossierId: string; processId: string }): Promise<PassportResult> {
  const base = `/dossiers/${p.dossierId}/processes/${p.processId}`;
  const proc = await call<Process>('GET', base);
  if (proc.status === 'pending' || proc.status === 'processing') return { status: 'pending' };
  if (proc.status === 'canceled' || proc.status === 'failed') return { status: 'retry', reason: `The passport scan was ${proc.status === 'canceled' ? 'cancelled' : 'not completed'}. Scan again.` };
  const c = proc.providerSpecific?.consolidatedIdentityData ?? {};
  const document = c.documentNumber ? { number: c.documentNumber, code: c.documentCode, country: c.issuingCountry, expiry: c.dateOfExpiry, name: [c.firstName, c.lastName].filter(Boolean).join(' ') } : undefined;
  const chip: { pa: string; aa?: string; ca?: string; face?: string } = { pa: c.chipVerification ?? 'UNKNOWN' };
  // Passive Authentication failed: the chip data is not signed by the issuing country. A forged or altered document.
  if (proc.status === 'rejected' || c.chipVerification !== 'SUCCEEDED') return { status: 'done', verified: false, reason: 'The passport chip failed authentication (its data is not signed by the issuing country)', document, chip };
  // A clone check that failed is "inconclusive" for Signicat: often a bad read, so let the user scan again.
  if (proc.status === 'inconclusive' || c.chipCloneDetection === 'FAILED') return { status: 'retry', reason: 'The anti-clone check on the chip did not complete. Hold the passport still against the phone and scan again.' };

  if (cloneCheck() === 'aa') {
    // AA vs CA is only in the raw ReadID session (Signicat enables the Raw endpoint on request).
    const raw = await call<Raw>('GET', `${base}/raw`).catch((e: Error) => { throw new ServiceError(`${e.message}. Ask Signicat to enable the Raw endpoint, or set PASSPORT_CLONE_CHECK=chip to accept Active or Chip Authentication`, 502); });
    const v = raw.nfcSession?.verificationStatus ?? {};
    Object.assign(chip, { aa: v.AA ?? 'UNKNOWN', ca: v.EACCA ?? 'UNKNOWN' });
    if (v.AA !== 'PRESENT_SUCCEEDED') {
      return v.AA === 'PRESENT_FAILED'
        ? { status: 'done', verified: false, reason: `Active Authentication failed (${v.AAReason ?? 'no reason given'}): the chip may be a clone`, document, chip }
        : { status: 'done', verified: false, reason: 'This passport does not support Active Authentication, which this check requires', document, chip };
    }
  } else {
    chip.ca = c.chipCloneDetection;
    if (c.chipCloneDetection !== 'SUCCEEDED') return { status: 'done', verified: false, reason: 'The passport has no anti-clone check (neither Active nor Chip Authentication)', document, chip };
  }
  // Liveness: iProov compared a live face with the photo read from the chip. Without it, a stolen passport would do.
  const face = proc.providerSpecific?.iproovSession;
  chip.face = face ? `${face.iProovAssuranceType ?? 'iProov'} ${face.passed ? 'PASSED' : 'FAILED'}` : 'NOT DONE';
  if (!face?.finished || face.hasError) return { status: 'retry', reason: 'The live face check did not complete. Scan again and follow the face check in the app.' };
  if (!face.passed || face.enrollmentImageSource !== 'Chip') return { status: 'done', verified: false, reason: 'The live face check did not match the photo on the chip', document, chip };
  if (!document) return { status: 'retry', reason: 'The chip was read, but no document number came back. Scan again.' };
  return { status: 'done', verified: true, reason: 'Chip authentic, not cloned, and the holder passed a live face check', document, chip };
}
