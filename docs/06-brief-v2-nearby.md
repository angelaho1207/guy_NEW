# Guy v2 — exchanging profiles after a conversation

The priority, above everything else: two people who have just spoken should be
able to exchange profiles in a few seconds, without typing anything.

The chosen mechanism is **Bluetooth nearby, in a native app**. Event mode and
the event directory are deferred and are described at the end so the schema
does not have to be redone later.

## Read these first

`CLAUDE.md`, then `docs/03-decisions.md`, then `docs/01-open-questions.md`.
The three rules that will bite fastest:

- **The database is the consent boundary.** `profiles` is readable only by its
  owner; the only path to someone else's data is
  `public.project_shared_profile()`.
- **Visibility follows the subject's current toggles, nothing else.**
  `connections.fields_at_exchange` is history and must never gate access.
- **Migrations are append-only.** `0001` to `0003` are deployed. Start at
  `0004`.

`npm test` must be green before anything is done. The harness boots a real
Postgres, so nothing about the sharing path should be mocked.

---

## The design, before the ordering

The thing that makes this work is not the radio. **It is that both people have
the connect screen open at that moment.** That is the intent signal.

Proximity only narrows the candidates. At a party of two hundred, the number
of people with that screen open right now is one or two, not two hundred, so
the messy case you would expect never really arrives.

- One candidate, the normal case: their name and photo appear, one tap to
  request, they accept.
- Several: a short list, ordered roughly by signal strength. Signal strength is
  useless for absolute distance and fine for ordering, and you are picking a
  name you just heard.
- A wrong pick costs nothing, because they still have to accept.

**No push notifications for proximity, ever.** Push is for reminders and 1:1
requests. A notification because someone walked past is the failure mode that
gets an app deleted. The prompt appears in-app only, and only while both
screens are open.

**What each phone advertises is a connect token**, the same short-lived
single-use token the QR code carries. Selecting someone redeems their token
through `public.open_exchange(token, method)`, with the same two confirmations
and the same thirty second window. The transport is new; the trust model is
not, and it is already tested. Do not invent a second one.

---

## 1. A real backend

**This is the blocker, and nothing phone-to-phone can start before it.**

The web app currently runs Postgres inside its own dev server. That was the
right call for looking at the design without any setup, and it is a dead end
for phones: a phone cannot reach an in-process database, and two phones would
have two separate databases with nothing to exchange.

So a real Supabase project has to exist, with the migrations applied.
`docs/04-setup.md` covers the project setup and has been waiting for this.

**A correction to what an earlier note in this repo claimed.** It said swapping
PGlite for Supabase was a matter of reimplementing `asUser` and `asAdmin`.
Those really are the only two functions that touch the database, but their
interface is raw SQL, and `supabase-js` cannot run raw SQL. It speaks
PostgREST and RPC. So the swap is larger than advertised. Two honest routes:

- **Rewrite the call sites** as PostgREST queries and RPC calls to the
  functions that already exist. This is how Supabase is meant to be used, RLS
  applies normally, and the mobile app can talk to it directly with the same
  client.
- **Connect to Postgres directly** with `pg` from server-side code, setting the
  request's claims per transaction so RLS still applies. Every existing query
  survives unchanged, but the mobile app then has to go through our own API
  rather than talking to Supabase.

Pick one deliberately and record it in `docs/03-decisions.md`. My preference is
the first, because the mobile app talking straight to Supabase removes a whole
tier, and because the SQL functions are already the API.

**Also missing and needed here:** sign up and log in. They are specified in the
original brief and were never built, because the demo had no auth. The mobile
app cannot work without them.

---

## 2. The mobile app shell

Expo with a development build, because a native module is coming. Bare React
Native is a fine alternative.

Port what already exists rather than reinventing it. `packages/shared` holds
the field registry, the handle links, the reminder and 1:1 rules, the connect
token timings and the colour palette, and all of it is platform-independent
and already tested. The screens to bring over are profile, contacts, contact
detail, follow-ups, and 1:1s. They are straightforward translations of the web
ones.

