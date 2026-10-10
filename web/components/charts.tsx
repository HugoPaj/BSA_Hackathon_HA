'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Point } from '@/lib/market';
import { cn } from '@/utils/cn';

// Swissquote's app draws every chart in blue with a soft fill, whatever the direction.
const BLUE = '#3B82F6';

/** Monotone cubic interpolation: smooth, and never overshoots between points. */
function smoothPath(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return '';
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i] || 1e-6);
    m.push((ys[i + 1] - ys[i]) / dx[i]);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  }
  t.push(m[n - 2]);
  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${xs[i] + h},${ys[i] + t[i] * h},${xs[i + 1] - h},${ys[i + 1] - t[i + 1] * h},${xs[i + 1]},${ys[i + 1]}`;
  }
  return d;
}

function linearPath(xs: number[], ys: number[]) {
  return xs.map((x, i) => `${i ? 'L' : 'M'}${x},${ys[i]}`).join('');
}

function geometry(data: Point[], w: number, h: number, padTop: number, padBottom: number, extra: number[] = []) {
  const vs = [...data.map((p) => p.v), ...extra];
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const t0 = data[0].t, t1 = data[data.length - 1].t || t0 + 1;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * w;
  const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo)) * (h - padTop - padBottom);
  return { x, y, xs: data.map((p) => x(p.t)), ys: data.map((p) => y(p.v)) };
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Interactive area chart. Drag or hover to scrub; `onScrub` reports the point under the pointer so the
 * caller can show it in its header, the way banking apps do. With `fill`, `height` is a minimum and the
 * chart takes whatever height its container gives it (e.g. `flex-1` in a stretched card).
 */
export function AreaChart({ data, height = 200, fill, curve = 'smooth', baseline, onScrub, formatTime, formatValue, className }: {
  data: Point[]; height?: number; fill?: boolean; curve?: 'smooth' | 'linear'; baseline?: number;
  onScrub?: (p: Point | null) => void; formatTime?: (t: number) => string; formatValue?: (v: number) => string; className?: string;
}) {
  const [ref, { w, h: measured }] = useSize();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');
  const h = fill ? Math.max(measured, height) : height;
  const style = fill ? { minHeight: height } : { height };

  if (data.length < 2) return <div ref={ref} className={className} style={style} />;
  const g = geometry(data, w, h, 14, 6, baseline === undefined ? [] : [baseline]);
  const line = (curve === 'smooth' ? smoothPath : linearPath)(g.xs, g.ys);
  const area = `${line}L${w},${h}L0,${h}Z`;
  const hp = hover === null ? null : data[hover];

  const scrub = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < g.xs.length; i++) if (Math.abs(g.xs[i] - px) < Math.abs(g.xs[best] - px)) best = i;
    setHover(best);
    onScrub?.(data[best]);
  };
  const leave = () => { setHover(null); onScrub?.(null); };

  return (
    <div ref={ref} className={cn('relative touch-pan-y select-none', className)} style={style}>
      {w > 0 && (
        // Absolute so the svg never props its container open: a `fill` chart can shrink back too.
        <svg width={w} height={h} className="absolute inset-0 block overflow-visible"
          onPointerMove={(e) => scrub(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => scrub(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={leave} onPointerCancel={leave}>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BLUE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
            </linearGradient>
          </defs>
          {baseline !== undefined && <line x1={0} x2={w} y1={g.y(baseline)} y2={g.y(baseline)} stroke="#99a0ae" strokeDasharray="2 4" strokeWidth={1} />}
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hp && (
            <g>
              <line x1={g.xs[hover!]} x2={g.xs[hover!]} y1={0} y2={h} stroke="#cacfd8" strokeWidth={1} />
              <circle cx={g.xs[hover!]} cy={g.ys[hover!]} r={5} fill={BLUE} stroke="#fff" strokeWidth={2} />
            </g>
          )}
          {!hp && <circle cx={g.xs[g.xs.length - 1]} cy={g.ys[g.ys.length - 1]} r={3.5} fill={BLUE} />}
        </svg>
      )}
      {hp && (formatTime || formatValue) && (
        <div className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-bg-strong-950 px-2 py-1 text-label-xs text-static-white"
          style={{ left: Math.min(Math.max(g.xs[hover!], 56), w - 56) }}>
          {formatValue && <span className="mr-1.5">{formatValue(hp.v)}</span>}
          {formatTime && <span className={formatValue ? 'text-static-white/70' : undefined}>{formatTime(hp.t)}</span>}
        </div>
      )}
    </div>
  );
}

/** Small non-interactive trend line for lists and cards. */
export function Sparkline({ data, className, fill = true }: { data: Point[]; className?: string; fill?: boolean }) {
  const gid = useId().replace(/:/g, '');
  if (data.length < 2) return <div className={className} />;
  const W = 100, H = 40;
  const g = geometry(data, W, H, 3, 3);
  const line = smoothPath(g.xs, g.ys);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn('block', className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={BLUE} stopOpacity={0.2} />
          <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={BLUE} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
