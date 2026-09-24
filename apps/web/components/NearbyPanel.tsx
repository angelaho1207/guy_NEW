'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  heartbeatPresence,
  leavePresence,
  connectNearby,
  type NearbyPerson,
} from '@/app/actions';

/**
 * The nearby list: who else has this screen open, right now, near you.
 *
 * The thing that makes this work is not the location. It is that both people
 * have the connect screen open at the same moment, which in a room of two
 * hundred narrows it to one or two. Location only sorts those candidates, so
 * it can be coarse and often is: indoors, tens of metres out is normal.
 *
 * Nothing starts until the button is pressed. Appearing on other people's
 * screens is the kind of thing that should be a decision, not a side effect of
 * navigating to a page, and the permission prompt reads better when the person
 * has just asked for it.
 */

/** Slower than the 45s presence TTL by a wide margin, so a row never lapses. */
const HEARTBEAT_MS = 4000;

type Status = 'off' | 'starting' | 'on' | 'denied' | 'unsupported' | 'error';

export function NearbyPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('off');
  const [detail, setDetail] = useState<string | null>(null);
  const [people, setPeople] = useState<NearbyPerson[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // The most recent fix, read by the heartbeat. A ref rather than state
  // because a new position should not re-render the list on its own.
  const pos = useRef<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const watchId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const beat = useCallback(async () => {
    const res = await heartbeatPresence(pos.current);
    if ('error' in res) {
      setStatus('error');
      setDetail(res.error);
      return;
    }
    setPeople(res.people);
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    pos.current = null;
    setPeople([]);
    setStatus('off');
    void leavePresence();
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }

    setStatus('starting');
    setDetail(null);

    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        pos.current = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        };
        setStatus((s) => (s === 'starting' ? 'on' : s));
        void beat();
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        setDetail(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );

    timer.current = setInterval(() => void beat(), HEARTBEAT_MS);
  }, [beat]);

  // Leaving the screen ends presence. The server also expires rows after 45
  // seconds, which is what covers a phone that loses signal or a tab killed
  // without ceremony.
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      void leavePresence();
    };
  }, []);

  const tap = async (person: NearbyPerson) => {
    setBusy(person.user_id);
    setNote(null);
    const res = await connectNearby(person.user_id);
    setBusy(null);

    if ('error' in res) {
      setNote(res.error);
      return;
    }
    if ('alreadyConnected' in res) {
      setNote(`You and ${person.display_name} are already connected.`);
      return;
    }
    // The prompt is rendered by the page from its own query, so ask for it.
    router.refresh();
  };

  return (
    <div className="card">
      <div className="row-head">
        <h3 style={{ margin: 0 }}>Who else is here</h3>
        {status === 'on' && (
          <span className="pill" data-tone="accent">
            You are visible
          </span>
        )}
      </div>

      {status === 'off' && (
        <>
          <p className="tiny" style={{ marginTop: 0 }}>
            Both of you open this screen, and you will see each other. Tapping a
            name only asks — nothing is shared until you both confirm.
          </p>
          <p className="tiny">
            While this is on, other people using Guy within about 150 metres who
            also have this screen open can see your name and roughly how far
            away you are. Nothing else. It stops the moment you leave.
          </p>
          <button className="btn btn-primary" onClick={start}>
            Show me who&rsquo;s nearby
          </button>
        </>
      )}

      {status === 'starting' && (
        <p className="tiny" style={{ marginTop: 0 }}>
          Finding you… if your phone asks about location, say yes.
        </p>
      )}

      {status === 'denied' && (
        <>
          <p className="tiny" style={{ marginTop: 0, color: 'var(--danger)' }}>
            Location is turned off for this site, so there is no way to tell who
            is near you. Use the code below instead, or turn location on in your
            browser settings and try again.
          </p>
          <button className="btn btn-quiet" onClick={start}>
            Try again
          </button>
        </>
      )}

      {status === 'unsupported' && (
        <p className="tiny" style={{ marginTop: 0 }}>
          This browser cannot do location. Use the code below instead.
        </p>
      )}

      {status === 'error' && (
        <>
          <p className="tiny" style={{ marginTop: 0, color: 'var(--danger)' }}>
            {detail ?? 'Something went wrong.'}
          </p>
          <button className="btn btn-quiet" onClick={start}>
            Try again
          </button>
        </>
      )}

      {status === 'on' && (
        <>
          {people.length === 0 ? (
            <p className="tiny" style={{ marginTop: 0 }}>
              Nobody else has this screen open near you yet. Ask them to open
              Connect too — you should appear on each other within a few
              seconds.
            </p>
          ) : (
            <div style={{ marginTop: 4 }}>
              {people.map((p) => (
                <div className="card card-tight row-head" key={p.user_id}>
                  <div>
                    <strong>{p.display_name}</strong>
                    <div className="tiny">{distance(p)}</div>
                  </div>
                  {p.already_connected ? (
                    <span className="pill">Already connected</span>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => tap(p)}
                      disabled={busy === p.user_id}
                    >
                      {busy === p.user_id ? 'Asking…' : 'Connect'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {note && (
            <div className="banner" style={{ marginBottom: 0 }}>
              {note}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn-quiet" onClick={stop}>
              Stop showing me
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Distance is a hint, not a measurement. Rounding hard is deliberate: a phone
 * that says "12 m" when it means "somewhere in this room" invites people to
 * trust it, and the number is there only to help tell two names apart.
 */
function distance(p: NearbyPerson): string {
  if (p.metres === null) return p.same_network ? 'On the same network' : 'Nearby';
  if (p.metres < 20) return 'Right here';
  if (p.metres < 75) return 'Within a minute of you';
  return 'Nearby';
}
