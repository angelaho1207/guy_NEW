# Brief — typeable codes, a real QR scan, and shipping

A prompt for Claude Code. Written 2 Oct 2026. Three jobs, in this order. Commit
each separately.

Read `CLAUDE.md` first. The consent rules are the part of this codebase where a
bug is a trust failure, and job 1 touches them.

---

## Job 1 — the connect code becomes three words

### The problem

`mint_connect_token()` produces 32 random bytes as base64url: about 43
characters. Nobody types that off another person's screen inside 120 seconds.
It works for the QR path and is useless for the manual one, which is the path
people fall back to when a camera fails.

### What to build

A code like `brisk-stubborn-otter`: **physical adjective, personality
adjective, animal**, in that order, joined with hyphens. Memorable, sayable out
loud across a noisy room, typeable in a few seconds.

- Three word lists, seeded by a new migration (`0011`), in a table rather than
  as arrays inside the function so they can be queried and tested.
- `mint_connect_token()` composes one word from each list. It must **retry on
  collision** — with a finite space, two live tokens can land on the same words.
  Catch the unique violation and try again, a bounded number of times.
- `open_exchange()` **normalises what it is given** before looking it up:
  lowercase, trim, and treat spaces, underscores and hyphens as the same
  separator. Someone typing `Brisk Stubborn Otter` must connect. This belongs in
  SQL, not in the web app, so the future native client gets it too.

### Word list rules — these matter more than they look

- **At least 256 words per list**, which gives 256³ ≈ 16.8 million combinations.
  State the actual arithmetic in the migration's comment, using the real list
  sizes. If a list comes out smaller, say so and say what entropy that leaves.
- Lowercase a–z only. No apostrophes, no hyphens inside a word.
- Eight characters or fewer: this gets typed on a phone keyboard.
- **No homophones or near-homophones** — not `bear`/`bare`, `hare`/`hair`. The
  code gets read aloud.
- No slurs, no profanity, nothing about appearance that could be read as an
  insult about the person holding the phone, nothing medical, nothing
  frightening. "Physical adjective" means `brisk`, `glossy`, `sturdy` — not
  body descriptions.
- Add a test asserting each list's size, that every word matches `^[a-z]{3,8}$`,
  and that there are no duplicates within or across lists.

### The security question, which you must not skip

Shortening this token weakens a boundary. Think it through and write the
conclusion down in the migration:

- A guessed code lets a stranger raise a confirmation prompt on someone's
  phone, naming themselves. It does **not** share anything — the exchange still
  needs both people to tap confirm, and `confirm_exchange` is unchanged. The
  token has never been the consent boundary; the mutual confirmation is. Say
  this plainly, and note it is the same residual risk already documented for the
  nearby path.
- But a prompt from a plausible-looking stranger is still an attack worth
  pricing, so: **add rate limiting to redemption.** Count recent failed
  `open_exchange` attempts and refuse past a threshold. Per caller, and consider
  a global ceiling too — one account is cheap to make. Put it in SQL so every
  client inherits it, and test that the limit actually bites and that a
  legitimate retry after a typo still works.
- Keep single-use and keep the 120-second TTL. Both already exist.

### Also

- `packages/shared/src/connect.ts` documents the token; update it.
- Display the code large and legible, with a copy button. Three words want to be
  read, not squinted at.
- A test should fail if the TTL constant and the SQL default drift — that guard
  already exists, keep it working.

---

## Job 2 — scanning a code actually connects, in about two taps

### Where it stands

`ScanBox` is a text input and a comment saying it "stands in for the camera".
`CodePanel` renders a QR of the **bare token**. There is no scanner. Pointing a
phone's camera at that QR gives a meaningless string.

### What to build

**Two ways in, both short.**

1. **The QR encodes a URL, not a token.** Something short, so the code stays
   low-density: `https://<origin>/c/<code>`. Then a new route `/c/[code]`
   redeems it and goes straight to the confirmation. Scanning with the phone's
   own camera app — no scanner needed, no app open — becomes: tap the
   notification, tap Confirm. If the scanner is not signed in, send them to
   `/login` and return them to the code afterwards rather than losing it.
2. **An in-app scanner** on Connect: tap *Scan*, the camera opens, the code is
   detected automatically with no shutter button, redeem, confirm. Two taps.

**The decoder.** `BarcodeDetector` is Chromium-only; Safari does not have it, and
Safari is most of the users. So: use `BarcodeDetector` where it exists and fall
back to a WASM/JS decoder. `jsqr` is small and dependency-free and is the
recommended choice — **this is a new runtime dependency and it is justified; say
so in the commit message.** Do not add a whole scanner UI framework.

**Camera handling that does not leak.**

