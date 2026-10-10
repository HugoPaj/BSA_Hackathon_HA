import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import '@sfinterface/numbers/styles.css';
import './globals.css';
import { SessionProvider } from '@/components/session';
import { AppShell } from '@/components/app-shell';
import { AlertWatcher } from '@/components/alert-watcher';
import { NotificationProvider } from '@/components/ui/notification-provider';

export const metadata: Metadata = {
  title: 'Swissquote Wallet · Self-custody',
  description: 'A passkey-controlled self-custody wallet next to your Swissquote account. Hackathon prototype on Base Sepolia.',
};

export const viewport: Viewport = { themeColor: '#ffffff', width: 'device-width', initialScale: 1 };

/** Reads the session cookie so the first render (and the server HTML) already has the signed-in layout and its skeletons. */
async function Session({ children }: { children: React.ReactNode }) {
  const hasCookie = (await cookies()).has('sq_session');
  return <SessionProvider hasCookie={hasCookie}>{children}</SessionProvider>;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Extensions such as ColorZilla add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>
        {/* The cookie read is instant, so the real tree streams in the same response as this fallback. */}
        <Suspense fallback={<div className="min-h-dvh" />}>
          <Session>
            <AppShell>{children}</AppShell>
            <AlertWatcher />
            <NotificationProvider />
          </Session>
        </Suspense>
      </body>
    </html>
  );
}
