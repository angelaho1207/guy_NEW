# Brief — visual redesign, "flyer" theme

A prompt for Claude Code. Written 2 Oct 2026. The functional app is finished
and working; this is purely about how it looks.

---

## What you are doing

Guy is a consent-based contact exchange app. Two people who have just met
exchange only the profile fields each has marked shareable. It works. 294 tests
pass. The data model, the consent rules, and every flow are done.

What it does not have is a point of view. The current styling is a competent
dark grey utility interface: `#0B0B0D` background, muted burgundy accent,
Inter, generous whitespace. It looks like an internal admin tool.

Your job is to give it a visual identity in the spirit of **partiful.com** —
the event RSVP site college students use. Nothing about behaviour, data, or
copy semantics changes. This is colour, type, motion, texture and layout
rhythm.

## Before you design anything: look at the reference

Fetch and read partiful.com yourself. Do not work from a description of it,
including the one below — treat that as a starting hypothesis to correct. Look
at the landing page and at least one public event page. Note specifically:

- the typeface's actual character (is it condensed? geometric? how quirky?)
- how gradients are applied — background washes, text fills, borders, or all
- how much motion there is, and on what
- how dense the layout is, and how large the type runs relative to it
- what the primary button looks like, and what the secondary one looks like

Then write down, in two or three sentences, what you concluded the design
language actually is. If it contradicts the hypothesis below, trust your own
reading and say so.

**Do not copy their assets, logo, wordmark, or proprietary fonts, and do not
reproduce their page layouts one-for-one.** Take the design language, not the
design. The result should look like it belongs to the same era and audience,
not like a clone.

## The hypothesis to verify

What I believe characterises it, to be confirmed or corrected:

- Near-black base, with saturated gradient as the expressive element — magenta
  into violet into orange, acid green, electric blue. Y2K rave flyer, not
  corporate gradient.
- Oversized display type, tight leading, used confidently. Headings are an
  event, not a label.
- Playful geometry: pill buttons with hard high-contrast fills, sticker-like
  badges, star and sparkle glyphs (✦ ✧ ★) as punctuation.
- Glow rather than shadow. Light bleeding off a coloured element onto dark,
  instead of grey drop shadows.
- Microcopy with personality, in lowercase or caps rather than sentence case.
- Looks hand-made on purpose. Slight irregularity, not grid-perfect blandness.

## The architectural requirement — this is the important part

**There will be a second theme.** The next version of this will be calmer,
because an app for building real relationships may not want to look like a
party flyer. So build this as a *theme*, not as a restyle.

Concretely:

- Every colour, radius, font, shadow, glow and gradient becomes a token. No
  component file contains a literal colour, ever.
- Tokens live in `packages/shared/src/theme.ts`, mirrored as CSS custom
  properties in `apps/web/app/globals.css`. **There is a test that fails if
  those two drift — `packages/shared/test/theme.test.ts`.** Read it before you
  touch either file; it also has an alias map you will need to extend.
- Structure the tokens so a theme is a named set that can be swapped whole.
  Switching themes must not require editing a single component.
- Keep the existing token *names* wherever the meaning survives (`--accent`,
  `--surface`, `--text-secondary`). Add new ones for things the current theme
  has no concept of — gradients, glows, display faces. Removing a name means
  touching every component that used it, so don't unless it is genuinely dead.

If you find yourself writing `#FF00AA` in a `.tsx` file, stop.

## Constraints that are not negotiable

- **Do not change any SQL, any server action's behaviour, or anything in
  `supabase/`.** The consent boundary is the database and this work does not go
  near it. Read `CLAUDE.md` first.
- **A shared-but-empty field renders as `-`. A withheld field is absent
  entirely.** That distinction is load-bearing and must stay legible — `-` has
  to read as "they left this blank", not as a styling artefact. It currently
  uses `--text-muted`.
- **Keep the navigation structure.** Top bar: Connect on the left, then
  Profile, username and Sign out on the right. Fixed bottom bar: Contacts,
  Follow-ups, 1:1s, with their count badges. That arrangement was chosen
  deliberately and works on a phone.
- **Mobile first, and verify it.** Most use is on a phone, in a room, in
  seconds. The top bar already runs out of room at 375px and has breakpoints
  at 560px and 400px handling it — oversized type will make that worse, so
  check it rather than assuming.
- **No new runtime dependencies without saying why.** No Tailwind, no component
  library, no animation library. The styling is hand-written CSS in one file and
  should stay that way. A web font from Google Fonts is fine; two is probably
  one too many.
- **Respect `prefers-reduced-motion`.** If you add motion, gate it.
- **Contrast.** Body text must stay readable on whatever the background becomes.
  Neon on near-black is easy to get wrong. Check it, especially for
  `--text-secondary` and the `-` muted colour.
- **Keep every test passing**, including the theme drift test and the palette
  checks. Run `npm test`.

## Where the expressive weight belongs

Not everywhere. Pick the moments:

- **Connect** is the screen two people look at together, in person, excited.
  This is the one that should feel like an event. The nearby list, the code
  panel, the 30-second confirmation prompt with its countdown — that prompt in
  particular is the emotional peak of the whole app and currently looks like a
  form.
- **Contacts** is a list you scan calmly later. Expressive type on the headings,
  quiet rows. Resist making every row a gradient.
- **Profile** is a long form with twenty fields and share toggles. Legibility
  wins over personality here, with one exception: the share toggle is the most
  important control in the product and should look like it matters.
- **Follow-ups and 1:1s** are task lists. Keep them calm.
- **Login and signup** are the first thing anyone ever sees. Spend effort here.

## Process

1. Read `CLAUDE.md`, `packages/shared/src/theme.ts`,
   `apps/web/app/globals.css`, and `packages/shared/test/theme.test.ts`.
2. Look at the reference. Write your conclusions.
3. Propose the token set — palette, type scale, radii, gradients, glows — and
   show it before applying it. A rendered swatch page is better than a list.
4. Apply it: tokens first, then `globals.css`, then components one at a time.
5. Verify. `npm test`, `next build`, and render the signed-in pages to check
   the markup. Say plainly what you could not check without a browser.
6. Commit in reviewable pieces, not one commit called "redesign".

## What done looks like

Someone opens the login screen on their phone and it looks like something made
in this decade, for people their age, by someone who cared. They open Connect
in front of a person they just met and it feels like a moment rather than a
form submission. And switching the whole thing to a calm theme later is an
afternoon's work on one file, not a rewrite.
