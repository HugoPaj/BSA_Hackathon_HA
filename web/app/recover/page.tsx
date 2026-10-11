'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  RiArrowLeftLine, RiArrowRightLine, RiCheckLine, RiCloseCircleFill, RiShieldCheckLine, RiFingerprintLine, RiMacbookLine,
  RiUserForbidLine, RiCameraLine, RiCheckboxCircleFill, RiExternalLinkLine, RiArrowDownSLine,
} from '@remixicon/react';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Button from '@/components/ui/button';
import * as Alert from '@/components/ui/alert';
import * as ProgressBar from '@/components/ui/progress-bar';
import { LoginForm } from '@/components/login-card';
import { SplitScreen } from '@/components/split-screen';
import { Bone, BoneLines, Skeleton } from '@/components/skeleton';
import { CardUnlock } from '@/components/card-unlock';
import { MockTag } from '@/components/brand';
import type { LivenessAttestation } from '@/lib/liveness';
import { useSession } from '@/components/session';
import { api, ApiError } from '@/lib/api';
import { createPasskey, hexToBytes, signWithPasskey, type Passkey } from '@/lib/passkey';
import { factorName, Safe, type WalletState } from '@/lib/chain';
import { PassportScan, passportGuardian, type ScanStart } from '@/components/passport-scan';
import { friendly, type CardSigner } from '@/lib/use-tx-flow';
import { saveDevice } from '@/lib/device';
import { useNow } from '@/lib/hooks';
import { formatDuration, shortAddress } from '@/lib/format';
import { EXPLORER, RECOVERY_DELAY_LABEL, RECOVERY_DELAY_PRODUCTION } from '@/lib/config';
import type { PublicRecoverySession, WalletRecord } from '@/lib/server/db';
import { cn } from '@/utils/cn';

type Info = { client: { clientId: string; name: string }; wallet: Pick<WalletRecord, 'address' | 'guardianA' | 'guardianB' | 'bankAssisted'> & { deployed: boolean } | null; state?: WalletState; session: PublicRecoverySession | null };
const LS = 'sq.recovery.v1';

