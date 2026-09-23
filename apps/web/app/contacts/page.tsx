import Link from 'next/link';
import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { cardName, initials, type ContactCard } from '@/components/Card';

export const dynamic = 'force-dynamic';

type Row = {
  connection_id: string;
  username: string;
  card: ContactCard;
  how_we_met: string | null;
  how_we_met_on: string | null;
  want_follow_up: boolean | null;
  created_at: string;
  note_count: number;
  has_reminder: boolean;
};

export default async function ContactsPage() {
  const me = await currentUser();

  const rows = await asUser<Row>(
    me.user_id,
    `select
       cc.*,
       (select count(*)::int from public.connection_notes n
         where n.connection_id = cc.connection_id) as note_count,
       exists (select 1 from public.reminders r
                where r.connection_id = cc.connection_id
                  and r.done_at is null) as has_reminder
     from public.contact_cards cc
     order by cc.created_at desc`,
  );

  return (
    <>
      <h1>Contacts</h1>
      <p className="lede">
        Everyone you have exchanged with. What each person shows is whatever
        they are sharing right now, so it changes when they change it.
      </p>

      {rows.length === 0 ? (
        <div className="empty">
          <p>No contacts yet.</p>
          <Link className="btn btn-primary" href="/connect">
            Connect with someone
          </Link>
        </div>
      ) : (
        rows.map((r) => (
          <Link
            key={r.connection_id}
            href={`/contacts/${r.connection_id}`}
            className="card card-tight row-link"
          >
            <div className="with-avatar">
              <span className="avatar">{initials(r.card)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row-head">
                  <h3 style={{ margin: 0 }}>{cardName(r.card, r.username)}</h3>
                  <span className="tiny">{metWhen(r.how_we_met_on, r.created_at)}</span>
                </div>
                <p className="tiny" style={{ margin: '2px 0 0' }}>
                  {[r.card.school, r.card.major].filter(Boolean).join(' · ') ||
                    'No school or major shared'}
                </p>
                {r.how_we_met && (
                  <p className="tiny" style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
                    {r.how_we_met}
                  </p>
                )}
                <div className="btn-row" style={{ marginTop: 10 }}>
                  {r.want_follow_up && (
                    <span className="pill" data-tone="accent">
                      Wants follow-up
                    </span>
                  )}
                  {r.has_reminder && <span className="pill">Reminder set</span>}
                  {r.note_count > 0 && (
                    <span className="pill">
                      {r.note_count} {r.note_count === 1 ? 'note' : 'notes'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))
      )}
    </>
  );
}

function metWhen(metOn: string | null, created: string) {
  const date = new Date(metOn ?? created);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
