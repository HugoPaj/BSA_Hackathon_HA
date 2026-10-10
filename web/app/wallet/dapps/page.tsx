'use client';
import { useState } from 'react';
import type { MetaTransaction } from 'abstractionkit';
import { RiExchangeLine, RiGiftLine, RiShieldCheckLine, RiArrowRightLine, RiFlaskLine, RiForbidLine, RiSearchEyeLine, RiShieldKeyholeLine } from '@remixicon/react';
import * as StatusBadge from '@/components/ui/status-badge';
import * as Button from '@/components/ui/button';
import { RequireLogin } from '@/components/require-login';
import { PageTitle } from '@/components/page-title';
import { TxSheet } from '@/components/tx-sheet';
import { useWallet } from '@/lib/hooks';
import { useConfig } from '@/lib/use-config';
import { useTxFlow } from '@/lib/use-tx-flow';
import { approveTx, transferTx } from '@/lib/chain';
import { PERMIT2, SERVICE_FEE, STEP_UP_THRESHOLD } from '@/lib/config';
import { formatUsdc, shortAddress } from '@/lib/format';

const UNKNOWN_SPENDER = '0x1111111111111111111111111111111111111111';
const MAX = 2n ** 256n - 1n;

export default function DappsPage() {
  return <RequireLogin><Dapps /></RequireLogin>;
}

type Action = { id: string; site?: string; title: string; description: string; txs: MetaTransaction[]; meta: { title: string } };

function Dapps() {
  const { data, refresh } = useWallet(10000);
  const cfg = useConfig();
  if (!data?.wallet || !cfg) return <div className="mx-auto h-64 max-w-[860px] animate-pulse rounded-3xl bg-bg-white-0" />;
  return <DappsInner data={data as Required<typeof data>} treasury={cfg.treasury} refresh={refresh} />;
}

function DappsInner({ data, treasury, refresh }: { data: Required<NonNullable<ReturnType<typeof useWallet>['data']>>; treasury: string; refresh: () => void }) {
  const wallet = data.wallet!;
  const flow = useTxFlow({ wallet, deployed: true });
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Action | null>(null);
  const fee = transferTx(treasury, SERVICE_FEE);

  const dapps = [
    {
      name: 'Uniswap', site: 'app.uniswap.org', icon: RiExchangeLine, allowlisted: true,
      blurb: 'Swap tokens. Uses Permit2 to manage token approvals.',
      actions: [
        { id: 'uni-approve', title: 'Enable 1 USDC for swaps', description: 'Approve Permit2 to spend up to 1 USDC', txs: [approveTx(PERMIT2, 1_000_000n), fee], meta: { title: 'Uniswap: enabled 1 USDC' } },
        { id: 'uni-revoke', title: 'Revoke approval', description: 'Set the Permit2 allowance back to 0', txs: [approveTx(PERMIT2, 0n), fee], meta: { title: 'Uniswap: approval revoked' } },
      ],
    },
    {
      name: 'Free Token Airdrop', site: 'claim-airdrop-now.xyz', icon: RiGiftLine, allowlisted: false,
      blurb: 'A site you found through an ad. Classic wallet-drainer pattern.',
      actions: [
        { id: 'drainer', title: 'Claim 500 tokens', description: `Actually: unlimited USDC approval to ${shortAddress(UNKNOWN_SPENDER)}`, txs: [approveTx(UNKNOWN_SPENDER, MAX), fee], meta: { title: 'Airdrop site: unlimited approval' } },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-[860px]">
      <PageTitle title="dApps" subtitle="Connect to on-chain apps with Swissquote's protection. Every request is checked before Swissquote agrees to pay the gas." back="/wallet" />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { icon: RiShieldCheckLine, t: 'Allowlist', d: 'Known contracts only' },
          { icon: RiFlaskLine, t: 'Simulation', d: 'Exact balance changes' },
          { icon: RiSearchEyeLine, t: 'Sanctions screen', d: 'Every counterparty' },
          { icon: RiShieldKeyholeLine, t: 'High-value step-up', d: `Above ${formatUsdc(STEP_UP_THRESHOLD)} USDC or unlimited` },
        ].map((s) => (
          <div key={s.t} className="flex items-center gap-3 rounded-2xl bg-bg-white-0 p-3 ring-1 ring-inset ring-stroke-soft-200">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-alpha-10 text-primary-base"><s.icon className="size-5" /></span>
            <div><div className="text-label-sm text-text-strong-950">{s.t}</div><div className="text-paragraph-xs text-text-sub-600">{s.d}</div></div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {dapps.map((d) => (
          <div key={d.name} className="flex flex-col rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-bg-weak-50 text-text-strong-950"><d.icon className="size-6" /></span>
                <div><div className="text-label-md text-text-strong-950">{d.name}</div><div className="text-paragraph-xs text-text-soft-400">{d.site}</div></div>
              </div>
              <StatusBadge.Root status={d.allowlisted ? 'completed' : 'failed'} variant="stroke">
                <StatusBadge.Icon as={d.allowlisted ? RiShieldCheckLine : RiForbidLine} />{d.allowlisted ? 'Allowlisted' : 'Not verified'}
              </StatusBadge.Root>
            </div>
            <p className="mt-3 text-paragraph-sm text-text-sub-600">{d.blurb}</p>
            <div className="mt-4 space-y-2">
              {d.actions.map((a) => (
                <button key={a.id} onClick={() => { setCurrent({ ...a, site: d.site }); setOpen(true); flow.prepare(a.txs, { type: 'approve', ...a.meta, fee: SERVICE_FEE }); }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-bg-weak-50 px-4 py-3 text-left transition hover:bg-bg-soft-200">
                  <span><span className="block text-label-sm text-text-strong-950">{a.title}</span><span className="block text-paragraph-xs text-text-sub-600">{a.description}</span></span>
                  <RiArrowRightLine className="size-5 shrink-0 text-text-soft-400" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-paragraph-xs text-text-soft-400">Swissquote declines to <i>sponsor</i> risky requests. It cannot block them: you can always pay your own gas. That keeps the wallet non-custodial.</p>
      {current && (
        <TxSheet open={open} onOpenChange={setOpen} flow={flow} title={current.title} txs={current.txs} guardianType={wallet.guardianB.type} onDone={refresh}
          headline={<div className="rounded-xl bg-bg-weak-50 p-3 text-paragraph-sm text-text-sub-600">Request from <b className="text-text-strong-950">{current.site}</b>: {current.description}.</div>} />
      )}
      {!data.state.usdc && <div className="mt-4 text-center"><Button.Root asChild variant="neutral" mode="ghost" size="small"><a href="/wallet">Add money first to try sponsored actions</a></Button.Root></div>}
    </div>
  );
}