// One component for the whole flow, logged out included: the layout and its artwork stay mounted
// from step to step, so the image animates in once instead of on every step.
export default function RecoverPage() {
  const { signedIn, logout } = useSession();
  const [info, setInfo] = useState<Info | null>(null);
  // Recovery doesn't log you in: step 1 only identifies you to /api/recovery. null until its first answer.
  const [identified, setIdentified] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<Passkey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (id = sessionId) => {
    try {
      const r = await api<Info>(`/api/recovery${id ? `?id=${id}` : ''}`);
      setInfo(r);
      setIdentified(true);
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setIdentified(false); return null; }
      throw e;
    }
  };
  useEffect(() => {
    const saved = localStorage.getItem(LS);
    const id = saved ? JSON.parse(saved).id : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resume a recovery saved in this browser
    if (id) setSessionId(id);
    load(id).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!sessionId || !identified) return;
    const t = setInterval(() => load(sessionId).catch(() => {}), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, identified]);

  // After going back to step 1, ignore whatever the previous identification loaded.
  const live = identified ? info : null;
  const steps = recoverySteps(live, !!newKey || !!live?.session, !!identified);
  const layout = (children: React.ReactNode, back?: Back) => <RecoverLayout steps={steps} wallet={live?.wallet?.address} back={back}>{children}</RecoverLayout>;
  // Step 1 is identification, so going back from step 2 drops it (and a full login, if recovery started from one).
  const toLogin = async () => {
    setError(null); setNewKey(null);
    await api('/api/recovery', undefined, 'DELETE').catch(() => {});
    if (signedIn) await logout();
    setIdentified(false);
  };

  if (identified === false) {
    return layout(
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-title-h4 text-text-strong-950">Identify yourself</h2>
            <p className="mt-2 text-paragraph-md text-text-sub-600">Use your Swissquote client number and password. This only opens the recovery: you are not logged in to your account on this device until your new passkey takes over.</p>
          </div>
        </div>
        <LoginForm label="Continue" busyLabel="Checking…" submit={async (clientId, password) => { await api('/api/recovery', { action: 'identify', clientId, password }); await load(); }} />
      </Panel>,
      '/',
    );
  }

  if (error) return layout(<Alert.Root status="error" variant="lighter" size="large"><Alert.Icon />{error}</Alert.Root>, toLogin);
  if (!info || !identified) return layout(<RecoverSkeleton />, identified ? toLogin : '/');
  if (!info.wallet) return layout(<Panel><div><h2 className="text-title-h4 text-text-strong-950">No wallet for this client</h2><p className="mt-2 text-paragraph-md text-text-sub-600">There is nothing to recover. <Link className="text-primary-base" href="/wallet/new">Open a wallet</Link>.</p></div></Panel>, toLogin);

  const s = info.session;
  const stage = !s ? (newKey ? 'start' : 'passkey') : s.status === 'collecting' ? 'collect' : s.status;
  const restart = () => { localStorage.removeItem(LS); setSessionId(null); setNewKey(null); load(null); };
  // Back steps through everything that is still off-chain. A collecting request only exists on
  // Swissquote's server, so it can be dropped; once both guardians signed it is on-chain and final.
  const back: Back = {
    passkey: toLogin,
    start: () => setNewKey(null),
    collect: () => { if (!s?.guardianB || confirm('Go back and discard the approval you already gave?')) restart(); },
  }[stage as string];

  return layout(
    <>
      {stage === 'passkey' && <NewPasskey info={info} onCreated={setNewKey} />}
      {stage === 'start' && newKey && <StartRecovery info={info} newKey={newKey} onStarted={(id) => { setSessionId(id); localStorage.setItem(LS, JSON.stringify({ id })); load(id); }} />}
      {stage === 'collect' && s && <Collect info={info} session={s} onChange={() => load()} />}
      {stage === 'pending' && s && <Pending info={info} session={s} onChange={() => load()} />}
      {stage === 'finalized' && s && <Finalized clientId={info.client.clientId} session={s} onReset={() => { localStorage.removeItem(LS); }} />}
      {stage === 'refused' && <Ended tone="error" title="Recovery refused" body="Swissquote's face check did not match the ID on file, so its guardian key did not sign. Without Swissquote's approval and your own recovery factor, nobody can replace the passkey. The owner was alerted on every channel." onRestart={restart} />}
      {stage === 'cancelled' && <Ended tone="warning" title="Recovery cancelled by the owner" body="A device that still holds the current passkey tapped “This wasn't me” and cancelled the request on-chain. Nothing changed." onRestart={restart} />}
    </>,
    back,
  );
}

type Step = { t: string; done: boolean; failed?: boolean };
/** Where Back goes: a URL, an action that returns to the previous step, or nothing once the flow can't go back. */
type Back = string | (() => void) | undefined;

function recoverySteps(info: Info | null, hasKey: boolean, identified: boolean) {
  const s = info?.session;
  const items: Step[] = [
    { t: 'Identify with your Swissquote login', done: identified },
    { t: 'New passkey on this device', done: hasKey },
    { t: 'Your recovery factor approves', done: !!s?.guardianB },
    { t: info?.wallet?.guardianB.type === 'passport' ? 'Swissquote approves' : 'Swissquote face check approves', done: !!s?.swissquote || s?.liveness?.result === 'match', failed: s?.status === 'refused' },
    { t: `Safety delay (${RECOVERY_DELAY_LABEL})`, done: s?.status === 'finalized' },
  ];
  const current = items.findIndex((i) => !i.done);
  return { items, current: current === -1 ? items.length : current };
}

const backClass = '-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-label-sm text-text-sub-600 transition hover:bg-bg-weak-50 hover:text-text-strong-950 active:scale-[0.97]';

/**
 * Split screen: artwork on the left; on the right, navigation pinned to the top, the current step
 * with a slim progress bar in the middle, and a reassurance line pinned to the bottom.
 */
