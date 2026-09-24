'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import QRCode from 'qrcode';
import { asUser } from '@/lib/db';
import { requireUser, currentUser, SESSION_COOKIE } from '@/lib/session';
import { PROFILE_FIELDS } from '@guy/shared';
import { toInstantValue } from '@/lib/dates';

/**
 * Every mutation the web app can make.
 *
 * Note what is not here: nothing writes to `connections`, `exchanges` or
 * `one_on_one_requests` directly. Those all go through the SECURITY DEFINER
 * functions, which is the rule the schema is built around. What is left is
 * a user editing their own rows, which RLS already scopes to them.
 */

/** Database errors carry useful text. Surface it rather than a 500 page. */
function message(err: unknown): string {
  const raw = String((err as Error)?.message ?? err);
  return raw.replace(/^error: /i, '');
}

export async function switchUser(formData: FormData) {
  const id = String(formData.get('user_id') ?? '');
  const store = await cookies();
  store.set(SESSION_COOKIE, id, { path: '/', maxAge: 60 * 60 * 24 * 30 });
  revalidatePath('/', 'layout');
}

// --- Profile ---------------------------------------------------------------

export async function saveProfile(_prev: unknown, formData: FormData) {
  const me = await requireUser();

  const columns = PROFILE_FIELDS.map((f) => f.key);
  const values = columns.map((key) => {
    const raw = formData.get(key);
    const text = typeof raw === 'string' ? raw.trim() : '';
    return text === '' ? null : text;
  });

  // first_name and last_name are required, so an empty submission is refused
  // here as well as by the database.
  const first = values[columns.indexOf('first_name')];
  const last = values[columns.indexOf('last_name')];
  if (!first || !last) {
    return { error: 'First name and last name are required.' };
  }

  const assignments = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');

  try {
    await asUser(
      me.user_id,
      `update public.profiles
          set ${assignments},
              updated_at = now()`,
      values,
    );
  } catch (err) {
    return { error: message(err) };
  }

  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/**
 * Takes plain arguments rather than FormData, because its button lives inside
 * the profile form and a nested <form> is invalid HTML: the browser drops the
 * inner one, so the toggle would submit the whole profile instead.
 */
export async function toggleShare(field: string, on: boolean) {
  const me = await requireUser();

  await asUser(
    me.user_id,
    `update public.profile_field_shares
        set shareable = $1, updated_at = now()
      where field = $2::public.profile_field`,
    [on, field],
  );

  revalidatePath('/', 'layout');
}

// --- Connection notes and context -----------------------------------------

export async function saveContext(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('connection_id'));
  const how = String(formData.get('how_we_met') ?? '').trim() || null;
  const on = String(formData.get('how_we_met_on') ?? '').trim() || null;
  const wants = formData.get('want_follow_up');
  const topic = String(formData.get('follow_up_topic') ?? '').trim() || null;

  const wantFollowUp = wants === null ? null : wants === 'yes';

  await asUser(
    me.user_id,
    `update public.connections
        set how_we_met = $1,
            how_we_met_on = $2::date,
            want_follow_up = $3,
            follow_up_topic = case when $3 is true then $4 else null end,
            updated_at = now()
      where id = $5`,
    [how, on, wantFollowUp, topic, id],
  );

  revalidatePath(`/contacts/${id}`);
}

export async function addNote(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('connection_id'));
  const body = String(formData.get('body') ?? '').trim();
  if (body === '') return;

  await asUser(
    me.user_id,
    `insert into public.connection_notes (connection_id, body) values ($1, $2)`,
    [id, body],
  );

  revalidatePath(`/contacts/${id}`);
}

export async function toggleHighlight(formData: FormData) {
  const me = await requireUser();
  const noteId = String(formData.get('note_id'));
  const connectionId = String(formData.get('connection_id'));

  await asUser(
    me.user_id,
    `update public.connection_notes
        set highlighted = not highlighted, updated_at = now()
      where id = $1`,
    [noteId],
  );

  revalidatePath(`/contacts/${connectionId}`);
}

export async function deleteNote(formData: FormData) {
  const me = await requireUser();
  const noteId = String(formData.get('note_id'));
  const connectionId = String(formData.get('connection_id'));

  await asUser(me.user_id, `delete from public.connection_notes where id = $1`, [
    noteId,
  ]);

  revalidatePath(`/contacts/${connectionId}`);
}

// --- Reminders -------------------------------------------------------------

