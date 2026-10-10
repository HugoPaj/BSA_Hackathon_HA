'use client';
// Recovery card: an offline guardian key, encrypted with a 6-digit PIN, shown once and never stored by the app.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

const PREFIX = 'SQRC1.';
const ITERATIONS = 310_000;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function deriveKey(pin: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createRecoveryCard(pin: string) {
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(privateKey)));
  const blob = new Uint8Array([...salt, ...iv, ...ct]);
  return { address, code: PREFIX + b64(blob) };
}

export async function unlockRecoveryCard(code: string, pin: string) {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('This is not a Swissquote recovery card code');
  const blob = unb64(trimmed.slice(PREFIX.length));
  const key = await deriveKey(pin, blob.slice(0, 16));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(16, 28) }, key, blob.slice(28));
    return privateKeyToAccount(new TextDecoder().decode(pt) as Hex);
  } catch {
    throw new Error('Wrong PIN for this recovery card');
  }
}
