'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Activity, Alert, PublicRecoverySession, WalletRecord } from './server/db';
import type { WalletState } from './chain';

export type Client = { clientId: string; name: string; email: string };
export type WalletData = { wallet: WalletRecord | null; state?: WalletState; recovery?: PublicRecoverySession | null };

// Last response per endpoint, shared by every component polling it. Revisiting a page shows the last data
// at once and refreshes it in the background, instead of a skeleton on every navigation.
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<(d: unknown) => void>>();

/** Drop cached responses. Call when the signed-in client changes. */
export function clearPollCache() {
  cache.clear();
}

/** Polls `fn` every `intervalMs` (0: once). With a `key`, the result is cached and shared across components. */
export function usePoll<T>(key: string | null, fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !(key && cache.has(key)));
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  useEffect(() => {
    if (!key) return;
    const set = listeners.get(key) ?? new Set();
    listeners.set(key, set);
    const onData = (d: unknown) => setData(d as T);
    set.add(onData);
    return () => { set.delete(onData); };
  }, [key]);
  const refresh = useCallback(async () => {
    try {
      const d = await fnRef.current();
      if (key && d !== undefined) {
        cache.set(key, d);
        listeners.get(key)?.forEach((l) => l(d));
      } else {
        setData(d);
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [key]);
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
  return usePoll('/api/wallet', () => api<WalletData>('/api/wallet'), intervalMs);
}

export function useActivity(intervalMs = 8000) {
  return usePoll('/api/activity', () => api<{ activity: Activity[] }>('/api/activity').then((r) => r.activity), intervalMs);
}

export function useAlerts(intervalMs = 5000, enabled = true) {
  return usePoll(enabled ? '/api/alerts' : null, () => (enabled ? api<{ alerts: Alert[] }>('/api/alerts').then((r) => r.alerts).catch(() => [] as Alert[]) : Promise.resolve(undefined)), enabled ? intervalMs : 0, [enabled]);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
