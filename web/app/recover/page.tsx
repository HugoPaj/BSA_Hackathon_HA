'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  RiArrowRightLine, RiBankLine, RiCheckLine, RiCloseCircleFill, RiFingerprintLine, RiMacbookLine, RiShieldKeyholeLine,
  RiTimeLine, RiUserForbidLine, RiCameraLine, RiCheckboxCircleFill, RiIdCardLine, RiExternalLinkLine,
} from '@remixicon/react';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Button from '@/components/ui/button';
import * as Alert from '@/components/ui/alert';
import * as ProgressBar from '@/components/ui/progress-bar';
import { RequireLogin } from '@/components/require-login';
import { PageTitle } from '@/components/page-title';
import { CardUnlock } from '@/components/card-unlock';
import { MockTag } from '@/components/brand';
import { useSession } from '@/components/session';
import { api } from '@/lib/api';
import { createPasskey, hexToBytes, signWithPasskey, type Passkey } from '@/lib/passkey';
import { Safe, type WalletState } from '@/lib/chain';
import { friendly, type CardSigner } from '@/lib/use-tx-flow';
import { saveDevice } from '@/lib/device';
import { useNow } from '@/lib/hooks';
import { formatDuration, shortAddress } from '@/lib/format';
import { EXPLORER, RECOVERY_DELAY_LABEL, RECOVERY_DELAY_PRODUCTION } from '@/lib/config';
import type { PublicRecoverySession, WalletRecord } from '@/lib/server/db';
import { cn } from '@/utils/cn';

type Info = { wallet: Pick<WalletRecord, 'address' | 'guardianA' | 'guardianB' | 'bankAssisted'> & { deployed: boolean } | null; state?: WalletState; session: PublicRecoverySession | null };
const LS = 'sq.recovery.v1';

export default function RecoverPage() {
  return <RequireLogin subtitle="Step 1 of recovery: log in to Swissquote e-banking."><Recover /></RequireLogin>;
}

