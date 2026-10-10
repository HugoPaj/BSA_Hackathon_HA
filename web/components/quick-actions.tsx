'use client';
import Link from 'next/link';
import type { RemixiconComponentType } from '@remixicon/react';
import { cn } from '@/utils/cn';

export type QuickAction = { icon: RemixiconComponentType; label: string; href?: string; onClick?: () => void; badge?: number; primary?: boolean };

/** Swissquote app quick actions: charcoal circles with a label underneath. Orange only for the primary one. */
export function QuickActions({ actions, className }: { actions: QuickAction[]; className?: string }) {
  return (
    // Equal columns, so the circles are evenly spaced whatever the label lengths.
    <div className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
      {actions.map((a) => {
        const inner = (
          <>
            <span className={cn('relative grid size-[52px] place-items-center rounded-full text-static-white shadow-regular-xs transition', a.primary ? 'bg-primary-base group-hover:bg-primary-darker' : 'bg-bg-strong-950 group-hover:bg-primary-base')}>
              <a.icon className="size-6" />
              {!!a.badge && <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-primary-base text-[10px] font-medium ring-2 ring-bg-white-0">{a.badge}</span>}
            </span>
            <span className="text-center text-label-sm text-text-strong-950">{a.label}</span>
          </>
        );
        const cls = 'group flex flex-col items-center gap-2';
        return a.href
          ? <Link key={a.label} href={a.href} className={cls}>{inner}</Link>
          : <button key={a.label} onClick={a.onClick} className={cls}>{inner}</button>;
      })}
    </div>
  );
}
