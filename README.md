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
| Schema, RLS, consent projection | Done, 101 tests against real Postgres |
| Exchange handshake, QR tokens | Done, server side |
| Reminders, 1:1 windows, scheduled jobs | Done, server side |
| Shared domain logic and design tokens | Done, 51 tests |
| Next.js web app | Not started |
| React Native app | Not started |
| Swift Nearby Interaction module | **Blocked on the spike below** |

### What is blocked

1. **The Nearby Interaction spike has not been run.** The brief puts it first,
   and it needs a Mac, an Apple Developer account and two physical iPhones.
   None of those were available. A ready-to-build harness and a measurement
   protocol are in [`ios-spike/`](ios-spike/) and
   [`docs/02-uwb-spike.md`](docs/02-uwb-spike.md).

2. **The UWB path has no identity check.** Nearby Interaction reports a
   distance, not an account, and the server currently takes the peer's account
   id from the client on trust. See
   [`docs/05-how-the-uwb-path-works.md`](docs/05-how-the-uwb-path-works.md) for
   how the path works and how to close it.

Every other open question was answered on 23 Sep 2026 and is implemented and
tested. See [`docs/01-open-questions.md`](docs/01-open-questions.md).

## Layout

```
supabase/migrations/   Schema, RLS, the functions that cross privacy boundaries
supabase/tests/        Those migrations, run against a real in-process Postgres
packages/shared/       Field registry, handle links, reminder and 1:1 rules, tokens
ios-spike/             Throwaway harness for the Nearby Interaction question
docs/                  Open questions, the spike, decisions, setup
```

## Getting started

```
npm install
npm test
```

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
