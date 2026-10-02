import { asUser } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ScanBox } from '@/components/ScanBox';
import { NearbyPanel } from '@/components/NearbyPanel';
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
  const me = await requireUser();

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

      {/*
        No "Connect" heading, and no "Waiting on you" heading: the nav already
        says which screen this is, and a prompt that opens with "Share with
        Marcus?" does not need a label above it. The mockups omit both, and the
        space goes to the two things that matter here.
      */}
      <p className="lede" style={{ marginTop: 20, fontSize: 14 }}>
        If you both have this screen open, you will see each other below. Both
        of you confirm before anything is shared, either way.
      </p>

      {pending.map((p) => (
        <ConfirmPrompt
          key={p.id}
          exchangeId={p.id}
          peerName={p.peer_name}
          expiresAt={toInstantValue(p.expires_at)}
          youConfirmed={p.you_confirmed}
        />
      ))}

      <NearbyPanel />

      <div className="eyebrow" style={{ marginTop: 28 }}>
        Or use a code
      </div>
      <p className="tiny" style={{ margin: '6px 0 12px' }}>
        For when location is off, or the two of you are further apart than the
        list reaches.
      </p>
      <CodePanel />

      <ScanBox />
    </>
  );
}
