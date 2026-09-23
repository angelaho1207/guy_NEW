# Decisions

Choices that were not spelled out in the brief, with the reasoning, so they can
be overturned on purpose rather than discovered by accident.

---

## D1 — The database is the consent boundary, not the application code

`profiles` is readable only by the person it describes. No other user holds a
`SELECT` grant on someone else's row, at any time, for any reason. The only
path from one user to another user's data is
`public.project_shared_profile()`, a `SECURITY DEFINER` function that returns
exactly what its subject is currently sharing and nothing outside it.

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
`connections.fields_at_exchange`, `connections.other_id`, `reminders.fire_at`
and `profiles.username`. See D6 for what happened when they were granted
broadly.

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

## D3 — Visibility is the subject's current toggle, and nothing else

One thing decides whether you can see a field of someone's profile: whether
they have its shareable toggle on **right now**.

Turning it off hides the field from everyone, immediately, including people who
have been looking at it for months. Turning it on reveals it to everyone,
immediately, including people they met while it was off. There is no
per-connection field set, no grandfathering and no ceiling.

The exchange decides *whether you are connected at all*. It does not decide
which fields you get.

This is the third version of this rule, and the history is worth keeping
because each step removed a trap:

1. **The brief, read literally.** The set of fields froze at the exchange and
   values stayed live. Revoking a field did nothing to existing connections,
   so revoking and then editing pushed the new value to everyone who already
   had it. The opposite of what a consent toggle should do.
2. **Frozen set intersected with current toggles.** Revocation worked, but the
   frozen set still acted as a ceiling, so turning a field back on reached new
   contacts and not old ones. Two people looking at the same profile saw
   different things for reasons neither could see or explain.
3. **Current toggles alone.** What is implemented. One rule, one place, and
   the toggle means exactly what it says on the screen.

`connections.fields_at_exchange` survives as a **historical record** of what
was being shared the day two people met. It is deliberately not consulted by
anything that decides access, and the column comment says so, because a column
that looks like a permission but is not would be the worst kind of trap. If it
earns nothing, delete it.

Falling out of this: `public.project_shared_profile()` no longer takes a field
list. An earlier version did, which meant a client calling it directly could
name a set of its own choosing and the function had to defend itself against
its own caller. With visibility driven entirely by the subject's toggles, the
argument has no reason to exist and that whole class of problem goes with it.
All that remains is checking the caller is connected at all.

A field that is not shared reads as **absent**, never as `-`. The empty marker
means "shared but blank", and conflating the two would make revocation look
like an empty profile.

`public.display_name_for()` applies the same test, so a push notification can
never carry a name the recipient may no longer see.

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
  `fields_at_exchange` (then called `shared_fields`, and then still load
  bearing) to every field in the enum and project the other person's entire
  profile. Fixed with column-level grants. The same class of hole let a client
  move `reminders.fire_at` past the 7 day ceiling.

- An ambiguous column reference in `mint_connect_token()`, then named
  `mint_qr_token()`, where the function's OUT parameters shadowed the table's
  own columns.

- A complete absence of table-level `GRANT`s, which would have locked every
  authenticated user out of the whole schema regardless of policy.

None of these would have appeared before a deploy. `supabase/tests/escalation.test.ts`
is now the file that tries what a modified client would try.

---

## D7 — Connect codes are random single-use tokens with a short life

The brief flags this before building, and it is right that a static code is an
impersonation risk.

A token is 32 random bytes, base64url, valid for 120 seconds, single use.
Opening the connect screen mints a new one and immediately retires any previous
live token, so only what is currently on screen, or currently being broadcast,
can be redeemed. Redeeming one does not share anything: it opens a handshake
that both people still have to confirm, inside the 30 second window.

D11 extended the same mechanism to the UWB path, which is why the table is
`connect_tokens` rather than `qr_tokens`.

---

## D9 — Two required fields, and Discord's id rides with its username

**First and last name are the only required profile content.** They are
collected at signup, because a profile cannot exist without them, and they are
enforced by `NOT NULL` plus a non-blank check rather than by client validation.

Required is about completeness, not about sharing. Both remain ordinary
shareable fields and can be withheld or revoked like any other, in which case
notifications fall back to the username. `fullName()` in the shared package
returns null unless both halves are present, so nothing ever renders as
"Alice -".

**Discord stores a username and a numeric id, under one toggle.** The username
is what people recognise and what shows on screen; the id is the only thing
that can be turned into a link. Giving the id its own toggle would let someone
share a username while withholding the thing that makes it useful, which is a
setting with no meaning, so `discord_id` is not in the `profile_field` enum at
all. The projection emits it alongside `discord`, and withholding Discord
withholds both.

The id is checked against a 15 to 25 digit pattern in the database, so a
username typed into the id box is rejected rather than turned into a link that
goes nowhere.

---

## D10 — Deleting an account deletes the other person's notes about you

