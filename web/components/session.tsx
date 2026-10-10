'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearPollCache, type Client } from '@/lib/hooks';

type SessionValue = {
  client: Client | null;
  wallet: { address: string; deployed: boolean } | null;
  ready: boolean;
  /** Best guess before the session request returns (the server saw a session cookie), the real answer after. */
  signedIn: boolean;
  refresh: () => Promise<void>;
  login: (clientId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children, hasCookie = false }: { children: React.ReactNode; hasCookie?: boolean }) {
  const [client, setClient] = useState<Client | null>(null);
  const [wallet, setWallet] = useState<SessionValue['wallet']>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    const r = await api<{ client: Client | null; wallet: SessionValue['wallet'] }>('/api/session').catch(() => ({ client: null, wallet: null }));
    setClient(r.client);
    setWallet(r.wallet ?? null);
    setReady(true);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session fetch
  useEffect(() => { refresh(); }, [refresh]);
  const login = useCallback(async (clientId: string, password: string) => {
    await api('/api/session', { clientId, password });
    clearPollCache();
    await refresh();
  }, [refresh]);
  const logout = useCallback(async () => {
    await api('/api/session', undefined, 'DELETE');
    clearPollCache();
    await refresh();
  }, [refresh]);
  const signedIn = ready ? !!client : hasCookie;
  return <Ctx.Provider value={{ client, wallet, ready, signedIn, refresh, login, logout }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
