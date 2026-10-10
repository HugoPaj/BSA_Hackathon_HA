'use client';
import { useState } from 'react';
import Link from 'next/link';
import { RiCheckboxCircleFill, RiTimeLine } from '@remixicon/react';
import * as Alert from '@/components/ui/alert';
import * as Button from '@/components/ui/button';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Input from '@/components/ui/input';
import * as SegmentedControl from '@/components/ui/segmented-control';
import { formatNumber } from '@/lib/format';
import { FX, commission, formatPrice, formatQty, heldQty, placeOrder, useMarket, valuation, type Instrument, type Order } from '@/lib/market';
import { cn } from '@/utils/cn';
import { Sheet } from './sheet';
import { InstrumentLogo } from './market-ui';

/** Order ticket: market or limit, buy or sell, against the simulated trading account. */
export function TradeSheet({ i, side: initialSide, open, onOpenChange }: { i: Instrument; side: 'buy' | 'sell'; open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = useMarket();
  const [side, setSide] = useState(initialSide);
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [qty, setQty] = useState('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Order | null>(null);
  const [lastOpen, setLastOpen] = useState(open);

  // Reset the ticket each time it opens, starting on the side the user picked.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setSide(initialSide); setType('market'); setQty(''); setLimit(''); setError(null); setDone(null); }
  }

  const price = s.prices[i.symbol];
  const fx = FX[i.currency];
  const q = Number(qty.replace(',', '.'));
  const lp = Number(limit.replace(',', '.'));
  const execPrice = type === 'limit' && lp > 0 ? lp : price;
  const value = q > 0 ? q * execPrice * fx : 0;
  const fee = q > 0 ? commission(i, value) : 0;
  const v = valuation(s);
  const held = heldQty(s.portfolio, i.symbol);
  const step = i.kind === 'crypto' ? (price > 1000 ? 0.001 : price > 10 ? 0.1 : 10) : 1;

  const submit = () => {
    setError(null);
    try {
      setDone(placeOrder({ symbol: i.symbol, side, type, qty: q, limit: type === 'limit' ? lp : undefined }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={done ? 'Order confirmation' : `${side === 'buy' ? 'Buy' : 'Sell'} ${i.name}`}>
      {done ? (
        <div className="space-y-5 text-center">
          {done.status === 'filled'
            ? <RiCheckboxCircleFill className="mx-auto size-12 text-success-base" />
            : <RiTimeLine className="mx-auto size-12 text-information-base" />}
          <div>
            <div className="text-title-h6 text-text-strong-950">{done.status === 'filled' ? 'Order executed' : 'Order placed'}</div>
            <p className="mt-1 text-paragraph-sm text-text-sub-600">
              {done.status === 'filled'
                ? <>{done.side === 'buy' ? 'Bought' : 'Sold'} {formatQty(done.qty)} {i.symbol} at {formatPrice(done.price!, i)} {i.currency}. Commission {formatNumber(done.commission!)} CHF.</>
                : <>{done.side === 'buy' ? 'Buy' : 'Sell'} {formatQty(done.qty)} {i.symbol} when the price reaches {formatPrice(done.limit!, i)} {i.currency}. It stays open until it fills or you cancel it.</>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button.Root variant="neutral" mode="stroke" onClick={() => onOpenChange(false)}>Close</Button.Root>
            <Button.Root asChild variant="neutral" mode="filled"><Link href={`/trade/orders${done.status === 'filled' ? '?tab=transactions' : ''}`}>{done.status === 'filled' ? 'Transactions' : 'Open orders'}</Link></Button.Root>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <InstrumentLogo i={i} />
            <div className="min-w-0 flex-1">
              <div className="text-label-sm text-text-strong-950">{i.symbol} <span className="text-text-soft-400">· {i.detail}</span></div>
              <div className="text-paragraph-xs text-text-sub-600">Last {formatPrice(price, i)} {i.currency}</div>
            </div>
          </div>

          <SegmentedControl.Root value={side} onValueChange={(x) => setSide(x as 'buy' | 'sell')}>
            <SegmentedControl.List>
              <SegmentedControl.Trigger value="buy" className="h-8">Buy</SegmentedControl.Trigger>
              <SegmentedControl.Trigger value="sell" className="h-8">Sell</SegmentedControl.Trigger>
            </SegmentedControl.List>
          </SegmentedControl.Root>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-label-sm text-text-strong-950">Quantity</span>
              <Input.Root><Input.Wrapper><Input.Input inputMode="decimal" placeholder={formatQty(step)} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></Input.Wrapper></Input.Root>
            </label>
            <div className="space-y-1.5">
              <span className="text-label-sm text-text-strong-950">Order type</span>
              <SegmentedControl.Root value={type} onValueChange={(x) => { setType(x as 'market' | 'limit'); if (x === 'limit' && !limit) setLimit(formatPrice(price, i).replace(/['’]/g, '')); }}>
                <SegmentedControl.List className="h-10">
                  <SegmentedControl.Trigger value="market" className="h-8">Market</SegmentedControl.Trigger>
                  <SegmentedControl.Trigger value="limit" className="h-8">Limit</SegmentedControl.Trigger>
                </SegmentedControl.List>
              </SegmentedControl.Root>
            </div>
          </div>
          {type === 'limit' && (
            <label className="block space-y-1.5">
              <span className="text-label-sm text-text-strong-950">Limit price</span>
              <Input.Root><Input.Wrapper><Input.Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /><span className="text-paragraph-sm text-text-soft-400">{i.currency}</span></Input.Wrapper></Input.Root>
            </label>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(side === 'sell' && held > 0 ? [0.25, 0.5, 1].map((f) => ({ l: f === 1 ? 'All' : `${f * 100}%`, q: +(held * f).toFixed(6) })) : [1, 5, 10].map((n) => ({ l: formatQty(n * step), q: n * step }))).map((o) => (
              <button key={o.l} onClick={() => setQty(String(o.q))} className="h-7 rounded-full bg-bg-weak-50 px-3 text-label-xs text-text-sub-600 hover:bg-bg-soft-200">{o.l}</button>
            ))}
          </div>

          <dl className="divide-y divide-stroke-soft-200 rounded-xl bg-bg-weak-50 px-3 text-paragraph-sm">
            {[
              ['Estimated value', `${formatNumber(value)} CHF`],
              ['Commission', `${formatNumber(fee)} CHF`],
              [side === 'buy' ? 'Total to pay' : 'You receive', `${formatNumber(side === 'buy' ? value + fee : Math.max(0, value - fee))} CHF`],
              side === 'buy' ? ['Buying power', `${formatNumber(v.buyingPower)} CHF`] : ['You hold', `${formatQty(held)} ${i.symbol}`],
            ].map(([k, val], n) => (
              <div key={k} className="flex justify-between py-2">
                <dt className="text-text-sub-600">{k}</dt>
                <dd className={cn('tabular-nums', n === 2 ? 'text-label-sm text-text-strong-950' : 'text-text-strong-950')}>{val}</dd>
              </div>
            ))}
          </dl>
          {i.currency !== 'CHF' && <p className="text-paragraph-xs text-text-soft-400">Converted at 1 {i.currency} = {fx.toFixed(2)} CHF.</p>}
          {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
          <FancyButton.Root variant={side === 'buy' ? 'primary' : 'neutral'} className="h-12 w-full" disabled={!(q > 0)} onClick={submit}>
            {q > 0 ? `${side === 'buy' ? 'Buy' : 'Sell'} ${formatQty(q)} ${i.symbol}` : 'Enter a quantity'}
          </FancyButton.Root>
        </div>
      )}
    </Sheet>
  );
}
