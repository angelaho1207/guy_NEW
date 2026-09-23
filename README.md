# Guy

A consent-based, tap-to-share networking app. Two people connect on the spot,
each confirms, and only the profile fields each of them has marked shareable
get exchanged. Afterwards both can privately note how they met and what they
talked about, set a one-time follow-up reminder, and request a scheduled 1:1.

## Where the build is

The data layer and the domain rules are built and tested. The apps are not
scaffolded yet, and the tap flow is deliberately blocked. Read
[`docs/03-decisions.md`](docs/03-decisions.md) D8 for why the order went this
way.

| | Status |
|---|---|
| Schema, RLS, consent projection | Done, 109 tests against real Postgres |
| Exchange handshake, QR tokens | Done, server side |
| Reminders, 1:1 windows, scheduled jobs | Done, server side |
| Shared domain logic and design tokens | Done, 82 tests |
| Next.js web app | Runs, minus sign-up and the camera scanner |
| React Native app | Not started |
| Swift Nearby Interaction module | **Blocked on the spike below** |

### What is blocked

**The Nearby Interaction spike has not been run.** The brief puts it first, and
it needs a Mac, an Apple Developer account and two physical iPhones. None of
those were available. A ready-to-build harness and a measurement protocol are
in [`ios-spike/`](ios-spike/) and [`docs/02-uwb-spike.md`](docs/02-uwb-spike.md).

That is the only thing outstanding. Every open question has been answered and
implemented; see [`docs/01-open-questions.md`](docs/01-open-questions.md), and
[`docs/05-how-the-uwb-path-works.md`](docs/05-how-the-uwb-path-works.md) for how
the tap path works end to end.

## Layout

```
supabase/migrations/   Schema, RLS, the functions that cross privacy boundaries
supabase/tests/        Those migrations, run against a real in-process Postgres
supabase/dev/          The two things PGlite needs shimmed to stand in for Supabase
packages/shared/       Field registry, handle links, reminder and 1:1 rules, tokens
apps/web/              Next.js app. Runs against the real schema, no setup
ios-spike/             Throwaway harness for the Nearby Interaction question
docs/                  Open questions, the spike, decisions, setup, the v2 brief
```

## Getting started

```
npm install
npm run dev     # the web app, at http://localhost:3000
npm test        # everything
```

`npm run dev` needs nothing else: no Supabase account, no environment
variables, no Docker. The dev server runs the real migrations against a
Postgres compiled to WebAssembly, seeded with a handful of people who have
already met each other. See [`apps/web/README.md`](apps/web/README.md) for
what to try first.

No Docker, no running database. The database tests boot Postgres in-process
via PGlite and run every assertion as a non-superuser, so row level security is
genuinely enforced rather than assumed. Full setup, including the Supabase
project, is in [`docs/04-setup.md`](docs/04-setup.md).

## The two design rules worth knowing up front

**`profiles` is readable only by its owner.** Nobody else ever holds a `SELECT`
grant on someone else's profile row. The only path from one person's account to
another's data is a `SECURITY DEFINER` function that returns exactly what its
subject is currently sharing. A bug in a client cannot widen what it sees, and
the consent rules are tested by running them rather than by mocking them.

**What you can see is whatever they are sharing right now.** Turning a field
off hides it from everyone immediately; turning it on reveals it to everyone
immediately, including people they met while it was off. There is no
per-connection field set. `connections.fields_at_exchange` records what was
shared the day two people met and is never consulted to decide access.

**Nobody ever names an account to connect.** Both the QR and the tap path
redeem a short-lived single-use token, through the same function. You cannot
reach someone you are not standing next to.
