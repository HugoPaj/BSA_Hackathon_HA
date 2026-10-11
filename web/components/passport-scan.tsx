'use client';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RiAppleLine, RiGooglePlayLine, RiLoader4Line, RiPassportLine, RiSmartphoneLine, RiUserForbidLine } from '@remixicon/react';
import * as Button from '@/components/ui/button';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Alert from '@/components/ui/alert';
import { MockTag } from '@/components/brand';
import { api } from '@/lib/api';
import { parse, stringify } from '@/lib/json';
import type { ScanStatus } from '@/services/passport-core';

// The passport guardian's API, proxied unchanged by /passport-guardian/*. It fetches scan results from Signicat
// itself and signs with its own key, so passing through Swissquote's server changes nothing.
export const passportGuardian = <T,>(path: string, body: unknown) => api<T>(`/passport-guardian${path}`, body);

export type ScanStart = { scan: string; link: string | null; simulated: boolean };
type Pending<C> = ScanStart & { at: number; context?: C };
const TTL = 30 * 60_000;
const SIM_KEY = 'sq.simpassport.v1';
const READID = { ios: 'https://apps.apple.com/app/readid-ready/id1486164875', android: 'https://play.google.com/store/apps/details?id=com.readid.ready' };

/** A scan started on this device and not finished yet: ReadID Ready sends the user back here, often to a fresh page. */
export function pendingScan<C = unknown>(key: string): Pending<C> | null {
  try {
    const p = parse(localStorage.getItem(key) ?? 'null') as Pending<C> | null;
    return p && p.at + TTL > Date.now() ? p : null;
  } catch { return null; }
}

const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const randomSecret = () => '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Scan a passport chip with Signicat's ReadID Ready app, for the passport guardian. `start` opens the scan (enrol or
 * recover) with a callback: on a phone the app returns to this page, from a QR code it returns to /passport/done.
 * Without Signicat credentials the guardian runs simulated, and a secret in this browser plays the passport.
 */
