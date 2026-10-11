// The guardian keys this build of the app trusts. In production Swissquote would publish them on swissquote.com,
// so anyone (a client, an auditor, the partner) can compare them with the guardians registered on-chain.
import { PUBLISHED_KEYS, publishedGuardianA } from '@/lib/guardian-keys';
import { CHAIN_ID } from '@/lib/config';

export function GET() {
  let guardianA: string | null = null;
  try { guardianA = publishedGuardianA(); } catch {}
  return Response.json({
    chainId: Number(CHAIN_ID),
    guardianA: { safe: guardianA, threshold: 1, owners: { swissquote: PUBLISHED_KEYS.swissquote, partner: PUBLISHED_KEYS.partner } },
    passportGuardian: { identityKey: PUBLISHED_KEYS.passport, certifies: 'one Guardian B key per enrolment (EIP-712 GuardianEnrollment)' },
  });
}