function RecoverLayout({ steps, wallet, back, children }: { steps: ReturnType<typeof recoverySteps>; wallet?: string; back?: Back; children: React.ReactNode }) {
  const { items, current } = steps;
  const failed = items.some((i) => i.failed);
  const eyebrow = failed ? 'Recovery stopped' : current < items.length ? `Step ${current + 1} of ${items.length}` : 'Recovery complete';
  return (
    <SplitScreen image="/landing/recover.webp" bannerClassName="h-[180px] sm:h-[260px]">
      <div className="flex min-h-7 items-center justify-between gap-3">
        {typeof back === 'string'
          ? <Link href={back} className={backClass}><RiArrowLeftLine className="size-4" />Back</Link>
          : back ? <button type="button" onClick={back} className={backClass}><RiArrowLeftLine className="size-4" />Back</button> : <span />}
        {wallet && <span className="rounded-md bg-bg-weak-50 px-2 py-1 font-mono text-paragraph-xs text-text-sub-600" title={wallet}>{shortAddress(wallet)}</span>}
      </div>
      <div className="mx-auto w-full max-w-[520px] pt-8 lg:my-auto lg:py-10">
        <div className="text-subheading-2xs uppercase tracking-wider text-primary-base">{eyebrow}</div>
        <div className="mt-3 grid grid-cols-5 gap-1">
          {items.map((it, i) => (
            <span key={it.t} title={it.t} className={cn('h-1 rounded-full', it.failed ? 'bg-error-base' : it.done ? 'bg-success-base' : i === current ? 'bg-primary-base' : 'bg-bg-soft-200')} />
          ))}
        </div>
        <div className="mt-6 space-y-5">{children}</div>
      </div>
      <div className="mt-10 flex items-center justify-center gap-2 text-paragraph-xs text-text-soft-400">
        <RiShieldCheckLine className="size-4" />Swissquote never holds a key that can spend
      </div>
    </SplitScreen>
  );
}

/** Stands in for a step panel while the recovery state loads. */
function RecoverSkeleton() {
  return (
    <Skeleton className="space-y-5">
      <div className="space-y-2"><Bone className="h-7 w-3/4" /><BoneLines /></div>
      <Bone className="h-12 w-full rounded-10" />
    </Skeleton>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('animate-fade-in-up space-y-5', className)}>{children}</div>;
}

function NewPasskey({ info, onCreated }: { info: Info; onCreated: (p: Passkey) => void }) {
  // The recovery identification, not a login: on a new device there is no logged-in session.
  const { client } = info;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Panel>
      <div>
        <h2 className="text-title-h4 text-text-strong-950">Create a new passkey on this device</h2>
        <p className="mt-2 text-paragraph-md text-text-sub-600">It will replace the lost one as the owner of your wallet. The old passkey is revoked on-chain when recovery completes, never rebuilt.</p>
      </div>
      {info.state?.recovery && <Alert.Root status="warning" variant="lighter" size="small"><Alert.Icon />A recovery is already pending for this wallet.</Alert.Root>}
      {!info.wallet!.bankAssisted && <Alert.Root status="warning" variant="lighter" size="small"><Alert.Icon />This wallet uses a trusted contact instead of Swissquote. Ask them to approve your request.</Alert.Root>}
      <FancyButton.Root variant="primary" className="h-12 w-full" disabled={busy || !!info.state?.recovery} onClick={async () => {
        setBusy(true); setError(null);
        try { onCreated(await createPasskey({ userName: `client-${client.clientId}`, displayName: client.name, purpose: 'wallet' })); } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
      }}><FancyButton.Icon as={RiFingerprintLine} />{busy ? 'Waiting for your device…' : 'Create new passkey'}</FancyButton.Root>
      {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
    </Panel>
  );
}

