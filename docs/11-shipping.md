# Shipping Guy

A checklist, in the order that matters. Each step says what to do, how to tell it
worked, and what it costs.

Written 2 Oct 2026. Steps marked **built** are already in the code and need only
the account-side action next to them.

---

## Before anyone but you uses it

### 1. Password reset — **built**

There was no recovery at all: a forgotten password locked someone out forever.

Now at `/forgot` → Supabase emails a link → `/auth/confirm` exchanges the token
for a session → `/reset` sets the new password. The `/forgot` form asks for the
**email**, not the username, because the link has to go somewhere and because
asking for the email keeps the page from becoming a way to discover which
usernames exist.

**What you have to do:** nothing in code, but check the email actually arrives.
Supabase → Authentication → Emails. The free tier's built-in SMTP is rate limited
to a few messages an hour and is only meant for testing — you hit that limit
already once. Before real users, set up your own SMTP under
Authentication → Emails → SMTP Settings. Resend's free tier is 3,000 a month and
takes about ten minutes to connect.

**How to tell it worked:** sign out, go to `/forgot`, enter your own email, and
land back in the app with a new password.

### 2. Turn email confirmation back on

You switched it off so development could proceed, which was right then. Left off,
anyone can register with someone else's address.

**What to do:** Supabase → Authentication → Sign In / Providers → Email → enable
**Confirm email**. Do step 1's SMTP first, or confirmations will hit the same rate
limit and nobody will be able to sign up at all.

**How to tell it worked:** a new account cannot sign in until the link is clicked.

### 3. Account deletion — **built**

Both app stores require it of anything with accounts, and it is the right thing
regardless.

On the profile page, behind a disclosure and then behind typing your own
username, because a single tap is not a confirmation for something irreversible.
Migration `0012` does the work in `delete_my_account()`, which takes no arguments
at all — a function that accepted a user id would be a delete-anyone button
granted to every signed-in account.

It removes the profile, the sharing toggles, the connections in both directions,
the reminders, the meeting requests, the account itself, **and the private notes
other people wrote about you**. That last one is D10, decided deliberately: a
note about someone who asked to be forgotten is still a record of them.

**What you have to do:** run `0012` in the Supabase SQL editor (see step 5), then
try it on a throwaway account before trusting it. `probeuser` exists for this.

### 4. The privacy policy — **built**

At `/privacy`, readable without signing in, which the app stores require.

It is specific rather than careful: it says the nearby feature holds one coarse
position while the screen is open, that it is overwritten rather than appended to,
that it expires after 45 seconds, and that deleting your account takes other
people's notes about you.

**What you have to do:** read it and check every sentence is still true. If you
change what the app does, that page becomes wrong and has to change with it.

### 5. Run the three new migrations

`0011` and `0012` are not on your live database yet.

Supabase → SQL Editor, **one file per execution, in order**:

1. `supabase/migrations/0011_word_connect_codes.sql`
2. `supabase/migrations/0012_delete_my_account.sql`

**How to tell it worked:** open Connect. The code should read like
`brisk-stubborn-otter` instead of 43 random characters.

---

## What makes it feel like an app

### 6. Add to Home Screen — **built**

`/manifest.webmanifest` and an icon at `/icon.svg`. Opened from the home screen
it runs full screen with no browser chrome, which is most of what people mean by
"an app". It is also a prerequisite for push on iOS.

**What you have to do:** the icon is a placeholder I drew — a gradient circle on
black. It is fine and it is not a logo. When you want a real one, replace
`apps/web/public/icon.svg`, and add a 180×180 PNG at `apple-touch-icon.png`
because iOS ignores SVG for home-screen icons. Until then iOS will render a
screenshot of the page instead, which looks unfinished.

**How to tell it worked:** on iPhone, Safari → Share → Add to Home Screen. Open
it. No address bar.

### 7. A custom domain — optional, about $12/year

`guy-something.vercel.app` works and is free. A real domain mostly buys
credibility when you send the link to someone.

