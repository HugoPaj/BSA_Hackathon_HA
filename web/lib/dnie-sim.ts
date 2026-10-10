'use client';
// Simulated DNIe for demos without an Android phone and a Spanish ID card. It behaves like the real card where it
// matters: an RSA-2048 key that signs SHA256withRSA (PKCS#1 v1.5), a 6-digit CAN printed on the card, a PIN, and a
// lock after three wrong PINs. The key is encrypted with the PIN and kept in this browser only.
import type { Hex } from 'viem';

const KEY = 'sq.simdnie.v1';
const ITERATIONS = 210_000;
const MAX_TRIES = 3;

type Stored = { can: string; spki: string; salt: string; iv: string; ct: string; triesLeft: number };

const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function load(): Stored | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
function save(s: Stored) { localStorage.setItem(KEY, JSON.stringify(s)); }

async function pinKey(pin: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** The simulated card in this browser, if one was issued. */
export function simDnie() {
  const s = load();
  return s ? { can: s.can, triesLeft: s.triesLeft } : null;
}

/** "Issue" a simulated DNI: like the police station, you choose its PIN. */
export async function issueSimDnie(pin: string) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pinKey(pin, salt), pkcs8);
  const can = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  save({ can, spki: b64(spki), salt: b64(salt), iv: b64(iv), ct: b64(ct), triesLeft: MAX_TRIES });
  return { can };
}

export function discardSimDnie() { localStorage.removeItem(KEY); }

/** Sign a 32-byte hash, the way the real card does after PACE (CAN) and PIN verification. */
export async function signWithSimDnie(can: string, pin: string, hash: Hex): Promise<{ signature: Hex; spki: string }> {
  const s = load();
  if (!s) throw new Error('No simulated DNI in this browser');
  if (s.triesLeft <= 0) throw new Error('This DNI\'s PIN is locked. A real DNI is unlocked at a police station; here, issue a new simulated card.');
  if (can !== s.can) throw new Error('The CAN does not match this card. It is printed at the bottom right of the front.');
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, await pinKey(pin, unb64(s.salt)), unb64(s.ct));
  } catch {
    save({ ...s, triesLeft: s.triesLeft - 1 });
    throw new Error(s.triesLeft - 1 > 0 ? `Wrong PIN. ${s.triesLeft - 1} attempt${s.triesLeft - 1 === 1 ? '' : 's'} left before the card locks.` : 'Wrong PIN. The card is now locked.');
  }
  if (s.triesLeft !== MAX_TRIES) save({ ...s, triesLeft: MAX_TRIES });
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const bytes = Uint8Array.from(hash.slice(2).match(/../g)!.map((h) => parseInt(h, 16)));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, bytes));
  return { signature: ('0x' + Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')) as Hex, spki: s.spki };
}
