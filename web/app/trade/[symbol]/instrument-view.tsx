'use client';
import { useState } from 'react';
import Link from 'next/link';
import { RiArrowLeftLine, RiStarFill, RiStarLine } from '@remixicon/react';
import * as Button from '@/components/ui/button';
import { RequireLogin } from '@/components/require-login';
import { AreaChart } from '@/components/charts';
import { InstrumentLogo, PeriodControl, formatChartTime } from '@/components/market-ui';
import { TradeSheet } from '@/components/trade-sheet';
import { formatNumber } from '@/lib/format';
import {
  FX, PERIOD_LABEL, VENUE, cancelOrder, formatPct, formatPrice, formatQty, formatSigned, instrument, prevClose, priceSeries, toggleWatch, tradable, useMarket,
  type Instrument, type Period, type Point,
} from '@/lib/market';
import { cn } from '@/utils/cn';

const PERIODS: Period[] = ['1D', '1W', '1M', '6M', '1Y', 'All'];

export function InstrumentView({ symbol }: { symbol: string }) {
  const i = instrument(symbol);
  return (
    <RequireLogin subtitle="Log in to trade.">
      {i ? <Detail i={i} /> : (
        <div className="mx-auto max-w-[440px] rounded-3xl bg-bg-white-0 p-8 text-center ring-1 ring-inset ring-stroke-soft-200">
          <div className="text-title-h6 text-text-strong-950">Instrument not found</div>
          <Button.Root asChild variant="neutral" mode="stroke" className="mt-4"><Link href="/trade">Back to markets</Link></Button.Root>
        </div>
      )}
    </RequireLogin>
  );
}

