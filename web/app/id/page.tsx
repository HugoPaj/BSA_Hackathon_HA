'use client';
import { useEffect, useState } from 'react';
import { RiAndroidLine, RiDownloadLine, RiIdCardLine, RiSmartphoneLine } from '@remixicon/react';
import * as FancyButton from '@/components/ui/fancy-button';
import * as Button from '@/components/ui/button';
import * as Alert from '@/components/ui/alert';
import { appLinks } from '@/components/dnie-sign';

// Opened by the QR code on the wallet's DNI step. On Android it hands the request to the Swissquote ID app,
// which reads the DNIe over NFC. Nothing here is secret beyond the single-use request token in the URL.
export default function IdHandoff() {
  const [p, setP] = useState<{ id: string; token: string; origin: string; install: boolean } | null>(null);
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get('id'), token = q.get('token');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the handoff parameters once, client-side
    setAndroid(/Android/i.test(navigator.userAgent));
    if (id && token) setP({ id, token, origin: q.get('origin') || window.location.origin, install: q.has('install') });
  }, []);
  const links = p ? appLinks(p, p.origin) : null;
  useEffect(() => {
    if (p && android && !p.install) window.location.href = appLinks(p, p.origin).intent;
  }, [p, android]);

  return (
    <div className="mx-auto max-w-[460px] space-y-5 rounded-3xl bg-bg-white-0 p-6 ring-1 ring-inset ring-stroke-soft-200 md:p-8">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-alpha-10 text-primary-base"><RiIdCardLine className="size-6" /></span>
      <div>
        <h1 className="text-title-h5 text-text-strong-950">Sign with your DNI</h1>
        <p className="mt-1 text-paragraph-sm text-text-sub-600">The Swissquote ID app reads your Spanish DNI over NFC. You enter the CAN printed on the card and your PIN; the card signs, and your wallet continues on the other screen.</p>
      </div>
      {!p ? (
        <Alert.Root status="warning" variant="lighter" size="small"><Alert.Icon />Open this page from the QR code in your wallet.</Alert.Root>
      ) : !android ? (
        <Alert.Root status="information" variant="lighter" size="small"><Alert.Icon />Open this link on an Android phone with NFC. Reading a DNI needs the phone&apos;s NFC reader, which browsers cannot use directly.</Alert.Root>
      ) : (
        <>
          {p.install && <Alert.Root status="information" variant="lighter" size="small"><Alert.Icon />Swissquote ID is not installed yet. Install it, then tap &quot;Open Swissquote ID&quot;.</Alert.Root>}
          <FancyButton.Root variant="primary" className="h-12 w-full" asChild>
            <a href={links!.intent}><FancyButton.Icon as={RiSmartphoneLine} />Open Swissquote ID</a>
          </FancyButton.Root>
        </>
      )}
      <Button.Root variant="neutral" mode="stroke" className="w-full" asChild>
        <a href="/swissquote-id.apk"><Button.Icon as={android ? RiDownloadLine : RiAndroidLine} />Download Swissquote ID (Android, prototype build)</a>
      </Button.Root>
    </div>
  );
}
