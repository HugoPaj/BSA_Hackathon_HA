import { Suspense } from 'react';
import { INSTRUMENTS } from '@/lib/instruments';
import { InstrumentView } from './instrument-view';

// Every instrument is known up front, so each page prerenders like a static route.
export function generateStaticParams() {
  return INSTRUMENTS.map((i) => ({ symbol: i.symbol }));
}

export default function InstrumentPage({ params }: { params: Promise<{ symbol: string }> }) {
  return <Suspense><Instrument params={params} /></Suspense>;
}

async function Instrument({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <InstrumentView symbol={symbol} />;
}
