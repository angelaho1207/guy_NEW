import 'server-only';
import type { PGlite } from '@electric-sql/pglite';

/**
 * Demo data for the dev database.
 *
 * Everything here goes through the real functions rather than inserting rows
 * directly: connections are made by minting a token, opening an exchange and
 * confirming from both sides, exactly as two phones would. That means the seed
 * exercises the flow, and a bug in it is a bug you want to find.
 *
 * The cast is deliberately uneven. Some people share everything, some withhold
 * a field, some left a field blank. That is what makes it possible to see the
 * difference between "they didn't fill this in", which shows as "-", and "they
 * didn't share this", which does not show at all.
 */

type Sql = (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>;

export async function seed(pg: PGlite) {
  const admin: Sql = async (sql, params = []) => {
    await pg.exec(`reset role`);
    await pg.query(`select set_config('guy.test_uid', '', false)`);
    return (await pg.query(sql, params)).rows as Record<string, any>[];
  };

  const as = async (uid: string, sql: string, params: unknown[] = []) => {
    await pg.exec(`reset role`);
    await pg.query(`select set_config('guy.test_uid', $1, false)`, [uid]);
    await pg.exec(`set role authenticated`);
    try {
      return (await pg.query(sql, params)).rows as Record<string, any>[];
    } finally {
      await pg.exec(`reset role`);
    }
  };

  const signUp = async (username: string, first: string, last: string) => {
    const rows = await admin(
      `insert into auth.users (raw_user_meta_data)
       values (jsonb_build_object('username', $1::text, 'first_name', $2::text, 'last_name', $3::text))
       returning id`,
      [username, first, last],
    );
    return rows[0].id as string;
  };

  /** Two people meet: mint, scan, both confirm. The real path. */
  const connect = async (a: string, b: string) => {
    const minted = await as(a, `select * from public.mint_connect_token(120)`);
    const opened = await as(b, `select * from public.open_exchange($1, 'qr')`, [
      minted[0].token,
    ]);
    const id = opened[0].exchange_id as string;
    await as(b, `select public.confirm_exchange($1)`, [id]);
    await as(a, `select public.confirm_exchange($1)`, [id]);
  };

  const connectionOf = async (owner: string, other: string) => {
    const rows = await admin(
      `select id from public.connections where owner_id = $1 and other_id = $2`,
      [owner, other],
    );
    return rows[0].id as string;
  };

  // --- The cast ------------------------------------------------------------

  const angela = await signUp('angela', 'Angela', 'Ho');
  const marcus = await signUp('marcusw', 'Marcus', 'Webb');
  const priya = await signUp('priya.r', 'Priya', 'Raghunathan');
  const tobias = await signUp('tbg', 'Tobias', 'Grant');
  const noor = await signUp('noorh', 'Noor', 'Haddad');

  await as(
    angela,
    `update public.profiles set
       school = 'Brown University',
       societies = 'Debate Union, Brown Daily Herald',
       major = 'Computer Science',
       class_year = '2027',
       affiliations = 'Coca-Cola Scholar',
       hometown = 'Cupertino, CA',
       currently_into = 'compiler design\ncold water swimming\nthe Tokyo subway map',
       want_to_learn = 'how ad auctions actually clear\nPortuguese\nbookbinding',
       figuring_out = 'whether to do a PhD or go build something',
       linkedin = 'angela-ho',
       x = 'angelaho',
       instagram = 'angela.ho',
       whatsapp = '+16505550142',
       messenger = 'angela.ho',
       discord = 'angelaho',
       phone = '+16505550142',
       work_email = 'angela@guyapp.dev',
       personal_email = 'angela.ho@example.com'`,
  );

  // Marcus shares everything. The full card.
  await as(
    marcus,
    `update public.profiles set
       school = 'Brown University',
       societies = 'Entrepreneurship Program, rugby',
       major = 'Applied Math and Economics',
       class_year = '2026',
       affiliations = 'Thiel Fellowship finalist',
       hometown = 'Manchester, UK',
       currently_into = 'market microstructure\nlong distance running\nbread',
       want_to_learn = 'distributed systems, properly this time\nhow to sail',
       figuring_out = 'whether to take the quant offer or defer a year',
       linkedin = 'marcus-webb',
       x = 'marcuswebb',
       instagram = 'marcus.webb',
       whatsapp = '+447700900142',
       messenger = 'marcus.webb',
       discord = 'mwebb',
       phone = '+447700900142',
       work_email = 'marcus@example.com',
       personal_email = 'm.webb@example.com'`,
  );

  // Priya withholds the personal channels. Professional contact only.
  await as(
    priya,
    `update public.profiles set
       school = 'MIT',
       societies = 'Media Lab, MIT Symphony',
       major = 'Media Arts and Sciences',
       class_year = 'Grad, 2nd year',
       affiliations = 'Knight-Hennessy Scholar',
       currently_into = 'tangible interfaces\nsynth repair',
       want_to_learn = 'control theory\nhow museums actually get funded',
       figuring_out = 'what to do after the masters',
       linkedin = 'priya-raghunathan',
       x = 'priyabuilds',
       instagram = 'priya.builds',
       discord = 'priyar',
       phone = '+16175550183',
       work_email = 'priya@media.mit.example',
       personal_email = 'priya.personal@example.com'`,
  );
  await as(
    priya,
    `update public.profile_field_shares set shareable = false
      where field in
        ('phone', 'whatsapp', 'personal_email', 'instagram', 'hometown')`,
  );

  // Tobias filled almost nothing in, but shares all of it. The "-" case.
  await as(
    tobias,
    `update public.profiles set
       school = 'Georgia Tech',
       major = 'Mechanical Engineering',
       class_year = '2028',
       currently_into = 'FSAE',
       linkedin = 'tobias-grant'`,
  );

  // Noor is a recent connection with nothing written down yet.
  await as(
    noor,
    `update public.profiles set
       school = 'Columbia',
       societies = 'Columbia Political Review',
       major = 'History',
       class_year = '2027',
       hometown = 'Amman, Jordan',
       currently_into = 'archival research\nfilm photography',
       want_to_learn = 'statistics, enough to argue with it',
       figuring_out = 'law school, or not',
       linkedin = 'noor-haddad',
       instagram = 'noor.shoots',
       personal_email = 'noor@example.com'`,
  );

  // --- Who has met whom ----------------------------------------------------

  await connect(angela, marcus);
  await connect(angela, priya);
  await connect(angela, tobias);
  await connect(angela, noor);
  await connect(marcus, priya);

  // --- Angela's private side of each connection ----------------------------

  const cMarcus = await connectionOf(angela, marcus);
  const cPriya = await connectionOf(angela, priya);
  const cTobias = await connectionOf(angela, tobias);
  const cNoor = await connectionOf(angela, noor);

  await as(
    angela,
    `update public.connections set
       how_we_met = 'Career fair, by the stairs. He came over to ask about the compiler project on my poster.',
       how_we_met_on = current_date - 18,
       want_follow_up = true,
       follow_up_topic = 'Ask whether he took the quant offer. Offer to intro him to Dara.'
     where id = $1`,
    [cMarcus],
  );

  await as(
    angela,
    `update public.connections set
       how_we_met = 'Sat next to each other at the HCI workshop in Boston.',
       how_we_met_on = current_date - 41,
       want_follow_up = true,
       follow_up_topic = 'She offered to show me around the Media Lab. Take her up on it before finals.'
     where id = $1`,
    [cPriya],
  );

  await as(
    angela,
    `update public.connections set
       how_we_met = 'Formula SAE pit, Michigan.',
       how_we_met_on = current_date - 5,
       want_follow_up = false
     where id = $1`,
    [cTobias],
  );

  await as(
    angela,
    `update public.connections set
       how_we_met = 'Fellowship dinner, seated at the same table.',
       how_we_met_on = current_date - 1
     where id = $1`,
    [cNoor],
  );

  const note = (conn: string, daysAgo: number, body: string, highlighted = false) =>
    as(
      angela,
      `insert into public.connection_notes (connection_id, body, noted_on, highlighted)
       values ($1, $2, current_date - $3::int, $4)`,
      [conn, body, daysAgo, highlighted],
    );

  await note(
    cMarcus,
    18,
    'Spent twenty minutes on why register allocation is the interesting part. Knows more about it than he lets on.',
  );
  await note(
    cMarcus,
    18,
    'Deciding between a quant desk in London and deferring a year to build something. Genuinely torn, not humblebragging.',
    true,
  );
  await note(cMarcus, 9, 'Ran into him at the library. Still deciding. Said the deadline is end of month.');

  await note(
    cPriya,
    41,
    'Her thesis is on tangible interfaces for archival material. The demo with the pressure-sensitive paper was the best thing at the workshop.',
    true,
  );
  await note(cPriya, 41, 'Repairs old synths as a hobby. Has a Juno-60 she rebuilt.');
  await note(cPriya, 12, 'Emailed about the Media Lab visit. Have not replied yet.');

  await note(cTobias, 5, 'Suspension team lead. Very deep on damper tuning, not much else yet.');

  // --- Reminders -----------------------------------------------------------

  // One already fired and waiting to be marked done.
  await as(angela, `select public.set_reminder($1, 2, 0)`, [cPriya]);
  await admin(
    `update public.reminders set fire_at = now() - interval '6 hours'
      where connection_id = $1`,
    [cPriya],
  );
  await admin(`select public.fire_due_reminders()`);

  // One still counting down.
  await as(angela, `select public.set_reminder($1, 3, 4)`, [cMarcus]);

  // --- 1:1 requests --------------------------------------------------------

  // Noor asked Angela, and is waiting on her.
  const noorConn = await connectionOf(noor, angela);
  await as(noor, `select public.request_one_on_one($1)`, [noorConn]);

  // Angela asked Marcus, he approved, and they are picking a time.
  await as(angela, `select public.request_one_on_one($1)`, [cMarcus]);
  const req = await admin(
    `select id from public.one_on_one_requests
      where requester_id = $1 and recipient_id = $2`,
    [angela, marcus],
  );
  const reqId = req[0].id as string;
  await as(marcus, `select public.respond_one_on_one($1, true)`, [reqId]);

  const say = (
    who: string,
    body: string,
    minutesAgo: number,
    proposedInDays?: number,
  ) =>
    admin(
      `insert into public.one_on_one_messages
         (request_id, sender_id, body, proposed_for, created_at)
       values (
         $1, $2, $3,
         case when $4::int is null then null
              else date_trunc('hour', now() + make_interval(days => $4::int)) end,
         now() - make_interval(mins => $5::int)
       )`,
      [reqId, who, body, proposedInDays ?? null, minutesAgo],
    );

  await say(marcus, 'Yes, happy to. Coffee rather than a call?', 220);
  await say(angela, 'Coffee works. Blue State on Thayer?', 180);
  await say(marcus, 'Perfect. Thursday afternoon any good?', 120);
  await say(angela, 'Thursday works. Shall we say 3pm?', 30, 4);

  await pg.exec(`reset role`);
}