function Detail({ i }: { i: Instrument }) {
  const s = useMarket();
  const [period, setPeriod] = useState<Period>('1D');
  const [scrub, setScrub] = useState<Point | null>(null);
  const [ticket, setTicket] = useState<'buy' | 'sell' | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const price = s.prices[i.symbol];
  const series = priceSeries(i, period, price, s.updatedAt);
  const start = period === '1D' ? prevClose(i) : series[0].v;
  const shown = scrub?.v ?? price;
  const diff = shown - start;
  const up = diff >= 0;
  const watched = s.portfolio.watchlist.includes(i.symbol);
  const holding = s.portfolio.holdings.find((h) => h.symbol === i.symbol);
  const orders = s.portfolio.orders.filter((o) => o.symbol === i.symbol && o.status === 'open');
  const day = priceSeries(i, '1D', price, s.updatedAt).map((p) => p.v);
  const year = priceSeries(i, '1Y', price, s.updatedAt).map((p) => p.v);
  const fmt = (v: number) => formatPrice(v, i);
  const openTicket = (x: 'buy' | 'sell') => { setSide(x); setTicket(x); };

  return (
    // The header gets its own grid row so the sidebar starts level with the chart card, whatever the header's height.
    <div className="mx-auto grid max-w-[1080px] gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/trade" className="grid size-9 shrink-0 place-items-center rounded-full bg-bg-white-0 text-text-sub-600 ring-1 ring-inset ring-stroke-soft-200 transition hover:bg-bg-weak-50 active:scale-95" aria-label="Back"><RiArrowLeftLine className="size-5" /></Link>
        <InstrumentLogo i={i} className="size-10" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title-h6 text-text-strong-950">{i.name}</h1>
          <div className="text-paragraph-xs uppercase text-text-soft-400">{i.symbol} · {i.detail}</div>
        </div>
        <button onClick={() => toggleWatch(i.symbol)} aria-pressed={watched} title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          className={cn('grid size-10 place-items-center rounded-full ring-1 ring-inset ring-stroke-soft-200 transition hover:bg-bg-weak-50 active:scale-95', watched ? 'text-primary-base' : 'text-text-soft-400')}>
          {watched ? <RiStarFill className="size-5" /> : <RiStarLine className="size-5" />}
        </button>
      </div>

      <div className="min-w-0 space-y-6 lg:col-start-1">
        <section className="rounded-3xl bg-bg-white-0 p-5 shadow-regular-xs ring-1 ring-inset ring-stroke-soft-200 md:p-6">
          <div className="text-[32px] font-medium tabular-nums leading-tight tracking-[-0.01em] text-text-strong-950">
            {fmt(shown)} <span className="text-[0.5em] text-text-soft-400">{i.currency}</span>
          </div>
          <div className="mt-1 text-paragraph-sm text-text-sub-600">
            <span className={cn('text-label-sm tabular-nums', up ? 'text-success-base' : 'text-error-base')}>
              {formatSigned(diff, i.kind === 'crypto' && price < 100 ? 4 : 2)} ({up ? '▲' : '▼'} {formatPct(diff / start)})
            </span>{' '}
            {scrub ? formatChartTime(period)(scrub.t) : PERIOD_LABEL[period]}
          </div>
          <AreaChart data={series} height={240} baseline={period === '1D' ? prevClose(i) : undefined} onScrub={setScrub} formatTime={formatChartTime(period)} className="mt-5" />
          <PeriodControl value={period} onChange={setPeriod} periods={PERIODS} className="mt-4" />
          {tradable(i) && (
            <div className="mt-5 grid grid-cols-2 gap-2 lg:hidden">
              <Button.Root onClick={() => openTicket('buy')}>Buy</Button.Root>
              <Button.Root variant="neutral" mode="stroke" onClick={() => openTicket('sell')} disabled={!holding}>Sell</Button.Root>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200 md:p-6">
          <h2 className="mb-2 text-label-md text-text-strong-950">Key figures</h2>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            {[
              ['Previous close', `${fmt(prevClose(i))} ${i.currency}`],
              ['Day range', `${fmt(Math.min(...day))} – ${fmt(Math.max(...day))}`],
              ['52-week range', `${fmt(Math.min(...year))} – ${fmt(Math.max(...year))}`],
              ['Change today', `${formatSigned(price - prevClose(i), i.kind === 'crypto' && price < 100 ? 4 : 2)} ${i.currency}`],
              ['Trading venue', VENUE[i.kind]],
              ['Currency', i.currency === 'CHF' ? 'CHF' : `${i.currency} (1 ${i.currency} = ${FX[i.currency].toFixed(2)} CHF)`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-stroke-soft-200 py-2.5 text-paragraph-sm last:border-0 sm:[&:nth-last-child(2)]:border-0">
                <dt className="text-text-sub-600">{k}</dt>
                <dd className="text-right tabular-nums text-text-strong-950">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <aside className="space-y-4 lg:col-start-2 lg:row-start-2">
        {tradable(i) ? (
          <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
            <h2 className="text-label-md text-text-strong-950">Your position</h2>
            {holding ? (
              <dl className="mt-2 text-paragraph-sm">
                {[
                  ['Quantity', formatQty(holding.qty)],
                  ['Average cost', `${fmt(holding.avgCost)} ${i.currency}`],
                  ['Market value', `${formatNumber(holding.qty * price * FX[i.currency])} CHF`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1.5"><dt className="text-text-sub-600">{k}</dt><dd className="tabular-nums text-text-strong-950">{v}</dd></div>
                ))}
                <div className="flex justify-between py-1.5">
                  <dt className="text-text-sub-600">Profit / loss</dt>
                  <dd className={cn('text-label-sm tabular-nums', price >= holding.avgCost ? 'text-success-base' : 'text-error-base')}>
                    {formatSigned(holding.qty * (price - holding.avgCost) * FX[i.currency])} CHF
                  </dd>
                </div>
              </dl>
            ) : <p className="mt-1 text-paragraph-sm text-text-sub-600">You don&apos;t hold {i.symbol} yet.</p>}
            <div className="mt-4 hidden grid-cols-2 gap-2 lg:grid">
              <Button.Root onClick={() => openTicket('buy')}>Buy</Button.Root>
              <Button.Root variant="neutral" mode="stroke" onClick={() => openTicket('sell')} disabled={!holding}>Sell</Button.Root>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl bg-bg-white-0 p-5 text-paragraph-sm text-text-sub-600 ring-1 ring-inset ring-stroke-soft-200">
            Indices can&apos;t be bought directly. Trade their components, or an ETF that tracks them.
            {i.symbol === 'SMI' && <Link href="/trade?tab=markets&cat=smi" className="mt-2 block text-label-sm text-primary-base hover:underline">See SMI components</Link>}
          </section>
        )}

        {orders.length > 0 && (
          <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
            <h2 className="mb-1 text-label-md text-text-strong-950">Open orders</h2>
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-2 text-paragraph-sm">
                <span><b className={cn('font-medium', o.side === 'buy' ? 'text-success-base' : 'text-error-base')}>{o.side === 'buy' ? 'Buy' : 'Sell'}</b> {formatQty(o.qty)} at {fmt(o.limit!)}</span>
                <Button.Root variant="neutral" mode="ghost" size="xxsmall" onClick={() => cancelOrder(o.id)}>Cancel</Button.Root>
              </div>
            ))}
          </section>
        )}
      </aside>

      {tradable(i) && <TradeSheet i={i} side={side} open={ticket !== null} onOpenChange={(o) => !o && setTicket(null)} />}
    </div>
  );
}
