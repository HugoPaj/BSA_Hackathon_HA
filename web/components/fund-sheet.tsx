'use client';
import { useState } from 'react';
import { RiExternalLinkLine } from '@remixicon/react';
import * as Alert from '@/components/ui/alert';
import * as Button from '@/components/ui/button';
import * as FancyButton from '@/components/ui/fancy-button';
import { api } from '@/lib/api';
import { EXPLORER } from '@/lib/config';
import { formatUsdc, toUnits } from '@/lib/format';
import { recordWalletTransfer } from '@/lib/market';
import { cn } from '@/utils/cn';
import { Sheet } from './sheet';

/** Moves testnet USDC from the demo treasury (standing in for the trading account) to the wallet. */
export function FundSheet({ open, onOpenChange, verified, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; verified: boolean; onDone: () => void }) {
  const [amount, setAmount] = useState(5_000_000n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setTx(null); setError(null); } }} title="Add money from Swissquote" dismissable={!busy}>
      {tx ? (
        <div className="space-y-4 text-center">
          <div className="text-title-h5 text-text-strong-950">{formatUsdc(amount)} USDC on its way</div>
          <a className="inline-flex items-center gap-1 text-label-sm text-primary-base hover:underline" href={`${EXPLORER}/tx/${tx}`} target="_blank">View on BaseScan <RiExternalLinkLine className="size-4" /></a>
          <Button.Root variant="neutral" mode="stroke" className="w-full" onClick={() => { onOpenChange(false); setTx(null); onDone(); }}>Close</Button.Root>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-bg-weak-50 p-3 text-paragraph-sm text-text-sub-600">From <b className="text-text-strong-950">Trading 2162953</b> to your self-custody wallet. Testnet USDC from the demo treasury stands in for the bank&apos;s crypto desk.</div>
          <div className="grid grid-cols-3 gap-2">
            {[1_000_000n, 5_000_000n, 10_000_000n].map((a) => (
              <button key={a.toString()} onClick={() => setAmount(a)} className={cn('h-14 rounded-xl text-label-md ring-1 ring-inset transition', amount === a ? 'bg-primary-alpha-10 text-primary-dark ring-primary-base' : 'bg-bg-white-0 text-text-strong-950 ring-stroke-soft-200 hover:bg-bg-weak-50')}>{formatUsdc(a)}</button>
            ))}
          </div>
          {verified
            ? <Alert.Root status="success" variant="lighter" size="small"><Alert.Icon />Destination ownership verified automatically via your passkey proof. No manual wallet check needed.</Alert.Root>
            : <Alert.Root status="warning" variant="lighter" size="small"><Alert.Icon />Ownership not verified yet. In production Swissquote would ask for the passkey proof first.</Alert.Root>}
          {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
          <FancyButton.Root variant="primary" className="h-12 w-full" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try {
              setTx((await api<{ txHash: string }>('/api/fund', { amount })).txHash);
              recordWalletTransfer(toUnits(amount));
            } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}>{busy ? 'Transferring…' : `Transfer ${formatUsdc(amount)} USDC`}</FancyButton.Root>
        </div>
      )}
    </Sheet>
  );
}
