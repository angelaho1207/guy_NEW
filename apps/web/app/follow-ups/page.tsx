import Link from 'next/link';
import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { completeFollowUp } from '@/app/actions';
import { cardName, initials, type ContactCard } from '@/components/Card';

export const dynamic = 'force-dynamic';

type Row = {
  reminder_id: string;
  connection_id: string;
  fire_at: string;
  fired_at: string;
  card: ContactCard;
};

export default async function FollowUpsPage() {
  const me = await currentUser();

  const rows = await asUser<Row>(
    me.user_id,
    `select * from public.undone_follow_ups order by fired_at desc`,
  );

  return (
    <>
      <h1>Follow-ups</h1>
      <p className="lede">
        Reminders that have fired and are not done yet. They stay here until you
        mark them.
      </p>

      {rows.length === 0 ? (
        <div className="empty">
          <p>Nothing outstanding.</p>
          <p className="tiny">
            Reminders show up here when they fire, and the push notification
            goes out at the same moment.
          </p>
        </div>
      ) : (
        rows.map((r) => (
          <div className="card card-tight" key={r.reminder_id}>
            <div className="with-avatar">
              <span className="avatar">{initials(r.card)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-head">
                  <h3 style={{ margin: 0 }}>
                    <Link
                      href={`/contacts/${r.connection_id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      Follow up with {cardName(r.card)}
                    </Link>
                  </h3>
                  <span className="tiny">
                    fired{' '}
                    {new Date(r.fired_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <form action={completeFollowUp}>
                    <input type="hidden" name="connection_id" value={r.connection_id} />
                    <button className="btn btn-sm btn-primary">Mark done</button>
                  </form>
                  <Link className="btn btn-sm btn-quiet" href={`/contacts/${r.connection_id}`}>
                    Open contact
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}