- `getUserMedia({ video: { facingMode: 'environment' } })`, started from a user
  gesture (iOS requires it), and **every track stopped** on unmount, on success,
  and when the tab is hidden. A camera left running is a privacy problem and a
  battery problem.
- Handle refused permission, no camera present, and insecure origin with
  distinct, honest messages. Camera needs HTTPS: it works on the Vercel domain
  and on `localhost`, and not on `http://192.168.x.x`. Say that in the error.
- Keep the typed-code fallback. It is now three words, so it is a real option,
  not a consolation.

**Count the taps in the commit message.** If it is more than two from open to
connected, say why.

---

## Job 3 — how to actually ship this

Produce `docs/11-shipping.md`: a numbered checklist the user can follow, each
step saying what to click, how to tell it worked, and what it costs. Build the
code-side prerequisites as you go, commit them, and leave the account-side steps
as instructions.

Order it by what blocks real users, not by what is interesting.

**Blockers — a stranger cannot safely use the app without these**

1. **Password reset.** There is none. A forgotten password locks someone out
   permanently. Supabase does reset-by-email and real addresses are already
   collected: build `/forgot` and `/reset`.
2. **Email confirmation back on.** It was switched off to unblock development.
   Left off, anyone can register with someone else's address.
3. **Account deletion, in the app.** Deleting an account must take the profile,
   the shares, the connections and the notes with it. `0001` already cascades
   from `profiles`; verify that and give it a button with a confirmation. This is
   also mandatory for App Store review later.
4. **A privacy policy page.** Short, true, and specific about what the nearby
   feature does with location: a coarse position, held while the screen is open,
   deleted when it closes, never logged. Also required by both app stores.

**Then — what makes it feel like an app**

5. **Web manifest, icons, Add to Home Screen.** No `public/` directory exists
   yet. This is the cheapest thing on the list and it is most of what people
   mean by "an app": an icon, full screen, no browser chrome. It is also a
   prerequisite for web push on iOS.
6. **A custom domain**, if wanted. Roughly $12 a year. Optional.

**Then — the thing that is quietly broken**

7. **Nothing drains `push_outbox`.** Reminders fire into that table and stop
   there, so follow-up reminders and 1:1 requests currently notify nobody. Build
   a worker — a Vercel cron route or a Supabase Edge Function — and pick a
   channel. Web push works on iOS 16.4+ **only for home-screen installs**, so it
   depends on step 5; email is the reliable fallback. Say which you chose.

**Then — operational facts the user should know**

8. Supabase free tier: the connection ceiling that already caused one outage
   (60), and that a free project pauses after a week of inactivity. Say how to
   tell and what to do.
9. Where to read errors when something breaks: Vercel → project → Logs.

**Last — native, and only if the tap is worth it**

10. Be explicit that **there is no tap today.** Nothing in the repo does
    ultra-wideband. The nearest working thing is nearby presence plus QR, and
    both work in the browser now. The real tap needs: an Apple Developer account
    ($99/yr), a React Native app, a Swift Nearby Interaction module, and the
    two-iPhone spike in `docs/02-uwb-spike.md` that has never been run.
    **Expo EAS builds on their machines, so no Mac is required** — that is worth
    stating plainly because it was previously thought to be a blocker. Android
    is $25 once.
11. What testing looks like before a store: TestFlight for iOS, internal testing
    track for Android.

Do not pad this with generic advice. Every step should be something this project
specifically needs, with the reason attached.

---

## Constraints

- **No literal colours** in any `.tsx` or in any CSS rule outside the two token
  blocks in `globals.css`. Both themes carry identical token names. Every new
  ink goes into the contrast test in `packages/shared/test/theme.test.ts`.
- Migrations are **append-only**. `0001`–`0010` are applied to a live database.
  New work is `0011` onward. A new enum value needs its own migration before it
  can be used.
- Every transition involving two people's consent stays in a `SECURITY DEFINER`
  function. `authenticated` gains no new write grants.
- Database tests must exercise the real SQL through PGlite as a non-superuser.
  A change to the token or redemption path without a test that runs the SQL does
  not count as done.
- Keep the copy. Wording about consent, sharing and presence is deliberate.
- `npm test` must pass. Two database test files occasionally time out under
  parallel load — re-run, and check in isolation with `npm run test:db`, before
  believing a failure.

## Verifying, and the trap

**Stop the dev server before `next build`.** They both write to `apps/web/.next`
and corrupt each other; the symptom is the dev server serving a 404 for its own
stylesheet and throwing `Cannot find module './385.js'`, which looks like a CSS
catastrophe and is not one.

`npm run dev:demo` runs the seeded demo on port 3001 with its own build
directory, and `/preview` is the component gallery. Use both.

Say at the end what you verified and what you could not check without a browser
or a second phone — specifically, not generally.