export async function setReminder(_prev: unknown, formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('connection_id'));
  const days = Number(formData.get('days') ?? 0);
  const hours = Number(formData.get('hours') ?? 0);

  try {
    await asUser(me.user_id, `select public.set_reminder($1, $2, $3)`, [
      id,
      days,
      hours,
    ]);
  } catch (err) {
    return { error: message(err) };
  }

  revalidatePath(`/contacts/${id}`);
  revalidatePath('/follow-ups');
  return { ok: true as const };
}

export async function clearReminder(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('connection_id'));

  await asUser(me.user_id, `delete from public.reminders where connection_id = $1`, [
    id,
  ]);

  revalidatePath(`/contacts/${id}`);
  revalidatePath('/follow-ups');
}

export async function completeFollowUp(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('connection_id'));

  await asUser(me.user_id, `select public.complete_follow_up($1)`, [id]);

  revalidatePath('/follow-ups');
  revalidatePath(`/contacts/${id}`);
}

// --- 1:1 -------------------------------------------------------------------

/**
 * Sends the request and goes straight to the thread.
 *
 * No error object comes back, because this is used as a plain form action and
 * those must return nothing. The realistic failure is the unique index that
 * allows only one live request per pair, and the button is hidden when one
 * already exists, so reaching it means something is genuinely wrong and an
 * error boundary is the honest response.
 */
export async function requestOneOnOne(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('connection_id'));

  const rows = await asUser<{ id: string }>(
    me.user_id,
    `select * from public.request_one_on_one($1)`,
    [id],
  );

  revalidatePath('/one-on-ones');
  revalidatePath(`/contacts/${id}`);

  // redirect() signals by throwing, so it stays outside any try/catch.
  redirect(`/one-on-ones/${rows[0].id}`);
}

export async function respondOneOnOne(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('request_id'));
  const approve = String(formData.get('approve')) === 'true';

  await asUser(me.user_id, `select public.respond_one_on_one($1, $2)`, [id, approve]);

  revalidatePath('/one-on-ones');
}

export async function sendMessage(_prev: unknown, formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('request_id'));
  const body = String(formData.get('body') ?? '').trim();
  const proposed = String(formData.get('proposed_for') ?? '').trim();

  if (body === '' && proposed === '') {
    return { error: 'Write something, or propose a time.' };
  }

  try {
    await asUser(
      me.user_id,
      `insert into public.one_on_one_messages (request_id, sender_id, body, proposed_for)
       values ($1, $2, $3, $4::timestamptz)`,
      [id, me.user_id, body || null, proposed || null],
    );
  } catch (err) {
    return { error: message(err) };
  }

  revalidatePath(`/one-on-ones/${id}`);
  return { ok: true as const };
}

export async function acceptTime(_prev: unknown, formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('request_id'));
  const when = String(formData.get('when'));

  try {
    await asUser(me.user_id, `select public.schedule_one_on_one($1, $2::timestamptz)`, [
      id,
      when,
    ]);
  } catch (err) {
    return { error: message(err) };
  }

  revalidatePath(`/one-on-ones/${id}`);
  revalidatePath('/one-on-ones');
  return { ok: true as const };
}

// --- Connect ---------------------------------------------------------------

/**
 * Mints a fresh connect token and renders it as a QR code.
 *
 * Called by the code panel on mount and again before the token expires, not by
 * the page on every render. That distinction matters: minting retires the
 * previous token, so a page that minted while rendering would invalidate the
 * code on screen every time anything else caused a re-render.
 */
export async function mintToken() {
  const me = await requireUser();
  const rows = await asUser<{ token: string; expires_at: Date }>(
    me.user_id,
    `select * from public.mint_connect_token(120)`,
  );
  const { token, expires_at } = rows[0];

  const svg = await QRCode.toString(token, {
    type: 'svg',
    margin: 0,
    width: 200,
    color: { dark: '#0B0B0D', light: '#F2F1EE' },
  });

  return { token, expiresAt: toInstantValue(expires_at), svg };
}

/**
 * Stands in for the other phone scanning your code.
 *
 * On a real device the scanner reads the token from the camera. Here you paste
 * it, or pick a person, so the whole two-sided flow can be walked through in
 * one browser.
 */
export async function redeemToken(_prev: unknown, formData: FormData) {
  const me = await requireUser();
  const token = String(formData.get('token') ?? '').trim();

  if (token === '') return { error: 'Paste a code first.' };

  try {
    const rows = await asUser<{ status: string; exchange_id: string | null }>(
      me.user_id,
      `select * from public.open_exchange($1, 'qr')`,
      [token],
    );
    const { status, exchange_id } = rows[0];

    // The confirmation prompt is rendered by the page from its own query, so
    // it only appears once the page is told to render again.
    revalidatePath('/connect');

    if (status === 'already_connected') {
      return { alreadyConnected: true as const };
    }
    return { exchangeId: exchange_id! };
  } catch (err) {
    return { error: message(err) };
  }
}

