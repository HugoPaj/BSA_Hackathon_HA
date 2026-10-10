'use client';
import { QRCodeSVG } from 'qrcode.react';
import { RiFileCopyLine, RiExternalLinkLine } from '@remixicon/react';
import * as Button from '@/components/ui/button';
import * as Alert from '@/components/ui/alert';
import { RequireLogin } from '@/components/require-login';
import { NoWallet } from '@/components/no-wallet';
import { Bone, BoneCard, Skeleton } from '@/components/skeleton';
import { PageTitle } from '@/components/page-title';
import { useWallet } from '@/lib/hooks';
import { CHAIN_NAME, EXPLORER } from '@/lib/config';

export default function ReceivePage() {
  return <RequireLogin><Receive /></RequireLogin>;
}

const title = <PageTitle title="Receive" subtitle={`Send only USDC on ${CHAIN_NAME} to this address.`} back="/wallet" />;

function Receive() {
  const { data, loading } = useWallet(0);
  const w = data?.wallet;
  if (loading && !data) return <ReceiveSkeleton />;
  if (!w || !data?.state?.deployed) return <NoWallet started={!!w} />;
  return (
    <div className="mx-auto max-w-[480px]">
      {title}
      <div className="flex flex-col items-center gap-5 rounded-3xl bg-bg-white-0 p-6 ring-1 ring-inset ring-stroke-soft-200">
        <div className="rounded-2xl p-3 ring-1 ring-inset ring-stroke-soft-200"><QRCodeSVG value={w.address} size={200} fgColor="#323232" /></div>
        <div className="w-full break-all rounded-xl bg-bg-weak-50 p-3 text-center font-mono text-paragraph-sm text-text-strong-950">{w.address}</div>
        <div className="flex gap-2">
          <Button.Root variant="neutral" mode="stroke" size="small" onClick={() => navigator.clipboard.writeText(w.address)}><Button.Icon as={RiFileCopyLine} />Copy address</Button.Root>
          <Button.Root asChild variant="neutral" mode="ghost" size="small"><a href={`${EXPLORER}/address/${w.address}`} target="_blank">BaseScan<Button.Icon as={RiExternalLinkLine} /></a></Button.Root>
        </div>
        {w.proof && <Alert.Root status="success" variant="lighter" size="small"><Alert.Icon />Swissquote has a verified ownership proof for this address. Withdrawals from your Swissquote account to it need no manual checks.</Alert.Root>}
      </div>
    </div>
  );
}

function ReceiveSkeleton() {
  return (
    <div className="mx-auto max-w-[480px]">
      {title}
      <Skeleton>
        <BoneCard className="flex flex-col items-center gap-5 md:p-6">
          <Bone className="size-[226px] rounded-2xl" />
          <Bone className="h-[68px] w-full rounded-xl" />
          <div className="flex gap-2"><Bone className="h-9 w-32 rounded-lg" /><Bone className="h-9 w-24 rounded-lg" /></div>
        </BoneCard>
      </Skeleton>
    </div>
  );
}
