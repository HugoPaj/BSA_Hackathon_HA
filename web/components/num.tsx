'use client';

import { Numbers, type NumbersProps } from '@sfinterface/numbers';

const formats = new Map<number, Intl.NumberFormatOptions>();
const fixed = (d: number) => {
  if (!formats.has(d)) formats.set(d, { minimumFractionDigits: d, maximumFractionDigits: d });
  return formats.get(d)!;
};

type Props = Omit<NumbersProps, 'value' | 'format' | 'locale'> & { value: number; digits?: number };

/** An animated number in the app's Swiss format (1’250.00). Kept quiet: a short slide, no blur, a soft edge. */
export function Num({ value, digits = 2, ...rest }: Props) {
  return <Numbers value={value} locale="de-CH" format={fixed(digits)} transition="tick" blur={false} fade={0.5} duration={320} {...rest} />;
}

/** "+ 1.65" / "− 0.42", animated. Mirrors formatSigned. */
export function SignedNum({ value, ...rest }: Props) {
  return <Num value={Math.abs(value)} prefix={value < 0 ? '− ' : '+ '} {...rest} />;
}

/** "1.23 %" from a fraction, unsigned. Mirrors formatPct. */
export function PctNum({ value, ...rest }: Props) {
  return <Num value={Math.abs(value * 100)} suffix={' %'} {...rest} />;
}