/**
 * The cheap half of watching for a confirmation prompt.
 *
 * Re-rendering the whole connect page every two seconds to find out whether
 * anything arrived cost five database calls a go, per phone, forever. This is
 * one query, and the page is only re-rendered when the answer changes.
 *
 * Returns null rather than an empty string when something went wrong, so a
 * blip reads as "no news" instead of as "the exchange disappeared".
 */
export async function pendingExchangeSignature(): Promise<string | null> {
  const me = await currentUser();
  if (!me) return null;

  try {
    const rows = await asUser<{ sig: string | null }>(
      me.user_id,
      `select string_agg(e.id::text, ',' order by e.id) as sig
         from public.exchanges e
        where e.state = 'pending'
          and e.expires_at > now()
          and (e.initiator_id = $1 or e.responder_id = $1)`,
      [me.user_id],
    );
    return rows[0]?.sig ?? '';
  } catch {
    return null;
  }
}

// --- Nearby presence -------------------------------------------------------

/**
 * One row of the nearby list. Everything here is what `nearby_people()`
 * decided to return, which is a name and a rough distance and nothing else.
 * Nothing about someone's profile crosses until both people confirm.
 */
export type NearbyPerson = {
  user_id: string;
  display_name: string;
  metres: number | null;
  same_network: boolean;
  already_connected: boolean;
};

/**
 * Says "I still have the connect screen open", and asks who else does.
 *
 * Both halves in one round trip, because they always happen together: the
 * list is only returned to someone who is themselves present, which is what
 * stops presence being a directory you can browse invisibly.
 *
 * `network_hint` is deliberately not sent yet. Two phones at the same party
 * are usually on cellular rather than a shared wifi, so it would rarely help,
 * and carrier-grade NAT puts strangers across a whole city behind one address,
 * so it would sometimes hurt. Location alone is the honest version.
 */
export async function heartbeatPresence(
  pos: { lat: number; lng: number; accuracy: number | null } | null,
): Promise<{ people: NearbyPerson[] } | { error: string }> {
  const me = await requireUser();

  try {
    await asUser(
      me.user_id,
      `select public.start_presence(
         $1::double precision, $2::double precision, $3::double precision, null)`,
      [pos?.lat ?? null, pos?.lng ?? null, pos?.accuracy ?? null],
    );

    const people = await asUser<NearbyPerson>(
      me.user_id,
      `select * from public.nearby_people()`,
    );

    return { people };
  } catch (err) {
    return { error: message(err) };
  }
}

/**
 * Leaving the screen. Uses currentUser rather than requireUser because this
 * runs while the page is going away, and a redirect at that moment is noise.
 *
 * Best effort by design: a phone that loses signal never gets here, which is
 * why rows also expire on their own after 45 seconds and a cron job sweeps
 * them. This just makes the common case instant.
 */
export async function leavePresence() {
  const me = await currentUser();
  if (!me) return;
  try {
    await asUser(me.user_id, `select public.end_presence()`);
  } catch {
    // Nothing useful to say to a page that is already unmounting.
  }
}

/**
 * Tapping someone on the list.
 *
 * This is the one connect path that names an account, and D11 says that is a
 * bug everywhere else. It is safe here only because the server re-derives the
 * list: `open_nearby_exchange` refuses anyone who is not currently nearby and
 * present, so naming an id gets a caller no further than their own screen
 * already showed them.
 */
export type ConnectNearbyResult =
  | { alreadyConnected: true }
  | { exchangeId: string }
  | { error: string };

export async function connectNearby(targetId: string): Promise<ConnectNearbyResult> {
  const me = await requireUser();

  try {
    const rows = await asUser<{ status: string; exchange_id: string | null }>(
      me.user_id,
      `select * from public.open_nearby_exchange($1)`,
      [targetId],
    );

    revalidatePath('/connect');

    if (rows[0].status === 'already_connected') {
      return { alreadyConnected: true as const };
    }
    return { exchangeId: rows[0].exchange_id! };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function confirmExchange(_prev: unknown, formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('exchange_id'));

  try {
    const rows = await asUser<{ confirm_exchange: string }>(
      me.user_id,
      `select public.confirm_exchange($1)`,
      [id],
    );
    revalidatePath('/contacts');
    revalidatePath('/connect');
    return { state: rows[0].confirm_exchange };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function declineExchange(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get('exchange_id'));
  await asUser(me.user_id, `select public.decline_exchange($1)`, [id]);
  revalidatePath('/connect');
}
