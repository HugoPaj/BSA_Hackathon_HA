'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  RiApps2Fill, RiApps2Line, RiHome5Fill, RiHome5Line, RiNotification3Fill, RiNotification3Line, RiStockFill, RiStockLine, RiWallet3Fill, RiWallet3Line,
} from '@remixicon/react';
import { cn } from '@/utils/cn';
import { useAlerts } from '@/lib/hooks';
import { AccountMenu } from './account-menu';
import { SqLogo } from './brand';
import { useSession } from './session';

const NAV = [
  { href: '/', label: 'Home', icon: RiHome5Line, active: RiHome5Fill, match: (p: string) => p === '/' },
  { href: '/trade', label: 'Trade', icon: RiStockLine, active: RiStockFill, match: (p: string) => p.startsWith('/trade') },
  { href: '/wallet', label: 'Wallet', icon: RiWallet3Line, active: RiWallet3Fill, match: (p: string) => p === '/wallet' || p.startsWith('/wallet/send') || p.startsWith('/wallet/receive') || p.startsWith('/wallet/new') },
  { href: '/wallet/dapps', label: 'dApps', icon: RiApps2Line, active: RiApps2Fill, match: (p: string) => p.startsWith('/wallet/dapps') },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signedIn } = useSession();
  const { data: alerts } = useAlerts(5000, signedIn);
  const unread = (alerts ?? []).filter((a) => !a.read).length;
  const bare = pathname.startsWith('/backoffice');
  const recovering = pathname.startsWith('/recover');
  // The logged-out home and the recovery flow are full-bleed split screens, so they opt out of the centred content column.
  const landing = (pathname === '/' && !signedIn) || recovering;
  // Recovery is a focused flow with no app chrome (nav, inbox, account menu): even a logged-in session never looks "in" there; Back is the way out.
  const nav = signedIn && !bare && !recovering;

  return (
    // The page scrolls inside its own container under the header, so the scrollbar starts below the navbar, not over it.
    <div className="flex h-dvh flex-col">
      {/* The header reserves the same gutter as the scroller, so its centred row lines up with the content below. */}
      <header className="z-40 shrink-0 overflow-hidden border-b border-stroke-soft-200 bg-bg-white-0 [scrollbar-gutter:stable]">
        <div className={cn('mx-auto flex h-16 items-center gap-6 px-4 lg:px-8', !landing && 'max-w-[1220px]')}>
          <Link href="/" className="flex shrink-0 items-center"><SqLogo product={bare ? 'Operations' : undefined} /></Link>
          {nav && (
            <nav className="hidden flex-1 items-center gap-1 md:flex">
              {NAV.map((n) => {
                const on = n.match(pathname);
                return (
                  <Link key={n.href} href={n.href} className={cn('relative rounded-lg px-3 py-2 text-label-sm transition active:scale-[0.97]', on ? 'text-primary-base' : 'text-text-sub-600 hover:bg-bg-weak-50 hover:text-text-strong-950')}>
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {nav && <InboxBell on={pathname.startsWith('/inbox')} unread={unread} />}
            {!bare && !recovering && <AccountMenu />}
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
        <main className={cn(landing ? 'flex flex-1 flex-col bg-bg-white-0' : 'mx-auto w-full max-w-[1220px] flex-1 px-4 pt-6 lg:px-8 lg:pt-10', !landing && (nav ? 'pb-28 md:pb-16' : 'pb-16'))}>{children}</main>
      </div>

      {nav && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stroke-soft-200 bg-bg-white-0/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <div className="grid grid-cols-4">
            {NAV.map((n) => {
              const on = n.match(pathname);
              const Icon = on ? n.active : n.icon;
              return (
                <Link key={n.href} href={n.href} className={cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-transform duration-150 ease-out active:scale-95', on ? 'text-primary-base' : 'text-text-strong-950')}>
                  <Icon className="size-6" />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function InboxBell({ on, unread }: { on: boolean; unread: number }) {
  const Icon = on ? RiNotification3Fill : RiNotification3Line;
  return (
    <Link href="/inbox" title="Inbox" aria-label={unread ? `Inbox, ${unread} unread` : 'Inbox'} className={cn('relative grid size-9 place-items-center rounded-full transition hover:bg-bg-weak-50 active:scale-95', on ? 'text-primary-base' : 'text-text-sub-600')}>
      <Icon className="size-5" />
      {unread > 0 && <span className="absolute right-0.5 top-0.5 inline-grid h-4 min-w-4 place-items-center rounded-full bg-primary-base px-1 text-[10px] font-medium text-static-white ring-2 ring-bg-white-0">{unread}</span>}
    </Link>
  );
}
