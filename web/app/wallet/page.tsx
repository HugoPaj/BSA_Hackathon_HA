'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatEther } from 'viem';
import {
  RiApps2Line, RiArrowLeftDownLine, RiArrowRightUpLine, RiBankLine, RiCheckLine, RiExternalLinkLine, RiFileCopyLine,
  RiFingerprintLine, RiShieldCheckFill, RiTimerLine, RiVerifiedBadgeLine,
} from '@remixicon/react';
import * as Button from '@/components/ui/button';
import * as Alert from '@/components/ui/alert';
import { RequireLogin } from '@/components/require-login';
import { ActivityList } from '@/components/activity-list';
import { RecoveryBanner } from '@/components/recovery-banner';
import { DeviceNotice } from '@/components/device-notice';
import { FundSheet } from '@/components/fund-sheet';
import { NoWallet } from '@/components/no-wallet';
import { Bone, BoneCard, BoneRow, Skeleton } from '@/components/skeleton';
import { QuickActions } from '@/components/quick-actions';
import { WalletBalanceChart } from '@/components/wallet-chart';
import { useActivity, useWallet } from '@/lib/hooks';
import { formatUsdc, shortAddress, usdcToChf } from '@/lib/format';
import { CHAIN_NAME, EXPLORER, RECOVERY_DELAY_LABEL, RECOVERY_DELAY_PRODUCTION } from '@/lib/config';
import { cn } from '@/utils/cn';

export default function WalletPage() {
  return <RequireLogin subtitle="Log in to see your wallet."><WalletHome /></RequireLogin>;
}

