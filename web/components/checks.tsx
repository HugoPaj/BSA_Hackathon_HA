'use client';
import { useEffect, useRef, useState } from 'react';
import { RiArrowDownSLine, RiCheckboxCircleFill, RiCloseCircleFill, RiErrorWarningFill, RiShieldKeyholeFill, RiLoader4Line } from '@remixicon/react';
import type { Evaluation } from '@/lib/wallet-client';
import type { Check, PlannedCheck } from '@/lib/server/policy';
import { cn } from '@/utils/cn';
import { MockTag } from './brand';

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
 * Swissquote's sponsorship checks. Rows spin from the moment the browser starts building the transaction and show each
 * result as soon as the server streams it (`checks`). `evaluation` is the final word.
 */
export function ChecksList({ evaluation, plan, checks = [], checking = false, collapsePassed = false }: { evaluation?: Evaluation | null; plan?: PlannedCheck[] | null; checks?: Check[]; checking?: boolean; collapsePassed?: boolean }) {
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

  const allShown = rows.every((row) => decided.some((d) => d.id === row.id && revealed.includes(resultKey(d))));
  const status = !evaluation && allShown && checking ? 'Checks passed. Swissquote is sponsoring the gas…' : null;

  if (collapsePassed && evaluation) {
    const passed = evaluation.checks.filter((c) => c.status === 'pass');
    const attention = evaluation.checks.filter((c) => c.status !== 'pass');
    return (
      <div className="space-y-2">
        {attention.map((c) => <CheckResult key={c.id} check={c} />)}
        {passed.length > 0 && (
          <details className="group rounded-xl bg-bg-weak-50">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-3 text-label-sm text-text-strong-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-base [&::-webkit-details-marker]:hidden">
              <RiCheckboxCircleFill className="size-5 shrink-0 text-success-base" />
              <span className="flex-1">{attention.length === 0 && evaluation.decision !== 'decline' ? 'Security checks passed' : `${passed.length} ${passed.length === 1 ? 'check' : 'checks'} passed`}</span>
              <RiArrowDownSLine className="size-5 shrink-0 text-text-sub-600 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 px-1 pb-1">
              {passed.map((c) => <CheckResult key={c.id} check={c} />)}
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const c = decided.find((d) => d.id === row.id && revealed.includes(resultKey(d)));
        if (!c) {
          return (
            <div key={row.id} className="flex items-center gap-3 rounded-xl bg-bg-weak-50 px-3 py-2.5">
              <RiLoader4Line className="size-5 animate-spin text-text-soft-400" />
              <span className="text-label-sm text-text-sub-600">{row.label}</span>
            </div>
          );
        }
        return <CheckResult key={row.id} check={c} />;
      })}
      {status && (
        <div key={status} className="flex animate-fade-in-up items-center gap-2 px-1 pt-1 text-paragraph-xs text-text-soft-400">
          <RiLoader4Line className="size-3.5 animate-spin" />{status}
        </div>
      )}
    </div>
  );
}

function CheckResult({ check: c }: { check: Check }) {
  const I = ICON[c.status];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200', c.status === 'fail' ? 'bg-error-lighter' : c.status === 'pass' ? 'bg-bg-weak-50' : c.status === 'warn' ? 'bg-warning-lighter' : 'bg-primary-alpha-10')}>
      <I.icon className={cn('mt-px size-5 shrink-0 animate-pop-in', I.cls)} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-label-sm text-text-strong-950">{c.label}{c.id === 'sanctions' && <MockTag>Mock list</MockTag>}</div>
        <div className="animate-fade-in-up text-paragraph-xs text-text-sub-600">{c.detail}</div>
      </div>
    </div>
  );
}
