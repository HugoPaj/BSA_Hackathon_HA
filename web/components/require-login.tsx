'use client';
import { LoginCard } from './login-card';
import { useSession } from './session';

export function RequireLogin({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  const { signedIn } = useSession();
  // Before the session request returns, trust the cookie: the page renders (and shows its own skeleton) right away.
  if (!signedIn) return <div className="mx-auto max-w-[440px] pt-6"><LoginCard subtitle={subtitle ?? 'Log in to continue.'} /></div>;
  return <>{children}</>;
}
