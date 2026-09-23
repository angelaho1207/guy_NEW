import QRCode from 'qrcode';
import { asUser, asAdmin } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { mintToken } from '@/app/actions';
import { ScanBox } from '@/components/ScanBox';
import { ConfirmPrompt } from '@/components/ConfirmPrompt';

export const dynamic = 'force-dynamic';

type Pending = {
  id: string;
  expires_at: string;
  you_confirmed: boolean;
  peer_first: string;
  peer_last: string;
  peer_username: string;
};

export default async function ConnectPage() {
  const me = await currentUser();

  // Opening this screen mints a fresh code and retires the previous one, which
  // is the whole point: a screenshot of an old code is worthless.
  const token = await mintToken();
  const svg = await QRCode.toString(token.token, {
    type: 'svg',
    margin: 0,
    width: 200,
    color: { dark: '#0B0B0D', light: '#F2F1EE' },
  });

  const pending = await asUser<Pending>(
    me.user_id,
    `select
       e.id,
       e.expires_at,
       case when e.initiator_id = $1 then e.initiator_confirmed_at is not null
            else e.responder_confirmed_at is not null end as you_confirmed,
       p.first_name as peer_first,
       p.last_name  as peer_last,
       p.username   as peer_username
     from public.exchanges e
     join public.profiles p
       on p.user_id = case when e.initiator_id = $1 then e.responder_id
                           else e.initiator_id end
     where e.state = 'pending'
       and (e.initiator_id = $1 or e.responder_id = $1)
     order by e.created_at desc`,
    [me.user_id],
  );

  // The profile row is not readable across users, so the peer's name comes
  // from a superuser read here. On a phone it comes from the confirmation
  // payload. Either way it is only a name, and only for someone raising a
  // prompt on your screen.
  const named = await Promise.all(
    pending.map(async (p) => {
      const [row] = await asAdmin<{ first_name: string; last_name: string }>(
        `select first_name, last_name from public.profiles where username = $1`,
        [p.peer_username],
      );
      return { ...p, display: `${row.first_name} ${row.last_name}` };
    }),
  );

  return (
    <>
      <h1>Connect</h1>
      <p className="lede">
        Show your code, or scan theirs. Either way both of you confirm before
        anything is shared, and the code itself is useless a couple of minutes
        from now.
      </p>

      {named.length > 0 && (
        <>
          <h2>Waiting on you</h2>
          {named.map((p) => (
            <ConfirmPrompt
              key={p.id}
              exchangeId={p.id}
              peerName={p.display}
              expiresAt={p.expires_at}
              youConfirmed={p.you_confirmed}
            />
          ))}
        </>
      )}

      <h2>Your code</h2>
      <div className="card">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <p className="tiny" style={{ marginTop: 0 }}>
              Good for two minutes, and only once. Opening this screen again
              makes a new one and kills this one.
            </p>
            <p className="field-label">Paste this into the other browser</p>
            <input type="text" readOnly value={token.token} />
            <p className="tiny">
              On a phone nobody sees this string. It is here so you can walk
              through both sides of the flow yourself.
            </p>
          </div>
        </div>
      </div>

      <h2>Their code</h2>
      <ScanBox />

      <div className="banner">
        <strong>On a phone this screen also does the tap.</strong> Two iPhones
        held together range over ultra wideband, and the same code travels over
        Bluetooth instead of through a camera. The server cannot tell the
        difference, which is the point.
      </div>
    </>
  );
}