function StartRecovery({ info, newKey, onStarted }: { info: Info; newKey: Passkey; onStarted: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Panel>
      <div className="flex items-center gap-3 rounded-2xl bg-success-lighter p-4"><RiCheckboxCircleFill className="size-6 text-success-base" /><div className="text-paragraph-sm text-text-strong-950">New passkey ready. Its signer contract will be <span className="font-mono text-paragraph-xs">{shortAddress(Safe.createWebAuthnSignerVerifierAddress(newKey.x, newKey.y))}</span>.</div></div>
      <p className="text-paragraph-sm text-text-sub-600">Next, Swissquote prepares a structured recovery request: <i>replace the owner of {shortAddress(info.wallet!.address)} with this new passkey</i>. Both guardians sign exactly that request (EIP-712). The current owner is alerted immediately.</p>
      <Button.Root className="h-11 w-full" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { const r = await api<{ session: PublicRecoverySession }>('/api/recovery', { action: 'start', newOwner: newKey }); onStarted(r.session.id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? 'Preparing…' : 'Start recovery request'}<Button.Icon as={RiArrowRightLine} /></Button.Root>
      {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
    </Panel>
  );
}

function Collect({ info, session, onChange }: { info: Info; session: PublicRecoverySession; onChange: () => void }) {
  // One guardian at a time, in the order of the steps: your recovery factor, then Swissquote's face check. A passport
  // scan covers both: ReadID's live face check against the chip photo is Swissquote's liveness evidence.
  const passport = info.wallet!.guardianB.type === 'passport';
  if (session.swissquote || session.liveness?.result === 'match') return <Approved text={passport ? 'Passport and live face check passed. Swissquote is signing the request.' : 'Face check passed. Swissquote is signing the request.'} />;
  if (!session.guardianB || passport) return <GuardianB info={info} session={session} onDone={onChange} />;
  return <><Approved text={`${info.wallet!.guardianB.label} approved`} /><Liveness session={session} onDone={onChange} /></>;
}

function Approved({ text }: { text: string }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-success-lighter p-4 text-label-sm text-text-strong-950"><RiCheckboxCircleFill className="size-5 text-success-base" />{text}</div>;
}

function GuardianB({ info, session, onDone }: { info: Info; session: PublicRecoverySession; onDone: () => void }) {
  const gB = info.wallet!.guardianB;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const submit = async (signature: string) => { await api('/api/recovery', { action: 'guardian', id: session.id, signature }); onDone(); };
  return (
    <Panel>
      <div>
        <h2 className="text-title-h4 text-text-strong-950">Approve with your {factorName(gB.type)}</h2>
        <p className="mt-2 text-paragraph-md text-text-sub-600">
          {gB.type === 'passport' ? `Scan the document you enrolled (${gB.label}) with the ReadID Ready app, then look into the camera for the live face check. The passport guardian checks that the chip is authentic, not a clone, the one you enrolled, and that your face matches its photo. Then it signs exactly this request, and Swissquote accepts the same face check.` : gB.type === 'passkey' ? 'Your browser will ask for the recovery passkey. Choose “Use another device” and scan the QR code with the phone or laptop that holds it, or use your security key.' : 'Use the recovery card you printed or copied when you created your wallet, plus the PIN you chose for it. The card key signs the request in this browser and is never sent anywhere.'}
        </p>
      </div>
      <details className="group rounded-xl bg-bg-weak-50">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-base [&::-webkit-details-marker]:hidden">
          <span className="text-paragraph-sm text-text-sub-600"><b className="text-text-strong-950">You&apos;re approving:</b> move wallet {shortAddress(session.wallet)} to the new passkey on this device. Your old passkey will stop working.</span>
          <RiArrowDownSLine className="size-5 shrink-0 text-text-soft-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4">
          <p className="text-label-xs text-text-soft-400">Technical details: the exact message signed</p>
          <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-text-sub-600">ExecuteRecovery(wallet {shortAddress(session.wallet)}, newOwners [{shortAddress(session.newOwner.signer)}], newThreshold 1, nonce {session.nonce})</p>
        </div>
      </details>
      {gB.type === 'passport' ? (
        <PassportScan
          storageKey={`sq.passport.recover.${session.id}`}
          purpose="recover"
          start={(callback) => passportGuardian<ScanStart>('/recover', { wallet: session.wallet, newOwner: session.newOwner.signer, callback })}
          onDone={async (s) => {
            if (s.hash?.toLowerCase() !== session.hash.toLowerCase()) throw new Error('The passport guardian signed a different request. Start the recovery again.');
            await api('/api/recovery', { action: 'guardian', id: session.id, signature: s.signature });
            await api('/api/recovery', { action: 'liveness', id: session.id, attestation: s.attestation });
            onDone();
          }}
        />
      ) : gB.type === 'passkey' ? (
        <FancyButton.Root variant="neutral" className="h-12 w-full" disabled={busy} onClick={async () => {
          setBusy(true); setError(null);
          try { const sig = await signWithPasskey([gB.credentialId], hexToBytes(session.hash)); await submit(Safe.createWebAuthnSignature(sig)); } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
        }}><FancyButton.Icon as={RiMacbookLine} />{busy ? 'Waiting for your recovery device…' : 'Approve with recovery device'}</FancyButton.Root>
      ) : (
        <CardUnlock purpose="Unlock your recovery card" onUnlocked={async (card: CardSigner) => {
          setBusy(true); setError(null);
          try { await submit(await card.sign({ hash: session.hash as `0x${string}` })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }} />
      )}
      {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
      {!missing ? (
        <button className="w-full text-center text-label-xs text-text-soft-400 hover:text-text-sub-600" onClick={() => setMissing(true)}>I don&apos;t have it</button>
      ) : (
        <Alert.Root status="information" variant="lighter" size="small"><Alert.Icon /><div><b>Then recovery is not possible, by design.</b> This is exactly what stops a thief who has your phone and your e-mail: they can pass a login, but they don&apos;t hold Guardian B. If you lost both your passkey and your recovery factor, the wallet cannot be recovered: that is the price of nobody else being able to take it over.</div></Alert.Root>
      )}
    </Panel>
  );
}

/** The liveness vendor's API (proxied unchanged by /liveness/*). */
async function vendor<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({ error: 'The liveness vendor is offline' }));
  if (!res.ok) throw new Error(out.error ?? 'The liveness vendor is offline');
  return out as T;
}

function Liveness({ session, onDone }: { session: PublicRecoverySession; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<'off' | 'on' | 'denied'>('off');
  const [scan, setScan] = useState(0);
  const [busy, setBusy] = useState<false | 'match' | 'mismatch'>(false);
  const [error, setError] = useState<string | null>(null);
  // Held in its own ref: by the time an unmount cleanup runs, React has already cleared video.current.
  const stream = useRef<MediaStream | null>(null);
  const unmounted = useRef(false);
  const stopCamera = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => { unmounted.current = false; return () => { unmounted.current = true; stopCamera(); }; }, []);
  useEffect(() => {
    if (cam !== 'on' || scan >= 100) return;
    const t = setTimeout(() => setScan((s) => Math.min(100, s + 4)), 80);
    return () => clearTimeout(t);
  }, [cam, scan]);
  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      stopCamera(); stream.current = s;
      if (unmounted.current) return stopCamera();
      if (video.current) { video.current.srcObject = s; await video.current.play(); }
      setCam('on');
    } catch { setCam('denied'); setScan(100); }
  };
  const send = async (result: 'match' | 'mismatch') => {
    setBusy(result); setError(null);
    try {
      // As the vendor's SDK would: open a session for this exact request, get the vendor-signed verdict, hand it on.
      const { session: vendorSession } = await vendor<{ session: string }>('/liveness/sessions', { subject: session.clientId, wallet: session.wallet, request: session.hash });
      const { attestation } = await vendor<{ attestation: LivenessAttestation }>('/liveness/sessions/complete', { session: vendorSession, result });
      await api('/api/recovery', { action: 'liveness', id: session.id, attestation });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); stopCamera(); onDone(); }
  };
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-title-h4 text-text-strong-950">Face check against your ID</h2>
          <p className="mt-2 text-paragraph-md text-text-sub-600">Swissquote&apos;s guardian key signs only after a live face match against your KYC file, approved by two operators. An e-mail link or SMS code is never enough.</p>
        </div>
        <MockTag>Mock face analysis</MockTag>
      </div>
      <div className="relative mx-auto grid aspect-square w-full max-w-[260px] place-items-center overflow-hidden rounded-full bg-[#323232]">
        <video ref={video} playsInline muted className={cn('absolute inset-0 size-full -scale-x-100 object-cover', cam === 'on' ? 'opacity-100' : 'opacity-0')} />
        {cam !== 'on' && <RiCameraLine className="size-12 text-static-white/40" />}
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="none" stroke="#FA5B35" strokeWidth="2.5" strokeDasharray={`${(scan / 100) * 301.6} 301.6`} strokeLinecap="round" /></svg>
      </div>
      {cam === 'off' && <Button.Root variant="neutral" mode="stroke" className="w-full" onClick={start}><Button.Icon as={RiCameraLine} />Start camera</Button.Root>}
      {cam === 'denied' && <p className="text-center text-paragraph-xs text-text-soft-400">No camera available. The check is simulated either way.</p>}
      {cam === 'on' && scan < 100 && <p className="text-center text-paragraph-sm text-text-sub-600">Hold still, turn your head slowly…</p>}
      {scan >= 100 && (
        <div className="grid gap-2 sm:grid-cols-2">
          <FancyButton.Root variant="primary" disabled={!!busy} onClick={() => send('match')}><FancyButton.Icon as={RiCheckLine} />{busy === 'match' ? 'Swissquote is signing…' : 'Face matches my ID'}</FancyButton.Root>
          <Button.Root variant="error" mode="stroke" disabled={!!busy} onClick={() => send('mismatch')}><Button.Icon as={RiUserForbidLine} />Simulate: someone else</Button.Root>
        </div>
      )}
      {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
      <p className="text-center text-paragraph-xs text-text-soft-400">Demo: choose the outcome. “Someone else” plays the attacker who has your phone and e-mail. The liveness vendor signs the verdict, and Swissquote&apos;s guardian checks that signature itself.</p>
    </Panel>
  );
}

