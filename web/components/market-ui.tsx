'use client';
import Image from 'next/image';
import Link from 'next/link';
import { RiArrowRightSLine } from '@remixicon/react';
import * as SegmentedControl from '@/components/ui/segmented-control';
import { formatPct, formatPrice, prevClose, priceSeries, type Instrument, type MarketState, type Period } from '@/lib/market';
import { cn } from '@/utils/cn';
import { Sparkline } from './charts';

// Logos live in public/: coin marks from the CC0 cryptocurrency-icons set, company marks in /logos,
// and circle-flags (MIT) for indices. Marks that aren't full-bleed sit smaller inside a white disc.
const VECTOR = new Set(['ALC', 'KNIN', 'ZURN', 'SQN']);
const PADDED = new Set(['ALC', 'GEBN', 'MSFT', 'SQN']);
const INDEX_FLAG: Record<string, string> = { SMI: 'ch', SPI: 'ch', SLI: 'ch', DAX: 'de', SPX: 'us', NDX: 'us' };

function logoSrc(i: Instrument) {
  if (i.kind === 'crypto') return `/crypto/${i.symbol.toLowerCase()}.svg`;
  if (i.kind === 'index') return `/logos/flag-${INDEX_FLAG[i.symbol] ?? 'ch'}.svg`;
  return `/logos/${i.symbol}.${VECTOR.has(i.symbol) ? 'svg' : 'png'}`;
}

export function InstrumentLogo({ i, className }: { i: Instrument; className?: string }) {
  return (
    <span className={cn('relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-bg-white-0 after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-inset after:ring-black/5', className)}>
      <Image src={logoSrc(i)} alt="" width={44} height={44} unoptimized className={PADDED.has(i.symbol) ? 'size-[60%] object-contain' : 'size-full object-cover'} />
    </span>
  );
}

/** Daily change. `solid` is the market-list style (white on green/red), `soft` the card style with an arrow. */
export function ChangePill({ pct, variant = 'soft', className }: { pct: number; variant?: 'solid' | 'soft'; className?: string }) {
  const up = pct >= 0;
  if (variant === 'solid') {
    return (
      <span className={cn('inline-flex h-8 min-w-[68px] items-center justify-center rounded-md px-2 text-label-sm text-static-white tabular-nums', up ? 'bg-success-base' : 'bg-error-base', className)}>
        {up ? '' : '−'}{formatPct(pct)}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-xs tabular-nums', up ? 'bg-success-lighter text-success-base' : 'bg-error-lighter text-error-base', className)}>
      {up ? '▲' : '▼'} {up ? '' : '−'}{formatPct(pct)}
    </span>
  );
}

export function PeriodControl({ value, onChange, periods, className }: { value: Period; onChange: (p: Period) => void; periods: Period[]; className?: string }) {
  return (
    <SegmentedControl.Root value={value} onValueChange={(v) => onChange(v as Period)} className={className}>
      <SegmentedControl.List className="rounded-full" floatingBgClassName="rounded-full">
        {periods.map((p) => <SegmentedControl.Trigger key={p} value={p} className="rounded-full">{p}</SegmentedControl.Trigger>)}
      </SegmentedControl.List>
    </SegmentedControl.Root>
  );
}

/** One row of a market list, as in the Swissquote app: name, last price, solid change pill. */
export function InstrumentRow({ i, s, spark = true, compact }: { i: Instrument; s: MarketState; spark?: boolean; compact?: boolean }) {
  const price = s.prices[i.symbol];
  const pct = price / prevClose(i) - 1;
  if (compact) {
    return (
      <Link href={`/trade/${i.symbol}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-bg-weak-50">
        <InstrumentLogo i={i} className="size-8 text-label-xs" />
        <div className="min-w-0 flex-1">
          <div className="text-label-sm text-text-strong-950">{i.symbol}</div>
          <div className="truncate text-[11px] uppercase leading-4 text-text-soft-400">{i.detail}</div>
        </div>
        <div className="text-right">
          <div className="text-label-sm tabular-nums text-text-strong-950">{formatPrice(price, i)} <span className="text-[11px] font-normal text-text-soft-400">{i.currency}</span></div>
          <div className={cn('text-label-xs tabular-nums', pct >= 0 ? 'text-success-base' : 'text-error-base')}>{pct >= 0 ? '▲' : '▼'} {formatPct(pct)}</div>
        </div>
      </Link>
    );
  }
  return (
    <Link href={`/trade/${i.symbol}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bg-weak-50">
      <InstrumentLogo i={i} />
      <div className="min-w-0 flex-1">
        <div className="text-label-md text-text-strong-950">{i.symbol}</div>
        <div className="truncate text-[11px] uppercase leading-4 text-text-soft-400">{i.detail}</div>
      </div>
      {spark && <Sparkline data={priceSeries(i, '1D', price, s.updatedAt)} fill={false} className="hidden h-8 w-24 sm:block" />}
      <div className="w-[104px] text-right text-label-md tabular-nums text-text-strong-950 sm:w-[120px]">
        {formatPrice(price, i)} <span className="text-[11px] font-normal text-text-soft-400">{i.currency}</span>
      </div>
      <ChangePill pct={pct} variant="solid" />
      <RiArrowRightSLine className="hidden size-5 shrink-0 text-text-soft-400 sm:block" />
    </Link>
  );
}

export function formatChartTime(period: Period) {
  return (t: number) => {
    const d = new Date(t);
    if (period === '1D') return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    if (period === '1W') return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
}