function Recover() {
  const [info, setInfo] = useState<Info | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<Passkey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (id = sessionId) => {
    const r = await api<Info>(`/api/recovery${id ? `?id=${id}` : ''}`);
    setInfo(r);
    return r;
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
    if (!sessionId) return;
    const t = setInterval(() => load(sessionId).catch(() => {}), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (error) return <div className="mx-auto max-w-[560px]"><Alert.Root status="error" variant="lighter" size="large"><Alert.Icon />{error}</Alert.Root></div>;
  if (!info) return <div className="mx-auto h-64 max-w-[560px] animate-pulse rounded-3xl bg-bg-white-0" />;
  if (!info.wallet) return <div className="mx-auto max-w-[560px] rounded-3xl bg-bg-white-0 p-8 text-center ring-1 ring-inset ring-stroke-soft-200"><div className="text-title-h6">No wallet for this client</div><p className="mt-2 text-paragraph-sm text-text-sub-600">There is nothing to recover. <Link className="text-primary-base" href="/wallet/new">Open a wallet</Link>.</p></div>;

  const s = info.session;
  const stage = !s ? (newKey ? 'start' : 'passkey') : s.status === 'collecting' ? 'collect' : s.status;

  return (
    <div className="mx-auto max-w-[620px]">
      <PageTitle title="Recover your wallet" subtitle={<>Replace a lost passkey for wallet <span className="font-mono text-paragraph-xs">{shortAddress(info.wallet.address)}</span>. Same address, same funds.</>} back="/" />
      <Steps info={info} hasKey={!!newKey || !!s} />
      <div className="mt-5 space-y-5">
        {stage === 'passkey' && <NewPasskey info={info} onCreated={setNewKey} />}
        {stage === 'start' && newKey && <StartRecovery info={info} newKey={newKey} onStarted={(id) => { setSessionId(id); localStorage.setItem(LS, JSON.stringify({ id })); load(id); }} />}
        {stage === 'collect' && s && <Collect info={info} session={s} onChange={() => load()} />}
        {stage === 'pending' && s && <Pending info={info} session={s} onChange={() => load()} />}
        {stage === 'finalized' && s && <Finalized session={s} onReset={() => { localStorage.removeItem(LS); }} />}
        {stage === 'refused' && <Ended tone="error" title="Recovery refused" body="Swissquote's face check did not match the ID on file, so its guardian key did not sign. Without Swissquote's approval and your own recovery factor, nobody can replace the passkey. The owner was alerted on every channel." onRestart={() => { localStorage.removeItem(LS); setSessionId(null); setNewKey(null); load(null); }} />}
        {stage === 'cancelled' && <Ended tone="warning" title="Recovery cancelled by the owner" body="A device that still holds the current passkey tapped “This wasn't me” and cancelled the request on-chain. Nothing changed." onRestart={() => { localStorage.removeItem(LS); setSessionId(null); setNewKey(null); load(null); }} />}
      </div>
    </div>
  );
}

function Steps({ info, hasKey }: { info: Info; hasKey: boolean }) {
  const s = info.session;
  const items = [
    { t: 'Swissquote login', done: true, icon: RiBankLine },
    { t: 'New passkey on this device', done: hasKey, icon: RiFingerprintLine },
    { t: 'Your recovery factor approves', done: !!s?.guardianB, icon: info.wallet?.guardianB.type === 'card' ? RiIdCardLine : RiMacbookLine },
    { t: 'Swissquote face check approves', done: !!s?.swissquote || s?.liveness?.result === 'match', icon: RiShieldKeyholeLine, failed: s?.status === 'refused' },
    { t: `Safety delay (${RECOVERY_DELAY_LABEL})`, done: s?.status === 'finalized', icon: RiTimeLine, active: s?.status === 'pending' },
  ];
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {items.map((it, i) => (
        <div key={i} className="space-y-1.5">
          <div className={cn('h-1.5 rounded-full', it.failed ? 'bg-error-base' : it.done ? 'bg-success-base' : it.active ? 'bg-warning-base' : 'bg-bg-soft-200')} />
          <div className={cn('hidden text-paragraph-xs sm:block', it.done ? 'text-text-strong-950' : 'text-text-soft-400')}>{it.t}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('animate-fade-in-up space-y-5 rounded-3xl bg-bg-white-0 p-6 ring-1 ring-inset ring-stroke-soft-200 md:p-8', className)}>{children}</div>;
}

function NewPasskey({ info, onCreated }: { info: Info; onCreated: (p: Passkey) => void }) {
  const { client } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Panel>
      <div>
        <h2 className="text-title-h5 text-text-strong-950">Create a new passkey on this device</h2>
        <p className="mt-1 text-paragraph-sm text-text-sub-600">It will replace the lost one as the owner of your wallet. The old passkey is revoked on-chain when recovery completes, never rebuilt.</p>
      </div>
      {info.state?.recovery && <Alert.Root status="warning" variant="lighter" size="small"><Alert.Icon />A recovery is already pending for this wallet.</Alert.Root>}
      {!info.wallet!.bankAssisted && <Alert.Root status="warning" variant="lighter" size="small"><Alert.Icon />This wallet uses a trusted contact instead of Swissquote. Ask them to approve your request.</Alert.Root>}
      <FancyButton.Root variant="primary" className="h-12 w-full" disabled={busy || !!info.state?.recovery} onClick={async () => {
        setBusy(true); setError(null);
        try { onCreated(await createPasskey({ userName: `client-${client!.clientId}`, displayName: client!.name, purpose: 'wallet' })); } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
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
  return (
    <>
      {!session.guardianB ? <GuardianB info={info} session={session} onDone={onChange} /> : <Approved text={`${info.wallet!.guardianB.label} approved`} />}
      {session.swissquote ? <Approved text="Swissquote approved after the face check" />
        : session.liveness?.result === 'match' ? <Approved text="Face check passed. Swissquote signs as soon as your recovery factor approves." />
        : <Liveness session={session} onDone={onChange} />}
    </>
  );
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
        <div className="text-subheading-2xs uppercase tracking-wider text-text-soft-400">Guardian B · something only you have</div>
        <h2 className="mt-1 text-title-h5 text-text-strong-950">Approve with your {gB.type === 'passkey' ? 'recovery device' : 'recovery card'}</h2>
        <p className="mt-1 text-paragraph-sm text-text-sub-600">
          {gB.type === 'passkey' ? 'Your browser will ask for the recovery passkey. Choose “Use another device” and scan the QR code with the phone or laptop that holds it, or use your security key.' : 'Use the recovery card you printed or copied when you created your wallet, plus the PIN you chose for it. The card key signs the request in this browser and is never sent anywhere.'}
        </p>
      </div>
      <div className="rounded-xl bg-bg-weak-50 p-3 font-mono text-[11px] leading-relaxed text-text-sub-600">ExecuteRecovery(wallet {shortAddress(session.wallet)}, newOwners [{shortAddress(session.newOwner.signer)}], newThreshold 1, nonce {session.nonce})</div>
      {gB.type === 'passkey' ? (
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

function Liveness({ session, onDone }: { session: PublicRecoverySession; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<'off' | 'on' | 'denied'>('off');
  const [scan, setScan] = useState(0);
  const [busy, setBusy] = useState<false | 'match' | 'mismatch'>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { (video.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => {
    if (cam !== 'on' || scan >= 100) return;
    const t = setTimeout(() => setScan((s) => Math.min(100, s + 4)), 80);
    return () => clearTimeout(t);
  }, [cam, scan]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (video.current) { video.current.srcObject = stream; await video.current.play(); }
      setCam('on');
    } catch { setCam('denied'); setScan(100); }
  };
  const send = async (result: 'match' | 'mismatch') => {
    setBusy(result); setError(null);
    try { await api('/api/recovery', { action: 'liveness', id: session.id, result }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); (video.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); onDone(); }
  };
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-subheading-2xs uppercase tracking-wider text-text-soft-400">Guardian A · Swissquote</div>
          <h2 className="mt-1 text-title-h5 text-text-strong-950">Face check against your ID</h2>
          <p className="mt-1 text-paragraph-sm text-text-sub-600">Swissquote&apos;s guardian key signs only after a live face match against your KYC file, approved by two operators. An e-mail link or SMS code is never enough.</p>
        </div>
        <MockTag>Mock liveness</MockTag>
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
      <p className="text-center text-paragraph-xs text-text-soft-400">Demo: choose the outcome. “Someone else” plays the attacker who has your phone and e-mail.</p>
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

function Finalized({ session, onReset }: { session: PublicRecoverySession; onReset: () => void }) {
  const { client, refresh } = useSession();
  useEffect(() => {
    saveDevice({ clientId: client!.clientId, wallet: session.wallet, owner: { credentialId: session.newOwner.credentialId, x: session.newOwner.x, y: session.newOwner.y }, createdAt: Date.now() });
    refresh();
    onReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Panel className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-lighter text-success-base"><RiCheckLine className="size-8" /></span>
      <div><div className="text-title-h5 text-text-strong-950">Wallet recovered</div><p className="mt-1 text-paragraph-sm text-text-sub-600">This device&apos;s passkey is now the only owner. The old passkey was revoked on-chain and can no longer sign. Same address, same balance.</p></div>
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
        <div><div className="text-title-h6 text-text-strong-950">{title}</div><p className="mt-1 text-paragraph-sm text-text-sub-600">{body}</p></div>
      </div>
      <Button.Root variant="neutral" mode="stroke" className="w-full" onClick={onRestart}>Start over</Button.Root>
    </Panel>
  );
}
