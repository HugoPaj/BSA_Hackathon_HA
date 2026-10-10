'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as Alert from '@/components/ui/alert';
import { loadDevice, type DeviceRecord } from '@/lib/device';

/**
 * Tells the client when this browser can read the wallet but not sign for it: either it never held the passkey
 * (logged in on a new device), or a recovery replaced its passkey with one on another device.
 */
export function DeviceNotice({ wallet }: { wallet: { address: string; owner: { credentialId: string } } }) {
  // undefined until localStorage is read, so the notice doesn't flash on devices that do hold the passkey.
  const [device, setDevice] = useState<DeviceRecord | null | undefined>(undefined);
  useEffect(() => {
    const load = () => setDevice(loadDevice());
    load();
    window.addEventListener('sq-device', load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener('sq-device', load); window.removeEventListener('storage', load); };
  }, []);
  if (device === undefined) return null;
  const sameWallet = !!device && device.wallet.toLowerCase() === wallet.address.toLowerCase();
  if (sameWallet && device.owner.credentialId === wallet.owner.credentialId) return null;
  if (sameWallet) {
    return (
      <Alert.Root status="warning" variant="lighter" size="large">
        <Alert.Icon />
        <div>
          <div className="text-label-sm">This device&apos;s passkey was replaced</div>
          <div className="mt-0.5">A recovery made a passkey on another device the owner of this wallet, so this device can no longer sign. If that wasn&apos;t you, contact Swissquote right away.</div>
        </div>
      </Alert.Root>
    );
  }
  return (
    <Alert.Root status="information" variant="lighter" size="large">
      <Alert.Icon />
      <div>
        <div className="text-label-sm">View only on this device</div>
        <div className="mt-0.5">Your Swissquote login shows the balance and history, but only your wallet passkey can move funds, and this device doesn&apos;t hold it. Use the device you set the wallet up on, or <Link href="/recover" className="font-medium underline">recover the wallet</Link> to make a passkey here.</div>
      </div>
    </Alert.Root>
  );
}
