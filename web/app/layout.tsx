import type { Metadata, Viewport } from 'next';
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Extensions such as ColorZilla add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>
        <SessionProvider>
          <AppShell>{children}</AppShell>
          <AlertWatcher />
          <NotificationProvider />
        </SessionProvider>
      </body>
    </html>
  );
}
