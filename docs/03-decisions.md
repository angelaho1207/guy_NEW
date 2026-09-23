# Decisions

Choices that were not spelled out in the brief, with the reasoning, so they can
be overturned on purpose rather than discovered by accident.

---

## D1 — The database is the consent boundary, not the application code

`profiles` is readable only by the person it describes. No other user holds a
`SELECT` grant on someone else's row, at any time, for any reason. The only
path from one user to another user's data is
`public.project_shared_profile()`, a `SECURITY DEFINER` function that takes the
field set frozen into the connection and returns nothing outside it.

The alternative is the usual one: let the API read profiles freely and filter
in Node before responding. That works right up until one endpoint forgets, and
the failure mode is silent over-sharing, which is the exact failure this app
cannot have. Putting it in the database means a forgetful endpoint gets an
empty result instead of someone's phone number.

The cost is that the projection logic lives in SQL, which is less pleasant to
read than TypeScript, and that the tests need a real Postgres. Both were worth
paying. See D6 for how the tests got a real Postgres.

Same reasoning drives the narrow grants at the bottom of
`0002_rls_and_functions.sql`. `authenticated` cannot insert a connection, write
an exchange, or touch `one_on_one_requests.status`. Every transition involving
two people's consent goes through a function.

Several of those grants are **column level**, which is the part most easily
missed. A row policy answers "is this your row". It does not answer "may you
change this particular column of your own row", and four columns here belong to
the system even though they sit on a row the user owns:
`connections.shared_fields`, `connections.other_id`, `reminders.fire_at` and
`profiles.username`. See D6 for what happened when they were granted broadly.

---

## D2 — Supabase Auth holds the passwords, with a synthetic email

The brief specifies custom username and password for v1, with email and phone
login deferred. Supabase Auth wants an email address.

**Chosen:** keep Supabase Auth as the password store and map a username to a
synthetic address, `username@users.guy.invalid`, with email confirmation turned
off. `.invalid` is reserved by RFC 2606 and can never be a real domain, so the
address cannot collide with anyone's mailbox. The username itself lives in
`profiles.username` as a case-insensitive unique `citext`, and a trigger on
`auth.users` creates the profile from signup metadata.

**Rejected:** a hand-rolled users table with our own password hashing and
session handling. It would have been more faithful to "custom username and
password", and it would have meant writing password storage, session rotation
and rate limiting ourselves for an app whose whole premise is trust. Supabase's
`auth.uid()` is also what every RLS policy in D1 keys on; replacing it would
mean reimplementing the enforcement layer too.

The practical consequence is that adding real email login later is a migration
of the stored address, not a rewrite. That fits the brief's "deferred to a
later version" framing.

**Requires:** email confirmation disabled in the Supabase Auth settings. Signup
will fail confusingly otherwise. See `docs/04-setup.md`.

---

## D3 — A connection freezes which fields, not what is in them

`connections.shared_fields` is a frozen array of field keys. The values behind
those keys are read live from the other person's profile at query time.

This is the brief read literally: "a copy of whichever of the other person's
fields were shareable at the moment of the exchange", which "live-updates" when
they edit their profile.

It has a consequence I do not think the brief intends, which is **Q1** in
`01-open-questions.md` and the thing I would most like answered. In short:
turning a shareable toggle off does nothing to connections that already exist.
I implemented the literal reading, but I recommend the other one.

The switch is deliberately one place. `project_shared_profile()` would
intersect its `p_fields` argument with a lookup against
`profile_field_shares`, and nothing else changes.

---

## D4 — pg_cron rather than a Vercel Cron Job

The brief offers both. Reminders and the two 1:1 windows need something to fire
at a wall-clock time with nobody's app open, and the brief is right that
without it none of them work.

**Chosen:** `pg_cron` with plain SQL functions, in `0003_scheduled_jobs.sql`.

- The work is entirely database work. Finding due reminders and expiring stale
  requests are both a single statement; routing them through an HTTP endpoint
  adds a network hop, an auth story for that endpoint, and a second place to
  look when a reminder does not arrive.
