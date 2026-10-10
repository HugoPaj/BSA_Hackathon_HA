import Image from 'next/image';
import { cn } from '@/utils/cn';

/**
 * Full-bleed split screen for the logged-out home and the recovery flow: engraved artwork on the left, optionally with copy
 * over its darkened foot, the form on white to the right. On mobile the art becomes a banner above the form.
 */
export function SplitScreen({ image, art, children, bannerClassName, contentClassName }: {
  image: string;
  /** Copy laid over the image's darkened foot. Without it the artwork shows untouched. */
  art?: React.ReactNode;
  children: React.ReactNode;
  bannerClassName?: string;
  contentClassName?: string;
}) {
  return (
    <div className="grid flex-1 content-start bg-bg-white-0 lg:content-stretch lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="p-3 pb-0 lg:p-4 lg:pr-0">
        {/* clip-path backs up the rounded corners: iOS Safari stops clipping the zooming image to them until its animation ends. */}
        <div className={cn('relative isolate flex h-[360px] flex-col overflow-hidden rounded-3xl [clip-path:inset(0_round_1.5rem)] bg-bg-weak-50 sm:h-[440px] lg:sticky lg:top-4 lg:h-[calc(100dvh-97px)]', bannerClassName)}>
          <Image src={image} alt="" fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="-z-20 animate-landing-zoom object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(0_0_0/0.1)_0.6px,transparent_0.8px)] bg-[length:4px_4px] mix-blend-multiply" />
          {art && <>
            {/* Under the copy, a progressive blur calms the detailed linework and a deep fade gives
                the white and orange text a quiet, dark backdrop. */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 backdrop-blur-md [mask-image:linear-gradient(to_top,#000_50%,transparent)]" />
            <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[60%] bg-gradient-to-t from-[#1a120e]/95 via-[#1a120e]/70 via-45% to-transparent" />
            <div className="stagger mt-auto p-5 text-static-white lg:p-10">{art}</div>
          </>}
        </div>
      </section>
      <section className={cn('flex flex-col px-5 pb-10 pt-8 sm:px-10 lg:py-6', contentClassName)}>{children}</section>
    </div>
  );
}

/** The bold uppercase display headline that sits on the artwork. */
export function SplitHeadline({ children }: { children: React.ReactNode }) {
  return <h1 className="sq-display animate-fade-in-up text-[clamp(28px,8.2vw,40px)] md:text-[56px] xl:text-[72px]">{children}</h1>;
}
