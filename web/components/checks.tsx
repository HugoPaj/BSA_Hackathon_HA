'use client';
import { RiCheckboxCircleFill, RiCloseCircleFill, RiErrorWarningFill, RiShieldKeyholeFill, RiLoader4Line } from '@remixicon/react';
import type { Evaluation } from '@/lib/wallet-client';
import { cn } from '@/utils/cn';

const ICON = {
  pass: { icon: RiCheckboxCircleFill, cls: 'text-success-base' },
  fail: { icon: RiCloseCircleFill, cls: 'text-error-base' },
  warn: { icon: RiErrorWarningFill, cls: 'text-warning-base' },
  required: { icon: RiShieldKeyholeFill, cls: 'text-primary-base' },
} as const;

export function ChecksList({ evaluation, loading }: { evaluation?: Evaluation | null; loading?: boolean }) {
  if (loading || !evaluation) {
    return (
      <div className="space-y-2">
        {['Allowlist', 'Sanctions screen', 'Simulation', 'Service fee'].map((l) => (
          <div key={l} className="flex items-center gap-3 rounded-xl bg-bg-weak-50 px-3 py-2.5">
            <RiLoader4Line className="size-5 animate-spin text-text-soft-400" />
            <span className="text-label-sm text-text-sub-600">{l}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {evaluation.checks.map((c) => {
        const I = ICON[c.status];
        return (
          <div key={c.id} className={cn('flex items-start gap-3 rounded-xl px-3 py-2.5', c.status === 'fail' ? 'bg-error-lighter' : c.status === 'pass' ? 'bg-bg-weak-50' : c.status === 'warn' ? 'bg-warning-lighter' : 'bg-primary-alpha-10')}>
            <I.icon className={cn('mt-px size-5 shrink-0', I.cls)} />
            <div className="min-w-0">
              <div className="text-label-sm text-text-strong-950">{c.label}</div>
              <div className="text-paragraph-xs text-text-sub-600">{c.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
