'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  RiArrowDownSLine, RiBankLine, RiCheckLine, RiFileCopyLine, RiFingerprintLine, RiKey2Line, RiMacbookLine, RiShieldCheckFill, RiShieldKeyholeLine,
  RiTimeLine, RiUserHeartLine, RiCheckboxCircleFill, RiArrowRightLine, RiIdCardLine, RiQrCodeLine,
} from '@remixicon/react';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Button from '@/components/ui/button';
import * as Alert from '@/components/ui/alert';
import * as Switch from '@/components/ui/switch';
import * as DigitInput from '@/components/ui/digit-input';
import * as ProgressBar from '@/components/ui/progress-bar';
import * as Input from '@/components/ui/input';
import * as Checkbox from '@/components/ui/checkbox';
import { RequireLogin } from '@/components/require-login';
import { ChecksList } from '@/components/checks';
import { MockTag } from '@/components/brand';
import { useSession } from '@/components/session';
import { createPasskey, passkeysSupported, signWithPasskey, hexToBytes, type Passkey } from '@/lib/passkey';
import { createRecoveryCard } from '@/lib/card';
import { counterfactualAddress, passkeySignerAddress, setupTransactions, Safe, type GuardianB } from '@/lib/chain';
import { rsaGuardianAddress } from '@/lib/rsa-guardian';
import { DnieSign, type DnieRequest } from '@/components/dnie-sign';
import { useTxFlow, friendly } from '@/lib/use-tx-flow';
import { api } from '@/lib/api';
import { saveDevice } from '@/lib/device';
import { shortAddress } from '@/lib/format';
import { EXPLORER, RECOVERY_DELAY_LABEL, RECOVERY_DELAY_PRODUCTION } from '@/lib/config';
import { cn } from '@/utils/cn';

type Step = 'intro' | 'passkey' | 'factor' | 'settings' | 'create' | 'proof';
const STEPS: Step[] = ['intro', 'passkey', 'factor', 'settings', 'create', 'proof'];
type Factor = (GuardianB & { label: string }) | null;

export default function NewWalletPage() {
  return <RequireLogin subtitle="Log in to open your self-custody wallet."><Onboarding /></RequireLogin>;
}

