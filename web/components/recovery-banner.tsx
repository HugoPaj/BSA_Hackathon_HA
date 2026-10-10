'use client';
import { useState } from 'react';
import { RiCloseCircleLine, RiErrorWarningFill } from '@remixicon/react';
import * as Button from '@/components/ui/button';
import * as ProgressBar from '@/components/ui/progress-bar';
import { TxSheet } from './tx-sheet';
import { useNow } from '@/lib/hooks';
import { useTxFlow } from '@/lib/use-tx-flow';
import { cancelRecoveryTx } from '@/lib/chain';
import { formatDuration, shortAddress } from '@/lib/format';
import type { WalletData } from '@/lib/hooks';

/** Shown on every wallet screen while a recovery is pending on-chain. The current passkey can cancel it. */
export function RecoveryBanner({ data, onChange }: { data: WalletData; onChange: () => void }) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const wallet = data.wallet!;
  const flow = useTxFlow({ wallet, deployed: true });
  const rec = data.state?.recovery;
  if (!rec) return null;
  const left = Number(rec.executeAfter) - now / 1000;
  const started = data.recovery?.createdAt ? (data.recovery.executeAfter ?? 0) - data.recovery.createdAt / 1000 : 180;
  const txs = [cancelRecoveryTx()];
  return (
    <div className="rounded-2xl bg-warning-lighter p-4 ring-1 ring-inset ring-warning-light md:p-5">
      <div className="flex items-start gap-3">
        <RiErrorWarningFill className="mt-0.5 size-5 shrink-0 text-warning-base" />
        <div className="min-w-0 flex-1">
          <div className="text-label-md text-text-strong-950">A recovery was requested for your wallet</div>
          <p className="mt-1 text-paragraph-sm text-text-sub-600">
            Both guardians approved a new passkey ({shortAddress(rec.newOwners[0])}). {left > 0 ? <>It takes over in <b className="text-text-strong-950">{formatDuration(left)}</b>.</> : 'The delay is over: it can be finalised now.'} If this wasn&apos;t you, cancel it now. Only a device that still holds your passkey can.
          </p>
          <ProgressBar.Root className="mt-3" color="orange" value={Math.max(0, started - left)} max={started} />
          <Button.Root variant="error" mode="stroke" size="small" className="mt-4" onClick={() => { setOpen(true); flow.prepare(txs, { type: 'security', title: 'Recovery cancelled with your passkey' }); }}>
            <Button.Icon as={RiCloseCircleLine} />This wasn&apos;t me, cancel recovery
          </Button.Root>
        </div>
      </div>
      <TxSheet open={open} onOpenChange={setOpen} flow={flow} title="Cancel recovery" txs={txs} guardianType={wallet.guardianB.type} onDone={onChange} confirmLabel="Cancel with passkey"
        headline={<p className="text-paragraph-sm text-text-sub-600">Your passkey signs <span className="font-mono text-paragraph-xs">cancelRecovery()</span> on the recovery module. The request is deleted and the guardians must start over. Security actions are always free.</p>} />
    </div>
  );
}
