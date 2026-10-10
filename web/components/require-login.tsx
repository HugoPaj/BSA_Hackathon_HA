'use client';
import { LoginCard } from './login-card';
import { useSession } from './session';

export function RequireLogin({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  const { client, ready } = useSession();
  if (!ready) return null;
  if (!client) return <div className="mx-auto max-w-[440px] pt-6"><LoginCard subtitle={subtitle ?? 'Log in to continue.'} /></div>;
  return <>{children}</>;
}
