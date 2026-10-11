'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { MetaTransaction } from 'abstractionkit';
import {
  RiArrowRightUpLine, RiCheckLine, RiExternalLinkLine, RiFingerprintLine, RiGasStationFill, RiLoader4Line, RiShieldKeyholeLine,
} from '@remixicon/react';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Button from '@/components/ui/button';
import * as Badge from '@/components/ui/badge';
import * as Alert from '@/components/ui/alert';
import { Sheet } from './sheet';
import { ChecksList } from './checks';
import { CardUnlock } from './card-unlock';
import { factorName, type GuardianB } from '@/lib/chain';
import type { useTxFlow, CardSigner } from '@/lib/use-tx-flow';
import { formatUsdc } from '@/lib/format';
import { CHAIN_NAME, EXPLORER } from '@/lib/config';

type Flow = ReturnType<typeof useTxFlow>;

export function TxSheet({ open, onOpenChange, flow, title, headline, txs, guardianType, onDone, confirmLabel = 'Confirm with passkey' }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  flow: Flow;
  title: string;
  headline?: React.ReactNode;
  txs: MetaTransaction[];
  guardianType: GuardianB['type'];
  onDone?: () => void;
  confirmLabel?: string;
}) {
  const { phase, evaluation, error, txHash } = flow;
  const [card, setCard] = useState<CardSigner | null>(null);
  const busy = ['preparing', 'stepup', 'signing', 'submitting', 'confirming'].includes(phase);
  const stepUp = evaluation?.decision === 'step-up';
  const total = evaluation ? evaluation.outgoing + evaluation.fee : 0n;
  // A failed simulation means the transaction would revert whoever pays the gas, so there is no self-paid fallback.
  const simFail = evaluation?.checks.find((c) => c.id === 'simulation' && c.status === 'fail');
  const wouldRevert = !!simFail;

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o && phase === 'done') onDone?.(); }} title={title} dismissable={!busy}>
      {phase === 'done' ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-success-lighter text-success-base"><RiCheckLine className="size-8" /></span>
          <div className="mt-4 text-title-h5 text-text-strong-950">Done</div>
          <p className="mt-1 text-paragraph-sm text-text-sub-600">Signed with your passkey and confirmed on {CHAIN_NAME}.</p>
          {txHash && (
            <Link href={`${EXPLORER}/tx/${txHash}`} target="_blank" className="mt-4 inline-flex items-center gap-1.5 text-label-sm text-primary-base hover:underline">
              View on BaseScan <RiExternalLinkLine className="size-4" />
            </Link>
          )}
          <Button.Root className="mt-6 w-full" variant="neutral" mode="stroke" onClick={() => { onOpenChange(false); onDone?.(); }}>Close</Button.Root>
        </div>
      ) : (
        <div className="space-y-4">
          {headline}

          {evaluation && (
            <div className="divide-y divide-stroke-soft-200 rounded-xl ring-1 ring-inset ring-stroke-soft-200">
              {evaluation.effects.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-paragraph-sm">
                  <span className="text-text-sub-600">{e.label}</span>
                  {e.amount !== undefined && <span className="shrink-0 text-label-sm text-text-strong-950">−{formatUsdc(e.amount)} USDC</span>}
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2.5 text-paragraph-sm">
                <span className="text-text-sub-600">Network fee</span>
                {evaluation.decision === 'decline'
                  ? <Badge.Root color="gray" variant="lighter" size="medium">Not sponsored</Badge.Root>
                  : <Badge.Root color="orange" variant="lighter" size="medium"><Badge.Icon as={RiGasStationFill} />Sponsored by Swissquote</Badge.Root>}
              </div>
              {total > 0n && (
                <div className="flex items-center justify-between px-3 py-3">
                  <span className="text-label-sm text-text-strong-950">Total</span>
                  <span className="text-label-md text-text-strong-950">{formatUsdc(total)} USDC</span>
                </div>
              )}
            </div>
          )}

          {(evaluation || phase !== 'error') && <ChecksList evaluation={evaluation} plan={flow.plan} checks={flow.checks} checking={flow.checking} collapsePassed />}

          {phase === 'declined' && evaluation && (
            <Alert.Root status="error" variant="lighter" size="small">
              <Alert.Icon />
              {evaluation.reason === simFail?.detail ? (
                <div>
                  <div className="text-label-sm">This transaction would fail</div>
                  <div className="mt-0.5">{simFail?.detail}. Nothing was signed or sent.</div>
                </div>
              ) : (
                <div>
                  <div className="text-label-sm">Swissquote won&apos;t sponsor this</div>
                  <div className="mt-0.5">{evaluation.reason}. {simFail ? `It would also fail on-chain: ${simFail.detail}.` : 'You keep full control: you can still send it and pay the network fee yourself in ETH.'}</div>
                </div>
              )}
            </Alert.Root>
          )}
          {error && phase === 'error' && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}

          {stepUp && phase === 'review' && guardianType === 'card' && (card
            ? <Alert.Root status="success" variant="lighter" size="small"><Alert.Icon />Recovery card unlocked. It co-signs when you confirm.</Alert.Root>
            : <CardUnlock onUnlocked={setCard} purpose="Confirm this high-value transfer" />)}

          <StatusLine phase={phase} stepUp={stepUp} guardianType={guardianType} />

          {phase === 'review' && (
            <div className="space-y-2">
              <FancyButton.Root variant="primary" className="h-12 w-full" disabled={stepUp && guardianType === 'card' && !card} onClick={() => flow.confirm(card ?? undefined)}>
                <FancyButton.Icon as={RiFingerprintLine} />
                {stepUp ? (guardianType === 'passkey' ? 'Confirm with both devices' : 'Confirm with card and passkey') : confirmLabel}
              </FancyButton.Root>
              <p className="text-center text-paragraph-xs text-text-soft-400">
                {stepUp ? `High-value: your ${factorName(guardianType)} confirms first, then your passkey signs.` : 'Face ID, Touch ID, Windows Hello or your device PIN.'}
              </p>
            </div>
          )}
          {!wouldRevert && (phase === 'declined' || (phase === 'error' && evaluation?.decision === 'decline')) && (
            <Button.Root variant="neutral" mode="stroke" className="w-full" onClick={() => flow.payOwnGas(txs)}>
              <Button.Icon as={RiArrowRightUpLine} />Send anyway, I pay gas in ETH
            </Button.Root>
          )}
          {((phase === 'error' && evaluation?.decision !== 'decline') || (phase === 'declined' && wouldRevert)) && (
            <Button.Root variant="neutral" mode="stroke" className="w-full" onClick={() => onOpenChange(false)}>Close</Button.Root>
          )}
        </div>
      )}
    </Sheet>
  );
}

// No line while preparing: the checks list above already shows Swissquote's progress.
function StatusLine({ phase, stepUp, guardianType }: { phase: string; stepUp: boolean; guardianType: string }) {
  const text: Record<string, string> = {
    stepup: `Confirm on your ${guardianType === 'passkey' ? 'recovery device (choose “use another device” if asked)' : 'recovery card'}…`,
    signing: 'Approve with your passkey…',
    submitting: 'Sending to the network…',
    confirming: `Waiting for ${CHAIN_NAME} to confirm…`,
  };
  if (!text[phase]) return null;
  const Icon = phase === 'signing' ? RiFingerprintLine : phase === 'stepup' && stepUp ? RiShieldKeyholeLine : RiLoader4Line;
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl bg-bg-weak-50 py-3 text-label-sm text-text-sub-600">
      <Icon className={phase === 'signing' || phase === 'stepup' ? 'size-5 animate-pulse text-primary-base' : 'size-5 animate-spin'} />
      {text[phase]}
    </div>
  );
}
