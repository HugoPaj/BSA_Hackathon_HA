'use client';
// Browser WebAuthn: create P-256 passkeys and turn assertions into Safe WebAuthn signatures.
import { webauthnSignatureFromAssertion, type WebauthnSignatureData } from 'abstractionkit';

const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export type Passkey = { credentialId: string; x: bigint; y: bigint };

const b64url = {
  encode(buf: ArrayBuffer | Uint8Array) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str: string) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

const toBig = (bytes: Uint8Array) => BigInt('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));

export function passkeysSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

/** Create a passkey. `purpose` ends up in the passkey's name so the user can tell them apart. */
export async function createPasskey(opts: { userName: string; displayName: string; purpose: 'wallet' | 'recovery'; otherDevice?: boolean }): Promise<Passkey> {
  const label = opts.purpose === 'wallet' ? 'Wallet' : 'Recovery key';
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Swissquote Wallet', id: window.location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: `${opts.userName} · ${label}`,
        displayName: `${opts.displayName} · ${label}`,
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 / P-256 only: what the Safe verifies on-chain
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestation: 'none',
      timeout: 120_000,
      // Hint the browser to offer "use another device" / security key for the recovery factor.
      ...(opts.otherDevice ? { hints: ['hybrid', 'security-key'] } : {}),
    } as PublicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey creation was cancelled');
  const res = cred.response as AuthenticatorAttestationResponse;
  if (res.getPublicKeyAlgorithm && res.getPublicKeyAlgorithm() !== -7) throw new Error('This authenticator did not create a P-256 key');
  const spki = res.getPublicKey();
  if (!spki) throw new Error('This browser does not expose the passkey public key');
  const raw = new Uint8Array(spki).slice(-64); // SPKI for P-256 ends with 0x04 || X || Y
  return { credentialId: b64url.encode(cred.rawId), x: toBig(raw.slice(0, 32)), y: toBig(raw.slice(32)) };
}

function parseDer(sig: Uint8Array): { r: bigint; s: bigint } {
  // SEQUENCE { INTEGER r, INTEGER s }
  let i = 2;
  if (sig[1] & 0x80) i += sig[1] & 0x7f;
  if (sig[i] !== 0x02) throw new Error('Bad DER signature');
  const rLen = sig[i + 1];
  const r = toBig(sig.slice(i + 2, i + 2 + rLen));
  i = i + 2 + rLen;
  if (sig[i] !== 0x02) throw new Error('Bad DER signature');
  const sLen = sig[i + 1];
  let s = toBig(sig.slice(i + 2, i + 2 + sLen));
  if (s > P256_N / 2n) s = P256_N - s; // low-s normal form
  return { r, s };
}

/** Ask the authenticator to sign a 32-byte challenge (a SafeOp hash, a recovery hash, a proof). */
export async function signWithPasskey(credentialIds: string[], challenge: Uint8Array): Promise<WebauthnSignatureData & { credentialId: string }> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      rpId: window.location.hostname,
      allowCredentials: credentialIds.map((id) => ({ type: 'public-key' as const, id: b64url.decode(id) as BufferSource })),
      userVerification: 'required',
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Signing was cancelled');
  const res = cred.response as AuthenticatorAssertionResponse;
  const data = webauthnSignatureFromAssertion({
    authenticatorData: new Uint8Array(res.authenticatorData),
    clientDataJSON: new Uint8Array(res.clientDataJSON),
    signature: parseDer(new Uint8Array(res.signature)),
  });
  return { ...data, credentialId: b64url.encode(cred.rawId) };
}

export function hexToBytes(hex: string) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Uint8Array.from(h.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
}
