'use client';
import { useEffect, useRef } from 'react';
import { notification } from '@/hooks/use-notification';
import { useAlerts } from '@/lib/hooks';
import { useSession } from './session';

/** Turns new server-side alerts into toasts: the "push" channel of the demo. */
export function AlertWatcher() {
  const { client } = useSession();
  const { data } = useAlerts(client ? 4000 : 0);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    if (!seen.current) {
      seen.current = new Set(data.map((a) => a.id));
      return;
    }
    for (const a of [...data].reverse()) {
      if (seen.current.has(a.id)) continue;
      seen.current.add(a.id);
      if (Date.now() - a.ts > 60_000) continue;
      notification({ title: a.title, description: a.body, status: a.severity === 'info' ? 'information' : a.severity, variant: 'stroke' });
    }
  }, [data]);
  return null;
}
