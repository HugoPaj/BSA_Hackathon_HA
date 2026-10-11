// The guardian keys Swissquote publishes, baked into the app at build time. The browser checks every guardian the
// backend proposes against them before the owner's passkey registers it on-chain, so a compromised or impersonated
// backend cannot slip in a guardian key of its own. In production the same keys would be in the signed app binary
// and on swissquote.com/.well-known/swissquote-guardians.json; here /.well-known serves this build's copy.
import { getAddress, isAddress, isAddressEqual, recoverTypedDataAddress, type Hex } from 'viem';
import { CHAIN_ID } from './config';
import { guardianSafeAddress } from './guardian-safe';

// Literal process.env.NEXT_PUBLIC_* reads, so Next inlines them into the client bundle.
const key = (v: string | undefined) => (v && isAddress(v) ? getAddress(v) : null);
export const PUBLISHED_KEYS = {
  swissquote: key(process.env.NEXT_PUBLIC_SQ_GUARDIAN_KEY), // Swissquote's recovery HSM
  partner: key(process.env.NEXT_PUBLIC_PARTNER_GUARDIAN_KEY), // the independent recovery partner
  passport: key(process.env.NEXT_PUBLIC_PASSPORT_GUARDIAN_KEY), // the passport guardian's identity key
};

class UnverifiedGuardian extends Error {}

function published(k: keyof typeof PUBLISHED_KEYS) {
  const v = PUBLISHED_KEYS[k];
  if (!v) throw new UnverifiedGuardian('This app was built without the published guardian keys, so it cannot verify its recovery guardians. Start it with "npm run dev".');
  return v;
}

/** Guardian A: the 1-of-2 Safe of the two published keys. Its address follows from them alone (CREATE2). */
export const publishedGuardianA = () => guardianSafeAddress([published('swissquote'), published('partner')]);

/** Throws unless `address` is the Guardian A Safe of the published Swissquote and partner keys. */
export function verifyGuardianA(address: string) {
  const expected = publishedGuardianA();
  if (!isAddress(address) || !isAddressEqual(address, expected)) throw new UnverifiedGuardian(`The server proposed ${address} as Swissquote's recovery guardian, but the published keys give ${expected}. Wallet creation stopped: do not continue, and contact Swissquote.`);
  return expected;
}

// The passport guardian derives one key per enrolment, so it cannot be published. Instead the guardian certifies
// each enrolment key with its published identity key.
export const ENROLLMENT_DOMAIN = { name: 'Passport guardian enrolment', version: '1', chainId: Number(CHAIN_ID) } as const;
export const ENROLLMENT_TYPES = {
  GuardianEnrollment: [
    { name: 'enrollment', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'guardian', type: 'address' }, // the key that becomes Guardian B on-chain
  ],
} as const;
export type EnrollmentClaim = { enrollment: string; wallet: Hex; guardian: Hex };
export const enrollmentTypedData = (c: EnrollmentClaim) => ({ domain: ENROLLMENT_DOMAIN, types: ENROLLMENT_TYPES, primaryType: 'GuardianEnrollment', message: c } as const);

/** Throws unless the published passport guardian certified `guardian` as its key for this wallet's enrolment. */
export async function verifyPassportEnrollment(c: EnrollmentClaim, certificate: Hex | undefined, wallet: string) {
  const expected = published('passport');
  const signer = certificate && await recoverTypedDataAddress({ ...enrollmentTypedData(c), signature: certificate }).catch(() => null);
  if (!signer || !isAddressEqual(signer, expected)) throw new UnverifiedGuardian('This passport enrolment is not certified by the published passport guardian key. Do not continue, and contact Swissquote.');
  if (!isAddressEqual(c.wallet, wallet as Hex)) throw new UnverifiedGuardian('This passport enrolment is for another wallet.');
}
