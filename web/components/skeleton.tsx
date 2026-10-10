import { cn } from '@/utils/cn';

/** Loading layout. Stays invisible for the first 150ms, so fast loads go straight to content without a flash. */
export function Skeleton({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div aria-busy="true" aria-label="Loading" className={cn('animate-skeleton-in', className)}>{children}</div>;
}

/** A placeholder shape. Size and round it to match what it stands in for. */
export function Bone({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-bg-soft-200/70', className)} />;
}

/** The white card most pages are built from. */
export function BoneCard({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-3xl bg-bg-white-0 p-5 ring-1 ring-inset ring-stroke-soft-200 md:p-6', className)}>{children}</div>;
}

/** Icon, two lines, and an optional value on the right: activity, assets, inbox rows. */
export function BoneRow({ value = true, className }: { value?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 py-2.5', className)}>
      <Bone className="size-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5"><Bone className="h-3.5 w-2/5" /><Bone className="h-3 w-1/4" /></div>
      {value && <div className="space-y-1.5"><Bone className="ml-auto h-3.5 w-16" /><Bone className="ml-auto h-3 w-10" /></div>}
    </div>
  );
}

/** Stand-in for PageTitle's subtitle when the real one depends on data. */
export function BoneLines({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => <Bone key={i} className={cn('h-3.5', i === lines - 1 ? 'w-3/5' : 'w-full')} />)}
    </div>
  );
}
