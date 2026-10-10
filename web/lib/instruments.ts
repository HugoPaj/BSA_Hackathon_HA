// Instruments of the mock trading account. Plain data, importable from server and client components.
import { USDC_CHF } from './config';

export type Kind = 'share' | 'smi' | 'crypto' | 'index';
export type Currency = 'CHF' | 'USD' | 'EUR';
export type Instrument = { symbol: string; name: string; detail: string; kind: Kind; currency: Currency; ref: number; day: number };

type Row = [symbol: string, name: string, detail: string, ref: number, dayPct: number];
const rows = (kind: Kind, currency: Currency, list: Row[]): Instrument[] =>
  list.map(([symbol, name, detail, ref, day]) => ({ symbol, name, detail, kind, currency, ref, day: day / 100 }));

export const INSTRUMENTS: Instrument[] = [
  ...rows('smi', 'CHF', [
    ['NESN', 'Nestlé', 'NESTLE N', 88.4, 0.42], ['NOVN', 'Novartis', 'NOVARTIS N', 88.56, -0.23], ['ROG', 'Roche', 'ROCHE GS', 256, 0.87],
    ['UBSG', 'UBS Group', 'UBS GROUP N', 27.92, 1.12], ['ZURN', 'Zurich Insurance', 'ZURICH INSURANCE N', 550, 0.18], ['ABBN', 'ABB', 'ABB LTD N', 51.56, 0.55],
    ['CFR', 'Richemont', 'RICHEMONT N', 140.2, -0.64], ['HOLN', 'Holcim', 'HOLCIM N', 88.5, -0.29], ['SCMN', 'Swisscom', 'SWISSCOM N', 503, -0.2],
    ['GIVN', 'Givaudan', 'GIVAUDAN N', 4000, 0.7], ['LONN', 'Lonza', 'LONZA N', 560.4, 1.35], ['SIKA', 'Sika', 'SIKA N', 215.3, -0.48],
    ['ALC', 'Alcon', 'ALCON N', 75.42, 0.21], ['SREN', 'Swiss Re', 'SWISS RE N', 135.15, 0.33], ['PGHN', 'Partners Group', 'PARTNERS GROUP N', 1180, -0.92],
    ['LOGN', 'Logitech', 'LOGITECH N', 82.06, 1.64], ['SLHN', 'Swiss Life', 'SWISS LIFE N', 720.4, 0.12], ['GEBN', 'Geberit', 'GEBERIT N', 545.2, -0.15],
    ['KNIN', 'Kuehne+Nagel', 'KUEHNE+NAGEL N', 190.35, -1.08], ['SOON', 'Sonova', 'SONOVA N', 270.1, 0.46],
  ]),
  ...rows('share', 'CHF', [['SQN', 'Swissquote', 'SWISSQUOTE N', 405, 0.95]]),
  ...rows('share', 'USD', [
    ['AAPL', 'Apple', 'APPLE INC', 228.4, 0.62], ['NVDA', 'NVIDIA', 'NVIDIA CORP', 131.2, 2.14], ['MSFT', 'Microsoft', 'MICROSOFT CORP', 418.1, -0.31],
    ['TSLA', 'Tesla', 'TESLA INC', 246.9, -1.87], ['AMZN', 'Amazon', 'AMAZON.COM INC', 186.5, 0.44],
  ]),
  ...rows('crypto', 'USD', [
    ['BTC', 'Bitcoin', 'BITCOIN', 62180, 2.31], ['ETH', 'Ethereum', 'ETHEREUM', 3104.5, -1.07], ['SOL', 'Solana', 'SOLANA', 109.47, -1.3],
    ['DOT', 'Polkadot', 'POLKADOT', 1.239, 5.9], ['CHZ', 'Chiliz', 'CHILIZ', 0.0153, 1.32], ['LINK', 'Chainlink', 'CHAINLINK', 12.936, 2.04],
    ['XRP', 'XRP', 'RIPPLE', 0.5821, -0.74], ['ADA', 'Cardano', 'CARDANO', 0.3842, 0.88],
  ]),
  ...rows('index', 'CHF', [['SMI', 'SMI', 'SMI® PR', 11681.44, 0.34], ['SPI', 'SPI', 'SPI® TR', 15402.8, 0.29], ['SLI', 'SLI', 'SLI® PR', 1930.12, 0.41]]),
  ...rows('index', 'EUR', [['DAX', 'DAX', 'DAX® PERFORMANCE', 18690.33, -0.12]]),
  ...rows('index', 'USD', [['SPX', 'S&P 500', 'S&P 500 INDEX', 5702.55, 0.4], ['NDX', 'Nasdaq 100', 'NASDAQ 100 INDEX', 19938.2, 0.71]]),
];
const BY_SYMBOL = new Map(INSTRUMENTS.map((i) => [i.symbol, i]));
export const instrument = (symbol: string) => BY_SYMBOL.get(symbol.toUpperCase());

export const FX: Record<Currency, number> = { CHF: 1, USD: USDC_CHF, EUR: 0.94 };
export const VENUE: Record<Kind, string> = { smi: 'SIX Swiss Exchange', share: 'SIX / NASDAQ', crypto: 'SQX, Swissquote crypto exchange', index: 'Index, not tradable' };
export const tradable = (i: Instrument) => i.kind !== 'index';
export const prevClose = (i: Instrument) => i.ref / (1 + i.day);