function Onboarding() {
  const [step, setStep] = useState<Step>('intro');
  const [owner, setOwner] = useState<Passkey | null>(null);
  const [factor, setFactor] = useState<Factor>(null);
  const [bankAssisted, setBankAssisted] = useState(true);
  const [contact, setContact] = useState('');
  const idx = STEPS.indexOf(step);

  return (
    <div className="mx-auto max-w-[560px]">
      {step !== 'intro' && (
        <div className="mb-6">
          <div className="mb-2 flex justify-between text-label-xs text-text-sub-600"><span>Step {idx} of {STEPS.length - 1}</span><span>{['', 'Your passkey', 'Your backup method', 'Recovery settings', 'Create wallet', 'Ownership proof'][idx]}</span></div>
          <ProgressBar.Root value={idx} max={STEPS.length - 1} />
        </div>
      )}
      <div key={step} className="animate-fade-in-up">
        {step === 'intro' && <Intro onNext={() => setStep('passkey')} />}
        {step === 'passkey' && <PasskeyStep owner={owner} setOwner={setOwner} onNext={() => setStep('factor')} />}
        {step === 'factor' && owner && <FactorStep wallet={counterfactualAddress(owner)} factor={factor} setFactor={setFactor} onNext={() => setStep('settings')} />}
        {step === 'settings' && <SettingsStep bankAssisted={bankAssisted} setBankAssisted={setBankAssisted} contact={contact} setContact={setContact} factor={factor!} onNext={() => setStep('create')} />}
        {step === 'create' && owner && factor && <CreateStep owner={owner} factor={factor} bankAssisted={bankAssisted} contact={contact} onNext={() => setStep('proof')} />}
        {step === 'proof' && owner && <ProofStep owner={owner} />}
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-3xl bg-bg-white-0 p-6 shadow-regular-xs ring-1 ring-inset ring-stroke-soft-200 md:p-8', className)}>{children}</div>;
}

function TechnicalDetails({ children, title = 'How it works' }: { children: React.ReactNode; title?: string }) {
  return (
    <details className="group rounded-xl bg-bg-weak-50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-label-sm text-text-sub-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-base [&::-webkit-details-marker]:hidden">
        {title}<RiArrowDownSLine className="size-5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 px-4 pb-4 text-paragraph-sm text-text-sub-600">{children}</div>
    </details>
  );
}

function Intro({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-primary-base p-6 text-static-white md:p-10">
        <h1 className="sq-display text-[36px] md:text-[56px]">Open your self-custody wallet</h1>
        <p className="mt-4 text-[17px] font-medium text-static-white/90">Three things to know before you start.</p>
      </div>
      <Card className="space-y-5">
        {[
          { icon: RiFingerprintLine, t: 'Approve payments with your passkey', d: 'Use Face ID, Touch ID, Windows Hello or your device PIN. Only your passkey can approve payments; Swissquote cannot move your money.' },
          { icon: RiShieldKeyholeLine, t: 'Choose a backup for lost-device recovery', d: 'If you lose access, you will need your backup method and approval from Swissquote after an identity check. Neither can recover the wallet alone.' },
          { icon: RiTimeLine, t: 'Recovery waits, and you can cancel it', d: `A safety delay of ${RECOVERY_DELAY_PRODUCTION} (${RECOVERY_DELAY_LABEL} in this demo) gives you time to respond to alerts. Cancel using a device with your original passkey.` },
        ].map((f) => (
          <div key={f.t} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-alpha-10 text-primary-base"><f.icon className="size-5" /></span>
            <div><div className="text-label-md text-text-strong-950">{f.t}</div><p className="mt-1 text-paragraph-sm text-text-sub-600">{f.d}</p></div>
          </div>
        ))}
        <Button.Root className="h-12 w-full" onClick={onNext}>Get started<Button.Icon as={RiArrowRightLine} /></Button.Root>
      </Card>
    </div>
  );
}

function PasskeyStep({ owner, setOwner, onNext }: { owner: Passkey | null; setOwner: (p: Passkey) => void; onNext: () => void }) {
  const { client } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const address = owner ? counterfactualAddress(owner) : null;
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-title-h5 text-text-strong-950">Create your wallet passkey</h2>
        <p className="mt-1 text-paragraph-sm text-text-sub-600">Use Face ID, Touch ID, Windows Hello or your device PIN to approve payments. Save this passkey on your everyday device. No seed phrase to write down.</p>
      </div>
      {!passkeysSupported() && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />This browser does not support passkeys.</Alert.Root>}
      {owner ? (
        <div className="space-y-3 rounded-2xl bg-success-lighter p-4">
          <div className="flex items-center gap-2 text-label-sm text-success-base"><RiCheckboxCircleFill className="size-5" />Passkey created</div>
          <div className="text-paragraph-sm text-text-strong-950">Next, choose a separate backup method in case you lose access to this passkey.</div>
        </div>
      ) : (
        <FancyButton.Root variant="primary" className="h-12 w-full" disabled={busy || !passkeysSupported()} onClick={async () => {
          setBusy(true); setError(null);
          try { setOwner(await createPasskey({ userName: `client-${client!.clientId}`, displayName: client!.name, purpose: 'wallet' })); } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
        }}>
          <FancyButton.Icon as={RiFingerprintLine} />{busy ? 'Waiting for your device…' : 'Create passkey'}
        </FancyButton.Root>
      )}
      {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
      {owner && <Button.Root className="h-11 w-full" onClick={onNext}>Continue<Button.Icon as={RiArrowRightLine} /></Button.Root>}
      <TechnicalDetails>
        <p>Your device creates a P-256 signing key. It stays in secure hardware, or syncs through your encrypted iCloud or Google password manager if you use synced passkeys. Swissquote never receives the private key.</p>
        {address && <p>Your wallet address is <span className="font-mono text-paragraph-xs">{shortAddress(address)}</span>, calculated from your passkey before the wallet is created on-chain.</p>}
      </TechnicalDetails>
    </Card>
  );
}

function FactorStep({ wallet, factor, setFactor, onNext }: { wallet: string; factor: Factor; setFactor: (f: Factor) => void; onNext: () => void }) {
  const { client } = useSession();
  const [choice, setChoice] = useState<'dnie' | 'passkey' | 'card'>('passkey');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [card, setCard] = useState<{ address: string; code: string } | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-title-h5 text-text-strong-950">Choose a backup method</h2>
        <p className="mt-1 text-paragraph-sm text-text-sub-600">If you lose access to your wallet, use this together with Swissquote to recover it. Keep it separate from your everyday device. Your backup cannot make payments.</p>
      </div>
      {!factor && (
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            { id: 'passkey', icon: RiMacbookLine, t: 'Passkey on another device', d: 'Your laptop, a second phone or a security key', tag: 'Recommended' },
            { id: 'dnie', icon: RiIdCardLine, t: 'Your ID card', d: 'Tap your ID card on an Android phone, PIN-protected', tag: 'No extra device' },
            { id: 'card', icon: RiQrCodeLine, t: 'Recovery card', d: 'A printable code locked with a 6-digit PIN', tag: 'Offline' },
          ] as const).map((o) => (
            <button key={o.id} aria-pressed={choice === o.id} onClick={() => setChoice(o.id)} className={cn('rounded-2xl p-4 text-left ring-1 ring-inset transition active:scale-[0.98]', choice === o.id ? 'bg-primary-alpha-10 ring-primary-base' : 'bg-bg-white-0 ring-stroke-soft-200 hover:bg-bg-weak-50')}>
              <div className="flex items-center justify-between"><o.icon className={cn('size-6', choice === o.id ? 'text-primary-base' : 'text-text-sub-600')} /><span className="text-label-xs text-text-soft-400">{o.tag}</span></div>
              <div className="mt-3 text-label-sm text-text-strong-950">{o.t}</div>
              <div className="text-paragraph-xs text-text-sub-600">{o.d}</div>
            </button>
          ))}
        </div>
      )}

      {!factor && choice === 'dnie' && (
        <DnieSign
          create={() => api<DnieRequest>('/api/dnie', { action: 'create', purpose: 'enroll' })}
          showRequest={false}
          onDone={(r) => {
            const card = r.card!;
            setFactor({ type: 'dnie', enrollId: r.id, address: rsaGuardianAddress(wallet, card), ...card, label: card.simulated ? `Simulated ID (${card.holder})` : `ID card of ${card.holder}` });
          }}
          intro={<p className="text-paragraph-sm text-text-sub-600">Use your ID card and its PIN to confirm a recovery. You will need an Android phone with the Swissquote ID app to read the card.</p>}
        />
      )}

      {!factor && choice === 'passkey' && (
        <div className="space-y-3">
          <Alert.Root status="information" variant="lighter" size="small"><Alert.Icon /><span>Your browser will ask where to save it. Choose <b>“Use another device”</b> and scan the QR code with your other phone or laptop, or insert a security key.</span></Alert.Root>
          <FancyButton.Root variant="neutral" className="h-12 w-full" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try {
              const pk = await createPasskey({ userName: `client-${client!.clientId}`, displayName: client!.name, purpose: 'recovery', otherDevice: true });
              setFactor({ type: 'passkey', ...pk, address: passkeySignerAddress(pk), label: 'Recovery passkey (other device)' });
            } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
          }}>
            <FancyButton.Icon as={RiKey2Line} />{busy ? 'Waiting for your other device…' : 'Add recovery passkey'}
          </FancyButton.Root>
        </div>
      )}

      {!factor && choice === 'card' && !card && (
        <div className="space-y-3">
          <div className="space-y-1.5"><div className="text-label-sm text-text-strong-950">Choose a 6-digit card PIN</div><DigitInput.Root numInputs={6} value={pin} onChange={setPin} inputType="password" /></div>
          <div className="space-y-1.5"><div className="text-label-sm text-text-strong-950">Repeat the PIN</div><DigitInput.Root numInputs={6} value={pin2} onChange={setPin2} inputType="password" hasError={pin2.length === 6 && pin !== pin2} /></div>
          <Button.Root variant="neutral" className="w-full" disabled={busy || pin.length < 6 || pin !== pin2} onClick={async () => {
            setBusy(true); try { setCard(await createRecoveryCard(pin)); } finally { setBusy(false); }
          }}>{busy ? 'Encrypting…' : 'Generate recovery card'}</Button.Root>
        </div>
      )}

      {!factor && card && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#323232] p-5 text-static-white">
            <div className="flex items-center justify-between"><span className="text-label-sm">Swissquote recovery card</span><RiShieldCheckFill className="size-5 text-primary-base" /></div>
            <div className="mt-4 flex gap-4">
              <div className="rounded-lg bg-static-white p-2"><QRCodeSVG value={card.code} size={112} /></div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-paragraph-xs text-static-white/70">Backup address</div>
                <div className="break-all font-mono text-[11px]">{card.address}</div>
                <div className="text-paragraph-xs text-static-white/70">Locked with your PIN. Shown once, never stored by Swissquote.</div>
              </div>
            </div>
            <div className="mt-4 break-all rounded-lg bg-static-white/10 p-2 font-mono text-[10px] leading-snug text-static-white/80">{card.code}</div>
          </div>
          <div className="flex gap-2">
            <Button.Root variant="neutral" mode="stroke" size="small" onClick={() => navigator.clipboard.writeText(card.code)}><Button.Icon as={RiFileCopyLine} />Copy code</Button.Root>
            <Button.Root variant="neutral" mode="stroke" size="small" onClick={() => window.print()}>Print</Button.Root>
          </div>
          <label className="flex items-center gap-2.5 text-paragraph-sm text-text-strong-950"><Checkbox.Root checked={saved} onCheckedChange={(v) => setSaved(v === true)} />I stored the card and its PIN somewhere safe, away from this device</label>
          <Button.Root className="w-full" disabled={!saved} onClick={() => setFactor({ type: 'card', address: card.address, label: 'Recovery card' })}>Use this card</Button.Root>
        </div>
      )}

      {factor && (
        <div className="flex items-center gap-3 rounded-2xl bg-success-lighter p-4">
          <RiCheckboxCircleFill className="size-6 shrink-0 text-success-base" />
          <div className="min-w-0"><div className="text-label-sm text-text-strong-950">{factor.label} added</div>{factor.type === 'dnie' && <div className="text-paragraph-xs text-text-sub-600">{factor.documentId} · {factor.issuer} · PIN verified</div>}<div className="text-paragraph-xs text-text-sub-600">Your backup is ready for lost-device recovery.</div></div>
        </div>
      )}
      {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
      {factor && <Button.Root className="h-11 w-full" onClick={onNext}>Continue<Button.Icon as={RiArrowRightLine} /></Button.Root>}
      <TechnicalDetails title="How recovery works">
        <p>Your backup is registered as Guardian B. Recovery needs approval from both your backup and Swissquote (Guardian A), followed by a safety delay of {RECOVERY_DELAY_PRODUCTION} ({RECOVERY_DELAY_LABEL} in this demo). Your original passkey can cancel during the delay. Neither guardian can make payments.</p>
        {choice === 'dnie' && <p>Your ID card uses its signature key to approve recovery. Its PIN protects the key; only the public key is registered in an on-chain guardian contract. If you lose the card, its issuing authority handles replacement.</p>}
        {factor && <p>Backup {factor.type === 'dnie' ? 'contract' : 'address'}: <span className="font-mono text-paragraph-xs">{shortAddress(factor.address)}</span>.</p>}
      </TechnicalDetails>
    </Card>
  );
}

