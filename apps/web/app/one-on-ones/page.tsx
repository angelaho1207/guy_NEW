import Link from 'next/link';
import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { respondOneOnOne } from '@/app/actions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
  created_at: string;
  scheduled_for: string | null;
  expires_at: string | null;
  peer_name: string;
};

export default async function OneOnOnesPage() {
  const me = await currentUser();

  const rows = await asUser<Row>(
    me.user_id,
    `select v.*,
            public.name_for(
              case when v.requester_id = $1 then v.recipient_id else v.requester_id end
            ) as peer_name
       from public.visible_one_on_ones v
      order by v.created_at desc`,
    [me.user_id],
  );

  const incoming = rows.filter(
    (r) => r.status === 'pending' && r.recipient_id === me.user_id,
  );
  const rest = rows.filter((r) => !incoming.includes(r));

  return (
    <>
      <h1>1:1s</h1>
      <p className="lede">
        Ask someone for a one to one. If they say yes, you have three days to
        agree on a time, and the meeting itself can be up to two weeks out.
      </p>

      {incoming.length > 0 && (
        <>
          <h2>Waiting on you</h2>
          {incoming.map((r) => (
            <div className="card" key={r.id}>
              <h3 style={{ margin: 0 }}>{r.peer_name} asked to meet</h3>
              <p className="tiny">
                {new Date(r.created_at).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <div className="btn-row">
                <form action={respondOneOnOne}>
                  <input type="hidden" name="request_id" value={r.id} />
                  <input type="hidden" name="approve" value="true" />
                  <button className="btn btn-primary">Approve</button>
                </form>
                <form action={respondOneOnOne}>
                  <input type="hidden" name="request_id" value={r.id} />
                  <input type="hidden" name="approve" value="false" />
                  <button className="btn btn-quiet">Decline</button>
                </form>
              </div>
              <p className="tiny" style={{ marginBottom: 0 }}>
                Declining sends them nothing. It just disappears for both of you.
              </p>
            </div>
          ))}
        </>
      )}

      <h2>All requests</h2>
      {rest.length === 0 ? (
        <div className="empty">
          <p>Nothing here yet.</p>
          <p className="tiny">Open a contact and ask them for a 1:1.</p>
        </div>
      ) : (
        rest.map((r) => (
          <Link className="card card-tight row-link" href={`/one-on-ones/${r.id}`} key={r.id}>
            <div className="row-head">
              <h3 style={{ margin: 0 }}>{r.peer_name}</h3>
              <span className="pill" data-tone={r.status === 'scheduled' ? 'accent' : undefined}>
                {r.status}
              </span>
            </div>
            <p className="tiny" style={{ margin: '4px 0 0' }}>
              {r.requester_id === me.user_id ? 'You asked' : 'They asked'}
              {r.scheduled_for &&
                ` · ${new Date(r.scheduled_for).toLocaleString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}`}
            </p>
          </Link>
        ))
      )}
    </>
  );
}