export function PassportScan<C = unknown>({ storageKey, purpose, start, context, onDone }: {
  storageKey: string;
  purpose: 'enroll' | 'recover';
  start: (callback: string) => Promise<ScanStart>;
  /** Saved with the pending scan, for the page to restore its own state when the app returns to it. */
  context?: C;
  onDone: (s: Extract<ScanStatus, { status: 'done' }>) => Promise<void> | void;
}) {
  const [scan, setScan] = useState<Pending<C> | null>(null);
  const [phone, setPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only: device type and a scan to resume
    setPhone(isPhone());
    setScan(pendingScan<C>(storageKey));
  }, [storageKey]);

  const clear = () => { localStorage.removeItem(storageKey); setScan(null); };
  const finish = async (s: ScanStatus) => {
    if (s.status === 'pending') return false;
    clear();
    if (s.status !== 'done') { setProblem(s.reason); return true; }
    if (done.current) return true;
    done.current = true;
    try { await onDoneRef.current(s); } catch (e) { done.current = false; setProblem((e as Error).message); }
    return true;
  };

  const begin = async () => {
    setBusy(true); setProblem(null);
    try {
      const callback = phone ? window.location.origin + window.location.pathname : window.location.origin + '/passport/done';
      const p: Pending<C> = { ...(await start(callback)), at: Date.now(), context };
      localStorage.setItem(storageKey, stringify(p));
      setScan(p);
    } catch (e) { setProblem((e as Error).message); } finally { setBusy(false); }
  };

  // One poll at a time while a real scan is open. The guardian asks Signicat; we only ask the guardian.
  const scanId = scan && !scan.simulated ? scan.scan : null;
  useEffect(() => {
    if (!scanId) return;
    let stopped = false;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await passportGuardian<ScanStatus>('/scan', { scan: scanId });
        if (stopped || await finish(s)) return;
      } catch (e) {
        if (stopped) return;
        if (/Unknown or expired/.test((e as Error).message)) { clear(); setProblem('The scan expired. Start again.'); return; }
        setProblem((e as Error).message);
      }
      if (!stopped) t = setTimeout(poll, 2500);
    };
    t = setTimeout(poll, 1000);
    return () => { stopped = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const simulate = async (secret: string) => {
    setBusy(true); setProblem(null);
    try { await finish(await passportGuardian<ScanStatus>('/scan/simulate', { scan: scan!.scan, secret })); } catch (e) { setProblem((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!scan && (
        <FancyButton.Root variant="primary" className="h-12 w-full" disabled={busy} onClick={begin}>
          <FancyButton.Icon as={RiPassportLine} />{busy ? 'Preparing the scan…' : purpose === 'enroll' ? 'Scan my passport' : 'Scan my passport to approve'}
        </FancyButton.Root>
      )}

      {scan && !scan.simulated && scan.link && (phone ? (
        <FancyButton.Root variant="primary" className="h-12 w-full" asChild>
          <a href={scan.link}><FancyButton.Icon as={RiSmartphoneLine} />Open ReadID Ready and scan</a>
        </FancyButton.Root>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl p-4 ring-1 ring-inset ring-stroke-soft-200">
          <div className="shrink-0 rounded-xl bg-static-white p-2 ring-1 ring-inset ring-stroke-soft-200"><QRCodeSVG value={scan.link} size={116} /></div>
          <div className="min-w-0 space-y-1.5 text-paragraph-xs text-text-sub-600">
            <div className="text-label-sm text-text-strong-950">Scan with your phone</div>
            <p>The ReadID Ready app opens. Point the camera at the photo page of your passport, then hold the passport flat against the back of the phone until the chip is read.</p>
          </div>
        </div>
      ))}

      {scan && !scan.simulated && (
        <>
          <div className="flex items-center justify-center gap-2 text-label-sm text-text-sub-600"><RiLoader4Line className="size-4 animate-spin text-primary-base" />Waiting for your passport…</div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stroke-soft-200 pt-3 text-label-xs text-text-soft-400">
            <span className="flex items-center gap-3">
              Get ReadID Ready:
              <a href={READID.ios} target="_blank" className="inline-flex items-center gap-1 hover:text-text-sub-600"><RiAppleLine className="size-4" />iPhone</a>
              <a href={READID.android} target="_blank" className="inline-flex items-center gap-1 hover:text-text-sub-600"><RiGooglePlayLine className="size-4" />Android</a>
            </span>
            <button className="hover:text-text-sub-600" onClick={() => { clear(); setProblem(null); }}>Start over</button>
          </div>
        </>
      )}

      {scan?.simulated && (
        <div className="space-y-3 rounded-2xl bg-bg-weak-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-paragraph-xs text-text-sub-600">
              {purpose === 'enroll'
                ? 'The passport guardian has no ReadID account configured, so this browser gets a simulated passport instead. Recovery then needs this same browser.'
                : 'Simulated passports live in the browser that enrolled them.'}
            </p>
            <MockTag>Simulated passport</MockTag>
          </div>
          {purpose === 'enroll' ? (
            <Button.Root variant="neutral" className="w-full" disabled={busy} onClick={() => { const s = randomSecret(); localStorage.setItem(SIM_KEY, s); simulate(s); }}><Button.Icon as={RiPassportLine} />{busy ? 'Reading the chip…' : 'Scan simulated passport'}</Button.Root>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button.Root variant="neutral" disabled={busy || !localStorage.getItem(SIM_KEY)} onClick={() => simulate(localStorage.getItem(SIM_KEY)!)}><Button.Icon as={RiPassportLine} />{busy ? 'Reading the chip…' : 'Scan my passport'}</Button.Root>
              <Button.Root variant="error" mode="stroke" disabled={busy} onClick={() => simulate(randomSecret())}><Button.Icon as={RiUserForbidLine} />Simulate: another passport</Button.Root>
            </div>
          )}
        </div>
      )}

      {problem && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{problem}</Alert.Root>}
    </div>
  );
}