- Vercel's hobby tier limits cron frequency, and reminders want minute
  granularity.
- It keeps firing atomic with the state change. `fire_due_reminders()` queues
  the push and marks the row fired in one transaction, so a crash mid-flight
  cannot double-send or silently drop.

**Cost:** these jobs are invisible from the Vercel dashboard, and debugging
them means looking at `cron.job_run_details` in Postgres. Worth knowing before
the first time one fails.

Pushes are queued into `public.push_outbox` rather than sent inline, because
Postgres should not be making HTTP calls to APNs. A worker drains that table.
The table also means a delivery attempt is never lost to a worker restart.

---

## D5 — The field list exists twice, with a test that fails if they diverge

`public.profile_field` in SQL, and `PROFILE_FIELDS` in
`packages/shared/src/fields.ts`.

Duplication is normally worth avoiding, but generating one from the other needs
a build step in the loop, and the two lists serve genuinely different jobs: the
enum decides what may cross a privacy boundary, the registry decides how the UI
labels and groups it.

So instead of generating, there is a test that parses the enum straight out of
the migration file and asserts the registry matches it key for key and in
order. Add a field to one and forget the other, and the suite fails. That is
the property that actually matters, and it costs one test.

---

## D6 — The database tests run a real Postgres, in-process

`supabase/tests/` boots PGlite, a WebAssembly build of Postgres, applies the
real migration files, and runs every assertion as a non-superuser
`authenticated` role so row level security is genuinely enforced.

Testing D1 against mocks would test nothing at all: the whole claim is about
what Postgres does when a policy is in force. Two shims stand in for things
Supabase provides and PGlite does not, both narrow: `auth.uid()` reads a
session variable instead of a JWT claim, and `cron.schedule()` records the
schedule rather than running it. The job functions themselves are real and are
called directly by the tests.

It needs no Docker and no running server, so `npm test` works on a clean
checkout.

It earned its keep immediately. Four real bugs surfaced while it was being
written, two of them leaks:

- **Any authenticated user could read any field of any profile.**
  `project_shared_profile()` is `SECURITY DEFINER` and has to be granted to
  `authenticated`, because the views run as their caller. So a client could
  call it directly with any user id and any field list and get back data it had
  never been given. It now checks for itself that the caller holds a connection
  whose frozen set covers every field asked for, and treats a null
  `auth.uid()` as a trusted server context.

- **The owner of a connection could widen it.** A row policy answers "is this
  your row", not "may you change this column of your own row". With a
  table-level `UPDATE` grant, a modified client could set its own
  `shared_fields` to every field in the enum and project the other person's
  entire profile. Fixed with column-level grants. The same class of hole let a
  client move `reminders.fire_at` past the 7 day ceiling.

- An ambiguous column reference in `mint_qr_token()`, where the function's OUT
  parameters shadowed the table's own columns.

- A complete absence of table-level `GRANT`s, which would have locked every
  authenticated user out of the whole schema regardless of policy.

None of these would have appeared before a deploy. `supabase/tests/escalation.test.ts`
is now the file that tries what a modified client would try.

---

## D7 — QR codes are random single-use tokens with a short life

The brief flags this before building, and it is right that a static code is an
impersonation risk.

A code is 32 random bytes, base64url, valid for 120 seconds, single use.
Opening the code screen mints a new one and immediately retires any previous
live code, so only what is currently on screen can be redeemed. Redeeming a
code does not share anything: it opens a handshake that both people still have
to confirm, inside the 30 second window.

The duration is a guess, which is Q8. Everything else here follows the brief.

---

## D8 — Built bottom-up, and the apps are not scaffolded yet

The brief asks for incremental work, each piece solid before the next, rather
than broad and shallow.

What exists is the data layer and the domain rules, with 114 tests. What does
not exist is the Next.js app, the React Native app, and the native module.

That ordering was chosen because the consent model is the part where a bug is a
trust failure, it is the part every screen depends on, and it is the only part
that could be finished and verified without an Apple toolchain or answers to
the open questions. The tap flow specifically is blocked on the spike, by
instruction.
