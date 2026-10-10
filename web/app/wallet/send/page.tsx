'use client';
import { useMemo, useState } from 'react';
import { RiArrowRightLine, RiErrorWarningLine, RiUser3Line } from '@remixicon/react';
import * as Input from '@/components/ui/input';
import * as Label from '@/components/ui/label';
import * as Button from '@/components/ui/button';
import * as Hint from '@/components/ui/hint';
import { RequireLogin } from '@/components/require-login';
import { PageTitle } from '@/components/page-title';
import { TxSheet } from '@/components/tx-sheet';
import { ReplacedDeviceNotice } from '@/components/replaced-device';
import { useWallet } from '@/lib/hooks';
import { useConfig } from '@/lib/use-config';
import { useTxFlow } from '@/lib/use-tx-flow';
import { transferTx } from '@/lib/chain';
import { formatUsdc, parseUsdc, shortAddress, usdcToChf } from '@/lib/format';
import { CONTACTS, SERVICE_FEE, STEP_UP_THRESHOLD } from '@/lib/config';
import { cn } from '@/utils/cn';

export default function SendPage() {
  return <RequireLogin><Send /></RequireLogin>;
}

function Send() {
  const { data, refresh } = useWallet(10000);
  const cfg = useConfig();
  const [to, setTo] = useState('');
  const [amountText, setAmountText] = useState('');
  const [open, setOpen] = useState(false);
  const wallet = data?.wallet;
  if (!wallet || !data?.state) return <div className="mx-auto h-64 max-w-[560px] animate-pulse rounded-3xl bg-bg-white-0" />;
  return <SendForm data={{ ...data, wallet }} cfg={cfg} to={to} setTo={setTo} amountText={amountText} setAmountText={setAmountText} open={open} setOpen={setOpen} refresh={refresh} />;
}

function SendForm({ data, cfg, to, setTo, amountText, setAmountText, open, setOpen, refresh }: {
  data: NonNullable<ReturnType<typeof useWallet>['data']> & { wallet: NonNullable<NonNullable<ReturnType<typeof useWallet>['data']>['wallet']> };
  cfg: { treasury: string } | null; to: string; setTo: (s: string) => void; amountText: string; setAmountText: (s: string) => void; open: boolean; setOpen: (o: boolean) => void; refresh: () => void;
}) {
  const wallet = data.wallet;
  const balance = data.state!.usdc;
  const flow = useTxFlow({ wallet, deployed: true });
  const amount = parseUsdc(amountText);
  const validTo = /^0x[0-9a-fA-F]{40}$/.test(to);
  const contact = CONTACTS.find((c) => c.address.toLowerCase() === to.toLowerCase());
  const txs = useMemo(() => (validTo && amount && cfg ? [transferTx(to, amount), transferTx(cfg.treasury, SERVICE_FEE)] : []), [validTo, amount, cfg, to]);
  const insufficient = !!amount && amount + SERVICE_FEE > balance;
  const canReview = validTo && !!amount && amount > 0n && !!cfg;

  return (
    <div className="mx-auto max-w-[560px]">
      <PageTitle title="Send USDC" subtitle="Signed by your passkey. Swissquote sponsors the network fee when the transfer passes its checks." back="/wallet" />
      <div className="mb-4 empty:hidden"><ReplacedDeviceNotice wallet={wallet} /></div>
      <div className="space-y-6 rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200 md:p-6">
        <div className="space-y-2">
          <Label.Root>Recipient</Label.Root>
          <div className="flex flex-wrap gap-2">
            {CONTACTS.map((c) => (
              <button key={c.address} onClick={() => setTo(c.address)} className={cn('flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-label-sm ring-1 ring-inset transition active:scale-[0.97]', to === c.address ? 'bg-primary-alpha-10 text-primary-dark ring-primary-base' : 'bg-bg-white-0 text-text-strong-950 ring-stroke-soft-200 hover:bg-bg-weak-50')}>
                <span className={cn('grid size-6 place-items-center rounded-full text-[11px]', c.note.startsWith('Demo') ? 'bg-error-lighter text-error-base' : 'bg-bg-weak-50 text-text-sub-600')}>{c.note.startsWith('Demo') ? <RiErrorWarningLine className="size-3.5" /> : c.name.split(' ').map((p) => p[0]).join('')}</span>
                {c.name}
              </button>
            ))}
          </div>
          <Input.Root hasError={!!to && !validTo}><Input.Wrapper><Input.Icon as={RiUser3Line} /><Input.Input placeholder="0x… address" value={to} onChange={(e) => setTo(e.target.value.trim())} className="font-mono" /></Input.Wrapper></Input.Root>
          {contact && <Hint.Root>{contact.name} · {contact.note} · {shortAddress(contact.address)}</Hint.Root>}
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between"><Label.Root htmlFor="amt">Amount</Label.Root><button className="text-label-xs text-primary-base" onClick={() => setAmountText(formatUsdc(balance > SERVICE_FEE ? balance - SERVICE_FEE : 0n).replace(/'/g, ''))}>Balance {formatUsdc(balance)} USDC</button></div>
          <div className="flex items-baseline gap-2 rounded-2xl bg-bg-weak-50 px-4 py-3 ring-1 ring-inset ring-stroke-soft-200 focus-within:ring-primary-base">
            <input id="amt" inputMode="decimal" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))} className="w-full bg-transparent text-[32px] font-medium tracking-[-0.02em] text-text-strong-950 outline-none placeholder:text-text-disabled-300" />
            <span className="text-label-lg text-text-soft-400">USDC</span>
          </div>
          <div className="flex justify-between text-paragraph-xs text-text-soft-400">
            <span>{amount ? `≈ ${usdcToChf(amount)} CHF` : ' '}</span>
            <span>+ {formatUsdc(SERVICE_FEE)} USDC Swissquote fee, gas included</span>
          </div>
          {insufficient && <Hint.Root hasError>Not enough USDC: this amount plus the {formatUsdc(SERVICE_FEE)} USDC fee is more than your balance, so the transfer would fail.</Hint.Root>}
          {!insufficient && amount && amount >= STEP_UP_THRESHOLD && <Hint.Root className="text-primary-dark">Above {formatUsdc(STEP_UP_THRESHOLD)} USDC your {wallet.guardianB.type === 'passkey' ? 'recovery device' : 'recovery card'} confirms too.</Hint.Root>}
        </div>

        <Button.Root className="h-12 w-full" disabled={!canReview} onClick={() => {
          setOpen(true);
          flow.prepare(txs, { type: 'send', title: `To ${contact?.name ?? shortAddress(to)}`, amount: amount!, counterparty: to, fee: SERVICE_FEE });
        }}>Review<Button.Icon as={RiArrowRightLine} /></Button.Root>
      </div>

      <TxSheet open={open} onOpenChange={setOpen} flow={flow} title="Review transfer" txs={txs} guardianType={wallet.guardianB.type} onDone={() => { refresh(); setAmountText(''); }}
        headline={amount ? (
          <div className="py-1 text-center">
            <div className="text-paragraph-sm text-text-sub-600">You send</div>
            <div className="text-[34px] font-medium tracking-[-0.02em] text-text-strong-950">{formatUsdc(amount)} <span className="text-[20px] text-text-soft-400">USDC</span></div>
            <div className="text-paragraph-sm text-text-sub-600">to {contact?.name ?? 'address'} · <span className="font-mono text-paragraph-xs">{shortAddress(to)}</span></div>
          </div>
        ) : null} />
    </div>
  );
}
