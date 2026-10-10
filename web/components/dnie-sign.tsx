'use client';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RiAndroidLine, RiArrowDownSLine, RiCheckboxCircleFill, RiDownloadLine, RiIdCardLine, RiLoader4Line, RiSmartphoneLine } from '@remixicon/react';
import * as Button from '@/components/ui/button';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Alert from '@/components/ui/alert';
import * as DigitInput from '@/components/ui/digit-input';
import * as Input from '@/components/ui/input';
import { MockTag } from '@/components/brand';
import { api } from '@/lib/api';
import { issueSimDnie, signWithSimDnie, simDnie } from '@/lib/dnie-sim';
import type { DnieCard } from '@/lib/chain';
import { cn } from '@/utils/cn';

export type DnieRequest = { id: string; token: string; title: string; lines: string[]; hash: `0x${string}`; done: boolean; lastError: string | null; card: DnieCard | null };

export const APP_PACKAGE = 'ch.swissquote.idsigner';

/** sqid://sign?... opens the Swissquote ID app. The intent form makes Chrome on Android offer the APK if it is missing. */
export function appLinks(r: Pick<DnieRequest, 'id' | 'token'>, origin: string) {
  const q = `id=${encodeURIComponent(r.id)}&token=${encodeURIComponent(r.token)}&origin=${encodeURIComponent(origin)}`;
  return {
    page: `${origin}/id?${q}`,
    intent: `intent://sign?${q}#Intent;scheme=sqid;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(`${origin}/id?${q}&install=1`)};end`,
  };
}

const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const isLocal = (o: string) => /\/\/(localhost|127\.|\[::1\])/.test(o);

/**
 * Get a DNIe signature for a request created by the server. The card is read by the Swissquote ID app on an Android
 * phone with NFC (this page, or a QR code from a laptop). The simulated card covers demos without one.
 */
