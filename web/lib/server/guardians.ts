import 'server-only';
// Client for the two guardian services (services/guardian.ts). They run as separate processes with their own keys
// and storage. This backend can ask them to sign, and they check every request against the chain themselves.
import { isAddressEqual, type Hex } from 'viem';
import { NODE_RPC } from '../config';
import { deployGuardianSafeTx, guardianSafeAddress, readGuardianSafe } from '../guardian-safe';
import { relay } from './aa';
import type { LivenessAttestation } from '../liveness';

export const GUARDIAN_URLS = {
  swissquote: process.env.SQ_GUARDIAN_URL ?? 'http://127.0.0.1:4101',
  partner: process.env.PARTNER_GUARDIAN_URL ?? 'http://127.0.0.1:4102',
};
type Role = keyof typeof GUARDIAN_URLS;
export type GuardianInfo = { role: Role; name: string; address: string; relayer: string; identity: string; identityLabel: string };

async function call<T>(role: Role, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(GUARDIAN_URLS[role] + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error(`The ${role === 'swissquote' ? 'Swissquote guardian' : 'recovery partner'} service is offline. Start it with "npm run dev".`);
  }
  const out = await res.json();
  if (!res.ok) throw new Error(out.error ?? `Guardian service error ${res.status}`);
  return out as T;
}

export const guardianInfo = (role: Role) => call<GuardianInfo>(role, '/info');

let deployed: Promise<{ address: string; owners: string[] }> | null = null;

/** The Guardian A Safe (1-of-2: Swissquote HSM, independent partner). Deployed once by the operations Safe. */
export function guardianSafe() {
  deployed ??= (async () => {
    const [sq, partner] = await Promise.all([guardianInfo('swissquote'), guardianInfo('partner')]);
    const owners = [sq.address, partner.address];
    const address = await guardianSafeAddress(NODE_RPC, owners);
    const onChain = await readGuardianSafe(NODE_RPC, address);
    if (!onChain) await relay([deployGuardianSafeTx(owners)]);
    else if (!owners.every((o) => onChain.owners.some((x) => isAddressEqual(x as Hex, o as Hex)))) throw new Error('Guardian Safe owners do not match the guardian services');
    return { address, owners };
  })().catch((e) => {
    deployed = null;
    throw e;
  });
  return deployed;
}

/**
 * Ask Swissquote's guardian HSM to approve. We pass evidence, not verdicts: the vendor-signed liveness attestation
 * and the owner's passkey-signed ownership proof. The guardian verifies both, and Guardian B, on its own.
 */
export function requestSwissquoteApproval(req: { wallet: string; guardian: string; newOwner: string; guardianBSignature: string; attestation: LivenessAttestation; ownershipProof: { message: string; signature: string } }) {
  return call<{ signer: string; signature: Hex }>('swissquote', '/approve', {
    wallet: req.wallet,
    guardian: req.guardian,
    newOwner: req.newOwner,
    guardianBSignature: req.guardianBSignature,
    identity: { method: 'kyc-liveness', attestation: req.attestation, ownershipProof: req.ownershipProof },
  });
}

export const LIVENESS_URL = process.env.LIVENESS_URL ?? 'http://127.0.0.1:4103';
let vendor: Promise<string> | null = null;

/** The liveness vendor's signing key, so this backend can explain a refusal before the guardian ever sees it. */
export function livenessVendor() {
  vendor ??= fetch(LIVENESS_URL + '/info', { cache: 'no-store' })
    .then((r) => r.json())
    .then((i: { address: string }) => i.address)
    .catch(() => {
      vendor = null;
      throw new Error('The liveness vendor is offline. Start it with "npm run dev".');
    });
  return vendor;
}

export type GuardianLogEntry = { id: string; ts: number; action: string; wallet?: string; detail: string; outcome: 'approved' | 'declined' | 'info' };

/** The guardians' and the liveness vendor's own logs, for the operations view. A service that is down simply shows no entries. */
export async function guardianLogs() {
  const [sq, partner] = await Promise.all((['swissquote', 'partner'] as const).map((r) => call<GuardianLogEntry[]>(r, '/audit').catch(() => null)));
  const liveness = await fetch(LIVENESS_URL + '/audit', { cache: 'no-store' }).then((r) => r.json() as Promise<GuardianLogEntry[]>).catch(() => null);
  return { swissquote: sq, partner, liveness };
}
