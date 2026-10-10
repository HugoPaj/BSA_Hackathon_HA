import { RiBankFill } from '@remixicon/react';
import { cn } from '@/utils/cn';

export function SqMark({ className }: { className?: string }) {
  // Orange disc with a white bank glyph, after the mark in Swissquote's header.
  return (
    <span className={cn('inline-grid size-7 place-items-center rounded-full bg-primary-base text-static-white', className)} aria-hidden>
      <RiBankFill className="size-[60%]" />
    </span>
  );
}

export function SqLogo({ className, product }: { className?: string; product?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <SqMark />
      <span className="text-[17px] font-bold tracking-[-0.01em] text-text-strong-950">Swissquote</span>
      {product && <span className="rounded-md bg-primary-alpha-10 px-1.5 py-0.5 text-label-xs text-primary-dark">{product}</span>}
    </span>
  );
}

export function SwissFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('inline-block size-3.5 align-[-2px]', className)} aria-label="Swiss franc">
      <rect width="32" height="32" rx="6" fill="#E10F00" />
      <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff" />
    </svg>
  );
}

export function MockTag({ children = 'Mock' }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md bg-bg-weak-50 px-1.5 text-subheading-2xs uppercase tracking-wider text-text-soft-400 ring-1 ring-inset ring-stroke-soft-200">
      {children}
    </span>
  );
}
