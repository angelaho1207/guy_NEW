# Working in this repo

Guy is a consent-based contact exchange app. Two people's personal information
and their explicit consent about what gets shared with whom run through this
code. A bug in the sharing path is a trust failure, not an inconvenience.

## The rule that overrides the others

**The database is the consent boundary.** `profiles` is readable only by its
owner. Nothing else ever gets a `SELECT` grant on someone else's profile row.
The only path across is `public.project_shared_profile()`.

If you find yourself about to filter profile fields in TypeScript before
returning them to a client, stop. That filter belongs in SQL, where forgetting
it produces an empty result rather than a leak. Client-side projection is for
previews only, and must be labelled as such.

Related: `authenticated` has no `INSERT` on `connections`, no write on
`exchanges`, and no write on `one_on_one_requests`. Every transition involving
two people's consent goes through a `SECURITY DEFINER` function in
`supabase/migrations/0002_rls_and_functions.sql`. Keep it that way.

## Ask rather than guess

The brief this was built from says to stop and ask when a detail needed to
implement something correctly is not specified, rather than picking a default
silently. That has held so far and should keep holding.

Thirteen such points are recorded in `docs/01-open-questions.md`. Where a
default had to be picked to keep moving, the file says which way it went and
where the one line is that changes it. Add to that file rather than quietly
deciding.

`docs/03-decisions.md` is for choices that are settled, with the reasoning.

## Testing

```
npm test          # everything
npm run test:db   # migrations, RLS, SQL functions
npm run test:unit # shared domain logic
```

Database tests boot a real Postgres in-process through PGlite, apply the real
migration files, and run as a non-superuser `authenticated` role so RLS is
actually enforced. Tests that mock the database prove nothing about the thing
this app must get right, so a change to the sharing path needs a test that runs
the SQL.

Two shims stand in for Supabase: `auth.uid()` reads a session variable, and
`cron.schedule()` records rather than runs. Everything downstream is real.

Node 22.6+ only. Tests are TypeScript run through Node's type stripping, so
there is no build step and no test framework dependency.

## Conventions

- The field list exists in SQL (`public.profile_field`) and in TypeScript
  (`packages/shared/src/fields.ts`). A test parses the migration and fails if
  they diverge. Change both.
- Dark mode only for v1. Colours come from `packages/shared/src/theme.ts`, not
  from literals. The accent is a deep muted burgundy used sparingly, never a
  bright red or pink.
- Migrations are append-only and numbered. Never edit one that has been applied
  to a real database.
- A shared field that is empty renders as `-`, not omitted. A field that was
  never shared, or whose toggle is currently off, is absent entirely. The
  difference is load-bearing: it separates "they didn't fill this in" from
  "they didn't share this". Never render a revoked field as `-`.
- Visibility follows one thing: the subject's **current** shareable toggle.
  Off hides the field from everyone immediately; on reveals it to everyone
  immediately, including people they met while it was off. There is no
  per-connection field set. `connections.fields_at_exchange` is a historical
  record of what was shared that day and must never be used to decide access.
  See D3.
- `first_name` and `last_name` are the only required fields, and they are still
  ordinary shareable fields. Anything that shows a person's name must handle
  both halves being withheld, and fall back to the username.
- Lists of 1:1 requests read `public.visible_one_on_ones`, never the table. A
  declined request disappears from both people's lists.

## What is not built yet

The Next.js web app, the React Native app and the Swift Nearby Interaction
module. The tap flow is blocked on the spike in `docs/02-uwb-spike.md`, which
needs two physical iPhones and has not been run.
