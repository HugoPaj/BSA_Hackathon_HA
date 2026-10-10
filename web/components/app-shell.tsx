'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  RiApps2Fill, RiApps2Line, RiHome5Fill, RiHome5Line, RiLogoutBoxRLine, RiMailFill, RiMailLine,
  RiShieldUserFill, RiShieldUserLine, RiWallet3Fill, RiWallet3Line,
} from '@remixicon/react';
import { cn } from '@/utils/cn';
import { useAlerts } from '@/lib/hooks';
import { SqLogo } from './brand';
import { useSession } from './session';

const NAV = [
  { href: '/', label: 'Home', icon: RiHome5Line, active: RiHome5Fill, match: (p: string) => p === '/' },
  { href: '/wallet', label: 'Wallet', icon: RiWallet3Line, active: RiWallet3Fill, match: (p: string) => p === '/wallet' || p.startsWith('/wallet/send') || p.startsWith('/wallet/receive') || p.startsWith('/wallet/new') },
  { href: '/wallet/dapps', label: 'dApps', icon: RiApps2Line, active: RiApps2Fill, match: (p: string) => p.startsWith('/wallet/dapps') },
  { href: '/wallet/security', label: 'Security', icon: RiShieldUserLine, active: RiShieldUserFill, match: (p: string) => p.startsWith('/wallet/security') || p.startsWith('/recover') },
  { href: '/inbox', label: 'Inbox', icon: RiMailLine, active: RiMailFill, match: (p: string) => p.startsWith('/inbox') },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { client, logout } = useSession();
  const { data: alerts } = useAlerts(client ? 5000 : 0);
  const unread = (alerts ?? []).filter((a) => !a.read).length;
  const bare = pathname.startsWith('/backoffice');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-stroke-soft-200 bg-bg-white-0/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1220px] items-center gap-6 px-4 lg:px-8">
          <Link href="/" className="shrink-0"><SqLogo product={bare ? 'Operations' : 'Wallet'} /></Link>
          {!bare && client && (
            <nav className="hidden flex-1 items-center gap-1 md:flex">
              {NAV.map((n) => {
                const on = n.match(pathname);
                return (
                  <Link key={n.href} href={n.href} className={cn('relative rounded-lg px-3 py-2 text-label-sm transition-colors', on ? 'text-primary-base' : 'text-text-sub-600 hover:bg-bg-weak-50 hover:text-text-strong-950')}>
                    {n.label}
                    {n.href === '/inbox' && unread > 0 && <span className="ml-1.5 inline-grid size-4 place-items-center rounded-full bg-primary-base text-[10px] font-medium text-static-white">{unread}</span>}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden h-6 items-center gap-1.5 rounded-full bg-bg-weak-50 px-2.5 text-label-xs text-text-sub-600 ring-1 ring-inset ring-stroke-soft-200 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-success-base" />Base Sepolia testnet
            </span>
            {client && !bare && (
              <>
                <span className="hidden text-right lg:block">
                  <span className="block text-label-sm text-text-strong-950">{client.name}</span>
                  <span className="block text-paragraph-xs text-text-soft-400">Client {client.clientId}</span>
                </span>
                <button onClick={logout} className="grid size-9 place-items-center rounded-full text-text-sub-600 ring-1 ring-inset ring-stroke-soft-200 hover:bg-bg-weak-50" title="Log out of Swissquote">
                  <RiLogoutBoxRLine className="size-[18px]" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={cn('mx-auto w-full max-w-[1220px] flex-1 px-4 pt-6 lg:px-8 lg:pt-10', client && !bare ? 'pb-28 md:pb-16' : 'pb-16')}>{children}</main>

      {client && !bare && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stroke-soft-200 bg-bg-white-0/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <div className="grid grid-cols-5">
            {NAV.map((n) => {
              const on = n.match(pathname);
              const Icon = on ? n.active : n.icon;
              return (
                <Link key={n.href} href={n.href} className={cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', on ? 'text-primary-base' : 'text-text-strong-950')}>
                  <Icon className="size-6" />
                  {n.label}
                  {n.href === '/inbox' && unread > 0 && <span className="absolute right-[calc(50%-18px)] top-1.5 size-2 rounded-full bg-primary-base" />}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
