'use client';
import { useEffect, useState } from 'react';
import * as Alert from '@/components/ui/alert';
import { loadDevice, type DeviceRecord } from '@/lib/device';

/** Shown on a device whose passkey a recovery replaced: it can still read the wallet but can no longer sign. */
export function ReplacedDeviceNotice({ wallet }: { wallet: { address: string; owner: { credentialId: string } } }) {
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  useEffect(() => {
    const load = () => setDevice(loadDevice());
    load();
    window.addEventListener('sq-device', load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener('sq-device', load); window.removeEventListener('storage', load); };
  }, []);
  if (!device || device.wallet.toLowerCase() !== wallet.address.toLowerCase() || device.owner.credentialId === wallet.owner.credentialId) return null;
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
