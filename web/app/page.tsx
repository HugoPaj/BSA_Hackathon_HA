'use client';
import Link from 'next/link';
import {
  RiArrowRightSLine, RiBankLine, RiCoinsLine, RiExchangeLine, RiFileList3Line, RiFingerprintLine, RiGasStationLine,
  RiLineChartLine, RiShieldCheckFill, RiShieldKeyholeLine, RiWallet3Line,
} from '@remixicon/react';
import * as Button from '@/components/ui/button';
import * as Badge from '@/components/ui/badge';
import { LoginCard } from '@/components/login-card';
import { useSession } from '@/components/session';
import { SwissFlag } from '@/components/brand';
import { useWallet } from '@/lib/hooks';
import { formatNumber, formatUsdc, usdcToChf, toUnits } from '@/lib/format';
import { USDC_CHF } from '@/lib/config';

const MOCK_ACCOUNT = { trading: 55050.01, assets: 12000, cryptoCustodial: 10150.01, cash: 31000, buyingPower: 1000 };

export default function Home() {
  const { client, ready } = useSession();
  if (!ready) return null;
  return client ? <Dashboard /> : <Landing />;
}

function Landing() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_420px] lg:gap-16">
      <section className="animate-fade-in-up">
        <div className="text-subheading-xs uppercase tracking-wider text-primary-base">Swissquote self-custody wallet</div>
        <h1 className="sq-display mt-4 text-[40px] text-text-strong-950 md:text-[64px]">Your keys.<br /><span className="text-primary-base">Your control.</span></h1>
        <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-text-sub-600">
          A wallet only you can spend from, one tap from your Swissquote account. No seed phrase: your face or fingerprint signs.
          Lose your phone and Swissquote helps you recover, but can never move your money.
        </p>
        <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
          {[
            { icon: RiFingerprintLine, t: 'Passkey signs', d: 'Face ID, Touch ID, Windows Hello' },
            { icon: RiShieldKeyholeLine, t: 'Thief-proof recovery', d: 'Bank + your own factor + delay' },
            { icon: RiGasStationLine, t: 'No gas to buy', d: 'Swissquote sponsors the network fee' },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl bg-bg-white-0 p-4 ring-1 ring-inset ring-stroke-soft-200">
              <span className="grid size-9 place-items-center rounded-lg bg-primary-alpha-10 text-primary-base"><f.icon className="size-5" /></span>
              <div className="mt-3 text-label-sm text-text-strong-950">{f.t}</div>
              <div className="mt-0.5 text-paragraph-xs text-text-sub-600">{f.d}</div>
            </div>
          ))}
        </div>
      </section>
      <div className="space-y-3">
        <LoginCard subtitle="Use your Swissquote client login to open or manage your wallet." />
        <Link href="/recover" className="flex items-center justify-between rounded-2xl bg-bg-white-0 px-5 py-4 ring-1 ring-inset ring-stroke-soft-200 hover:bg-bg-weak-50">
          <span>
            <span className="block text-label-sm text-text-strong-950">Lost your device?</span>
            <span className="block text-paragraph-xs text-text-sub-600">Recover your wallet with a new passkey</span>
          </span>
          <RiArrowRightSLine className="size-5 text-text-soft-400" />
        </Link>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data } = useWallet(10000);
  const { client } = useSession();
  const wallet = data?.wallet;
  const usdc = data?.state?.usdc ?? 0n;
  const walletChf = toUnits(usdc) * USDC_CHF;
  const total = MOCK_ACCOUNT.trading + walletChf;

  return (
    <div className="mx-auto max-w-[1080px] space-y-8">
      <section className="text-center">
        <div className="text-paragraph-sm text-text-sub-600">Total value</div>
        <div className="mt-1 text-[34px] font-medium tracking-[-0.02em] text-text-strong-950 md:text-[44px]">
          {formatNumber(total)} <span className="text-[0.55em] text-text-soft-400">CHF</span>
        </div>
        <div className="mt-1 text-paragraph-xs text-text-soft-400">Welcome back, {client?.name.split(' ')[0]}. Trading account figures are mock data.</div>
      </section>

      {!wallet || !wallet.deployedAt ? (
        <section className="relative overflow-hidden rounded-3xl bg-primary-base p-6 text-static-white md:p-10">
          <div className="relative z-10 max-w-xl">
            <div className="text-subheading-xs uppercase tracking-wider text-static-white/80">New</div>
            <h2 className="sq-display mt-3 text-[34px] md:text-[52px]">Open your self-custody wallet</h2>
            <p className="mt-4 text-[17px] font-medium leading-snug text-static-white/90">Hold USDC in a wallet only you control. Set up in under a minute with a passkey. Recovery included, gas on us.</p>
            <Link href="/wallet/new" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-static-white px-5 text-label-md text-primary-base shadow-regular-md transition hover:bg-[#fff6f3]">
              {wallet ? 'Finish setting up' : 'Open self-custody wallet'} <RiArrowRightSLine className="size-5" />
            </Link>
          </div>
          <RiWallet3Line className="pointer-events-none absolute -bottom-10 -right-6 size-64 text-static-white/10 md:size-80" />
        </section>
      ) : (
        <Link href="/wallet" className="block rounded-3xl bg-bg-white-0 p-5 shadow-regular-xs ring-1 ring-inset ring-stroke-soft-200 transition hover:shadow-regular-md md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-label-sm text-text-sub-600"><RiWallet3Line className="size-[18px] text-primary-base" />Self-custody wallet</div>
              <div className="mt-2 text-title-h4 text-text-strong-950">{formatUsdc(usdc)} <span className="text-label-lg text-text-soft-400">USDC</span></div>
              <div className="text-paragraph-sm text-text-sub-600">≈ {usdcToChf(usdc)} CHF <SwissFlag /></div>
            </div>
            <RiArrowRightSLine className="size-6 text-text-soft-400" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge.Root color="green" variant="lighter" size="medium"><Badge.Icon as={RiShieldCheckFill} />Only you can spend</Badge.Root>
            {data?.recovery?.status === 'pending' && <Badge.Root color="yellow" variant="lighter" size="medium">Recovery pending</Badge.Root>}
            {wallet.proof && <Badge.Root color="blue" variant="lighter" size="medium">Ownership verified</Badge.Root>}
          </div>
        </Link>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-label-md text-text-strong-950">Trading 2162953</h3>
          <span className="text-paragraph-xs text-text-soft-400">Swissquote custody · mock</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { icon: RiLineChartLine, label: 'Assets', v: MOCK_ACCOUNT.assets },
            { icon: RiCoinsLine, label: 'Crypto (custodial)', v: MOCK_ACCOUNT.cryptoCustodial },
            { icon: RiBankLine, label: 'Cash', v: MOCK_ACCOUNT.cash },
            { icon: RiFileList3Line, label: 'Buying power', v: MOCK_ACCOUNT.buyingPower },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-bg-white-0 p-4 ring-1 ring-inset ring-stroke-soft-200">
              <div className="flex items-center justify-between text-paragraph-xs text-text-sub-600">
                <span className="flex items-center gap-1.5"><c.icon className="size-4 text-primary-base" />{c.label}</span>
                <RiArrowRightSLine className="size-4 text-text-soft-400" />
              </div>
              <div className="mt-2 text-label-lg text-text-strong-950">{formatNumber(c.v)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-information-lighter p-5 text-paragraph-sm text-text-strong-950">
          <div className="text-label-sm">Why a self-custody wallet at a bank?</div>
          <p className="mt-1 text-text-sub-600">Crypto here is held for you by Swissquote. The wallet is different: the key is a passkey on your device and Swissquote holds no key that can spend. You keep the convenience: fund it from your account, recover it with the bank&apos;s help.</p>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
          <div>
            <div className="text-label-sm text-text-strong-950">New phone or lost device?</div>
            <p className="mt-1 text-paragraph-sm text-text-sub-600">Replace your passkey without a seed phrase. Your own recovery factor and Swissquote both approve, then a safety delay runs.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button.Root asChild variant="neutral" mode="stroke" size="small"><Link href="/recover"><Button.Icon as={RiExchangeLine} />Recover access</Link></Button.Root>
            <Button.Root asChild variant="neutral" mode="ghost" size="small"><Link href="/backoffice">Swissquote operations view</Link></Button.Root>
          </div>
        </div>
      </section>
    </div>
  );
}
