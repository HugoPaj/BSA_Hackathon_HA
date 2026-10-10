'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  RiBankLine, RiExternalLinkLine, RiFingerprintLine, RiHistoryLine, RiIdCardLine, RiKey2Line, RiMacbookLine, RiRefreshLine,
  RiTimeLine, RiVerifiedBadgeFill, RiDeleteBinLine, RiSkull2Line,
} from '@remixicon/react';
import * as Badge from '@/components/ui/badge';
import * as Button from '@/components/ui/button';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Alert from '@/components/ui/alert';
import { RequireLogin } from '@/components/require-login';
import { PageTitle } from '@/components/page-title';
import { RecoveryBanner } from '@/components/recovery-banner';
import { TxSheet } from '@/components/tx-sheet';
import { useWallet, type WalletData } from '@/lib/hooks';
import { useTxFlow, friendly } from '@/lib/use-tx-flow';
import { api } from '@/lib/api';
import { Safe, srm } from '@/lib/chain';
import { hexToBytes, signWithPasskey } from '@/lib/passkey';
import { forgetDevice } from '@/lib/device';
import { shortAddress, timeAgo } from '@/lib/format';
import { EXPLORER, RECOVERY_DELAY_LABEL, RECOVERY_DELAY_PRODUCTION, RECOVERY_MODULE } from '@/lib/config';
import { useSession } from '@/components/session';

export default function SecurityPage() {
  return <RequireLogin><Security /></RequireLogin>;
}

