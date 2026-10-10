'use client';
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { RiCameraLine, RiCheckboxCircleFill, RiCloseLine, RiImageLine, RiLockUnlockLine } from '@remixicon/react';
import * as DigitInput from '@/components/ui/digit-input';
import * as Button from '@/components/ui/button';
import * as Label from '@/components/ui/label';
import * as Alert from '@/components/ui/alert';
import { unlockRecoveryCard } from '@/lib/card';
import type { CardSigner } from '@/lib/use-tx-flow';

const PREFIX = 'SQRC1.';

// Reads a QR code from a video frame or image, downscaling large photos so jsQR stays fast.
function readQr(src: HTMLVideoElement | HTMLImageElement, width: number, height: number, canvas: HTMLCanvasElement) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
}

export function CardUnlock({ onUnlocked, purpose }: { onUnlocked: (s: CardSigner & { address: string; signTypedData: (a: never) => Promise<`0x${string}`> }) => void; purpose: string }) {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fromQr, setFromQr] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const accept = (text: string | null) => {
    if (!text) return setError('No QR code found. Try a sharper, closer photo, or paste the code instead.'), false;
    if (!text.trim().startsWith(PREFIX)) return setError('That QR code is not a Swissquote recovery card.'), false;
    setCode(text.trim()); setFromQr(true); setError(null); return true;
  };

  useEffect(() => {
    if (!scanning) return;
    let raf = 0, stream: MediaStream | null = null, stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!; v.srcObject = stream; await v.play();
        const tick = () => {
          if (stopped) return;
          const text = v.videoWidth ? readQr(v, v.videoWidth, v.videoHeight, canvas.current!) : null;
          if (text?.startsWith(PREFIX)) { accept(text); setScanning(false); return; }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setError('Camera unavailable. Upload a photo of your card or paste the code instead.'); setScanning(false); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [scanning]);

  const upload = (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => { accept(readQr(img, img.naturalWidth, img.naturalHeight, canvas.current!)); URL.revokeObjectURL(url); };
    img.onerror = () => { setError('Could not read that image.'); URL.revokeObjectURL(url); };
    img.src = url;
  };

  return (
    <div className="space-y-3 rounded-xl bg-bg-weak-50 p-4">
      <div>
        <div className="text-label-sm text-text-strong-950">{purpose}</div>
        <p className="mt-0.5 text-paragraph-xs text-text-sub-600">You need two things from when you created your wallet: the recovery card you printed or copied (a QR code and a code starting with <span className="font-mono">{PREFIX}</span>), and the 6-digit PIN you chose for it.</p>
      </div>

      <div className="space-y-1.5">
        <Label.Root htmlFor="card-code">1. Your recovery card</Label.Root>
        {scanning ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-10 bg-[#323232]">
            <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-[18%] rounded-xl ring-2 ring-static-white/80" />
            <div className="absolute inset-x-0 bottom-3 text-center text-paragraph-xs text-static-white/90">Point the camera at the QR code on your card</div>
            <button aria-label="Stop scanning" onClick={() => setScanning(false)} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-static-black/50 text-static-white"><RiCloseLine className="size-5" /></button>
          </div>
        ) : fromQr ? (
          <div className="flex items-center gap-2.5 rounded-10 bg-bg-white-0 p-3 ring-1 ring-inset ring-stroke-soft-200">
            <RiCheckboxCircleFill className="size-5 shrink-0 text-success-base" />
            <div className="min-w-0 flex-1"><div className="text-label-sm text-text-strong-950">Card code read</div><div className="truncate font-mono text-paragraph-xs text-text-soft-400">{code}</div></div>
            <button className="text-label-xs text-text-sub-600 hover:text-text-strong-950" onClick={() => { setFromQr(false); setCode(''); }}>Change</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button.Root variant="neutral" mode="stroke" size="small" onClick={() => { setError(null); setScanning(true); }}><Button.Icon as={RiCameraLine} />Scan QR</Button.Root>
              <Button.Root variant="neutral" mode="stroke" size="small" onClick={() => file.current?.click()}><Button.Icon as={RiImageLine} />Upload photo</Button.Root>
            </div>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            <textarea id="card-code" value={code} onChange={(e) => setCode(e.target.value)} rows={3} placeholder={`or paste the code: ${PREFIX}…`} className="w-full rounded-10 bg-bg-white-0 p-3 font-mono text-paragraph-xs text-text-strong-950 ring-1 ring-inset ring-stroke-soft-200 outline-none focus:ring-primary-base" />
          </>
        )}
        <canvas ref={canvas} className="hidden" />
      </div>

      <div className="space-y-1.5">
        <Label.Root>2. Card PIN</Label.Root>
        <DigitInput.Root numInputs={6} value={pin} onChange={setPin} inputType="password" />
      </div>
      {error && <Alert.Root status="error" variant="lighter" size="xsmall"><Alert.Icon />{error}</Alert.Root>}
      <Button.Root variant="neutral" mode="stroke" size="small" className="w-full" disabled={busy || pin.length < 6 || !code}
        onClick={async () => {
          setBusy(true); setError(null);
          try { onUnlocked((await unlockRecoveryCard(code, pin)) as never); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>
        <Button.Icon as={RiLockUnlockLine} />{busy ? 'Unlocking…' : 'Unlock card'}
      </Button.Root>
    </div>
  );
}
