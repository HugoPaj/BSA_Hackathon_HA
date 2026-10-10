'use client';
import { useState } from 'react';
import { RiLockPasswordLine, RiUser3Line } from '@remixicon/react';
import * as Input from '@/components/ui/input';
import * as Label from '@/components/ui/label';
import * as Button from '@/components/ui/button';
import * as Alert from '@/components/ui/alert';
import { DEMO_CLIENT } from '@/lib/config';
import { MockTag } from './brand';
import { useSession } from './session';

export function LoginCard({ title = 'Log in to Swissquote', subtitle, onDone }: { title?: string; subtitle?: string; onDone?: () => void }) {
  const { login } = useSession();
  const [clientId, setClientId] = useState(DEMO_CLIENT.clientId);
  const [password, setPassword] = useState(DEMO_CLIENT.password);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="w-full rounded-20 bg-bg-white-0 p-6 shadow-regular-md ring-1 ring-inset ring-stroke-soft-200"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try { await login(clientId, password); onDone?.(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-title-h6 text-text-strong-950">{title}</h2>
          {subtitle && <p className="mt-1 text-paragraph-sm text-text-sub-600">{subtitle}</p>}
        </div>
        <MockTag>Mock login</MockTag>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label.Root htmlFor="cid">Client number</Label.Root>
          <Input.Root><Input.Wrapper><Input.Icon as={RiUser3Line} /><Input.Input id="cid" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="username" /></Input.Wrapper></Input.Root>
        </div>
        <div className="space-y-1.5">
          <Label.Root htmlFor="pw">Password</Label.Root>
          <Input.Root><Input.Wrapper><Input.Icon as={RiLockPasswordLine} /><Input.Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Input.Wrapper></Input.Root>
        </div>
        {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
        <Button.Root type="submit" className="w-full" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</Button.Root>
        <p className="text-center text-paragraph-xs text-text-soft-400">Demo client {DEMO_CLIENT.name}, {DEMO_CLIENT.clientId} / {DEMO_CLIENT.password}. In production this is Swissquote&apos;s existing e-banking login with its own MFA.</p>
      </div>
    </form>
  );
}
