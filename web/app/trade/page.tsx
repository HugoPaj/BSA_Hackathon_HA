'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RiArrowDownLine, RiArrowLeftRightLine, RiArrowRightSLine, RiArrowUpLine, RiListUnordered } from '@remixicon/react';
import * as TabMenu from '@/components/ui/tab-menu-horizontal';
import { RequireLogin } from '@/components/require-login';
import { InstrumentLogo, InstrumentRow } from '@/components/market-ui';
import {
  FX, INSTRUMENTS, formatPct, formatPrice, formatQty, formatSigned, instrument, prevClose, useMarket, valuation,
  type Instrument, type Kind, type MarketState,
} from '@/lib/market';
import { cn } from '@/utils/cn';
import { Num, SignedNum } from '@/components/num';
import { formatNumber } from '@/lib/format';

const CATS: { id: string; label: string; title: string; kinds: Kind[] }[] = [
  { id: 'smi', label: 'Components', title: 'Components of the SMI', kinds: ['smi'] },
  { id: 'shares', label: 'Shares', title: 'Shares', kinds: ['share'] },
  { id: 'crypto', label: 'Crypto', title: 'Crypto on SQX', kinds: ['crypto'] },
  { id: 'indices', label: 'Indices', title: 'Indices', kinds: ['index'] },
];
const SORTS = ['Default', 'Top gainers', 'Top losers'] as const;

export default function TradePage() {
  return (
    <RequireLogin subtitle="Log in to trade.">
      <Suspense><Trade /></Suspense>
    </RequireLogin>
  );
}

function Trade() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'markets';
  const cat = CATS.find((c) => c.id === params.get('cat')) ?? CATS[0];
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    router.replace(`/trade?${next}`, { scroll: false });
  };
  const s = useMarket();

  return (
    // The tab root is the page grid, so the sidebar can sit in the content row and line up with the first card.
    <TabMenu.Root value={tab} onValueChange={(v) => setParam('tab', v)} className="mx-auto grid max-w-[1080px] gap-x-6 lg:grid-cols-[1fr_320px]">
      <div className="mb-2 flex min-w-0 items-end justify-between gap-4">
        <h1 className="text-title-h5 text-text-strong-950 md:text-title-h4">Trade</h1>
        <span className="text-paragraph-xs tabular-nums text-text-soft-400">Updated {new Date(s.updatedAt).toLocaleTimeString('de-CH')}</span>
      </div>
      <TabMenu.List wrapperClassName="lg:col-start-1">
        <TabMenu.Trigger value="portfolio">Portfolio</TabMenu.Trigger>
        <TabMenu.Trigger value="watchlist">Watchlist</TabMenu.Trigger>
        <TabMenu.Trigger value="markets">Markets</TabMenu.Trigger>
      </TabMenu.List>
      <TabMenu.Content value="markets" className="min-w-0 pt-4 lg:col-start-1"><Markets s={s} cat={cat} onCat={(c) => setParam('cat', c)} /></TabMenu.Content>
      <TabMenu.Content value="watchlist" className="min-w-0 pt-4 lg:col-start-1"><WatchlistTab s={s} /></TabMenu.Content>
      <TabMenu.Content value="portfolio" className="min-w-0 pt-4 lg:col-start-1"><PortfolioTab s={s} /></TabMenu.Content>
      {/* Markets opens with a row of category pills (h-8 + 16px gap); skip it so the sidebar starts level with the list card. */}
      <aside className={cn('mt-6 space-y-4 lg:col-start-2 lg:row-start-3 lg:mt-0 lg:pt-4', tab === 'markets' && 'lg:pt-16')}>
        <AccountSummary s={s} />
        <Movers s={s} />
      </aside>
    </TabMenu.Root>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-label-md text-text-strong-950">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Markets({ s, cat, onCat }: { s: MarketState; cat: (typeof CATS)[number]; onCat: (id: string) => void }) {
  const [sort, setSort] = useState(0);
  const change = (i: Instrument) => s.prices[i.symbol] / prevClose(i) - 1;
  const list = INSTRUMENTS.filter((i) => cat.kinds.includes(i.kind));
  if (sort === 1) list.sort((a, b) => change(b) - change(a));
  if (sort === 2) list.sort((a, b) => change(a) - change(b));
  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {CATS.map((c) => (
          <button key={c.id} onClick={() => onCat(c.id)} className={cn('h-8 shrink-0 rounded-full px-4 text-label-sm transition active:scale-[0.97]', c.id === cat.id ? 'bg-bg-strong-950 text-static-white' : 'bg-bg-white-0 text-text-sub-600 ring-1 ring-inset ring-stroke-soft-200 hover:bg-bg-weak-50')}>
            {c.label}
          </button>
        ))}
      </div>
      <Card title={cat.title} right={
        <button onClick={() => setSort((sort + 1) % SORTS.length)} className="flex items-center gap-1 text-label-sm text-primary-base">
          {sort === 2 ? <RiArrowUpLine className="size-4" /> : <RiArrowDownLine className="size-4" />}{sort ? SORTS[sort] : 'Sort'}
        </button>
      }>
        {list.map((i) => <InstrumentRow key={i.symbol} i={i} s={s} />)}
      </Card>
    </div>
  );
}

