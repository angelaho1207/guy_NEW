import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { Card, cardName, initials, type ContactCard } from '@/components/Card';
import { ReminderForm } from '@/components/ReminderForm';
import { toDateValue, formatDate, formatInstant } from '@/lib/dates';
import {
  addNote,
  saveContext,
  toggleHighlight,
  deleteNote,
  requestOneOnOne,
} from '@/app/actions';

export const dynamic = 'force-dynamic';

type Contact = {
  connection_id: string;
  other_id: string;
  username: string;
  card: ContactCard;
  met_via: 'qr' | 'uwb';
  how_we_met: string | null;
  how_we_met_on: Date | string | null;
  want_follow_up: boolean | null;
  follow_up_topic: string | null;
  created_at: string;
};

type Note = {
  id: string;
  body: string;
  noted_on: Date | string;
  highlighted: boolean;
};

export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireUser();

  const [contact] = await asUser<Contact>(
    me.user_id,
    `select * from public.contact_cards where connection_id = $1`,
    [id],
  );

  if (!contact) notFound();

  const notes = await asUser<Note>(
    me.user_id,
    `select id, body, noted_on, highlighted
       from public.connection_notes
      where connection_id = $1
      order by noted_on desc, created_at desc`,
    [id],
  );

  const [reminder] = await asUser<{
    days: number;
    hours: number;
    fire_at: string;
    fired_at: string | null;
    done_at: string | null;
  }>(
    me.user_id,
    `select days, hours, fire_at, fired_at, done_at
       from public.reminders where connection_id = $1`,
    [id],
  );

  const [live] = await asUser<{ id: string; status: string }>(
    me.user_id,
    `select id, status from public.visible_one_on_ones
      where connection_id = $1 or (requester_id = $2 and recipient_id = $3)
        or (requester_id = $3 and recipient_id = $2)
      order by created_at desc limit 1`,
    [id, me.user_id, contact.other_id],
  );

  const name = cardName(contact.card, contact.username);
  const openRequest =
    live && ['pending', 'approved', 'scheduled'].includes(live.status) ? live : null;

  return (
    <>
      <p className="tiny" style={{ marginTop: 20 }}>
        <Link href="/contacts" style={{ color: 'var(--text-secondary)' }}>
          ← Contacts
        </Link>
      </p>

      <div className="with-avatar" style={{ alignItems: 'center', marginTop: 12 }}>
        <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
          {initials(contact.card)}
        </span>
        <div>
          <h1 style={{ margin: 0 }}>{name}</h1>
          <p className="tiny" style={{ margin: 0 }}>
            @{contact.username} · met by {contact.met_via === 'qr' ? 'QR code' : 'tap'} on{' '}
            {contact.how_we_met_on
              ? formatDate(contact.how_we_met_on, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              : formatInstant(contact.created_at, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
          </p>
        </div>
      </div>

      <div className="btn-row" style={{ margin: '20px 0 4px' }}>
        {openRequest ? (
          <Link className="btn" href={`/one-on-ones/${openRequest.id}`}>
            1:1 · {openRequest.status}
          </Link>
        ) : (
          <form action={requestOneOnOne}>
            <input type="hidden" name="connection_id" value={id} />
            <button className="btn btn-primary">Request a 1:1</button>
          </form>
        )}
      </div>

      <h2>What they share</h2>
      <Card card={contact.card} />

      <h2>How you met</h2>
      <form action={saveContext} className="card">
        <input type="hidden" name="connection_id" value={id} />

        <label className="field">
          <span className="field-label">Where and how</span>
          <textarea
            name="how_we_met"
            defaultValue={contact.how_we_met ?? ''}
            placeholder="Career fair, by the stairs. She came over to ask about the poster."
            style={{ minHeight: 72 }}
          />
        </label>

        <label className="field">
          <span className="field-label">Date</span>
          <input
            type="date"
            name="how_we_met_on"
            defaultValue={toDateValue(contact.how_we_met_on)}
          />
        </label>

        <div className="field">
          <span className="field-label">Do you want to follow up?</span>
          <div className="btn-row">
            <label className="pill">
              <input
                type="radio"
                name="want_follow_up"
                value="yes"
                defaultChecked={contact.want_follow_up === true}
              />
              Yes
            </label>
            <label className="pill">
              <input
                type="radio"
                name="want_follow_up"
                value="no"
                defaultChecked={contact.want_follow_up === false}
              />
              No
            </label>
          </div>
        </div>

        <label className="field">
          <span className="field-label">What you would want to talk about next time</span>
          <textarea
            name="follow_up_topic"
            defaultValue={contact.follow_up_topic ?? ''}
            placeholder="Ask whether he took the offer. Offer to intro him to Dara."
            style={{ minHeight: 64 }}
          />
        </label>

        <button className="btn">Save</button>
      </form>

      <h2>Notes</h2>
      <p className="lede">
        Private to you. {name} never sees these, and they do not change unless
        you change them.
      </p>

      <form action={addNote} className="card">
        <input type="hidden" name="connection_id" value={id} />
        <label className="field">
          <span className="field-label">Add an entry</span>
          <textarea
            name="body"
            placeholder="Short bullets work well. What you talked about, anything worth remembering."
            style={{ minHeight: 80 }}
          />
        </label>
        <button className="btn">Add note</button>
      </form>

      {notes.length === 0 ? (
        <p className="muted">Nothing written down yet.</p>
      ) : (
        notes.map((n) => (
          <div className="note" key={n.id} data-highlighted={n.highlighted}>
            <div className="note-head">
              <span>
                {formatDate(n.noted_on)}
              </span>
              <form action={toggleHighlight}>
                <input type="hidden" name="note_id" value={n.id} />
                <input type="hidden" name="connection_id" value={id} />
                <button className="btn btn-quiet btn-sm">
                  {n.highlighted ? 'Unhighlight' : 'Highlight'}
                </button>
              </form>
              <form action={deleteNote}>
                <input type="hidden" name="note_id" value={n.id} />
                <input type="hidden" name="connection_id" value={id} />
                <button className="btn btn-quiet btn-sm btn-danger">Delete</button>
              </form>
            </div>
            <p>{n.body}</p>
          </div>
        ))
      )}

      <h2>Reminder</h2>
      <ReminderForm connectionId={id} existing={reminder ?? null} />
    </>
  );
}