export function DnieSign({ create, onDone, intro }: { create: () => Promise<DnieRequest>; onDone: (r: DnieRequest) => void; intro?: React.ReactNode }) {
  const [req, setReq] = useState<DnieRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState(false);
  const [origin, setOrigin] = useState('');
  const doneRef = useRef(false);
  const created = useRef(false);

  useEffect(() => {
    if (created.current) return;
    created.current = true;
    setOrigin(window.location.origin);
    create().then(setReq).catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // One poll loop per request, each poll after the previous one returns, so a slow server never piles up requests.
  const reqId = req?.id, reqToken = req?.token;
  useEffect(() => {
    if (!reqId || !reqToken) return;
    let stopped = false;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await api<Omit<DnieRequest, 'token'>>(`/api/dnie?id=${reqId}&token=${reqToken}`);
        if (stopped) return;
        if (r.done) { if (!doneRef.current) { doneRef.current = true; onDoneRef.current({ ...r, token: reqToken }); } return; }
        setReq((cur) => (cur && cur.lastError !== r.lastError ? { ...cur, lastError: r.lastError } : cur));
      } catch (e) { if (!stopped) setError((e as Error).message); }
      if (!stopped) t = setTimeout(poll, 2000);
    };
    t = setTimeout(poll, 2000);
    return () => { stopped = true; clearTimeout(t); };
  }, [reqId, reqToken]);

  if (error && !req) return <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>;
  if (!req) return <div className="h-40 animate-pulse rounded-2xl bg-bg-weak-50" />;
  const links = appLinks(req, origin);

  return (
    <div className="space-y-4">
      {intro}
      <div className="rounded-2xl bg-bg-weak-50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-alpha-10 text-primary-base"><RiIdCardLine className="size-5" /></span>
          <div className="min-w-0">
            <div className="text-label-sm text-text-strong-950">{req.title}</div>
            <ul className="mt-1 space-y-0.5 text-paragraph-xs text-text-sub-600">{req.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </div>
      </div>

      {isAndroid() ? (
        <FancyButton.Root variant="primary" className="h-12 w-full" asChild>
          <a href={links.intent}><FancyButton.Icon as={RiSmartphoneLine} />Open Swissquote ID and tap your ID card</a>
        </FancyButton.Root>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl p-4 ring-1 ring-inset ring-stroke-soft-200">
          <div className="shrink-0 rounded-xl bg-static-white p-2 ring-1 ring-inset ring-stroke-soft-200"><QRCodeSVG value={links.page} size={116} /></div>
          <div className="min-w-0 space-y-1.5 text-paragraph-xs text-text-sub-600">
            <div className="text-label-sm text-text-strong-950">Scan with your Android phone</div>
            <p>The Swissquote ID app opens. Enter the CAN printed on your ID card and your PIN, then hold the card to the back of the phone.</p>
            {isLocal(origin) && <p className="text-warning-dark">This page runs on {origin.replace(/^https?:\/\//, '')}, which your phone cannot reach. Open the wallet through its network or Tailscale address.</p>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-label-sm text-text-sub-600">
        <RiLoader4Line className="size-4 animate-spin text-primary-base" />Waiting for your ID card…
      </div>
      {req.lastError && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{req.lastError}</Alert.Root>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stroke-soft-200 pt-3">
        <a href="/swissquote-id.apk" className="inline-flex items-center gap-1 text-label-xs text-text-soft-400 hover:text-text-sub-600"><RiAndroidLine className="size-4" />Get the Android app</a>
        <button onClick={() => setSim((s) => !s)} className="inline-flex items-center gap-1 text-label-xs text-text-soft-400 hover:text-text-sub-600">
          No phone or ID card here? Use a simulated ID<RiArrowDownSLine className={cn('size-4 transition-transform', sim && 'rotate-180')} />
        </button>
      </div>
      {sim && <SimulatedDnie req={req} />}
    </div>
  );
}

/** A stand-in card in this browser. Same signature format as the real DNIe, so the contract checks it identically. */
function SimulatedDnie({ req }: { req: DnieRequest }) {
  const [card, setCard] = useState(simDnie);
  const [can, setCan] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!card) {
    return (
      <div className="space-y-3 rounded-2xl p-4 ring-1 ring-inset ring-stroke-soft-200">
        <div className="flex items-start justify-between gap-3">
          <p className="text-paragraph-xs text-text-sub-600">Issue a simulated ID card in this browser. As at the issuing office, you choose its PIN (8 to 16 characters).</p>
          <MockTag>Simulated</MockTag>
        </div>
        <Input.Root><Input.Wrapper><Input.Input type="password" placeholder="Choose a PIN" value={pin} onChange={(e) => setPin(e.target.value)} /></Input.Wrapper></Input.Root>
        <Input.Root hasError={pin2.length >= 8 && pin !== pin2}><Input.Wrapper><Input.Input type="password" placeholder="Repeat the PIN" value={pin2} onChange={(e) => setPin2(e.target.value)} /></Input.Wrapper></Input.Root>
        <Button.Root variant="neutral" className="w-full" disabled={busy || pin.length < 8 || pin.length > 16 || pin !== pin2} onClick={async () => {
          setBusy(true);
          try { await issueSimDnie(pin); setCard(simDnie()); setPin(''); setPin2(''); } finally { setBusy(false); }
        }}>{busy ? 'Generating the card key…' : 'Issue simulated ID card'}</Button.Root>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl p-4 ring-1 ring-inset ring-stroke-soft-200">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#e8eef6] to-[#c9d6e8] p-4 text-[#1d2b45]">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider"><span>National identity card</span><MockTag>Simulated</MockTag></div>
        <div className="mt-3 flex items-end justify-between">
          <div className="h-12 w-10 rounded-md bg-[#1d2b45]/15" />
          <div className="text-right"><div className="text-[9px] uppercase tracking-wider opacity-60">CAN</div><div className="font-mono text-label-md tracking-[0.2em]">{card.can}</div></div>
        </div>
      </div>
      {sent ? (
        <div className="flex items-center gap-2 text-label-sm text-success-base"><RiCheckboxCircleFill className="size-5" />Signed by the card. Finishing…</div>
      ) : (
        <>
          <div className="space-y-1.5"><div className="text-label-xs text-text-sub-600">CAN (6 digits on the card)</div><DigitInput.Root numInputs={6} value={can} onChange={setCan} /></div>
          <Input.Root><Input.Wrapper><Input.Input type="password" placeholder="ID card PIN" value={pin} onChange={(e) => setPin(e.target.value)} /></Input.Wrapper></Input.Root>
          <Button.Root variant="neutral" className="w-full" disabled={busy || can.length !== 6 || pin.length < 8} onClick={async () => {
            setBusy(true); setError(null);
            try {
              const { signature, spki } = await signWithSimDnie(can, pin, req.hash);
              await api('/api/dnie', { action: 'result', id: req.id, token: req.token, signature, spki, simulated: true });
              setSent(true);
            } catch (e) { setError((e as Error).message); setCard(simDnie()); } finally { setBusy(false); }
          }}><Button.Icon as={RiIdCardLine} />{busy ? 'Card is signing…' : 'Tap simulated ID card'}</Button.Root>
          {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
        </>
      )}
      <p className="text-paragraph-xs text-text-soft-400">The key lives encrypted in this browser. It signs exactly like a real ID card (RSA-2048, SHA256withRSA), so the on-chain guardian checks it the same way.</p>
    </div>
  );
}

export function DnieDownload() {
  return (
    <Button.Root variant="neutral" mode="stroke" asChild>
      <a href="/swissquote-id.apk"><Button.Icon as={RiDownloadLine} />Download Swissquote ID (Android)</a>
    </Button.Root>
  );
}
