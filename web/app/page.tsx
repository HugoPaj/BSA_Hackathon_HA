'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  RiArrowLeftRightLine, RiArrowRightLine, RiArrowRightSLine, RiBankCardLine, RiCoinsLine, RiExchangeLine, RiFingerprintLine,
  RiHandCoinLine, RiLineChartLine, RiListUnordered, RiScales3Line, RiShieldCheckFill, RiTimeLine, RiUser3Line, RiWallet3Line,
} from '@remixicon/react';
import * as Button from '@/components/ui/button';
import * as SegmentedControl from '@/components/ui/segmented-control';
import { LoginForm } from '@/components/login-card';
import { SplitHeadline, SplitScreen } from '@/components/split-screen';
import { useSession } from '@/components/session';
import { SqMark, SwissFlag } from '@/components/brand';
import { AreaChart, Sparkline } from '@/components/charts';
import { FundSheet } from '@/components/fund-sheet';
import { ChangePill, InstrumentLogo, InstrumentRow, PeriodControl, formatChartTime } from '@/components/market-ui';
import { QuickActions } from '@/components/quick-actions';
import { TradeSheet } from '@/components/trade-sheet';
import { WalletSparkline } from '@/components/wallet-chart';
import { useActivity, useWallet } from '@/lib/hooks';
import { formatNumber, toUnits, usdcChf } from '@/lib/format';
import {
  INSTRUMENTS, PERIOD_LABEL, formatPrice, formatSigned, instrument, portfolioSeries, prevClose, priceSeries, useMarket, valuation,
  type Instrument, type MarketState, type Period, type Point,
} from '@/lib/market';
import { Bone, BoneCard, Skeleton } from '@/components/skeleton';
import { cn } from '@/utils/cn';
import { Num, PctNum, SignedNum } from '@/components/num';

export default function Home() {
  const { signedIn } = useSession();
  return signedIn ? <Dashboard /> : <Landing />;
}

function Landing() {
  const [tab, setTab] = useState<'signin' | 'recover'>('signin');
  const copy = tab === 'signin'
    ? { title: 'Welcome back', sub: 'Log in with your Swissquote client number to open or manage your wallet.' }
    : { title: 'Recover your wallet', sub: 'Lost your device? Replace your passkey without a seed phrase. Same address, same funds.' };
  return (
    <SplitScreen
      image="/landing/hero.webp"
      art={<SplitHeadline>Your keys.<br /><span className="text-primary-base">Your control.</span></SplitHeadline>}
    >
      <div className="m-auto w-full max-w-[400px] animate-fade-in-up">
        <div className="text-center">
          <SqMark className="mx-auto size-10" />
          <h2 className="mt-5 text-title-h4 text-text-strong-950">{copy.title}</h2>
          <p className="mx-auto mt-2 max-w-[340px] text-paragraph-sm text-text-sub-600">{copy.sub}</p>
        </div>
        <SegmentedControl.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-7">
          <SegmentedControl.List>
            <SegmentedControl.Trigger value="signin" className="h-8">Log in</SegmentedControl.Trigger>
            <SegmentedControl.Trigger value="recover" className="h-8">Recover access</SegmentedControl.Trigger>
          </SegmentedControl.List>
          <SegmentedControl.Content value="signin" className="mt-6 animate-fade-in-up outline-none">
            <LoginForm />
          </SegmentedControl.Content>
          <SegmentedControl.Content value="recover" className="mt-6 animate-fade-in-up outline-none">
            <RecoverPanel />
          </SegmentedControl.Content>
        </SegmentedControl.Root>
      </div>
      <div className="mt-10 flex items-center justify-center gap-2 text-paragraph-xs text-text-soft-400">
        <SwissFlag className="size-3" /> Swiss bank, self-custody wallet
      </div>
    </SplitScreen>
  );
}

