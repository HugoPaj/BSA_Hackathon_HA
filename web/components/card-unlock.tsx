'use client';
import { useState } from 'react';
import { RiLockUnlockLine } from '@remixicon/react';
import * as DigitInput from '@/components/ui/digit-input';
import * as Button from '@/components/ui/button';
import * as Label from '@/components/ui/label';
import * as Alert from '@/components/ui/alert';
import { unlockRecoveryCard } from '@/lib/card';
import type { CardSigner } from '@/lib/use-tx-flow';

export function CardUnlock({ onUnlocked, purpose }: { onUnlocked: (s: CardSigner & { address: string; signTypedData: (a: never) => Promise<`0x${string}`> }) => void; purpose: string }) {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3 rounded-xl bg-bg-weak-50 p-4">
      <div className="text-label-sm text-text-strong-950">{purpose}</div>
      <div className="space-y-1.5">
        <Label.Root htmlFor="card-code">Recovery card code</Label.Root>
        <textarea id="card-code" value={code} onChange={(e) => setCode(e.target.value)} rows={3} placeholder="SQRC1.…" className="w-full rounded-10 bg-bg-white-0 p-3 font-mono text-paragraph-xs text-text-strong-950 ring-1 ring-inset ring-stroke-soft-200 outline-none focus:ring-primary-base" />
      </div>
      <div className="space-y-1.5">
        <Label.Root>Card PIN</Label.Root>
        <DigitInput.Root numInputs={6} value={pin} onChange={setPin} inputType="password" />
      </div>
      {error && <Alert.Root status="error" variant="lighter" size="xsmall"><Alert.Icon />{error}</Alert.Root>}
      <Button.Root variant="neutral" mode="stroke" size="small" className="w-full" disabled={busy || pin.length < 6 || !code}
        onClick={async () => {
          setBusy(true); setError(null);
          try { onUnlocked((await unlockRecoveryCard(code, pin)) as never); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>
        <Button.Icon as={RiLockUnlockLine} />{busy ? 'Unlocking…' : 'Unlock card'}
      </Button.Root>
    </div>
  );
}