function WatchlistTab({ s }: { s: MarketState }) {
  const items = s.portfolio.watchlist.map(instrument).filter((i): i is Instrument => !!i);
  return (
    <Card title="My watchlist">
      {items.length
        ? items.map((i) => <InstrumentRow key={i.symbol} i={i} s={s} />)
        : <p className="py-6 text-center text-paragraph-sm text-text-soft-400">Open any instrument and tap the star to follow it here.</p>}
    </Card>
  );
}

function PortfolioTab({ s }: { s: MarketState }) {
  const v = valuation(s);
  const rows = s.portfolio.holdings.map((h) => {
    const i = instrument(h.symbol)!;
    const price = s.prices[h.symbol];
    const value = h.qty * price * FX[i.currency];
    return { h, i, price, value, pl: h.qty * (price - h.avgCost) * FX[i.currency], plPct: price / h.avgCost - 1 };
  }).sort((a, b) => b.value - a.value);
  const group = (crypto: boolean) => rows.filter((r) => (r.i.kind === 'crypto') === crypto);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Assets', v.assets], ['Crypto', v.crypto], ['Cash', v.cash], ['Buying power', v.buyingPower]].map(([l, n]) => (
          <div key={l} className="rounded-2xl bg-bg-white-0 p-3.5 ring-1 ring-inset ring-stroke-soft-200">
            <div className="text-paragraph-xs text-text-sub-600">{l}</div>
            <div className="mt-1 text-label-lg tabular-nums text-text-strong-950">{formatNumber(n as number)}</div>
          </div>
        ))}
      </div>
      {[false, true].map((crypto) => group(crypto).length > 0 && (
        <Card key={String(crypto)} title={crypto ? 'Crypto' : 'Shares'} right={<span className="text-label-sm tabular-nums text-text-sub-600">{formatNumber(crypto ? v.crypto : v.assets)} CHF</span>}>
          {group(crypto).map(({ h, i, price, value, pl, plPct }) => (
            <Link key={h.symbol} href={`/trade/${i.symbol}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bg-weak-50 active:bg-bg-weak-50">
              <InstrumentLogo i={i} />
              <div className="min-w-0 flex-1">
                <div className="text-label-md text-text-strong-950">{i.symbol}</div>
                <div className="truncate text-paragraph-xs tabular-nums text-text-soft-400">{formatQty(h.qty)} × {formatPrice(price, i)} {i.currency}</div>
              </div>
              <div className="text-right">
                <div className="text-label-md tabular-nums text-text-strong-950">{formatNumber(value)} <span className="text-[11px] font-normal text-text-soft-400">CHF</span></div>
                <div className={cn('text-label-xs tabular-nums', pl >= 0 ? 'text-success-base' : 'text-error-base')}>{formatSigned(pl)} ({pl >= 0 ? '' : '−'}{formatPct(plPct)})</div>
              </div>
              <RiArrowRightSLine className="hidden size-5 shrink-0 text-text-soft-400 sm:block" />
            </Link>
          ))}
        </Card>
      ))}
      {!rows.length && <Card title="Positions"><p className="py-6 text-center text-paragraph-sm text-text-soft-400">No positions yet. Find something in Markets.</p></Card>}
    </div>
  );
}

function AccountSummary({ s }: { s: MarketState }) {
  const v = valuation(s);
  const open = s.portfolio.orders.filter((o) => o.status === 'open').length;
  return (
    <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
      <div className="text-paragraph-sm text-text-sub-600">Trading 2162953</div>
      <div className="mt-1 text-title-h5 tabular-nums text-text-strong-950"><Num value={v.total} /> <span className="text-label-md text-text-soft-400">CHF</span></div>
      <div className={cn('text-label-sm tabular-nums', v.dayChange >= 0 ? 'text-success-base' : 'text-error-base')}><SignedNum value={v.dayChange} /> CHF today</div>
      <div className="mt-4 flex justify-between border-t border-stroke-soft-200 pt-3 text-paragraph-sm">
        <span className="text-text-sub-600">Buying power</span>
        <span className="tabular-nums text-text-strong-950">{formatNumber(v.buyingPower)} CHF</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href="/trade/orders" className="flex items-center gap-2 rounded-xl bg-bg-weak-50 px-3 py-2.5 text-label-sm text-text-strong-950 transition hover:bg-bg-soft-200 active:scale-[0.97]">
          <RiArrowLeftRightLine className="size-4 text-primary-base" />Orders{open > 0 && <span className="ml-auto text-text-soft-400">{open}</span>}
        </Link>
        <Link href="/trade/orders?tab=transactions" className="flex items-center gap-2 rounded-xl bg-bg-weak-50 px-3 py-2.5 text-label-sm text-text-strong-950 transition hover:bg-bg-soft-200 active:scale-[0.97]">
          <RiListUnordered className="size-4 text-primary-base" />History
        </Link>
      </div>
    </section>
  );
}

function Movers({ s }: { s: MarketState }) {
  const tradables = INSTRUMENTS.filter((i) => i.kind !== 'index');
  const change = (i: Instrument) => s.prices[i.symbol] / prevClose(i) - 1;
  const top = [...tradables].sort((a, b) => Math.abs(change(b)) - Math.abs(change(a))).slice(0, 5);
  return (
    <Card title="Biggest movers today">
      {top.map((i) => <InstrumentRow key={i.symbol} i={i} s={s} compact />)}
    </Card>
  );
}