function Section({ title, children, id, right }: { title: string; children: React.ReactNode; id?: string; right?: React.ReactNode }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-24 rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-subheading-xs uppercase tracking-wider text-text-sub-600">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

function Security() {
  const { data, refresh } = useWallet();
  if (!data?.wallet || !data.state?.deployed) return <div className="mx-auto max-w-[480px] text-center text-paragraph-sm text-text-sub-600">No wallet yet. <Link className="text-primary-base" href="/wallet/new">Open one</Link>.</div>;
  return <SecurityInner data={data} refresh={refresh} />;
}

function SecurityInner({ data, refresh }: { data: WalletData; refresh: () => void }) {
  const wallet = data.wallet!;
  const state = data.state!;
  const label = (a: string) => a.toLowerCase() === wallet.guardianA.address.toLowerCase() ? wallet.guardianA : a.toLowerCase() === wallet.guardianB.address.toLowerCase() ? wallet.guardianB : { label: 'Unknown guardian', type: 'unknown' };

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <PageTitle title="Security" subtitle="Everything below is read live from the chain. Only your passkey can change it." back="/wallet" />
      {state.recovery && <RecoveryBanner data={data} onChange={refresh} />}

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Owner: who can spend">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary-alpha-10 text-primary-base"><RiFingerprintLine className="size-6" /></span>
            <div className="min-w-0">
              <div className="text-label-md text-text-strong-950">Your passkey</div>
              <div className="truncate font-mono text-paragraph-xs text-text-sub-600">Signer contract {shortAddress(state.owners[0])}</div>
            </div>
          </div>
          <p className="mt-3 text-paragraph-xs text-text-sub-600">The Safe has exactly {state.owners.length} owner with threshold 1. It verifies your passkey&apos;s P-256 signature on-chain for every transaction.</p>
          {wallet.previousOwners.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-label-xs text-text-soft-400">Revoked passkeys</div>
              {wallet.previousOwners.map((o) => (
                <div key={o.signer} className="flex items-center justify-between rounded-xl bg-bg-weak-50 px-3 py-2 text-paragraph-xs"><span className="font-mono text-text-sub-600 line-through">{shortAddress(o.signer)}</span><span className="text-text-soft-400">revoked {timeAgo(o.revokedAt)}</span></div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Recovery guardians" right={<a className="flex items-center gap-1 text-label-xs text-primary-base hover:underline" target="_blank" href={`${EXPLORER}/address/${RECOVERY_MODULE}`}>Module <RiExternalLinkLine className="size-3.5" /></a>}>
          <div className="space-y-2">
            {state.guardians.map((g) => {
              const l = label(g);
              const Icon = l.type === 'swissquote' ? RiBankLine : l.type === 'passkey' ? RiMacbookLine : l.type === 'card' ? RiIdCardLine : RiKey2Line;
              return (
                <div key={g} className="flex items-center gap-3 rounded-xl bg-bg-weak-50 px-3 py-2.5">
                  <Icon className="size-5 shrink-0 text-text-sub-600" />
                  <div className="min-w-0 flex-1"><div className="text-label-sm text-text-strong-950">{l.label}</div><div className="truncate font-mono text-paragraph-xs text-text-soft-400">{g}</div></div>
                  <Badge.Root color="gray" variant="lighter">Can&apos;t spend</Badge.Root>
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-paragraph-xs">
            <div className="rounded-xl p-3 ring-1 ring-inset ring-stroke-soft-200"><div className="text-text-soft-400">Approvals needed</div><div className="text-label-md text-text-strong-950">{state.threshold.toString()} of {state.guardians.length}</div></div>
            <div className="rounded-xl p-3 ring-1 ring-inset ring-stroke-soft-200"><div className="flex items-center gap-1 text-text-soft-400"><RiTimeLine className="size-3.5" />Safety delay</div><div className="text-label-md text-text-strong-950">{RECOVERY_DELAY_LABEL}</div><div className="text-text-soft-400">{RECOVERY_DELAY_PRODUCTION} in production</div></div>
          </div>
          <div className="mt-4 flex items-start justify-between gap-4 rounded-xl p-3 ring-1 ring-inset ring-stroke-soft-200">
            <div><div className="text-label-sm text-text-strong-950">Bank-assisted recovery</div><div className="text-paragraph-xs text-text-sub-600">{wallet.bankAssisted ? 'Swissquote is Guardian A. To opt out, your passkey swaps it for a trusted contact (guardian rotation, production feature).' : 'Off: a trusted contact is Guardian A.'}</div></div>
            <Badge.Root color={wallet.bankAssisted ? 'green' : 'gray'} variant="lighter" className="shrink-0">{wallet.bankAssisted ? 'On' : 'Off'}</Badge.Root>
          </div>
        </Section>
      </div>

      <ProofSection data={data} refresh={refresh} />
      <DemoTools data={data} refresh={refresh} />
    </div>
  );
}

function ProofSection({ data, refresh }: { data: WalletData; refresh: () => void }) {
  const wallet = data.wallet!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Section id="proof" title="Wallet ownership proof (FINMA Guidance 02/2019)">
      {wallet.proof ? (
        <div className="flex items-start gap-3">
          <RiVerifiedBadgeFill className="mt-0.5 size-6 shrink-0 text-information-base" />
          <div className="min-w-0 text-paragraph-sm text-text-sub-600">
            <div className="text-label-sm text-text-strong-950">Verified {timeAgo(wallet.proof.verifiedAt)}</div>
            {wallet.proof.method}. Signer {shortAddress(wallet.proof.signer)}. Swissquote archives the signed message and re-attests after every recovery.
            <pre className="mt-2 whitespace-pre-wrap break-all rounded-xl bg-bg-weak-50 p-3 font-mono text-[11px] leading-relaxed text-text-sub-600">{wallet.proof.message}</pre>
          </div>
        </div>
      ) : (
        <p className="text-paragraph-sm text-text-sub-600">No valid proof on file{wallet.previousOwners.length ? ' since your last recovery' : ''}. Sign one so Swissquote can send funds to this wallet without manual checks.</p>
      )}
      {error && <Alert.Root className="mt-3" status="error" variant="lighter" size="small"><Alert.Icon />{error}</Alert.Root>}
      <FancyButton.Root variant={wallet.proof ? 'basic' : 'primary'} size="small" className="mt-4" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try {
          const ch = await api<{ challengeId: string; hash: string }>('/api/wallet/proof', { stage: 'challenge' });
          const sig = await signWithPasskey([wallet.owner.credentialId], hexToBytes(ch.hash));
          await api('/api/wallet/proof', { stage: 'verify', challengeId: ch.challengeId, signature: Safe.createWebAuthnSignature(sig) });
          refresh();
        } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
      }}><FancyButton.Icon as={RiFingerprintLine} />{busy ? 'Waiting for passkey…' : wallet.proof ? 'Sign a fresh proof' : 'Sign ownership proof'}</FancyButton.Root>
    </Section>
  );
}

function DemoTools({ data, refresh }: { data: WalletData; refresh: () => void }) {
  const wallet = data.wallet!;
  const { refresh: refreshSession } = useSession();
  const old = wallet.previousOwners[wallet.previousOwners.length - 1];
  const flow = useTxFlow({ wallet, deployed: true, signer: old ?? wallet.owner });
  const [open, setOpen] = useState(false);
  const txs = [srm.createChangeThresholdMetaTransaction(2n)];
  return (
    <Section title="Demo tools">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-bg-weak-50 p-4">
          <div><div className="flex items-center gap-2 text-label-sm text-text-strong-950"><RiSkull2Line className="size-4" />Try the old passkey</div><p className="mt-1 text-paragraph-xs text-text-sub-600">{old ? 'Sign a transaction with the passkey that was replaced by recovery. The chain should reject it.' : 'Available after a recovery.'}</p></div>
          <Button.Root size="xsmall" variant="neutral" mode="stroke" disabled={!old} onClick={() => { setOpen(true); flow.prepare(txs, { type: 'security', title: 'Old passkey attempt' }); }}>Sign with old passkey</Button.Root>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-bg-weak-50 p-4">
          <div><div className="flex items-center gap-2 text-label-sm text-text-strong-950"><RiHistoryLine className="size-4" />Lose this device</div><p className="mt-1 text-paragraph-xs text-text-sub-600">Forget the local device record. For a real loss, delete the passkey in Chrome DevTools &gt; WebAuthn (virtual authenticator) or your password manager.</p></div>
          <Button.Root size="xsmall" variant="neutral" mode="stroke" asChild><Link href="/recover" onClick={() => forgetDevice()}>Forget device and recover</Link></Button.Root>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-bg-weak-50 p-4">
          <div><div className="flex items-center gap-2 text-label-sm text-text-strong-950"><RiRefreshLine className="size-4" />Reset demo</div><p className="mt-1 text-paragraph-xs text-text-sub-600">Swissquote forgets this wallet so onboarding can be shown again. The old wallet stays on-chain.</p></div>
          <Button.Root size="xsmall" variant="error" mode="stroke" onClick={async () => { if (!confirm('Reset the demo wallet record?')) return; await api('/api/demo/reset', {}); forgetDevice(); await refreshSession(); window.location.href = '/'; }}><Button.Icon as={RiDeleteBinLine} />Reset</Button.Root>
        </div>
      </div>
      {old && <TxSheet open={open} onOpenChange={setOpen} flow={flow} title="Sign with the revoked passkey" txs={txs} guardianType={wallet.guardianB.type} confirmLabel="Sign with old passkey" onDone={refresh}
        headline={<Alert.Root status="information" variant="lighter" size="small"><Alert.Icon /><span>Swissquote sponsors this harmless settings call. Your browser will ask for the <b>old</b> passkey ({shortAddress(old.signer)}). Expect the network to reject it.</span></Alert.Root>} />}
    </Section>
  );
}
