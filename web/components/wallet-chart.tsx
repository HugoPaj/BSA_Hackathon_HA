'use client';
import type { Activity } from '@/lib/server/db';
import { formatNumber, toUnits } from '@/lib/format';
import type { Point } from '@/lib/market';
import { AreaChart, Sparkline } from './charts';

/**
 * The wallet's real balance over time, rebuilt backwards from the current on-chain balance through the
 * confirmed transfers. Each transfer is a step: flat before it, flat after it.
 */
export function walletHistory(activity: Activity[] | undefined, balance: bigint, now = Date.now()): Point[] {
  if (!activity?.length) return [];
  const moves = activity
    .filter((a) => a.status === 'confirmed' && a.amount !== undefined && (a.type === 'send' || a.type === 'receive'))
    .sort((a, b) => b.ts - a.ts);
  if (!moves.length) return [];
  let b = toUnits(balance);
  const pts: Point[] = [{ t: now, v: b }];
  for (const a of moves) {
    pts.push({ t: a.ts, v: b });
    const amt = toUnits(a.amount!);
    b = Math.max(0, a.type === 'receive' ? b - amt : b + amt + (a.fee ? toUnits(a.fee) : 0));
    pts.push({ t: a.ts - 1, v: b });
  }
  const opened = Math.min(...activity.map((a) => a.ts));
  pts.push({ t: Math.min(opened, moves[moves.length - 1].ts - 60_000), v: b });
  return pts.reverse();
}

const time = (t: number) => {
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function WalletBalanceChart({ activity, balance, className }: { activity?: Activity[]; balance: bigint; className?: string }) {
  const data = walletHistory(activity, balance);
  if (data.length < 2) return null;
  return (
    <div className={className}>
      <AreaChart data={data} height={132} curve="linear" formatValue={(v) => `${formatNumber(v)} USDC`} formatTime={time} />
      <div className="mt-1.5 flex justify-between text-paragraph-xs text-text-soft-400">
        <span>{time(data[0].t)}</span>
        <span>Now</span>
      </div>
    </div>
  );
}

export function WalletSparkline({ activity, balance, className }: { activity?: Activity[]; balance: bigint; className?: string }) {
  const data = walletHistory(activity, balance);
  if (data.length < 2) return null;
  return <Sparkline data={data} className={className} />;
}
