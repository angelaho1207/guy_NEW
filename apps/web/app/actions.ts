'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { asUser } from '@/lib/db';
import { currentUser, SESSION_COOKIE } from '@/lib/session';
import { PROFILE_FIELDS } from '@guy/shared';

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
  const me = await currentUser();

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

  const discordId = String(formData.get('discord_id') ?? '').trim() || null;

  const assignments = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');

  try {
    await asUser(
      me.user_id,
      `update public.profiles
          set ${assignments},
              discord_id = $${columns.length + 1},
              updated_at = now()`,
      [...values, discordId],
    );
  } catch (err) {
    return { error: message(err) };
  }

  revalidatePath('/', 'layout');
  return { ok: true as const };
}

export async function toggleShare(formData: FormData) {
  const me = await currentUser();
  const field = String(formData.get('field') ?? '');
  const on = String(formData.get('on') ?? '') === 'true';

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
  const me = await currentUser();
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
  const me = await currentUser();
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
  const me = await currentUser();
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
  const me = await currentUser();
  const noteId = String(formData.get('note_id'));
  const connectionId = String(formData.get('connection_id'));

  await asUser(me.user_id, `delete from public.connection_notes where id = $1`, [
    noteId,
  ]);

  revalidatePath(`/contacts/${connectionId}`);
}

// --- Reminders -------------------------------------------------------------

export async function setReminder(_prev: unknown, formData: FormData) {
  const me = await currentUser();
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
  const me = await currentUser();
  const id = String(formData.get('connection_id'));

  await asUser(me.user_id, `delete from public.reminders where connection_id = $1`, [
    id,
  ]);

  revalidatePath(`/contacts/${id}`);
  revalidatePath('/follow-ups');
}

export async function completeFollowUp(formData: FormData) {
  const me = await currentUser();
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
  const me = await currentUser();
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
  const me = await currentUser();
  const id = String(formData.get('request_id'));
  const approve = String(formData.get('approve')) === 'true';

  await asUser(me.user_id, `select public.respond_one_on_one($1, $2)`, [id, approve]);

  revalidatePath('/one-on-ones');
}

export async function sendMessage(_prev: unknown, formData: FormData) {
  const me = await currentUser();
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
  const me = await currentUser();
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

/** Mints a fresh connect token, exactly as opening the code screen would. */
export async function mintToken() {
  const me = await currentUser();
  const rows = await asUser<{ token: string; expires_at: string }>(
    me.user_id,
    `select * from public.mint_connect_token(120)`,
  );
  return rows[0];
}

/**
 * Stands in for the other phone scanning your code.
 *
 * On a real device the scanner reads the token from the camera. Here you paste
 * it, or pick a person, so the whole two-sided flow can be walked through in
 * one browser.
 */
export async function redeemToken(_prev: unknown, formData: FormData) {
  const me = await currentUser();
  const token = String(formData.get('token') ?? '').trim();

  if (token === '') return { error: 'Paste a code first.' };

  try {
    const rows = await asUser<{ status: string; exchange_id: string | null }>(
      me.user_id,
      `select * from public.open_exchange($1, 'qr')`,
      [token],
    );
    const { status, exchange_id } = rows[0];

    if (status === 'already_connected') {
      return { alreadyConnected: true as const };
    }
    return { exchangeId: exchange_id! };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function confirmExchange(_prev: unknown, formData: FormData) {
  const me = await currentUser();
  const id = String(formData.get('exchange_id'));

  try {
    const rows = await asUser<{ confirm_exchange: string }>(
      me.user_id,
      `select public.confirm_exchange($1)`,
      [id],
    );
    revalidatePath('/contacts');
    return { state: rows[0].confirm_exchange };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function declineExchange(formData: FormData) {
  const me = await currentUser();
  const id = String(formData.get('exchange_id'));
  await asUser(me.user_id, `select public.decline_exchange($1)`, [id]);
}
