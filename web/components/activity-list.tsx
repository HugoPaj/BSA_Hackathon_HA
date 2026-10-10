'use client';
import Link from 'next/link';
import { RiArrowLeftDownLine, RiArrowRightUpLine, RiCheckDoubleLine, RiExternalLinkLine, RiLoader4Line, RiShieldKeyholeLine, RiSparkling2Line } from '@remixicon/react';
import type { Activity } from '@/lib/server/db';
import { EXPLORER } from '@/lib/config';
import { formatUsdc, timeAgo } from '@/lib/format';
import { cn } from '@/utils/cn';
import { BoneRow, Skeleton } from './skeleton';

const ICONS = {
  send: { icon: RiArrowRightUpLine, cls: 'bg-bg-weak-50 text-text-sub-600' },
  receive: { icon: RiArrowLeftDownLine, cls: 'bg-primary-alpha-10 text-primary-base' },
  approve: { icon: RiCheckDoubleLine, cls: 'bg-information-lighter text-information-base' },
  deploy: { icon: RiSparkling2Line, cls: 'bg-success-lighter text-success-base' },
  security: { icon: RiShieldKeyholeLine, cls: 'bg-success-lighter text-success-base' },
  recovery: { icon: RiShieldKeyholeLine, cls: 'bg-warning-lighter text-warning-dark' },
};

export function ActivityList({ items, empty = 'No activity yet.' }: { items?: Activity[]; empty?: string }) {
  if (!items) return <Skeleton className="divide-y divide-stroke-soft-200">{[0, 1, 2].map((i) => <BoneRow key={i} className="py-3" />)}</Skeleton>;
  if (!items.length) return <div className="rounded-xl bg-bg-weak-50 px-4 py-6 text-center text-paragraph-sm text-text-soft-400">{empty}</div>;
  return (
    <div className="divide-y divide-stroke-soft-200">
      {items.map((a) => {
        const I = ICONS[a.type];
        const sign = a.type === 'receive' ? '+' : a.type === 'send' ? '−' : '';
        return (
          <div key={a.id} className="flex items-center gap-3 py-3">
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', I.cls)}><I.icon className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-label-sm text-text-strong-950">{a.title}</div>
              <div className="flex items-center gap-1.5 text-paragraph-xs text-text-soft-400">
                {a.status === 'pending' && <RiLoader4Line className="size-3.5 animate-spin" />}
                {a.status === 'failed' && <span className="text-error-base">Failed ·</span>}
                {timeAgo(a.ts)}{a.sponsored ? ' · gas sponsored' : ' · own gas'}
                {a.txHash && <Link href={`${EXPLORER}/tx/${a.txHash}`} target="_blank" className="inline-flex items-center text-primary-base hover:underline"><RiExternalLinkLine className="size-3.5" /></Link>}
              </div>
            </div>
            {a.amount !== undefined && (
              <div className="text-right">
                <div className={cn('text-label-sm', sign === '+' ? 'text-success-base' : 'text-text-strong-950')}>{sign}{formatUsdc(a.amount)}</div>
                <div className="text-paragraph-xs text-text-soft-400">USDC</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