function SettingsStep({ bankAssisted, setBankAssisted, contact, setContact, factor, onNext }: { bankAssisted: boolean; setBankAssisted: (b: boolean) => void; contact: string; setContact: (s: string) => void; factor: NonNullable<Factor>; onNext: () => void }) {
  const contactOk = /^0x[0-9a-fA-F]{40}$/.test(contact);
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-title-h5 text-text-strong-950">Recovery settings</h2>
        <p className="mt-1 text-paragraph-sm text-text-sub-600">Both approvals below are needed to recover your wallet. Neither can make payments.</p>
      </div>
      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl bg-bg-weak-50 p-4">
          <div className="text-subheading-2xs uppercase tracking-wider text-text-soft-400">Recovery support</div>
          <div className="mt-2 flex items-center gap-2 text-label-sm text-text-strong-950">{bankAssisted ? <RiBankLine className="size-5 text-primary-base" /> : <RiUserHeartLine className="size-5 text-primary-base" />}{bankAssisted ? 'Swissquote' : 'Trusted contact'}</div>
          <div className="mt-1 text-paragraph-xs text-text-sub-600">{bankAssisted ? 'Approves only after e-banking login and a live face match against your ID. If Swissquote is ever unavailable, an independent partner can approve in its place.' : 'Someone you trust approves from their own wallet.'}</div>
        </div>
        <div className="grid place-items-center text-label-sm text-text-soft-400">AND</div>
        <div className="rounded-2xl bg-bg-weak-50 p-4">
          <div className="text-subheading-2xs uppercase tracking-wider text-text-soft-400">Your backup method</div>
          <div className="mt-2 flex items-center gap-2 text-label-sm text-text-strong-950">{factor.type === 'passkey' ? <RiMacbookLine className="size-5 text-primary-base" /> : factor.type === 'dnie' ? <RiIdCardLine className="size-5 text-primary-base" /> : <RiQrCodeLine className="size-5 text-primary-base" />}{factor.label}</div>
          <div className="mt-1 text-paragraph-xs text-text-sub-600">Something only you have.</div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-warning-lighter p-4 text-paragraph-sm text-text-strong-950"><RiTimeLine className="size-5 shrink-0 text-warning-dark" />Then a safety delay of {RECOVERY_DELAY_PRODUCTION} ({RECOVERY_DELAY_LABEL} in this demo). Cancel during the delay using your original passkey.</div>
      <div className="flex items-start justify-between gap-4 rounded-2xl p-4 ring-1 ring-inset ring-stroke-soft-200">
        <div>
          <div className="text-label-sm text-text-strong-950">Bank-assisted recovery</div>
          <div className="mt-1 text-paragraph-xs text-text-sub-600">Swissquote helps verify your identity. Switch this off to choose a trusted contact instead. Your backup method is still required.</div>
        </div>
        <Switch.Root checked={bankAssisted} onCheckedChange={setBankAssisted} />
      </div>
      {!bankAssisted && (
        <div className="space-y-2">
          <div className="text-label-sm text-text-strong-950">Trusted contact&apos;s wallet address</div>
          <Input.Root hasError={!!contact && !contactOk}><Input.Wrapper><Input.Input placeholder="0x…" value={contact} onChange={(e) => setContact(e.target.value.trim())} className="font-mono" /></Input.Wrapper></Input.Root>
          <p className="text-paragraph-xs text-text-soft-400">This demo&apos;s recovery screens support Swissquote-assisted recovery. The trusted-contact recovery flow is not available here.</p>
        </div>
      )}
      <Button.Root className="h-11 w-full" disabled={!bankAssisted && !contactOk} onClick={onNext}>Continue<Button.Icon as={RiArrowRightLine} /></Button.Root>
    </Card>
  );
}

