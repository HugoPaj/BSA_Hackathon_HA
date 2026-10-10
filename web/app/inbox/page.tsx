'use client';
import { useEffect } from 'react';
import { RiCheckboxCircleFill, RiCloseCircleFill, RiErrorWarningFill, RiInformationFill, RiMailLine } from '@remixicon/react';
import * as Badge from '@/components/ui/badge';
import { RequireLogin } from '@/components/require-login';
import { PageTitle } from '@/components/page-title';
import { Bone, BoneLines, Skeleton } from '@/components/skeleton';
import { useAlerts } from '@/lib/hooks';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { cn } from '@/utils/cn';

const SEV = {
  info: { icon: RiInformationFill, cls: 'text-information-base' },
  success: { icon: RiCheckboxCircleFill, cls: 'text-success-base' },
  warning: { icon: RiErrorWarningFill, cls: 'text-warning-base' },
  error: { icon: RiCloseCircleFill, cls: 'text-error-base' },
};

export default function InboxPage() {
  return <RequireLogin><Inbox /></RequireLogin>;
}

function Inbox() {
  const { data } = useAlerts(4000);
  useEffect(() => {
    const unread = (data ?? []).filter((a) => !a.read).map((a) => a.id);
    if (unread.length) api('/api/alerts', { ids: unread }).catch(() => {});
  }, [data]);
  return (
    <div className="mx-auto max-w-[720px]">
      <PageTitle title="E-banking inbox" subtitle="Security alerts about your wallet. Each one also goes out by push and e-mail, so a thief who controls one channel cannot hide them." />
      <div className="overflow-hidden rounded-3xl bg-bg-white-0 ring-1 ring-stroke-soft-200">
        {data === undefined ? (
          <Skeleton className="divide-y divide-stroke-soft-200">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 p-4 md:p-5">
                <Bone className="mt-0.5 size-5 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2"><Bone className="h-4 w-1/3" /><BoneLines /></div>
              </div>
            ))}
          </Skeleton>
        ) : !data.length && <div className="flex flex-col items-center gap-2 p-10 text-paragraph-sm text-text-soft-400"><RiMailLine className="size-8" />No messages yet.</div>}
        <div className="divide-y divide-stroke-soft-200">
          {data?.map((a) => {
            const S = SEV[a.severity];
            return (
              <div key={a.id} className={cn('flex gap-3 p-4 md:p-5', !a.read && 'bg-primary-alpha-10/40')}>
                <S.icon className={cn('mt-0.5 size-5 shrink-0', S.cls)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="text-label-sm text-text-strong-950">{a.title}</div><div className="text-paragraph-xs text-text-soft-400">{timeAgo(a.ts)}</div></div>
                  <p className="mt-1 text-paragraph-sm text-text-sub-600">{a.body}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{a.channels.map((c) => <Badge.Root key={c} color="gray" variant="lighter">{c}</Badge.Root>)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
