import { USDC, USDC_CHF } from './config';

const chf = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Swiss format, currency after the number: 1'250.00 */
export function formatNumber(n: number) {
  return chf.format(n);
}

export function toUnits(amount: bigint, decimals: number = USDC.decimals) {
  return Number(amount) / 10 ** decimals;
}

export function parseUsdc(input: string): bigint | null {
  const clean = input.replace(/['\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,6})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  return BigInt(whole) * 10n ** 6n + BigInt(frac.padEnd(6, '0'));
}

export function formatUsdc(amount: bigint) {
  return formatNumber(toUnits(amount));
}

export function usdcToChf(amount: bigint) {
  return formatNumber(toUnits(amount) * USDC_CHF);
}

export function shortAddress(address?: string | null) {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString('de-CH');
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