When someone deletes their account, the cascade runs all the way through:
profile, then both connection rows, then the notes the *other* person wrote
about them.

This was flagged as a probable data-loss bug, because those notes are the other
person's own writing about their own life, and everything else in this schema
treats notes as belonging to their author. Deleting my account arguably should
not delete your diary.

**Chosen anyway, explicitly, for v1**, with the trade understood. The
alternative is a tombstone: keep the connection row, blank the profile, show
the contact as a username or "deleted account", and leave the notes standing.
That is more code and more states to render, and it keeps data about someone
who asked to be forgotten.

The cascade is now a decision rather than an accident. Revisit it the first
time someone loses notes they cared about.

---

## D11 — One connect token, one entry point, for both paths

Nearby Interaction proves that two phones are touching. It says nothing about
whose accounts they are, so the identity claim has to travel over the Bluetooth
discovery channel, and whatever carries it is what an attacker would forge.

**Chosen:** the UWB path redeems the same short-lived, single-use token the QR
path already used. The token is broadcast over Bluetooth alongside the Nearby
Interaction discovery token, and the server resolves it to an account.

**Rejected:** passing the peer's account id, which is what the first version
did. It let a modified client raise a confirmation prompt on any user's phone
from anywhere, with no proximity involved. Nothing leaked, since the prompt
still had to be confirmed, but it was a spam and social-engineering vector.

**Also rejected:** keeping the account id and adding rate limits and clearer
prompts. Worth doing anyway, but it makes abuse harder rather than impossible.

Three renames fell out of it, and they are the point rather than tidying:

- `qr_tokens` became `connect_tokens`, and `mint_qr_token()` became
  `mint_connect_token()`. The token was never QR-specific.
- `open_qr_exchange()` and `open_uwb_exchange()` collapsed into
  `open_exchange(token, method)`. Past the first step the two paths were
  already identical, and two functions doing one job drift.
- `method` is recorded, not trusted. A client that misreports it gains nothing.

**The residual risk, stated plainly:** a Bluetooth broadcast can be overheard
at range, while a QR code has to be pointed at, so the UWB token is more
exposed. Single use, a short life and the two-sided confirmation bound it. That
is why the lifetime stays short and why the refresh interval sits just inside
it. Both live in `packages/shared/src/connect.ts` with a test that fails if
they drift from the database.

**A cost I claimed and was wrong about:** I said this would stop two people
connecting with no signal. It does not. Guy could never complete an exchange
offline on either path, because the connection rows are created by the server
and profile data never moves phone to phone. Minting a token is one more round
trip on a path that already required the network.

---

## D12 — The web app's dev server runs the real database, not a mock

`npm run dev` needs no Supabase account, no environment variables and no
Docker. The dev server boots PGlite, applies the real migrations from
`supabase/migrations`, and seeds a handful of people by minting connect tokens
and confirming exchanges from both sides.

**Chosen** because the alternative was worse in both directions. Requiring a
Supabase project before you can look at anything puts twenty minutes and
several ways to get stuck between a change and seeing it. Mocking the data
instead would have meant the screens demonstrated the mock rather than the
product: the whole question worth asking of this UI is whether the consent
rules read correctly, and a mock cannot answer that.

Running the shipped SQL means a withheld field is missing from a card because
the database declined to send it, which is the only version of that worth
looking at.

**Costs, all real:**

- The database is in memory, so every restart is a fresh one. Nothing typed in
  the demo survives. Acceptable while the app is being looked at rather than
  used.
- Two shims, in `supabase/dev/pglite-shim.sql`, shared with the test harness so
  there is one copy: `auth.uid()` reads a session variable, and
  `cron.schedule()` records rather than runs.
- There is no login. The current user sits in a cookie with a switcher in the
  header. That is also how you check the thing most worth checking, which is
  what a connection looks like from the other side.
- PGlite is one connection, so queries are serialised through a small queue.
  Fine for one person looking at a demo, wrong for anything else.

The swap is contained: `asUser` and `asAdmin` in `apps/web/lib/db.ts` are the
only two functions that touch the database. Everything above them is already
the SQL that ships.

**One thing this cost an hour of:** booting Postgres inside a request blocks
while Next is already streaming a response, and fails with an error about
ArrayBuffers that has nothing to do with databases. The boot belongs in
`instrumentation.ts`, which runs once at startup. That file gets compiled for
the edge runtime too, where `node:fs` does not resolve, which is why
`next.config.mjs` marks those modules external for that build.

---

## D8 — Built bottom-up, and the apps are not scaffolded yet

The brief asks for incremental work, each piece solid before the next, rather
than broad and shallow.

What exists is the data layer and the domain rules, with 152 tests. What does
not exist is the Next.js app, the React Native app, and the native module.

That ordering was chosen because the consent model is the part where a bug is a
trust failure, it is the part every screen depends on, and it is the only part
that could be finished and verified without an Apple toolchain or answers to
the open questions. The tap flow specifically is blocked on the spike, by
instruction.