function RecoverPanel() {
  const steps = [
    { icon: RiUser3Line, t: 'Log in to Swissquote', d: 'Your usual e-banking login, on the new device.' },
    { icon: RiFingerprintLine, t: 'Create a new passkey', d: 'Face ID, Touch ID or Windows Hello on this device.' },
    { icon: RiTimeLine, t: 'Approve, then a safety delay', d: 'Your recovery factor and Swissquote both sign. Your old device can cancel.' },
  ];
  return (
    <div>
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-3 rounded-2xl p-3 transition hover:bg-bg-weak-50">
            <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-primary-alpha-10 text-primary-base">
              <s.icon className="size-[18px]" />
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-bg-white-0 text-[10px] font-medium text-text-sub-600 ring-1 ring-stroke-soft-200">{i + 1}</span>
            </span>
            <span>
              <span className="block text-label-sm text-text-strong-950">{s.t}</span>
              <span className="block text-paragraph-xs text-text-sub-600">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button.Root asChild className="mt-5 w-full">
        <Link href="/recover">Start recovery<Button.Icon as={RiArrowRightLine} /></Link>
      </Button.Root>
    </div>
  );
}

function Dashboard() {
  const { data, loading, refresh } = useWallet(10000);
  const activity = useActivity(15000);
  const s = useMarket();
  const [fundOpen, setFundOpen] = useState(false);
  const wallet = data?.wallet;
  const deployed = !!wallet?.deployedAt;
  // Until the first wallet fetch resolves we don't know whether it exists, so render neither the
  // setup banner nor the wallet card; otherwise set-up users see the banner flash on every load.
  const unknown = loading && !data;
  const usdc = data?.state?.usdc ?? 0n;
  const onFund = deployed ? () => setFundOpen(true) : undefined;
  const actions = [
    { icon: RiArrowLeftRightLine, label: 'Open orders', href: '/trade/orders', badge: s.portfolio.orders.filter((o) => o.status === 'open').length },
    { icon: RiListUnordered, label: 'Transactions', href: '/trade/orders?tab=transactions' },
    { icon: RiHandCoinLine, label: 'Fund wallet', href: onFund ? undefined : '/wallet/new', onClick: onFund },
  ];

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      {!unknown && !deployed && (
        <section className="relative overflow-hidden rounded-3xl bg-primary-base p-6 text-static-white md:p-10">
          <div className="relative z-10 max-w-xl">
            <div className="text-subheading-xs uppercase tracking-wider text-static-white/80">New</div>
            <h2 className="sq-display mt-3 text-[34px] md:text-[52px]">Open your self-custody wallet</h2>
            <p className="mt-4 text-[17px] font-medium leading-snug text-static-white/90">Hold USDC in a wallet only you control. Set up in under a minute with a passkey. Recovery included, gas on us.</p>
            <Link href="/wallet/new" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-static-white px-5 text-label-md text-primary-base shadow-regular-md transition hover:bg-[#fff6f3] active:scale-[0.97]">
              {wallet ? 'Finish setting up' : 'Open self-custody wallet'} <RiArrowRightSLine className="size-5" />
            </Link>
          </div>
          <RiWallet3Line className="pointer-events-none absolute -bottom-10 -right-6 size-64 text-static-white/10 md:size-80" />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <TradingCard s={s} />
        <aside className="flex flex-col gap-6">
          {unknown && (
            <Skeleton className="flex flex-1">
              <BoneCard className="flex min-h-[220px] flex-1 flex-col md:p-5">
                <div className="flex items-center justify-between"><Bone className="h-4 w-36" /><Bone className="size-5 rounded-full" /></div>
                <Bone className="mt-4 h-7 w-40" />
                <Bone className="mt-2 h-4 w-20" />
                <Bone className="mt-3 min-h-14 w-full flex-1 rounded-xl" />
                <Bone className="mt-3 h-4 w-32" />
              </BoneCard>
            </Skeleton>
          )}
          {deployed && wallet && (
            <Link href="/wallet" className="flex flex-1 flex-col rounded-3xl bg-bg-white-0 p-5 shadow-regular-xs ring-1 ring-inset ring-stroke-soft-200 transition hover:shadow-regular-md active:scale-[0.99]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-label-sm text-text-sub-600"><RiWallet3Line className="size-[18px] text-primary-base" />Self-custody wallet</span>
                <RiArrowRightSLine className="size-5 text-text-soft-400" />
              </div>
              <div className="mt-3 text-title-h4 tabular-nums text-text-strong-950"><Num value={toUnits(usdc)} /> <span className="text-label-lg text-text-soft-400">USDC</span></div>
              <div className="text-paragraph-sm text-text-sub-600">≈ <Num value={usdcChf(usdc)} /> CHF</div>
              <WalletSparkline activity={activity.data} balance={usdc} className="mt-3 min-h-14 w-full flex-1" />
              {data?.recovery?.status === 'pending'
                ? <div className="mt-auto pt-3 text-label-sm text-warning-dark">Recovery pending · review it</div>
                : <div className="mt-auto flex items-center gap-1 pt-3 text-label-sm text-success-base"><RiShieldCheckFill className="size-4" />Only you can spend</div>}
            </Link>
          )}
          <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
            <h2 className="mb-4 text-label-md text-text-strong-950">Quick actions</h2>
            <QuickActions actions={actions} className="md:grid md:gap-0 md:px-0" />
          </section>
          {/* The wallet card takes the space once it exists; until then the watchlist fills the column. */}
          {!unknown && !deployed && <Watchlist s={s} limit={4} className="flex-1" />}
        </aside>
      </div>

      <CryptoStrip s={s} />

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

      {deployed && <FundSheet open={fundOpen} onOpenChange={setFundOpen} verified={!!wallet?.proof} onDone={() => { refresh(); activity.refresh(); }} />}
    </div>
  );
}

const PORTFOLIO_PERIODS: Period[] = ['1W', '1M', '6M', '1Y', 'All'];

function TradingCard({ s }: { s: MarketState }) {
  const [period, setPeriod] = useState<Period>('1M');
  const [scrub, setScrub] = useState<Point | null>(null);
  const v = valuation(s);
  const series = portfolioSeries(s, period);
  const tone = (n: number) => (n >= 0 ? 'text-success-base' : 'text-error-base');
  // Change over the selected period, or up to the scrubbed point.
  const start = series[0].v;
  const change = (scrub ?? series[series.length - 1]).v - start;

  const tiles = [
    { icon: RiLineChartLine, label: 'Assets', v: v.assets, href: '/trade?tab=portfolio' },
    { icon: RiCoinsLine, label: 'Crypto', v: v.crypto, href: '/trade?tab=portfolio' },
    { icon: RiBankCardLine, label: 'Cash', v: v.cash, href: '/trade/orders?tab=transactions' },
    { icon: RiScales3Line, label: 'Buying power', v: v.buyingPower, href: '/trade' },
  ];

  return (
    <section className="flex flex-col rounded-3xl bg-bg-white-0 p-5 shadow-regular-xs ring-1 ring-inset ring-stroke-soft-200 md:p-6">
      <Link href="/trade?tab=portfolio" className="flex items-center justify-between text-label-md text-text-strong-950 hover:text-primary-base">
        Trading 2162953 <RiArrowRightSLine className="size-5 text-text-soft-400" />
      </Link>
      <div className="mt-3 flex items-center gap-2 text-[28px] font-medium tabular-nums leading-tight tracking-[-0.01em] text-text-strong-950 md:text-[32px]">
        <Num value={scrub?.v ?? v.total} /> <SwissFlag />
      </div>
      <div className="mt-1 min-h-[42px] text-paragraph-sm text-text-sub-600">
        <div>
          <span className={cn('text-label-sm', tone(change))}><SignedNum value={change} /> CHF {change >= 0 ? '▲' : '▼'} <PctNum value={change / start} /></span>{' '}
          {scrub ? `since ${formatChartTime(period)(series[0].t)}` : PERIOD_LABEL[period]}
        </div>
        {scrub
          ? <div className="text-text-soft-400">{formatChartTime(period)(scrub.t)}</div>
          : <div><span className={cn('text-label-sm', tone(v.performance))}>{formatSigned(v.performance)} CHF</span> absolute performance</div>}
      </div>

      <AreaChart data={series} height={190} fill onScrub={setScrub} formatTime={formatChartTime(period)} className="mt-4 flex-1" />
      <PeriodControl value={period} onChange={setPeriod} periods={PORTFOLIO_PERIODS} className="mt-4" />

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-2xl p-3.5 ring-1 ring-inset ring-stroke-soft-200 transition hover:bg-bg-weak-50 active:scale-[0.97]">
            <div className="flex items-center justify-between text-paragraph-sm text-text-strong-950">
              <span className="flex items-center gap-1.5"><c.icon className="size-4 text-primary-base" />{c.label}</span>
              <RiArrowRightSLine className="size-4 text-text-soft-400" />
            </div>
            <div className="mt-1.5 text-label-lg tabular-nums text-text-strong-950">{formatNumber(c.v)}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Watchlist({ s, limit = 5, className }: { s: MarketState; limit?: number; className?: string }) {
  const items = s.portfolio.watchlist.map(instrument).filter((i): i is Instrument => !!i).slice(0, limit);
  return (
    <section className={cn('rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200', className)}>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-label-md text-text-strong-950">Watchlist</h2>
        <Link href="/trade?tab=watchlist" className="flex items-center text-label-sm text-primary-base hover:underline">See all<RiArrowRightSLine className="size-4" /></Link>
      </div>
      {items.length
        ? items.map((i) => <InstrumentRow key={i.symbol} i={i} s={s} compact />)
        : <p className="py-4 text-paragraph-sm text-text-soft-400">Star an instrument to follow it here.</p>}
    </section>
  );
}

function CryptoStrip({ s }: { s: MarketState }) {
  const [sel, setSel] = useState<Instrument | null>(null);
  const [open, setOpen] = useState(false);
  const coins = INSTRUMENTS.filter((i) => i.kind === 'crypto');
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-label-md text-text-strong-950">Crypto on SQX</h2>
          <p className="text-paragraph-xs text-text-sub-600">Swissquote&apos;s exchange, aggregating liquidity for competitive prices</p>
        </div>
        <Link href="/trade?tab=markets&cat=crypto" className="flex shrink-0 items-center text-label-sm text-primary-base hover:underline">Discover<RiArrowRightSLine className="size-4" /></Link>
      </div>
      <FadeScroller className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {coins.map((i) => {
          const price = s.prices[i.symbol];
          return (
            <div key={i.symbol} className="relative flex w-[264px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-bg-white-0 ring-1 ring-inset ring-stroke-soft-200">
              <Link href={`/trade/${i.symbol}`} className="flex items-center gap-3 p-4 pb-0">
                <InstrumentLogo i={i} className="size-11 text-label-md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-paragraph-sm text-text-sub-600"><b className="font-medium text-text-strong-950">{i.symbol}</b> {i.name}</span>
                    <ChangePill pct={price / prevClose(i) - 1} className="shrink-0" />
                  </div>
                  <div className="text-label-lg tabular-nums text-text-strong-950">{formatPrice(price, i)} <span className="text-paragraph-xs text-text-soft-400">USD</span></div>
                </div>
              </Link>
              <Link href={`/trade/${i.symbol}`} tabIndex={-1} aria-hidden><Sparkline data={priceSeries(i, '1W', price, s.updatedAt)} className="mt-3 h-24 w-full" /></Link>
              <div className="absolute bottom-3 right-3">
                <Button.Root size="xsmall" onClick={() => { setSel(i); setOpen(true); }}>Trade now</Button.Root>
              </div>
            </div>
          );
        })}
      </FadeScroller>
      {sel && <TradeSheet i={sel} side="buy" open={open} onOpenChange={setOpen} />}
    </section>
  );
}

/** Horizontal scroller whose edges fade out, only on the sides that have more content to scroll to. */
function FadeScroller({ className, children, fade = 64 }: { className?: string; children: React.ReactNode; fade?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);
  const mask = `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'}, #000 ${fade}px, #000 calc(100% - ${fade}px), ${edges.end ? 'transparent' : '#000'})`;
  return <div ref={ref} className={className} style={{ maskImage: mask, WebkitMaskImage: mask }}>{children}</div>;
}