Vercel → project → Settings → Domains → add it, then follow the DNS instructions
at your registrar. Nothing in the code needs to change: the QR code and the reset
emails both build their URLs from the incoming request, so they follow the domain
automatically.

---

## The thing that is quietly broken

### 8. Nothing delivers notifications — **not built**

`fire_due_reminders()` runs every minute and writes to `push_outbox`. Nothing
reads that table. So **follow-up reminders and 1:1 requests currently notify
nobody** — the data is correct and the message never leaves.

Two decisions to make, in this order:

**Channel.** Web push reaches iOS only for home-screen installs (step 6), needs
VAPID keys, and needs a service worker, which this app does not have. Email works
everywhere, needs no new client code, and reuses the SMTP from step 1. For a
first release, email is the smaller piece of work and the one that actually
arrives.

**Worker.** Either a Vercel Cron hitting an API route on a schedule, or a Supabase
Edge Function. The Vercel route is simpler because it can use the database code
that already exists in this repo; it needs a shared secret in the header so the
route is not open to the world.

Until this is done, say plainly to anyone testing that reminders will not ping
them. A feature that silently does nothing is worse than one that is missing.

---

## Operational facts worth knowing

### 9. The free tier's limits, both of which have already bitten

**Connections: 60.** This caused the intermittent 500s. The fix is in — one
pooled connection per serverless instance, fewer queries per page — but if you
add polling or a new query per render, that ceiling is where it shows up, and it
shows up as a 500 rather than as anything helpful.

**Projects pause after a week of inactivity.** The app will start failing and
Supabase will show the project as paused; you resume it from the dashboard. Worth
knowing before you conclude something is broken.

### 10. Where to look when something breaks

Vercel → your project → **Logs**, with the failing page open in another tab. That
is where a 500's actual error text appears. The error boundary in the app shows a
retry button and a reference code rather than a stack trace, deliberately — the
stack trace goes to the logs.

For database questions: Supabase → SQL Editor is the fastest way to ask whether
the data is what you think it is.

---

## Native, and whether the tap is worth it

### 11. There is no tap today

Nothing in this repo does ultra-wideband. Nothing can, until there is a native
app. What works right now, in a browser, on two phones:

- **Nearby presence.** Both people open Connect, both appear on each other's
  screen, one tap to ask, both confirm.
- **QR.** One shows a code, the other scans it with the phone's own camera or the
  in-app scanner. Two taps.

Those cover the same need. Test them before spending anything.

### 12. What the real tap would cost

- **Apple Developer Program, $99/year.** Required to put anything on an iPhone
  that is not a web page.
- **No Mac required.** Expo EAS builds and signs on their macOS machines. This was
  previously believed to be a blocker and it is not.
- **A React Native app.** The domain logic in `packages/shared` is already
  platform-neutral and the database functions are already reachable over
  PostgREST, so this is screens, not a rewrite.
- **A Swift Nearby Interaction module**, plus the two-iPhone spike in
  `docs/02-uwb-spike.md`, which has never been run. The spike exists because the
  whole feature depends on an answer nobody has yet: whether discovery survives
  backgrounding well enough to be useful.
- **Google Play, $25 once**, if Android matters. Android has no equivalent of
  Nearby Interaction, so the tap would be Bluetooth-only there.

### 13. Testing before a store

iOS: **TestFlight**, up to 100 internal testers, review is light for internal
builds. Android: the **internal testing** track, which is near-instant.

Neither is needed for the web app. Sending someone the URL is the whole
distribution story, which is the main argument for staying on the web until the
tap is proven.

---

## The order I would actually do it in

1. Steps 1, 2 and 5 — SMTP, email confirmation, migrations. Half an hour, and
   until they are done the app is not safe to hand to a stranger.
2. Step 6 — Add to Home Screen. Ten minutes, and it changes how the thing feels
   more than anything else on this list.
3. Test nearby and QR on two phones at something real.
4. Step 8 — notifications, once you know people are actually connecting.
5. Decide about native only after that.
