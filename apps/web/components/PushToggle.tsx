'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  savePushSubscription,
  dropPushSubscription,
} from '@/app/push-actions';

/**
 * Turning reminders on for this device.
 *
 * ## The iOS condition, which is the whole reason this reads the way it does
 *
 * Safari only allows notifications for a site that has been added to the home
 * screen. In an ordinary Safari tab the API is simply absent, so there is no
 * permission to ask for and no way to ask. Rather than show a button that
 * cannot work, this detects it and says what to do instead.
 *
 * `navigator.standalone` is the old Safari flag for a home-screen launch, and
 * the display-mode query is the standard one. Either is enough.
 *
 * ## Why a subscription is per device, not per account
 *
 * The thing a push service delivers to is a browser, not a person. So turning
 * this on on a laptop says nothing about a phone, and the copy says so rather
 * than implying an account-wide setting.
 */

type State = 'checking' | 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied' | 'error';

/** The VAPID public key, which identifies this app to the push service. */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * Push wants the key as bytes, and it travels as base64url.
 *
 * Typed as ArrayBuffer rather than Uint8Array because `applicationServerKey`
 * will not accept a view whose buffer might be shared, and a plain Uint8Array's
 * type says it might be.
 */
function toBytes(base64url: string): ArrayBuffer {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function PushToggle({ subscribed }: { subscribed: boolean }) {
  const [state, setState] = useState<State>('checking');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!VAPID) {
      setState('unsupported');
      setDetail('Notifications are not configured on this deployment yet.');
      return;
    }

    const installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // On an iPhone this is almost always the home-screen condition rather
      // than a browser that cannot do push at all.
      setState(
        /iphone|ipad|ipod/i.test(navigator.userAgent) && !installed
          ? 'needs-install'
          : 'unsupported',
      );
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    setState(subscribed ? 'on' : 'off');
  }, [subscribed]);

  const turnOn = useCallback(async () => {
    setDetail(null);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          // Required to be true by every browser: a push that shows nothing is
          // not allowed, which suits us -- every message here is worth seeing.
          userVisibleOnly: true,
          applicationServerKey: toBytes(VAPID!),
        }));

      const raw = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
        setState('error');
        setDetail('The browser gave back an incomplete subscription.');
        return;
      }

      const res = await savePushSubscription({
        endpoint: raw.endpoint,
        keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
      });

      if ('error' in res) {
        setState('error');
        setDetail(res.error);
        return;
      }
      setState('on');
    } catch (err) {
      setState('error');
      setDetail((err as Error)?.message ?? 'Something went wrong.');
    }
  }, []);

  const turnOff = useCallback(async () => {
    setDetail(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      // Tell the server first. If unsubscribing succeeded and saving failed we
      // would keep sending to a dead endpoint until the push service rejected
      // it, which is slower and noisier than the other order.
      if (subscription) {
        await dropPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch (err) {
      setState('error');
      setDetail((err as Error)?.message ?? 'Something went wrong.');
    }
  }, []);

  return (
    <div className="card">
      <div className="row-head">
        <div>
          <h3 style={{ margin: 0 }}>Reminders</h3>
          <p className="tiny" style={{ margin: '4px 0 0' }}>
            For follow-ups coming due and meeting requests. This device only, so
            turning it on here says nothing about your other ones.
          </p>
        </div>

        {state === 'on' && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => void turnOff()}>
            Turn off
          </button>
        )}
        {state === 'off' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void turnOn()}>
            Turn on
          </button>
        )}
      </div>

      {state === 'on' && (
        <p className="tiny" style={{ marginBottom: 0 }}>
          <span className="dot" data-live="true" style={{ display: 'inline-block', marginRight: 6 }} />
          On for this device.
        </p>
      )}

      {state === 'needs-install' && (
        <p className="tiny" style={{ marginBottom: 0 }}>
          On iPhone, notifications only work once Guy is on your home screen.
          Tap Share, then <strong>Add to Home Screen</strong>, open it from
          there, and this will offer to turn them on.
        </p>
      )}

      {state === 'denied' && (
        <p className="tiny" style={{ marginBottom: 0, color: 'var(--danger)' }}>
          Notifications are blocked for this site, so we cannot ask again from
          here. Allow them in your browser settings first.
        </p>
      )}

      {(state === 'unsupported' || state === 'error') && (
        <p className="tiny" style={{ marginBottom: 0, color: 'var(--text-muted)' }}>
          {detail ?? 'This browser will not do notifications.'}
        </p>
      )}
    </div>
  );
}