function CreateStep({ owner, factor, bankAssisted, contact, onNext }: { owner: Passkey; factor: NonNullable<Factor>; bankAssisted: boolean; contact: string; onNext: () => void }) {
  const { client, refresh } = useSession();
  const address = useMemo(() => counterfactualAddress(owner), [owner]);
  const wallet = useMemo(() => ({ address, owner: { ...owner, signer: passkeySignerAddress(owner) }, guardianB: factor }), [address, owner, factor]);
  const flow = useTxFlow({ wallet, deployed: false });
  const [prepError, setPrepError] = useState<string | null>(null);

  // Registers the wallet (idempotent until deployed) and asks Swissquote to check and sponsor the setup batch.
  const prepare = async () => {
    try {
      const { swissquoteGuardian } = await api<{ swissquoteGuardian: string }>('/api/config');
      await api('/api/wallet', { owner, guardianB: factor, bankAssisted, contact: bankAssisted ? undefined : contact });
      const guardianA = bankAssisted ? swissquoteGuardian : contact;
      await flow.prepare(setupTransactions(address, guardianA, factor), { type: 'deploy', title: 'Wallet created, recovery switched on' });
    } catch (e) { setPrepError(friendly(e)); }
  };
  useEffect(() => {
    void Promise.resolve().then(prepare); // state updates happen after the first await, not during the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const failed = !!prepError || flow.phase === 'error';

  useEffect(() => {
    if (flow.phase === 'done') {
      saveDevice({ clientId: client!.clientId, wallet: address, owner: { credentialId: owner.credentialId, x: owner.x, y: owner.y }, createdAt: Date.now() });
      refresh();
    }
  }, [flow.phase, address, owner, client, refresh]);

  const busy = ['preparing', 'signing', 'submitting', 'confirming'].includes(flow.phase);
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-title-h5 text-text-strong-950">Create your wallet</h2>
        <p className="mt-1 text-paragraph-sm text-text-sub-600">Create your wallet with passkey payments and recovery already set up. Only you can approve payments. Swissquote pays the network fee.</p>
      </div>
      <div className="divide-y divide-stroke-soft-200 rounded-xl ring-1 ring-inset ring-stroke-soft-200">
        {[
          ['Wallet address', <span key="a" className="font-mono text-paragraph-xs">{shortAddress(address)}</span>],
          ['Payment approval', 'Your passkey'],
          ['Recovery support', bankAssisted ? 'Swissquote' : 'Trusted contact'],
          ['Backup method', factor.label],
          ['Recovery approvals', 'Both required'],
          ['Safety delay', `${RECOVERY_DELAY_LABEL} in this demo`],
        ].map(([k, v]) => (
          <div key={k as string} className="flex items-center justify-between gap-3 px-3 py-2.5 text-paragraph-sm"><span className="text-text-sub-600">{k}</span><span className="text-right text-label-sm text-text-strong-950">{v}</span></div>
        ))}
      </div>
      {flow.phase !== 'done' && (flow.evaluation || !failed) && <ChecksList evaluation={flow.evaluation} plan={flow.plan} checks={flow.checks} checking={flow.checking} />}
      {prepError && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{prepError}</Alert.Root>}
      {flow.error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{flow.error}</Alert.Root>}
      {flow.phase === 'done' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-success-lighter p-4">
            <RiCheckLine className="size-6 text-success-base" />
            <div className="text-paragraph-sm text-text-strong-950">Wallet deployed on Base Sepolia. <a className="text-primary-base underline" href={`${EXPLORER}/tx/${flow.txHash}`} target="_blank">View transaction</a></div>
          </div>
          <Button.Root className="h-11 w-full" onClick={onNext}>Continue<Button.Icon as={RiArrowRightLine} /></Button.Root>
        </div>
      ) : (
        <FancyButton.Root variant="primary" className="h-12 w-full" disabled={busy || (!failed && flow.phase !== 'review')}
          // Retry from the failed step: re-check and re-sponsor if that never succeeded, otherwise sign again.
          onClick={() => { if (failed && !flow.evaluation) { setPrepError(null); prepare(); } else flow.confirm(); }}>
          <FancyButton.Icon as={RiFingerprintLine} />
          {flow.phase === 'signing' ? 'Approve with your passkey…' : flow.phase === 'submitting' || flow.phase === 'confirming' ? 'Deploying…' : failed ? 'Try again' : 'Create wallet'}
        </FancyButton.Root>
      )}
      <TechnicalDetails>
        <p>A single transaction deploys your Safe smart account, makes your passkey signer contract its only owner and enables recovery. Your recovery support and backup are registered as Guardian A and Guardian B; both approvals are required.</p>
      </TechnicalDetails>
    </Card>
  );
}

