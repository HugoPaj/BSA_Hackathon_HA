'use client';
// What this browser remembers. Only public data: credential IDs and public keys. Private keys stay in the authenticator.
import { useEffect, useState } from 'react';
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

/** This browser's record, kept in sync. undefined until localStorage is read, so nothing flashes on first render. */
export function useDevice() {
  const [device, setDevice] = useState<DeviceRecord | null | undefined>(undefined);
  useEffect(() => {
    const load = () => setDevice(loadDevice());
    load();
    window.addEventListener('sq-device', load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener('sq-device', load); window.removeEventListener('storage', load); };
  }, []);
  return device;
}

/** Whether this browser holds the wallet's current owner passkey, i.e. can sign for it. */
export function holdsPasskey(device: DeviceRecord | null | undefined, wallet: { address: string; owner: { credentialId: string } }) {
  return !!device && device.wallet.toLowerCase() === wallet.address.toLowerCase() && device.owner.credentialId === wallet.owner.credentialId;
}
