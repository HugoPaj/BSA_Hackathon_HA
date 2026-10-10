'use client';
// Mock trading account and market data. Everything here is simulated in the browser: prices tick with a
// seeded random walk, orders fill against the simulated price, and the portfolio persists in localStorage.
import { useSyncExternalStore } from 'react';
import { notification } from '@/hooks/use-notification';
import { USDC_CHF } from './config';

export * from './instruments';
import { FX, INSTRUMENTS, instrument, prevClose, tradable, type Instrument } from './instruments';
export type Point = { t: number; v: number };

/** Commission in CHF: flat 9 CHF per stock order, 1% on crypto. Indicative only. */
export function commission(i: Instrument, valueChf: number) {
  return i.kind === 'crypto' ? Math.max(1, valueChf * 0.01) : 9;
}

// ── Seeded randomness ───────────────────────────────────────────────────────────────────────────

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

// ── Price history ───────────────────────────────────────────────────────────────────────────────

export type Period = '1D' | '1W' | '1M' | '6M' | '1Y' | 'All';
export const PERIOD_LABEL: Record<Period, string> = { '1D': 'today', '1W': 'past week', '1M': 'past month', '6M': 'past 6 months', '1Y': 'past year', All: 'past 5 years' };
const DAY = 86_400_000;
const PERIOD: Record<Period, { n: number; span: number; move: number; noise: number }> = {
  '1D': { n: 72, span: DAY, move: 0, noise: 0.003 },
  '1W': { n: 56, span: 7 * DAY, move: 0.03, noise: 0.009 },
  '1M': { n: 60, span: 30 * DAY, move: 0.06, noise: 0.018 },
  '6M': { n: 72, span: 182 * DAY, move: 0.14, noise: 0.04 },
  '1Y': { n: 80, span: 365 * DAY, move: 0.22, noise: 0.06 },
  All: { n: 90, span: 5 * 365 * DAY, move: 0.5, noise: 0.12 },
};

const pathCache = new Map<string, { start: number; walk: number[] }>();
/** Start price and a fixed random walk per instrument and period, so the chart keeps its shape as prices tick. */
function path(i: Instrument, period: Period) {
  const key = `${i.symbol}:${period}`;
  let p = pathCache.get(key);
  if (!p) {
    const r = rng(hash(key));
    const { n, move, noise } = PERIOD[period];
    const k = i.kind === 'crypto' ? 2.5 : i.kind === 'index' ? 0.7 : 1;
    // Long periods drift up on average, like most of these markets did.
    const ret = period === '1D' ? i.day : period === 'All' ? (r() * 1.4 - 0.25) * move * k : (r() * 2 - 0.9) * move * k;
    const walk = [0];
    for (let j = 1; j <= n; j++) walk.push(walk[j - 1] + (gauss(r) * noise * k) / Math.sqrt(n));
    p = { start: i.ref / (1 + Math.max(-0.8, ret)), walk };
    pathCache.set(key, p);
  }
  return p;
}

/** A Brownian bridge from the period's start price to the live price. */
export function priceSeries(i: Instrument, period: Period, price: number, now: number): Point[] {
  const { n, span } = PERIOD[period];
  const { start, walk } = path(i, period);
  const a = Math.log(start), b = Math.log(price), wn = walk[n];
  return walk.map((w, j) => {
    const t = j / n;
    return { t: now - span + t * span, v: Math.exp(a + (b - a) * t + w - t * wn) };
  });
}

export function periodStart(i: Instrument, period: Period) {
  return path(i, period).start;
}

// ── Store ───────────────────────────────────────────────────────────────────────────────────────

export type Holding = { symbol: string; qty: number; avgCost: number };
export type Order = {
  id: string; symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; qty: number; limit?: number;
  status: 'open' | 'filled' | 'cancelled'; ts: number; filledAt?: number; price?: number; commission?: number;
};
export type Transfer = { id: string; ts: number; usdc: number; chf: number };
export type Portfolio = { cash: number; holdings: Holding[]; orders: Order[]; transfers: Transfer[]; watchlist: string[] };
export type MarketState = { prices: Record<string, number>; updatedAt: number; portfolio: Portfolio };

