// Liveness attestations. The identity-verification vendor (services/liveness.ts) signs its verdict as EIP-712 data,
// bound to one recovery request. Swissquote's guardian pins the vendor's key, so whoever relays the verdict (the
// browser, the web backend) cannot forge or change it, or reuse it for a different request.
import { isAddressEqual, keccak256, recoverTypedDataAddress, toBytes, type Hex } from 'viem';
import { CHAIN_ID } from './config';

export const LIVENESS_DOMAIN = { name: 'Liveness vendor (mock)', version: '1', chainId: Number(CHAIN_ID) } as const;
export const LIVENESS_TYPES = {
  LivenessAttestation: [
    { name: 'session', type: 'string' },
    { name: 'subject', type: 'string' }, // KYC file: the Swissquote client number
    { name: 'wallet', type: 'address' },
    { name: 'request', type: 'bytes32' }, // EIP-712 hash of the recovery request the client is approving
    { name: 'match', type: 'bool' },
    { name: 'issuedAt', type: 'uint64' },
  ],
} as const;
export const ATTESTATION_TTL_SECONDS = 10 * 60;

export type LivenessAttestation = { session: string; subject: string; wallet: Hex; request: Hex; match: boolean; issuedAt: number; signature: Hex };

export function attestationTypedData(a: Omit<LivenessAttestation, 'signature'>) {
  return {
    domain: LIVENESS_DOMAIN,
    types: LIVENESS_TYPES,
    primaryType: 'LivenessAttestation',
    message: { session: a.session, subject: a.subject, wallet: a.wallet, request: a.request, match: a.match, issuedAt: BigInt(a.issuedAt) },
  } as const;
}

/** Why an attestation is unacceptable for this request, or null if it is a valid, fresh verdict by `vendor`. */
export async function checkAttestation(a: LivenessAttestation | undefined, expect: { vendor: string; wallet: string; request: string; subject?: string }) {
  if (!a?.signature) return 'No liveness attestation';
  const signer = await recoverTypedDataAddress({ ...attestationTypedData(a), signature: a.signature }).catch(() => null);
  if (!signer || !isAddressEqual(signer, expect.vendor as Hex)) return 'Liveness attestation is not signed by the pinned vendor';
  if (!isAddressEqual(a.wallet, expect.wallet as Hex)) return 'Liveness attestation is for another wallet';
  if (a.request.toLowerCase() !== expect.request.toLowerCase()) return 'Liveness attestation is for another recovery request';
  if (expect.subject !== undefined && a.subject !== expect.subject) return 'Liveness attestation is for another person';
  const age = Date.now() / 1000 - a.issuedAt;
  if (age < -60 || age > ATTESTATION_TTL_SECONDS) return 'Liveness attestation expired';
  return null;
}

/** The ownership proof the owner's passkey signed: "client C owns wallet W". */
export function parseOwnershipProof(message: string) {
  const client = /^Client: (\S+)$/m.exec(message)?.[1];
  const wallet = /^Wallet: (0x[0-9a-fA-F]{40})$/m.exec(message)?.[1];
  if (!message.startsWith('Swissquote wallet ownership proof\n') || !client || !wallet) return null;
  return { client, wallet, hash: keccak256(toBytes(message)) };
}
