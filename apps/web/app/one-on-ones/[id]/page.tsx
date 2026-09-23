import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { Scheduler } from '@/components/Scheduler';
import { respondOneOnOne } from '@/app/actions';
import type { OneOnOneStatus } from '@guy/shared';

export const dynamic = 'force-dynamic';

type Request = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: OneOnOneStatus;
  approved_at: string | null;
  scheduled_for: string | null;
  peer_name: string;
};

export default async function OneOnOnePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await currentUser();

  const [req] = await asUser<Request>(
    me.user_id,
    `select v.*,
            public.name_for(
              case when v.requester_id = $2 then v.recipient_id else v.requester_id end
            ) as peer_name
       from public.visible_one_on_ones v
      where v.id = $1`,
    [id, me.user_id],
  );

  if (!req) notFound();

  const messages = await asUser<{
    id: string;
    sender_id: string;
    body: string | null;
    proposed_for: string | null;
    created_at: string;
  }>(
    me.user_id,
    `select id, sender_id, body, proposed_for, created_at
       from public.one_on_one_messages
      where request_id = $1
      order by created_at`,
    [id],
  );

  const iAmRecipient = req.recipient_id === me.user_id;

  return (
    <>
      <p className="tiny" style={{ marginTop: 20 }}>
        <Link href="/one-on-ones" style={{ color: 'var(--text-secondary)' }}>
          ← 1:1s
        </Link>
      </p>

      <div className="row-head" style={{ marginTop: 12 }}>
        <h1 style={{ margin: 0 }}>{req.peer_name}</h1>
        <span className="pill" data-tone={req.status === 'scheduled' ? 'accent' : undefined}>
          {req.status}
        </span>
      </div>

      {req.status === 'pending' && iAmRecipient && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>{req.peer_name} asked to meet</h3>
          <div className="btn-row">
            <form action={respondOneOnOne}>
              <input type="hidden" name="request_id" value={req.id} />
              <input type="hidden" name="approve" value="true" />
              <button className="btn btn-primary">Approve</button>
            </form>
            <form action={respondOneOnOne}>
              <input type="hidden" name="request_id" value={req.id} />
              <input type="hidden" name="approve" value="false" />
              <button className="btn btn-quiet">Decline</button>
            </form>
          </div>
        </div>
      )}

      {req.status === 'pending' && !iAmRecipient && (
        <p className="lede">Waiting for them to approve.</p>
      )}

      <Scheduler
        requestId={req.id}
        meId={me.user_id}
        peerName={req.peer_name}
        status={req.status}
        approvedAt={req.approved_at}
        scheduledFor={req.scheduled_for}
        messages={messages}
      />
    </>
  );
}
