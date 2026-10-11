import { RiCheckboxCircleFill } from '@remixicon/react';

// Where ReadID Ready sends the phone after a scan started from a QR code on another screen.
export default function PassportDone() {
  return (
    <div className="mx-auto max-w-[460px] space-y-4 rounded-3xl bg-bg-white-0 p-6 text-center ring-1 ring-inset ring-stroke-soft-200 md:p-8">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-lighter text-success-base"><RiCheckboxCircleFill className="size-7" /></span>
      <h1 className="text-title-h5 text-text-strong-950">Passport scanned</h1>
      <p className="text-paragraph-sm text-text-sub-600">Go back to the screen where you started. It continues on its own once the passport guardian has checked the chip.</p>
    </div>
  );
}