**Hardware and accounts.** Android costs nothing: a development build installs
on your own phone with no developer account. iOS needs a Mac for seven-day
sideloading, or the Apple Developer Program at $99 a year, which is also
required for push notifications. Whichever platform comes first, **two physical
devices are needed** to test any of this. A simulator cannot do Bluetooth.

---

## 3. Bluetooth nearby

Only startable once 1 and 2 are done.

**The mechanism.** Opening the connect screen starts both advertising and
scanning over Bluetooth Low Energy under a service UUID of ours. The
advertisement carries the current connect token. Leaving the screen stops both.

**What to build:**

- Advertise the connect token, re-advertising when it rotates. The refresh
  interval is already in `packages/shared/src/connect.ts` and there is a test
  that fails if it drifts from the database.
- Scan for the same service UUID and keep a live list of candidates, each with
  its token and its most recent signal strength.
- Resolve each candidate's token to a display name so the list shows people
  rather than identifiers. `public.exchange_peer_name()` does this for an open
  exchange; the pre-exchange case needs its own narrow function and its own
  tests. Keep it to a name and nothing else.
- Order by signal strength, most recent first. Drop candidates not seen for a
  few seconds so the list does not fill with people who have walked away.
- Tapping a candidate redeems their token and opens the existing confirmation
  prompt on both sides.

**Platform notes that will cost a day each if they are a surprise:**

- **Android needs location permission to scan for Bluetooth devices.** Before
  Android 12 this is `ACCESS_FINE_LOCATION`. From 12 it is `BLUETOOTH_SCAN`
  with the `neverForLocation` flag, which avoids the permission but has to be
  declared correctly. Users will ask why a contacts app wants location, so the
  screen should say plainly that nothing about location is collected.
- **iOS restricts what can be advertised in the background**, and the service
  UUID moves to an overflow area other iPhones can see but Android cannot.
  Since this design only advertises while the screen is open, that is
  survivable, but do not plan around background advertising.
- Advertising is not supported on every Android device, and some are unreliable
  about it. Test on real hardware early, not at the end.

**Do not attempt** background scanning, silent connection, or anything that
connects two people without both tapping. The thirty second window and the two
confirmations are the product.

---

## 4. The QR scanner in the app

Once the app exists this is roughly a day, because the camera library has
barcode reading built in and the server side is finished.

It is listed after Bluetooth only because Bluetooth is what you asked for
first. It is worth doing regardless: it works when Bluetooth is off, when a
device will not advertise, and across platforms that refuse to see each other.

The web app keeps its paste box. A browser cannot scan without HTTPS and a
camera permission, and cannot do Bluetooth peer discovery at all.

---

## 5. Deferred

**Event mode.** A box where you type the event you are heading to and a switch
to turn it on. While on, your event fills in the other person's "how you met"
note about you, only when it is empty, and turning it off affects future
connections only. When it is built, model it as event sessions with a start and
an end rather than a text column on the profile, because the directory below
needs that shape.

**The event directory.** Organizers add events, people join them, attendees can
see each other if they opt in, and a running event shows how many people have
it switched on. This is the largest privacy surface in the product: a live
headcount plus a visible attendee list is real-time location disclosure about
identifiable people. Bring it back as its own brief.

---

## Open questions

Numbering continues from `docs/01-open-questions.md`.

**Q14. Android or iOS first?** Android is free to test on real hardware. iOS
needs a Mac or $99 a year. Two devices are needed either way.

**Q15. PostgREST and RPC, or a direct Postgres connection?** Section 1. This
decides whether the mobile app talks to Supabase directly or through our API.

**Q16. Does the nearby list show names, or only to people who share them?** A
list of usernames is safe and often unusable, since usernames are not how
people recognise each other. Showing a name means someone who has the screen
open near you learns it before you have agreed to anything. My view is
name-if-shared, consistent with everywhere else, but it is a new disclosure.

**Q17. Should you be able to be nearby-visible without being connectable?**
Opening the screen currently means both advertising and scanning. Some people
will want to look without being seen.

**Q18. Is there a block list?** Not needed to build this, but it becomes
necessary the moment strangers can raise a prompt on your screen.