function Pending({ info, session, onChange }: { info: Info; session: PublicRecoverySession; onChange: () => void }) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const executeAfter = Number(info.state?.recovery?.executeAfter ?? session.executeAfter ?? 0);
  const left = executeAfter - now / 1000;
  const total = (session.executeAfter ?? executeAfter) - (session.swissquote?.signedAt ?? session.createdAt) / 1000;
  return (
    <Panel>
      <Approved text="Both guardians approved. Submitted on-chain." />
      <div className="text-center">
        <div className="text-paragraph-sm text-text-sub-600">{left > 0 ? 'New passkey takes over in' : 'Safety delay over'}</div>
        <div className="mt-1 font-medium tabular-nums text-text-strong-950 text-[44px] tracking-[-0.02em]">{formatDuration(Math.max(0, left))}</div>
        <div className="text-paragraph-xs text-text-soft-400">{RECOVERY_DELAY_PRODUCTION} in production</div>
      </div>
      <ProgressBar.Root color="orange" value={Math.max(0, total - Math.max(0, left))} max={total || 1} />
      <div className="rounded-2xl bg-warning-lighter p-4 text-paragraph-sm text-text-strong-950">Alerts went out by push, e-mail and the e-banking inbox. If the real owner still has their passkey, they can cancel during this window.</div>
      {session.submittedTx && <a className="flex items-center justify-center gap-1 text-label-xs text-primary-base hover:underline" target="_blank" href={`${EXPLORER}/tx/${session.submittedTx}`}>Guardian approvals on BaseScan <RiExternalLinkLine className="size-3.5" /></a>}
      <FancyButton.Root variant="primary" className="h-12 w-full" disabled={left > 0 || busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await api('/api/recovery', { action: 'finalize', id: session.id }); onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? 'Finalising…' : left > 0 ? 'Waiting for the delay…' : 'Finish recovery'}</FancyButton.Root>
      {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
    </Panel>
  );
}

