'use client';
// What this browser remembers. Only public data: credential IDs and public keys. Private keys stay in the authenticator.
import { parse, stringify } from './json';

export type DeviceRecord = {
  clientId: string;
  wallet: string;
  owner: { credentialId: string; x: bigint; y: bigint };
  createdAt: number;
};
const KEY = 'sq.device.v1';

export function loadDevice(): DeviceRecord | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  return raw ? parse<DeviceRecord>(raw) : null;
}

export function saveDevice(d: DeviceRecord) {
  localStorage.setItem(KEY, stringify(d));
  window.dispatchEvent(new Event('sq-device'));
}

export function forgetDevice() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('sq-device'));
}