function WalletHome() {
  const { data, refresh, loading } = useWallet();
  const activity = useActivity();
  const [fundOpen, setFundOpen] = useState(false);
  if (loading && !data) return <WalletSkeleton />;
  const wallet = data?.wallet;
  if (!wallet || !data?.state?.deployed) return <NoWallet started={!!wallet} />;
  const state = data.state;
  const isOwner = state.owners.some((o) => o.toLowerCase() === wallet.owner.signer.toLowerCase());

  const proof = wallet.proof;
  const factor = wallet.guardianB.type === 'card' ? 'recovery card' : 'recovery passkey on another device';

  return (
    <div className="mx-auto grid max-w-[1080px] gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <DeviceNotice wallet={wallet} />
        {state.recovery && <RecoveryBanner data={data} onChange={() => { refresh(); activity.refresh(); }} />}
        {!isOwner && <Alert.Root status="error" variant="lighter" size="large"><Alert.Icon />The owner on-chain differs from Swissquote&apos;s record. Refresh in a moment.</Alert.Root>}

        <section className="rounded-3xl bg-bg-white-0 p-5 shadow-regular-xs ring-1 ring-inset ring-stroke-soft-200 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-label-md text-text-strong-950">Self-custody wallet</h1>
            <CopyAddress address={wallet.address} />
          </div>
          <div className="mt-3 text-[32px] font-medium tabular-nums leading-tight tracking-[-0.01em] text-text-strong-950 md:text-[36px]">
            {formatUsdc(state.usdc)} <span className="text-[0.5em] text-text-soft-400">USDC</span>
          </div>
          <div className="mt-1 text-paragraph-sm text-text-sub-600">≈ {usdcToChf(state.usdc)} CHF</div>
          <WalletBalanceChart activity={activity.data} balance={state.usdc} className="mt-5" />
          <QuickActions className="mt-6" actions={[
            { icon: RiArrowRightUpLine, label: 'Send', href: '/wallet/send', primary: true },
            { icon: RiArrowLeftDownLine, label: 'Receive', href: '/wallet/receive' },
            { icon: RiBankLine, label: 'Add money', onClick: () => setFundOpen(true) },
            { icon: RiApps2Line, label: 'dApps', href: '/wallet/dapps' },
          ]} />
        </section>

        <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200 md:p-6">
          <h2 className="mb-1 text-label-md text-text-strong-950">Assets</h2>
          {[
            { icon: '/crypto/usdc.svg', sym: 'USDC', name: 'USD Coin', amount: `${formatUsdc(state.usdc)} USDC`, sub: `≈ ${usdcToChf(state.usdc)} CHF` },
            { icon: '/crypto/eth.svg', sym: 'ETH', name: 'For network fees', amount: state.eth ? `${Number(formatEther(state.eth)).toFixed(4)} ETH` : '0 ETH', sub: 'Gas sponsored by Swissquote' },
          ].map((r) => (
            <div key={r.sym} className="flex items-center gap-3 py-2.5">
              <Image src={r.icon} alt="" width={36} height={36} unoptimized className="size-9 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="text-label-md text-text-strong-950">{r.sym}</div>
                <div className="truncate text-paragraph-xs text-text-soft-400">{r.name}</div>
              </div>
              <div className="text-right">
                <div className="text-label-md tabular-nums text-text-strong-950">{r.amount}</div>
                <div className="text-paragraph-xs text-text-soft-400">{r.sub}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200 md:p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-label-md text-text-strong-950">Recent activity</h2>
            <Link href={`${EXPLORER}/address/${wallet.address}`} target="_blank" className="flex items-center gap-1 text-label-sm text-primary-base hover:underline">BaseScan <RiExternalLinkLine className="size-4" /></Link>
          </div>
          <ActivityList items={activity.data} empty="No activity yet. Add money from your Swissquote account to start." />
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
          <div className="flex items-center justify-between">
            <h2 className="text-label-md text-text-strong-950">Protection</h2>
            {state.recovery
              ? <span className="rounded-full bg-warning-lighter px-2 py-0.5 text-label-xs text-warning-dark">Recovery pending</span>
              : <span className="flex items-center gap-1 rounded-full bg-success-lighter px-2 py-0.5 text-label-xs text-success-base"><RiShieldCheckFill className="size-3.5" />Protected</span>}
          </div>
          <div className="mt-4 space-y-4">
            {[
              { icon: RiFingerprintLine, t: 'Only your passkey can spend', d: 'Your face or fingerprint signs every payment.' },
              {
                icon: RiBankLine, t: 'Swissquote can\'t move your money',
                d: wallet.guardianA.type === 'swissquote'
                  ? `It only helps with recovery, and only together with your ${factor}.`
                  : `It holds no key for this wallet. Recovery needs your trusted contact and your ${factor}.`,
              },
              { icon: RiTimerLine, t: 'Recoveries wait first', d: `${RECOVERY_DELAY_LABEL} here, ${RECOVERY_DELAY_PRODUCTION} in production. You can cancel one from this device.` },
            ].map((r) => (
              <div key={r.t} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-bg-weak-50 text-text-sub-600"><r.icon className="size-4" /></span>
                <div><div className="text-label-sm text-text-strong-950">{r.t}</div><div className="text-paragraph-xs text-text-sub-600">{r.d}</div></div>
              </div>
            ))}
            <div className="flex gap-3">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', proof ? 'bg-success-lighter text-success-base' : 'bg-warning-lighter text-warning-dark')}><RiVerifiedBadgeLine className="size-4" /></span>
              {proof
                ? <div><div className="text-label-sm text-text-strong-950">Ownership verified</div><div className="text-paragraph-xs text-text-sub-600">Proven with your passkey on {new Date(proof.verifiedAt).toLocaleDateString('de-CH')}.</div></div>
                : <div><div className="text-label-sm text-text-strong-950">Ownership not verified</div><Link href="/wallet/security#proof" className="text-paragraph-xs text-primary-base hover:underline">Sign the ownership proof</Link></div>}
            </div>
          </div>
          <Button.Root asChild variant="neutral" mode="stroke" size="small" className="mt-5 w-full"><Link href="/wallet/security">Security and recovery</Link></Button.Root>
        </section>

        <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
          <h2 className="mb-1 text-label-md text-text-strong-950">Wallet details</h2>
          <dl className="divide-y divide-stroke-soft-200 text-paragraph-sm">
            {[
              ['Network', CHAIN_NAME],
              ['Account', 'Safe smart account'],
              ['Network fees', 'Paid by Swissquote'],
              ['Opened', new Date(wallet.deployedAt ?? wallet.createdAt).toLocaleDateString('de-CH')],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3 py-2.5"><dt className="text-text-sub-600">{k}</dt><dd className="text-right text-text-strong-950">{v}</dd></div>
            ))}
          </dl>
        </section>
      </aside>

      <FundSheet open={fundOpen} onOpenChange={setFundOpen} verified={!!proof} onDone={() => { refresh(); activity.refresh(); }} />
    </div>
  );
}

/** Mirrors WalletHome's layout, so nothing jumps when the data arrives. */
function WalletSkeleton() {
  return (
    <Skeleton className="mx-auto grid max-w-[1080px] gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <BoneCard className="shadow-regular-xs">
          <div className="flex items-center justify-between gap-3"><Bone className="h-5 w-36" /><Bone className="h-6 w-28 rounded-full" /></div>
          <Bone className="mt-4 h-9 w-52" />
          <Bone className="mt-2 h-4 w-24" />
          <Bone className="mt-5 h-[132px] w-full rounded-xl" />
          <div className="mt-6 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col items-center gap-2"><Bone className="size-[52px] rounded-full" /><Bone className="h-4 w-12" /></div>)}
          </div>
        </BoneCard>
        <BoneCard><Bone className="mb-2 h-5 w-16" /><BoneRow /><BoneRow /></BoneCard>
        <BoneCard><Bone className="mb-2 h-5 w-32" /><BoneRow /><BoneRow /><BoneRow /></BoneCard>
      </div>
      <aside className="space-y-6">
        <BoneCard className="md:p-5">
          <div className="flex items-center justify-between"><Bone className="h-5 w-24" /><Bone className="h-5 w-20 rounded-full" /></div>
          <div className="mt-4 space-y-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="flex gap-3"><Bone className="size-8 shrink-0 rounded-lg" /><div className="flex-1 space-y-1.5"><Bone className="h-3.5 w-3/4" /><Bone className="h-3 w-full" /></div></div>)}
          </div>
          <Bone className="mt-5 h-9 w-full rounded-lg" />
        </BoneCard>
        <BoneCard className="md:p-5">
          <Bone className="mb-3 h-5 w-28" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="flex justify-between py-2.5"><Bone className="h-3.5 w-20" /><Bone className="h-3.5 w-24" /></div>)}
        </BoneCard>
      </aside>
    </Skeleton>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      title="Copy wallet address"
      className="flex items-center gap-1.5 rounded-full bg-bg-weak-50 py-1 pl-3 pr-2.5 text-paragraph-xs text-text-sub-600 transition hover:bg-bg-soft-200 active:scale-[0.97]"
    >
      <span className="font-mono">{shortAddress(address)}</span>
      {copied ? <RiCheckLine className="size-3.5 text-success-base" /> : <RiFileCopyLine className="size-3.5" />}
    </button>
  );
}
