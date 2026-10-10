'use client';
import { useEffect, useRef, useState } from 'react';
import { RiCheckboxBlankCircleLine, RiCheckboxCircleFill, RiCloseCircleFill, RiErrorWarningFill, RiShieldKeyholeFill, RiLoader4Line } from '@remixicon/react';
import type { Evaluation } from '@/lib/wallet-client';
import type { Check, PlannedCheck } from '@/lib/server/policy';
import { cn } from '@/utils/cn';

const ICON = {
  pass: { icon: RiCheckboxCircleFill, cls: 'text-success-base' },
  fail: { icon: RiCloseCircleFill, cls: 'text-error-base' },
  warn: { icon: RiErrorWarningFill, cls: 'text-warning-base' },
  required: { icon: RiShieldKeyholeFill, cls: 'text-primary-base' },
} as const;

// Shown while the transaction is still being built, before Swissquote says which checks it will run.
const EVERY_TIME: PlannedCheck[] = [{ id: 'allowlist', label: 'Allowlist' }, { id: 'sanctions', label: 'Sanctions screen' }, { id: 'simulation', label: 'Simulation' }];
// Checks decided in the same instant still land one by one, this far apart, so each result can be seen.
const REVEAL_GAP_MS = 150;

const resultKey = (c: Check) => `${c.id}|${c.status}|${c.detail}`;

/**
 * Swissquote's sponsorship checks. Rows are queued while the browser builds the transaction, spin once Swissquote has
 * it (`checking`), and show each result as soon as the server streams it (`checks`). `evaluation` is the final word.
 */
export function ChecksList({ evaluation, plan, checks = [], checking = false }: { evaluation?: Evaluation | null; plan?: PlannedCheck[] | null; checks?: Check[]; checking?: boolean }) {
  const decided = evaluation?.checks ?? checks;
  const rows = plan ?? evaluation?.checks ?? EVERY_TIME;
  // Revealed results, by content: the final evaluation repeats what was streamed without replaying it, and a check
  // it changes (the paymaster's own simulation can still fail) lands again.
  const [revealed, setRevealed] = useState<string[]>([]);
  const last = useRef(0);

  useEffect(() => {
    const next = decided.find((c) => !revealed.includes(resultKey(c)));
    if (!next) return;
    const t = setTimeout(() => { last.current = Date.now(); setRevealed((r) => [...r, resultKey(next)]); }, Math.max(0, last.current + REVEAL_GAP_MS - Date.now()));
    return () => clearTimeout(t);
  }, [decided, revealed]);

  const running = !!plan || checking;
  const allShown = rows.every((row) => decided.some((d) => d.id === row.id && revealed.includes(resultKey(d))));
  const status = evaluation ? null : !running ? 'Preparing your transaction…' : allShown && checking ? 'Checks passed. Swissquote is sponsoring the gas…' : null;

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const c = decided.find((d) => d.id === row.id && revealed.includes(resultKey(d)));
        if (!c) {
          return (
            <div key={row.id} className="flex items-center gap-3 rounded-xl bg-bg-weak-50 px-3 py-2.5">
              {running ? <RiLoader4Line className="size-5 animate-spin text-text-soft-400" /> : <RiCheckboxBlankCircleLine className="size-5 text-text-disabled-300" />}
              <span className={cn('text-label-sm', running ? 'text-text-sub-600' : 'text-text-soft-400')}>{row.label}</span>
            </div>
          );
        }
        const I = ICON[c.status];
        return (
          <div key={row.id} className={cn('flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200', c.status === 'fail' ? 'bg-error-lighter' : c.status === 'pass' ? 'bg-bg-weak-50' : c.status === 'warn' ? 'bg-warning-lighter' : 'bg-primary-alpha-10')}>
            <I.icon className={cn('mt-px size-5 shrink-0 animate-pop-in', I.cls)} />
            <div className="min-w-0">
              <div className="text-label-sm text-text-strong-950">{c.label}</div>
              <div className="animate-fade-in-up text-paragraph-xs text-text-sub-600">{c.detail}</div>
            </div>
          </div>
        );
      })}
      {status && (
        <div key={status} className="flex animate-fade-in-up items-center gap-2 px-1 pt-1 text-paragraph-xs text-text-soft-400">
          <RiLoader4Line className="size-3.5 animate-spin" />{status}
        </div>
      )}
    </div>
  );
}
