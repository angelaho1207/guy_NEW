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
| Schema, RLS, consent projection | Done, 68 tests against real Postgres |
| Exchange handshake, QR tokens | Done, server side |
| Reminders, 1:1 windows, scheduled jobs | Done, server side |
| Shared domain logic and design tokens | Done, 46 tests |
| Next.js web app | Not started |
| React Native app | Not started |
| Swift Nearby Interaction module | **Blocked on the spike below** |

### Two things need a decision before the next layer

1. **The Nearby Interaction spike has not been run.** The brief puts it first,
   and it needs a Mac, an Apple Developer account and two physical iPhones.
   None of those were available. A ready-to-build harness and a measurement
   protocol are in [`ios-spike/`](ios-spike/) and
   [`docs/02-uwb-spike.md`](docs/02-uwb-spike.md).

2. **Thirteen open questions**, in
   [`docs/01-open-questions.md`](docs/01-open-questions.md). Q1 is the one that
   matters: whether turning a "shareable" toggle off should retract a field
   from people you have already met. The brief read literally says no. I think
   it should be yes, and I would like that settled before there are real users.

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

## The one design rule worth knowing up front

`profiles` is readable only by its owner. Nobody else ever holds a `SELECT`
grant on someone else's profile row. The only path from one person's account to
another's data is a `SECURITY DEFINER` function that takes the field set frozen
into that connection and returns nothing outside it.

That means a bug in a client cannot widen what it sees. It also means the
consent rules are tested by running them, not by mocking them.
