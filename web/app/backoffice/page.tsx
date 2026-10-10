'use client';
import { RiBankLine, RiCheckLine, RiCloseLine, RiExternalLinkLine, RiGasStationLine, RiKey2Line, RiServerLine, RiForbidLine } from '@remixicon/react';
import * as Badge from '@/components/ui/badge';
import { MockTag } from '@/components/brand';
import { usePoll } from '@/lib/hooks';
import { api } from '@/lib/api';
import { EXPLORER } from '@/lib/config';
import { formatUsdc, shortAddress, timeAgo } from '@/lib/format';
import type { AuditEntry, PublicRecoverySession } from '@/lib/server/db';

type BO = {
  audit: AuditEntry[];
  wallets: { clientId: string; address: string; deployed: boolean; owner: string; guardianA: { label: string; address: string }; guardianB: { type: string; address: string; label: string }; proof: { verifiedAt: number } | null; previousOwners: number }[];
  recoveries: PublicRecoverySession[];
  treasury: { address: string; usdc: bigint; eth: bigint };
  guardian: string;
};

const A = ({ a }: { a: string }) => <a className="inline-flex items-center gap-0.5 font-mono text-paragraph-xs text-primary-base hover:underline" target="_blank" href={`${EXPLORER}/address/${a}`}>{shortAddress(a)}<RiExternalLinkLine className="size-3" /></a>;

export default function Backoffice() {
  const { data } = usePoll(() => api<BO>('/api/backoffice'), 5000);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-title-h4 text-text-strong-950">Swissquote operations</h1>
          <p className="mt-1 max-w-2xl text-paragraph-sm text-text-sub-600">What the bank&apos;s side of the wallet can see and do. Everything Swissquote holds is listed here. None of it can move client funds.</p>
        </div>
        <MockTag>Internal view · mock</MockTag>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card icon={RiKey2Line} title="Guardian key (Guardian A)" sub="HSM in production · software key in the demo">
          {data && <A a={data.guardian} />}
          <Rule ok text="Signs EIP-712 recovery approvals" />
          <Rule ok text="Only after login + liveness match, four-eyes" />
          <Rule text="Cannot sign transactions or spend" />
          <Rule text="Cannot recover without the client's Guardian B" />
        </Card>
        <Card icon={RiServerLine} title="Operations Safe" sub="Relayer, demo treasury, fee collector">
          {data && <><A a={data.treasury.address} /><div className="mt-2 text-label-md text-text-strong-950">{formatUsdc(data.treasury.usdc)} USDC</div></>}
          <Rule ok text="Relays guardian signatures, pays nothing from client funds" />
          <Rule ok text="Receives the batched 0.05 USDC service fee" />
          {data && data.treasury.usdc === 0n && <p className="mt-2 text-paragraph-xs text-warning-dark">Empty. Fund it with Base Sepolia USDC at faucet.circle.com to demo &quot;Add money&quot;.</p>}
        </Card>
        <Card icon={RiGasStationLine} title="Paymaster policy" sub="Candide paymaster on Base Sepolia">
          <Rule ok text="Allowlist, simulation, sanctions, step-up" />
          <Rule ok text="Declines to sponsor risky transactions" />
          <Rule text="Cannot block: the client can pay own gas" />
          <Rule text="Never holds a key to client wallets" />
        </Card>
      </div>

      <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
        <h2 className="mb-3 text-subheading-xs uppercase tracking-wider text-text-sub-600">Client wallets</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-paragraph-sm">
            <thead className="text-label-xs text-text-soft-400"><tr><th className="py-2 pr-3">Client</th><th className="pr-3">Wallet</th><th className="pr-3">Owner (passkey signer)</th><th className="pr-3">Guardian A</th><th className="pr-3">Guardian B</th><th className="pr-3">Ownership proof</th><th>Recoveries</th></tr></thead>
            <tbody className="divide-y divide-stroke-soft-200">
              {data?.wallets.map((w) => (
                <tr key={w.address}>
                  <td className="py-2.5 pr-3 text-label-sm">{w.clientId}</td>
                  <td className="pr-3"><A a={w.address} /></td>
                  <td className="pr-3"><A a={w.owner} /></td>
                  <td className="pr-3 text-paragraph-xs">{w.guardianA.label.split(' (')[0]}</td>
                  <td className="pr-3 text-paragraph-xs">{w.guardianB.label}</td>
                  <td className="pr-3">{w.proof ? <Badge.Root color="blue" variant="lighter">EIP-1271 · {timeAgo(w.proof.verifiedAt)}</Badge.Root> : <Badge.Root color="gray" variant="lighter">None</Badge.Root>}</td>
                  <td>{w.previousOwners}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
        <h2 className="mb-3 text-subheading-xs uppercase tracking-wider text-text-sub-600">Audit log</h2>
        <div className="divide-y divide-stroke-soft-200">
          {data?.audit.slice(0, 60).map((e) => (
            <div key={e.id} className="grid gap-1 py-2.5 md:grid-cols-[120px_170px_1fr] md:gap-4">
              <div className="text-paragraph-xs text-text-soft-400">{new Date(e.ts).toLocaleTimeString('de-CH')}</div>
              <div className="text-label-xs text-text-sub-600">{e.actor}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-label-sm text-text-strong-950">{e.action}</span>
                  {e.outcome !== 'info' && <Badge.Root color={e.outcome === 'approved' ? 'green' : 'red'} variant="lighter">{e.outcome}</Badge.Root>}
                </div>
                <div className="break-words text-paragraph-xs text-text-sub-600">{e.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Card({ icon: Icon, title, sub, children }: { icon: typeof RiBankLine; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary-alpha-10 text-primary-base"><Icon className="size-5" /></span>
        <div><div className="text-label-md text-text-strong-950">{title}</div><div className="text-paragraph-xs text-text-soft-400">{sub}</div></div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Rule({ ok, text }: { ok?: boolean; text: string }) {
  const I = ok ? RiCheckLine : RiForbidLine;
  return <div className="flex items-start gap-2 text-paragraph-xs text-text-sub-600"><I className={ok ? 'mt-px size-4 shrink-0 text-success-base' : 'mt-px size-4 shrink-0 text-error-base'} />{text}</div>;
}
void RiCloseLine;
