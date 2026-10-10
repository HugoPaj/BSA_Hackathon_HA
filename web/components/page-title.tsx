import Link from 'next/link';
import { RiArrowLeftLine } from '@remixicon/react';

export function PageTitle({ title, subtitle, back, right }: { title: string; subtitle?: React.ReactNode; back?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3">
      {back && (
        <Link href={back} className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-bg-white-0 text-text-sub-600 ring-1 ring-inset ring-stroke-soft-200 hover:bg-bg-weak-50" aria-label="Back">
          <RiArrowLeftLine className="size-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-title-h5 text-text-strong-950 md:text-title-h4">{title}</h1>
        {subtitle && <div className="mt-1 text-paragraph-sm text-text-sub-600">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
