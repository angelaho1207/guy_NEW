# Setup

## Running the tests

Nothing external is required. The database tests boot Postgres in-process.

```
npm install
npm test
```

| Command | Runs |
|---|---|
| `npm test` | Everything |
| `npm run test:db` | The migrations, RLS and the SQL functions |
| `npm run test:unit` | The shared domain logic |

Node 22.6 or later, because the tests are TypeScript and run on Node's own type
stripping rather than a build step. Developed against Node 24.

## Standing up a Supabase project

1. Create a project. Note the project URL and the `anon` key.

2. **Turn off email confirmation.** Authentication → Providers → Email →
   disable "Confirm email". Signup uses a synthetic `@users.guy.invalid`
   address that can never receive mail, so leaving confirmation on means no
   account can ever be activated. The reasoning is D2 in
   [`03-decisions.md`](./03-decisions.md).

3. Enable the extensions the migrations need: `pgcrypto`, `citext` and
   `pg_cron`. Database → Extensions. `pg_cron` must be enabled on the
   `postgres` database.

4. Apply the migrations in order.

   **If you have already applied an earlier version of these files to a real
   database, reset it rather than re-running them.** The answers of 23 Sep 2026
   changed `0001` through `0003` in place, and several of those changes cannot
   be replayed with `create or replace`:

   - `name` became `first_name` and `last_name`, and `discord_id` was added.
   - `connections.shared_fields` became `fields_at_exchange`.
   - `qr_tokens` became `connect_tokens`, and `mint_qr_token()` became
     `mint_connect_token()`.
   - `open_qr_exchange()` and `open_uwb_exchange()` collapsed into
     `open_exchange(token, method)`.
   - `project_shared_profile()` lost its field-list argument.

   Editing applied migrations is normally forbidden, and this was only safe
   because no database had them yet. From here they are append-only.

   ```
   supabase link --project-ref <ref>
   supabase db push
   ```

   Or paste `supabase/migrations/*.sql` into the SQL editor in filename order.

5. Confirm the scheduled jobs registered:

   ```sql
   select jobname, schedule from cron.job order by jobname;
   ```

   Four rows, all prefixed `guy-`. If they are missing, reminders will never
   fire and approved 1:1 requests will never expire.

## Environment

Not yet consumed by anything, since neither app is scaffolded. Recorded here so
the names are settled.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only, drains push_outbox
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

The service role key bypasses every policy in
`0002_rls_and_functions.sql`. It belongs only in server-side code that drains
`public.push_outbox`, and never in either client bundle.

## Accounts you will need before the mobile app can ship

Both are named in the brief and neither can be worked around.

- **Apple Developer Program.** Required for push, for the custom native module,
  and for running on physical iPhones at all. Also required before the spike in
  [`02-uwb-spike.md`](./02-uwb-spike.md) can be run.
- **Google Play Developer.** Required for Android distribution.

## What is not set up yet

The Next.js app, the React Native app and the native module do not exist.
`packages/shared` is consumed by nothing so far. See D8 in
[`03-decisions.md`](./03-decisions.md) for why the order went this way.
