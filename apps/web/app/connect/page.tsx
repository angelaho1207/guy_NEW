import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { ScanBox } from '@/components/ScanBox';
import { ConfirmPrompt } from '@/components/ConfirmPrompt';
import { CodePanel } from '@/components/CodePanel';
import { PendingWatcher } from '@/components/PendingWatcher';
import { toInstantValue } from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Pending = {
  id: string;
  expires_at: Date;
  you_confirmed: boolean;
  peer_name: string;
};

export default async function ConnectPage() {
  const me = await currentUser();

  // name_for() pins the viewer to the caller, so this shows what you are
  // allowed to call them and nothing more. A prompt that cannot say who it is
  // from is not a prompt, and one that leaks a withheld name is worse.
  const pending = await asUser<Pending>(
    me.user_id,
    `select
       e.id,
       e.expires_at,
       case when e.initiator_id = $1 then e.initiator_confirmed_at is not null
            else e.responder_confirmed_at is not null end as you_confirmed,
       public.exchange_peer_name(e.id) as peer_name
     from public.exchanges e
     where e.state = 'pending'
       and e.expires_at > now()
       and (e.initiator_id = $1 or e.responder_id = $1)
     order by e.created_at desc`,
    [me.user_id],
  );

  return (
    <>
      <PendingWatcher />

      <h1>Connect</h1>
      <p className="lede">
        Show your code, or scan theirs. Either way both of you confirm before
        anything is shared, and the code itself is useless a couple of minutes
        from now.
      </p>

      {pending.length > 0 && (
        <>
          <h2>Waiting on you</h2>
          {pending.map((p) => (
            <ConfirmPrompt
              key={p.id}
              exchangeId={p.id}
              peerName={p.peer_name}
              expiresAt={toInstantValue(p.expires_at)}
              youConfirmed={p.you_confirmed}
            />
          ))}
        </>
      )}

      <h2>Your code</h2>
      <CodePanel />

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
