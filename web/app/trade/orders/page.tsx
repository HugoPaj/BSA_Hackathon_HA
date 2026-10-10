'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RiWallet3Line } from '@remixicon/react';
import * as Button from '@/components/ui/button';
import * as TabMenu from '@/components/ui/tab-menu-horizontal';
import { PageTitle } from '@/components/page-title';
import { RequireLogin } from '@/components/require-login';
import { InstrumentLogo } from '@/components/market-ui';
import { formatNumber } from '@/lib/format';
import { FX, cancelOrder, formatPrice, formatQty, instrument, useMarket, type MarketState } from '@/lib/market';
import { cn } from '@/utils/cn';

export default function OrdersPage() {
  return (
    <RequireLogin subtitle="Log in to see your orders.">
      <Suspense><Orders /></Suspense>
    </RequireLogin>
  );
}

const when = (ts: number) => new Date(ts).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Orders() {
  const params = useSearchParams();
  const router = useRouter();
  const s = useMarket();
  const tab = params.get('tab') ?? 'open';
  return (
    <div className="mx-auto max-w-[760px]">
      <PageTitle title="Orders and transactions" subtitle="Trading 2162953" back="/" />
      <TabMenu.Root value={tab} onValueChange={(v) => router.replace(`/trade/orders?tab=${v}`, { scroll: false })}>
        <TabMenu.List>
          <TabMenu.Trigger value="open">Open orders</TabMenu.Trigger>
          <TabMenu.Trigger value="transactions">Transactions</TabMenu.Trigger>
        </TabMenu.List>
        <TabMenu.Content value="open" className="pt-4"><OpenOrders s={s} /></TabMenu.Content>
        <TabMenu.Content value="transactions" className="pt-4"><Transactions s={s} /></TabMenu.Content>
      </TabMenu.Root>
    </div>
  );
}

function OpenOrders({ s }: { s: MarketState }) {
  const open = s.portfolio.orders.filter((o) => o.status === 'open');
  if (!open.length) {
    return (
      <div className="rounded-3xl bg-bg-white-0 p-8 text-center ring-1 ring-inset ring-stroke-soft-200">
        <p className="text-paragraph-sm text-text-sub-600">No open orders. Limit orders wait here until the price reaches your limit.</p>
        <Button.Root asChild variant="neutral" mode="stroke" size="small" className="mt-4"><Link href="/trade">Go to markets</Link></Button.Root>
      </div>
    );
  }
  return (
    <div className="divide-y divide-stroke-soft-200 rounded-3xl bg-bg-white-0 px-5 ring-1 ring-inset ring-stroke-soft-200">
      {open.map((o) => {
        const i = instrument(o.symbol)!;
        const price = s.prices[o.symbol];
        const distance = o.limit! / price - 1;
        return (
          <div key={o.id} className="flex items-center gap-3 py-4">
            <Link href={`/trade/${i.symbol}`}><InstrumentLogo i={i} /></Link>
            <div className="min-w-0 flex-1">
              <div className="text-label-md text-text-strong-950">
                <span className={o.side === 'buy' ? 'text-success-base' : 'text-error-base'}>{o.side === 'buy' ? 'Buy' : 'Sell'}</span> {formatQty(o.qty)} {i.symbol}
              </div>
              <div className="text-paragraph-xs tabular-nums text-text-sub-600">
                Limit {formatPrice(o.limit!, i)} {i.currency} · last {formatPrice(price, i)} ({distance >= 0 ? '+' : '−'}{Math.abs(distance * 100).toFixed(1)}%)
              </div>
              <div className="text-paragraph-xs text-text-soft-400">Placed {when(o.ts)} · good till cancelled</div>
            </div>
            <Button.Root variant="neutral" mode="stroke" size="xsmall" onClick={() => cancelOrder(o.id)}>Cancel</Button.Root>
          </div>
        );
      })}
    </div>
  );
}

function Transactions({ s }: { s: MarketState }) {
  const rows = [
    ...s.portfolio.orders.filter((o) => o.status === 'filled').map((o) => {
      const i = instrument(o.symbol)!;
      const value = o.qty * o.price! * FX[i.currency];
      return {
        id: o.id, ts: o.filledAt!, i, title: `${o.side === 'buy' ? 'Buy' : 'Sell'} ${formatQty(o.qty)} ${i.symbol}`,
        sub: `${formatPrice(o.price!, i)} ${i.currency} · commission ${formatNumber(o.commission!)} CHF`,
        amount: o.side === 'buy' ? -(value + o.commission!) : value - o.commission!,
      };
    }),
    ...s.portfolio.transfers.map((t) => ({ id: t.id, ts: t.ts, i: null, title: 'To self-custody wallet', sub: `${formatNumber(t.usdc)} USDC`, amount: -t.chf })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="divide-y divide-stroke-soft-200 rounded-3xl bg-bg-white-0 px-5 ring-1 ring-inset ring-stroke-soft-200">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-3.5">
          {r.i ? <InstrumentLogo i={r.i} /> : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-alpha-10 text-primary-base"><RiWallet3Line className="size-[18px]" /></span>}
          <div className="min-w-0 flex-1">
            <div className="truncate text-label-sm text-text-strong-950">{r.title}</div>
            <div className="truncate text-paragraph-xs text-text-soft-400">{when(r.ts)} · {r.sub}</div>
          </div>
          <div className={cn('text-right text-label-sm tabular-nums', r.amount >= 0 ? 'text-success-base' : 'text-text-strong-950')}>
            {r.amount >= 0 ? '+' : '−'}{formatNumber(Math.abs(r.amount))}
            <div className="text-paragraph-xs font-normal text-text-soft-400">CHF</div>
          </div>
        </div>
      ))}
    </div>
  );
}
