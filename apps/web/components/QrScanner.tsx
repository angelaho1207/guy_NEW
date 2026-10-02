'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectCodeFromLink } from '@guy/shared';
import { redeemCode } from '@/app/actions';

/**
 * Reading someone else's code with the camera.
 *
 * Two taps from here to connected: *Scan*, then *Confirm*. There is no shutter
 * button — a code is detected the moment it is in frame, because asking someone
 * to frame and then press is a third tap for nothing.
 *
 * ## Two decoders
 *
 * `BarcodeDetector` is built into Chromium and does this in native code. Safari
 * does not have it, and Safari is most phones, so jsQR is the fallback: a pure
 * JavaScript decoder run over frames pulled off a canvas. The native one is
 * tried first because it is faster and uses less battery.
 *
 * ## Why the camera is stopped so insistently
 *
 * A live camera track is a privacy problem and a battery problem, and a tab
 * switched away from on a phone can stay alive for a long time. So tracks are
 * stopped on success, on error, on unmount, and whenever the page is hidden.
 */

type Status = 'off' | 'starting' | 'scanning' | 'working' | 'denied' | 'unsupported' | 'error';

type DetectorLike = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

/** jsQR's shape, named rather than inferred so the variable can start null. */
type QrDecoder = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { data: string } | null;

export function QrScanner() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('off');
  const [detail, setDetail] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number | null>(null);
  const done = useRef(false);

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const handle = useCallback(
    async (raw: string) => {
      const code = connectCodeFromLink(raw);
      // Not one of our links. Keep looking rather than complaining, and do not
      // try to redeem it: a camera pointed at the world sees other people's QR
      // codes, and a failed redemption would spend a rate-limited attempt.
      if (!code || done.current) return;

      done.current = true;
      stop();
      setStatus('working');

      const res = await redeemCode(code);
      if ('error' in res) {
        setStatus('error');
        setDetail(res.error);
        done.current = false;
        return;
      }
      if ('alreadyConnected' in res) {
        setStatus('off');
        setNote('You two are already connected. Nothing happened.');
        done.current = false;
        return;
      }
      setStatus('off');
      router.refresh();
    },
    [router, stop],
  );

  const start = useCallback(async () => {
    setNote(null);
    setDetail(null);
    done.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }

    setStatus('starting');

    try {
      // `environment` is the back camera, which is the one pointed at another
      // person's phone.
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied');
      } else {
        setStatus('error');
        setDetail((err as Error)?.message ?? 'The camera would not open.');
      }
      return;
    }

    const el = video.current;
    if (!el) return;
    el.srcObject = stream.current;
    await el.play().catch(() => undefined);
    setStatus('scanning');

    const native: DetectorLike | null =
      'BarcodeDetector' in window
        ? new (window as unknown as { BarcodeDetector: new (o: object) => DetectorLike })
            .BarcodeDetector({ formats: ['qr_code'] })
        : null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let jsQR: QrDecoder | null = null;

    if (!native) {
      // Loaded only when it is actually needed, so Chromium never pays for it.
      jsQR = (await import('jsqr')).default as unknown as QrDecoder;
    }

    const look = async () => {
      if (done.current || !video.current) return;
      const v = video.current;

      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        try {
          if (native) {
            const found = await native.detect(v);
            if (found[0]?.rawValue) await handle(found[0].rawValue);
          } else if (jsQR && ctx) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(pixels.data, pixels.width, pixels.height);
            if (found?.data) await handle(found.data);
          }
        } catch {
          // A single unreadable frame is normal. Keep going.
        }
      }

      if (!done.current) frame.current = requestAnimationFrame(() => void look());
    };

    frame.current = requestAnimationFrame(() => void look());
  }, [handle]);

  // Stop on unmount, and whenever the page goes to the background.
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        setStatus((s) => (s === 'scanning' || s === 'starting' ? 'off' : s));
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      stop();
    };
  }, [stop]);

  const close = () => {
    stop();
    setStatus('off');
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Scan their code</h3>

      {status === 'off' && (
        <>
          <p className="tiny" style={{ marginTop: 0 }}>
            Point your camera at the code on their screen. It connects as soon as
            it sees it — you will still both confirm.
          </p>
          {note && (
            <div className="banner" style={{ marginBottom: 12 }}>
              {note}
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={() => void start()}>
            Scan
          </button>
        </>
      )}

      {(status === 'starting' || status === 'scanning' || status === 'working') && (
        <>
          <div className="viewfinder">
            <video ref={video} playsInline muted />
          </div>
          <p className="tiny">
            {status === 'working'
              ? 'Got it — opening…'
              : status === 'starting'
                ? 'Opening the camera…'
                : 'Looking for a code…'}
          </p>
          <button type="button" className="btn btn-quiet" onClick={close}>
            Stop
          </button>
        </>
      )}

      {status === 'denied' && (
        <>
          <p className="tiny" style={{ marginTop: 0, color: 'var(--danger)' }}>
            The camera is blocked for this site. Allow it in your browser
            settings, or type their three words instead.
          </p>
          <button type="button" className="btn btn-quiet" onClick={() => void start()}>
            Try again
          </button>
        </>
      )}

      {status === 'unsupported' && (
        <p className="tiny" style={{ marginTop: 0 }}>
          This browser will not open a camera here. On a phone that usually means
          the page is not on a secure address — it works on the real site, and
          not over a plain <code>http://</code> address on your home network.
          Type their three words instead.
        </p>
      )}

      {status === 'error' && (
        <>
          <p className="tiny" style={{ marginTop: 0, color: 'var(--danger)' }}>
            {detail ?? 'Something went wrong.'}
          </p>
          <button type="button" className="btn btn-quiet" onClick={() => void start()}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