function Finalized({ clientId, session, onReset }: { clientId: string; session: PublicRecoverySession; onReset: () => void }) {
  const { refresh } = useSession();
  useEffect(() => {
    saveDevice({ clientId, wallet: session.wallet, owner: { credentialId: session.newOwner.credentialId, x: session.newOwner.x, y: session.newOwner.y }, createdAt: Date.now() });
    refresh(); // finalising turned the recovery session into a normal login
    onReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Panel className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-lighter text-success-base"><RiCheckLine className="size-8" /></span>
      <div><div className="text-title-h4 text-text-strong-950">Wallet recovered</div><p className="mt-2 text-paragraph-md text-text-sub-600">This device&apos;s passkey is now the only owner. The old passkey was revoked on-chain and can no longer sign. Same address, same balance.</p></div>
      {session.finalizedTx && <a className="inline-flex items-center gap-1 text-label-sm text-primary-base hover:underline" target="_blank" href={`${EXPLORER}/tx/${session.finalizedTx}`}>Owner swap on BaseScan <RiExternalLinkLine className="size-4" /></a>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button.Root asChild><Link href="/wallet">Open wallet</Link></Button.Root>
        <Button.Root asChild variant="neutral" mode="stroke"><Link href="/wallet/security#proof">Re-verify ownership</Link></Button.Root>
      </div>
    </Panel>
  );
}

function Ended({ tone, title, body, onRestart }: { tone: 'error' | 'warning'; title: string; body: string; onRestart: () => void }) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <RiCloseCircleFill className={cn('size-7 shrink-0', tone === 'error' ? 'text-error-base' : 'text-warning-base')} />
        <div><div className="text-title-h6 text-text-strong-950">{title}</div><p className="mt-2 text-paragraph-md text-text-sub-600">{body}</p></div>
      </div>
      <Button.Root variant="neutral" mode="stroke" className="w-full" onClick={onRestart}>Start over</Button.Root>
    </Panel>
  );
}