function ProofStep({ owner }: { owner: Passkey }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-title-h5 text-text-strong-950">Prove ownership to Swissquote</h2>
          <p className="mt-1 text-paragraph-sm text-text-sub-600">Confirm with your passkey that this wallet belongs to you, so you can add money from your Swissquote account. This does not send money or give Swissquote access to your funds.</p>
        </div>
        <MockTag>Compliance</MockTag>
      </div>
      {done ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-success-lighter p-4"><RiCheckboxCircleFill className="size-6 text-success-base" /><div className="text-paragraph-sm text-text-strong-950">Ownership verified and archived. You can now move funds from your Swissquote account.</div></div>
          <Button.Root className="h-11 w-full" onClick={() => router.push('/wallet')}>Open my wallet<Button.Icon as={RiArrowRightLine} /></Button.Root>
        </div>
      ) : (
        <>
          <FancyButton.Root variant="primary" className="h-12 w-full" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try {
              const ch = await api<{ challengeId: string; hash: string }>('/api/wallet/proof', { stage: 'challenge' });
              const sig = await signWithPasskey([owner.credentialId], hexToBytes(ch.hash));
              await api('/api/wallet/proof', { stage: 'verify', challengeId: ch.challengeId, signature: Safe.createWebAuthnSignature(sig) });
              setDone(true);
            } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
          }}>
            <FancyButton.Icon as={RiFingerprintLine} />{busy ? 'Waiting for your passkey…' : 'Sign ownership proof'}
          </FancyButton.Root>
          <Button.Root variant="neutral" mode="ghost" className="w-full" onClick={() => router.push('/wallet')}>Skip for now</Button.Root>
        </>
      )}
      {error && <Alert.Root status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
      <TechnicalDetails>
        <p>Your passkey signs an ownership challenge. Swissquote verifies it on-chain through your wallet&apos;s signer contract (EIP-1271) and archives the proof. This supports wallet ownership verification under FINMA Guidance 02/2019, without screenshots or test transfers.</p>
      </TechnicalDetails>
    </Card>
  );
}
