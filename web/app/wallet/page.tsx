'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  RiApps2Line, RiArrowLeftDownLine, RiArrowRightSLine, RiArrowRightUpLine, RiBankLine, RiExternalLinkLine, RiFileCopyLine,
  RiShieldCheckFill, RiShieldKeyholeLine, RiVerifiedBadgeFill, RiKey2Line, RiBankFill, RiUserForbidLine,
} from '@remixicon/react';
import * as Badge from '@/components/ui/badge';
import * as Button from '@/components/ui/button';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Alert from '@/components/ui/alert';
import { RequireLogin } from '@/components/require-login';
import { ActivityList } from '@/components/activity-list';
import { RecoveryBanner } from '@/components/recovery-banner';
import { Sheet } from '@/components/sheet';
import { SwissFlag } from '@/components/brand';
import { useActivity, useWallet } from '@/lib/hooks';
import { api } from '@/lib/api';
import { formatUsdc, shortAddress, usdcToChf } from '@/lib/format';
import { EXPLORER, RECOVERY_DELAY_LABEL } from '@/lib/config';
import { cn } from '@/utils/cn';

export default function WalletPage() {
  return <RequireLogin subtitle="Log in to see your wallet."><WalletHome /></RequireLogin>;
}

function WalletHome() {
  const { data, refresh, loading } = useWallet();
  const activity = useActivity();
  const [fundOpen, setFundOpen] = useState(false);
  if (loading && !data) return <div className="mx-auto h-64 max-w-[1080px] animate-pulse rounded-3xl bg-bg-white-0" />;
  const wallet = data?.wallet;
  if (!wallet || !data?.state?.deployed) {
    return (
      <div className="mx-auto max-w-[480px] rounded-3xl bg-bg-white-0 p-8 text-center ring-1 ring-inset ring-stroke-soft-200">
        <h1 className="text-title-h5 text-text-strong-950">{wallet ? 'Finish setting up your wallet' : 'No wallet yet'}</h1>
        <p className="mt-2 text-paragraph-sm text-text-sub-600">Create a passkey-controlled wallet next to your Swissquote account. It takes under a minute.</p>
        <Button.Root asChild className="mt-6"><Link href="/wallet/new">Open self-custody wallet</Link></Button.Root>
      </div>
    );
  }
  const state = data.state;
  const isOwner = state.owners.some((o) => o.toLowerCase() === wallet.owner.signer.toLowerCase());

  return (
    <div className="mx-auto grid max-w-[1080px] gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {state.recovery && <RecoveryBanner data={data} onChange={() => { refresh(); activity.refresh(); }} />}
        {!isOwner && <Alert.Root status="error" variant="lighter" size="large"><Alert.Icon />The owner on-chain differs from Swissquote&apos;s record. Refresh in a moment.</Alert.Root>}

        <section className="rounded-3xl bg-bg-white-0 p-6 text-center shadow-regular-xs ring-1 ring-inset ring-stroke-soft-200 md:p-8">
          <div className="text-paragraph-sm text-text-sub-600">Self-custody balance</div>
          <div className="mt-1 text-[40px] font-medium leading-tight tracking-[-0.02em] text-text-strong-950 md:text-[48px]">{formatUsdc(state.usdc)} <span className="text-[0.5em] text-text-soft-400">USDC</span></div>
          <div className="text-paragraph-sm text-text-sub-600">≈ {usdcToChf(state.usdc)} CHF <SwissFlag /> <span className="text-text-soft-400">indicative</span></div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge.Root color="green" variant="lighter" size="medium"><Badge.Icon as={RiShieldCheckFill} />Only you can spend</Badge.Root>
            <Badge.Root color={state.recovery ? 'yellow' : 'gray'} variant="lighter" size="medium"><Badge.Icon as={RiShieldKeyholeLine} />{state.recovery ? 'Recovery pending' : `Recovery on · ${state.guardians.length} guardians`}</Badge.Root>
            {wallet.proof ? <Badge.Root color="blue" variant="lighter" size="medium"><Badge.Icon as={RiVerifiedBadgeFill} />Ownership verified</Badge.Root>
              : <Link href="/wallet/security#proof"><Badge.Root color="orange" variant="lighter" size="medium">Verify ownership</Badge.Root></Link>}
          </div>
          <div className="mx-auto mt-6 grid max-w-md grid-cols-4 gap-2">
            {[
              { href: '/wallet/send', icon: RiArrowRightUpLine, label: 'Send', primary: true },
              { href: '/wallet/receive', icon: RiArrowLeftDownLine, label: 'Receive' },
              { onClick: () => setFundOpen(true), icon: RiBankLine, label: 'Add money' },
              { href: '/wallet/dapps', icon: RiApps2Line, label: 'dApps' },
            ].map((a) => {
              const inner = (
                <>
                  <span className={cn('grid size-12 place-items-center rounded-full transition', a.primary ? 'bg-primary-base text-static-white group-hover:bg-primary-darker' : 'bg-[#323232] text-static-white group-hover:bg-black')}><a.icon className="size-5" /></span>
                  <span className="text-label-xs text-text-strong-950">{a.label}</span>
                </>
              );
              return a.href
                ? <Link key={a.label} href={a.href} className="group flex flex-col items-center gap-2">{inner}</Link>
                : <button key={a.label} onClick={a.onClick} className="group flex flex-col items-center gap-2">{inner}</button>;
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200 md:p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-subheading-xs uppercase tracking-wider text-text-sub-600">Recent activity</h2>
            <Link href={`${EXPLORER}/address/${wallet.address}`} target="_blank" className="flex items-center gap-1 text-label-xs text-primary-base hover:underline">BaseScan <RiExternalLinkLine className="size-3.5" /></Link>
          </div>
          <ActivityList items={activity.data} empty="No activity yet. Add money from your Swissquote account to start." />
        </section>
      </div>

      <aside className="space-y-4">
        <div className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
          <div className="text-subheading-xs uppercase tracking-wider text-text-sub-600">Wallet address</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="font-mono text-paragraph-sm text-text-strong-950">{shortAddress(wallet.address)}</span>
            <Button.Root variant="neutral" mode="ghost" size="xxsmall" onClick={() => navigator.clipboard.writeText(wallet.address)}><Button.Icon as={RiFileCopyLine} />Copy</Button.Root>
          </div>
          <div className="mt-1 text-paragraph-xs text-text-soft-400">Safe smart account · Base Sepolia</div>
        </div>
        <Link href="/wallet/security" className="block rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200 hover:bg-bg-weak-50">
          <div className="flex items-center justify-between"><span className="text-subheading-xs uppercase tracking-wider text-text-sub-600">Who can do what</span><RiArrowRightSLine className="size-5 text-text-soft-400" /></div>
          <div className="mt-3 space-y-3">
            {[
              { icon: RiKey2Line, t: 'Your passkey', d: 'Spends, cancels recovery, changes guardians' },
              { icon: RiBankFill, t: 'Swissquote', d: 'Cannot spend. Approves recovery only with Guardian B' },
              { icon: RiShieldKeyholeLine, t: wallet.guardianB.label, d: 'Cannot spend. Approves recovery only with Guardian A' },
              { icon: RiUserForbidLine, t: 'Anyone else', d: `Nothing. Recoveries wait ${RECOVERY_DELAY_LABEL} (3 days in production)` },
            ].map((r) => (
              <div key={r.t} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-bg-weak-50 text-text-sub-600"><r.icon className="size-4" /></span>
                <div><div className="text-label-sm text-text-strong-950">{r.t}</div><div className="text-paragraph-xs text-text-sub-600">{r.d}</div></div>
              </div>
            ))}
          </div>
        </Link>
      </aside>

      <FundSheet open={fundOpen} onOpenChange={setFundOpen} verified={!!wallet.proof} onDone={() => { refresh(); activity.refresh(); }} />
    </div>
  );
}

function FundSheet({ open, onOpenChange, verified, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; verified: boolean; onDone: () => void }) {
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
            try { setTx((await api<{ txHash: string }>('/api/fund', { amount })).txHash); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}>{busy ? 'Transferring…' : `Transfer ${formatUsdc(amount)} USDC`}</FancyButton.Root>
        </div>
      )}
    </Sheet>
  );
}
