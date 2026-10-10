'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Activity, Alert, PublicRecoverySession, WalletRecord } from './server/db';
import type { WalletState } from './chain';

export type Client = { clientId: string; name: string; email: string };
export type WalletData = { wallet: WalletRecord | null; state?: WalletState; recovery?: PublicRecoverySession | null };

export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    if (!intervalMs) return;
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, intervalMs, ...deps]);
  return { data, error, loading, refresh };
}

export function useWallet(intervalMs = 6000) {
  return usePoll(() => api<WalletData>('/api/wallet'), intervalMs);
}

export function useActivity(intervalMs = 8000) {
  return usePoll(() => api<{ activity: Activity[] }>('/api/activity').then((r) => r.activity), intervalMs);
}

export function useAlerts(intervalMs = 5000, enabled = true) {
  return usePoll(() => (enabled ? api<{ alerts: Alert[] }>('/api/alerts').then((r) => r.alerts).catch(() => [] as Alert[]) : Promise.resolve(undefined)), enabled ? intervalMs : 0, [enabled]);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
