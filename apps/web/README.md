# Guy, on the web

## Running it

```
npm install
npm run dev
```

Then open http://localhost:3000.

There is nothing else to set up. No Supabase account, no environment
variables, no Docker. The first boot takes a few seconds while the database
starts.

## What you are actually looking at

The dev server runs **the real database**. Postgres, compiled to WebAssembly,
living inside the Next process, with the real migrations from
`supabase/migrations` applied to it. Row level security is on and enforced, the
consent projection is the shipped SQL, and the seed data was created by minting
connect tokens and confirming exchanges from both sides, the same way two
phones would.

So when a field does not appear on someone's card, it is because the database
declined to send it, not because the page chose not to draw it.

Two things are shimmed, both in `supabase/dev/pglite-shim.sql`. `auth.uid()`
reads a session variable instead of a JWT claim, and `cron.schedule()` records
what it would have scheduled rather than running it. The scheduled job
functions are real and can be called by hand.

The database lives in memory. **Every restart is a fresh database with fresh
seed data**, so nothing you type survives. That is deliberate for now: it keeps
the demo honest and means a broken experiment is one restart away from gone.

## There is no login yet

Sign up and log in are real screens in the spec and will use Supabase Auth.
Building them first would have meant you could not look at anything without
making an account, so instead the current user sits in a cookie and you switch
between the seeded people from the dropdown in the header.

Switching is not only a shortcut. Guy is an app about what two people can see
of each other, and the fastest way to check that is to look at the same
connection from both sides.

## Things worth trying

**Watch a field disappear.** Open Profile as Angela, turn off School, then
switch to Marcus and open Angela in his contacts. It is gone. Turn it back on
and it is back, showing whatever it says now. There is no per-person setting
and nothing is grandfathered.

**See the difference between blank and private.** Tobias shares every field and
filled in almost none, so his card is full of dashes. Priya filled almost
everything in but keeps her phone, personal email, Instagram and hometown to
herself, so those fields are simply not on her card. A dash means "they left it
blank". Nothing at all means "they did not share it".

**Connect two people.** Open Connect as one person, copy the code, switch to
someone else, paste it. A prompt appears for both of you and nothing is shared
until you both confirm. Wait thirty seconds instead and it expires with nothing
on either side. Try scanning the code of someone you already know and it says
so without spending the code.

**Try to break the reminder.** Zero days and zero hours, or eight days. The
button explains itself before you press it, and the database refuses it again
if you get past that.

**Decline a 1:1.** As Angela, decline the request from Noor. It disappears for
both of you, with no notification and nothing left saying "declined".

## Deploying this

It builds and runs on Vercel, and you should know what you are getting.

The database is the in-memory one described above. On Vercel that means **one
database per serverless instance**, created on that instance's first request
and gone when it recycles. So:

- Anything saved can disappear a minute later.
- Two people looking at the same link can see different data.
- The first request to each instance waits about three seconds for the
  database to boot.

That is fine for showing someone the design. It is not a working app, and
nobody should put real information into it. The fix is not a deployment
setting, it is wiring up Supabase.

Two things had to be true for the build to work at all, both easy to undo by
accident:

- `@electric-sql/pglite` is a **dependency** of this package, not a
  devDependency of the repo root. It is the app's database layer at runtime,
  not a build tool.
- The migrations are **imported**, not read from disk. A deployed bundle only
  contains files the build traced through imports, and `supabase/` sits
  outside this app. A test fails if a migration is added without being
  imported here.

## Swapping in a real Supabase project

The app talks to the database through `asUser` and `asAdmin` in `lib/db.ts`,
and nowhere else. Pointing it at Supabase means giving those two functions a
Supabase client instead of PGlite; every query and every RPC call above them is
already the SQL that ships. `docs/04-setup.md` covers the project setup.

## What is not built here

Sign up and log in, and the web QR *scanner*, which needs camera permission and
is the one thing the paste box is standing in for. The tap path is iPhone only
and belongs to the mobile app, which has not been started. See the repository
README for the state of everything.