const STORAGE_KEY = 'sq-portfolio-v1';
const uid = () => Math.random().toString(36).slice(2, 10);

function seedPortfolio(now: number): Portfolio {
  const holdings: Holding[] = [
    { symbol: 'NESN', qty: 40, avgCost: 92.1 }, { symbol: 'NOVN', qty: 30, avgCost: 81.2 }, { symbol: 'ROG', qty: 10, avgCost: 248 },
    { symbol: 'SQN', qty: 8, avgCost: 342 }, { symbol: 'BTC', qty: 0.12, avgCost: 48200 }, { symbol: 'ETH', qty: 1.5, avgCost: 2650 },
    { symbol: 'SOL', qty: 6, avgCost: 142.3 },
  ];
  const ages = [412, 318, 260, 190, 150, 96, 41];
  const filled: Order[] = holdings.map((h, k) => {
    const inst = instrument(h.symbol)!;
    return {
      id: uid(), symbol: h.symbol, side: 'buy', type: 'market', qty: h.qty, status: 'filled', ts: now - ages[k] * DAY, filledAt: now - ages[k] * DAY,
      price: h.avgCost, commission: commission(inst, h.qty * h.avgCost * FX[inst.currency]),
    };
  });
  const open: Order[] = [
    { id: uid(), symbol: 'UBSG', side: 'buy', type: 'limit', qty: 50, limit: 26.5, status: 'open', ts: now - 2 * DAY },
    { id: uid(), symbol: 'BTC', side: 'sell', type: 'limit', qty: 0.02, limit: 68000, status: 'open', ts: now - 5 * DAY },
  ];
  return { cash: 31000, holdings, orders: [...open, ...filled], transfers: [], watchlist: ['UBSG', 'LOGN', 'NVDA', 'BTC', 'SMI'] };
}

function initialState(now: number): MarketState {
  return { prices: Object.fromEntries(INSTRUMENTS.map((i) => [i.symbol, i.ref])), updatedAt: now, portfolio: seedPortfolio(now) };
}

const SERVER_STATE = initialState(0);
let state: MarketState = SERVER_STATE;
let loaded = false;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function set(next: MarketState, persist = false) {
  state = next;
  if (persist) localStorage.setItem(STORAGE_KEY, JSON.stringify(next.portfolio));
  listeners.forEach((l) => l());
}

function load() {
  loaded = true;
  const now = Date.now();
  state = initialState(now);
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) state = { ...state, portfolio: JSON.parse(saved) };
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state.portfolio));
  } catch { /* private mode: keep the seed */ }
}

function tick() {
  if (document.visibilityState !== 'visible') return;
  const prices = { ...state.prices };
  for (const i of INSTRUMENTS) {
    const sigma = i.kind === 'crypto' ? 0.0012 : i.kind === 'index' ? 0.00025 : 0.0005;
    prices[i.symbol] *= Math.exp(sigma * gauss(Math.random));
  }
  let portfolio = state.portfolio;
  const fills: Order[] = [];
  for (const o of portfolio.orders) {
    if (o.status !== 'open' || o.limit === undefined) continue;
    const p = prices[o.symbol];
    if ((o.side === 'buy' && p <= o.limit) || (o.side === 'sell' && p >= o.limit)) {
      const r = fill(portfolio, o, o.limit);
      if (typeof r === 'string') continue;
      portfolio = r;
      fills.push(o);
    }
  }
  set({ ...state, prices, updatedAt: Date.now(), portfolio }, fills.length > 0);
  for (const o of fills) {
    notification({ title: 'Limit order executed', description: `${o.side === 'buy' ? 'Bought' : 'Sold'} ${formatQty(o.qty)} ${o.symbol} at ${formatPrice(o.limit!, instrument(o.symbol)!)}`, status: 'success', variant: 'stroke' });
  }
}

