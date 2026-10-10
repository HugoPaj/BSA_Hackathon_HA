import Link from 'next/link';
import * as Button from '@/components/ui/button';

/** Shown on wallet pages once we know there is no deployed wallet yet. */
export function NoWallet({ started = false }: { started?: boolean }) {
  return (
    <div className="mx-auto max-w-[480px] rounded-3xl bg-bg-white-0 p-8 text-center ring-1 ring-inset ring-stroke-soft-200">
      <h1 className="text-title-h5 text-text-strong-950">{started ? 'Finish setting up your wallet' : 'No wallet yet'}</h1>
      <p className="mt-2 text-paragraph-sm text-text-sub-600">Create a passkey-controlled wallet next to your Swissquote account. It takes under a minute.</p>
      <Button.Root asChild className="mt-6"><Link href="/wallet/new">{started ? 'Finish setting up' : 'Open self-custody wallet'}</Link></Button.Root>
    </div>
  );
}