function subscribe(listener: () => void) {
  if (!loaded) load();
  listeners.add(listener);
  timer ??= setInterval(tick, 5000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) { clearInterval(timer); timer = undefined; }
  };
}

export function useMarket() {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

// ── Valuation ───────────────────────────────────────────────────────────────────────────────────

export function reservedCash(p: Portfolio) {
  return p.orders.filter((o) => o.status === 'open' && o.side === 'buy').reduce((s, o) => {
    const i = instrument(o.symbol)!;
    const value = o.qty * o.limit! * FX[i.currency];
    return s + value + commission(i, value);
  }, 0);
}

export function valuation(s: MarketState) {
  let assets = 0, crypto = 0, prev = 0, cost = 0;
  for (const h of s.portfolio.holdings) {
    const i = instrument(h.symbol)!;
    const fx = FX[i.currency];
    const v = h.qty * s.prices[h.symbol] * fx;
    if (i.kind === 'crypto') crypto += v; else assets += v;
    prev += h.qty * prevClose(i) * fx;
    cost += h.qty * h.avgCost * fx;
  }
  const cash = s.portfolio.cash;
  const total = assets + crypto + cash;
  const dayChange = assets + crypto - prev;
  return {
    assets, crypto, cash, total, dayChange, dayPct: dayChange / (total - dayChange),
    performance: assets + crypto - cost, buyingPower: Math.max(0, cash - reservedCash(s.portfolio)),
  };
}

/** Trading account value over a period: each position's price history times its quantity, plus cash. */
export function portfolioSeries(s: MarketState, period: Period): Point[] {
  let out: Point[] | null = null;
  for (const h of s.portfolio.holdings) {
    const i = instrument(h.symbol)!;
    const ser = priceSeries(i, period, s.prices[h.symbol], s.updatedAt);
    const k = h.qty * FX[i.currency];
    out = out ? out.map((p, j) => ({ t: p.t, v: p.v + ser[j].v * k })) : ser.map((p) => ({ t: p.t, v: p.v * k }));
  }
  const cash = s.portfolio.cash;
  return (out ?? priceSeries(INSTRUMENTS[0], period, INSTRUMENTS[0].ref, s.updatedAt).map((p) => ({ t: p.t, v: 0 }))).map((p) => ({ t: p.t, v: p.v + cash }));
}

// ── Actions ─────────────────────────────────────────────────────────────────────────────────────

function fill(p: Portfolio, o: Order, price: number): Portfolio | string {
  const i = instrument(o.symbol)!;
  const value = o.qty * price * FX[i.currency];
  const fee = commission(i, value);
  const holdings = [...p.holdings];
  const k = holdings.findIndex((h) => h.symbol === o.symbol);
  let cash = p.cash;
  if (o.side === 'buy') {
    if (value + fee > cash + 1e-9) return 'Not enough cash in your trading account';
    cash -= value + fee;
    if (k < 0) holdings.push({ symbol: o.symbol, qty: o.qty, avgCost: price });
    else {
      const h = holdings[k];
      holdings[k] = { ...h, qty: h.qty + o.qty, avgCost: (h.qty * h.avgCost + o.qty * price) / (h.qty + o.qty) };
    }
  } else {
    const held = k < 0 ? 0 : holdings[k].qty;
    if (o.qty > held + 1e-9) return `You hold ${formatQty(held)} ${o.symbol}`;
    cash += value - fee;
    const left = held - o.qty;
    if (left < 1e-9) holdings.splice(k, 1);
    else holdings[k] = { ...holdings[k], qty: left };
  }
  const filled: Order = { ...o, status: 'filled', filledAt: Date.now(), price, commission: fee };
  const exists = p.orders.some((x) => x.id === o.id);
  return { ...p, cash, holdings, orders: exists ? p.orders.map((x) => (x.id === o.id ? filled : x)) : [filled, ...p.orders] };
}

export function heldQty(p: Portfolio, symbol: string) {
  return p.holdings.find((h) => h.symbol === symbol)?.qty ?? 0;
}

/** Places an order. Market orders, and limit orders that are already marketable, fill at once. */
export function placeOrder(input: { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; qty: number; limit?: number }): Order {
  const i = instrument(input.symbol);
  if (!i || !tradable(i)) throw new Error('This instrument cannot be traded');
  if (!(input.qty > 0)) throw new Error('Enter a quantity');
  if (input.type === 'limit' && !(input.limit! > 0)) throw new Error('Enter a limit price');
  const p = state.portfolio;
  const price = state.prices[i.symbol];
  const order: Order = { id: uid(), ...input, status: 'open', ts: Date.now() };
  const marketable = input.type === 'market' || (input.side === 'buy' ? price <= input.limit! : price >= input.limit!);

  if (input.side === 'sell') {
    const pending = p.orders.filter((o) => o.status === 'open' && o.side === 'sell' && o.symbol === i.symbol).reduce((s, o) => s + o.qty, 0);
    const free = heldQty(p, i.symbol) - pending;
    if (input.qty > free + 1e-9) throw new Error(free > 0 ? `You can sell up to ${formatQty(free)} ${i.symbol}` : `You don't hold any ${i.symbol}`);
  } else {
    const value = input.qty * (marketable ? price : input.limit!) * FX[i.currency];
    if (value + commission(i, value) > valuation(state).buyingPower + 1e-9) throw new Error('Not enough buying power for this order');
  }

  if (marketable) {
    const r = fill(p, order, price);
    if (typeof r === 'string') throw new Error(r);
    set({ ...state, portfolio: r }, true);
    return r.orders[0];
  }
  set({ ...state, portfolio: { ...p, orders: [order, ...p.orders] } }, true);
  return order;
}

export function cancelOrder(id: string) {
  const p = state.portfolio;
  set({ ...state, portfolio: { ...p, orders: p.orders.map((o) => (o.id === id && o.status === 'open' ? { ...o, status: 'cancelled' } : o)) } }, true);
}

export function toggleWatch(symbol: string) {
  const p = state.portfolio;
  const watchlist = p.watchlist.includes(symbol) ? p.watchlist.filter((s) => s !== symbol) : [...p.watchlist, symbol];
  set({ ...state, portfolio: { ...p, watchlist } }, true);
}

/** Books a transfer from the trading account's cash to the self-custody wallet. */
export function recordWalletTransfer(usdc: number) {
  if (!loaded) load();
  const p = state.portfolio;
  const chf = usdc * USDC_CHF;
  set({ ...state, portfolio: { ...p, cash: p.cash - chf, transfers: [{ id: uid(), ts: Date.now(), usdc, chf }, ...p.transfers] } }, true);
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────────

const fmt = (d: number) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: d, maximumFractionDigits: d });
const F2 = fmt(2), F3 = fmt(3), F4 = fmt(4);

/** Decimal places a price is shown with: more for cheap crypto. */
export function priceDigits(v: number, i?: Instrument) {
  if (i?.kind === 'crypto') return v < 1 ? 4 : v < 100 ? 3 : 2;
  return 2;
}

export function formatPrice(v: number, i?: Instrument) {
  const d = priceDigits(v, i);
  return (d === 4 ? F4 : d === 3 ? F3 : F2).format(v);
}

export function formatQty(q: number) {
  return new Intl.NumberFormat('de-CH', { maximumFractionDigits: 6 }).format(q);
}

/** "+ 1.65" / "− 0.42": signed amount with a typographic minus, as in the Swissquote app. */
export function formatSigned(v: number, digits = 2) {
  return `${v < 0 ? '−' : '+'} ${fmt(digits).format(Math.abs(v))}`;
}

export function formatPct(v: number) {
  return `${F2.format(Math.abs(v * 100))} %`;
}
