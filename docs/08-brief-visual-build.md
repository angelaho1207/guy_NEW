# Brief — make the app match the approved mockups

A prompt for Claude Code. Written 2 Oct 2026, after a first pass that landed the
tokens but not the design.

**The approved design lives here:**
https://claude.ai/artifact/28WgeCCBmohqTAbepNKkNf

Read it with the Artifact tool (`action: "read"`, with `path`), not WebFetch.
Its artboard files are the specification:

| File | What it specifies |
|---|---|
| `project/Main.dc.html` | palette, gradients, type scale, every control |
| `project/Connect-Midnight.dc.html` | the Connect screen, dark |
| `project/Connect-Daylight.dc.html` | the Connect screen, light |
| `project/Contacts-Midnight.dc.html` | contacts list + a shared-fields card, dark |
| `project/Contacts-Daylight.dc.html` | the same, light |
| `project/Login-Midnight.dc.html` | sign in, dark |
| `project/Login-Daylight.dc.html` | sign in, light |

Those files contain exact hex values, sizes, weights, paddings and radii as
inline styles. **Where this document and an artboard disagree, the artboard
wins.** Where an artboard uses a literal colour, find or add the token for it:
the artboards are mockups and may hold literals, the app may not.

## What is already done — do not redo it

Commits `193793e` and `34de689`:

- Both themes exist in `packages/shared/src/theme.ts` as `midnight` and
  `daylight`, with identical token names, mirrored in
  `apps/web/app/globals.css` under `:root, :root[data-theme='midnight']` and
  `:root[data-theme='daylight']`.
- The theme resolves before first paint (inline script in `layout.tsx`), is
  switchable from Profile → Settings (`components/ThemeToggle.tsx`), and
  persists in `localStorage`.
- Outfit and Hanken Grotesk load; `--font-display` and `--font-sans` exist;
  `h1` is 44px display, `h2` 28px display.
- `.card` is 12px radius, `.btn` 8px.
- `.hero` / `.hero-title` gradient wash on sign in and sign up.
- `.glowing` on the confirmation prompt, with the per-theme treatment split.
- `.eyebrow` and `.celebrate` classes exist but are barely used — use them.
- `packages/shared/test/theme.test.ts` checks both themes against the
  stylesheet in both directions and computes WCAG contrast. Extend it; do not
  weaken it.

The result is correctly tokenised and far too plain. Everything below is the
gap between it and the mockups.

## The gaps, in priority order

### 1. Avatars are gradient circles

The mockups fill every avatar with one of three gradients and set dark initials
on it, 40–42px, **no border**. The app currently renders
`background: var(--accent-subtle)` with a border, which on midnight is a grey
disc.

- Add `--grad-bloom`, `--grad-periwinkle`, `--grad-dusk` as tokens, with their
  ink. `--celebrate` is already bloom; keep it as the name used for celebratory
  surfaces and let the three be the avatar set.
- Pick one deterministically per person, so the same contact always gets the
  same colour. Hash `other_id` (or `user_id`), modulo three. Not random, and not
  by list position — a contact must not change colour when the list reorders.
- Exact values are in `Main.dc.html` under the CELEBRATION section and on the
  avatars in the Contacts and Connect boards.

### 2. Semantic pills

The mockups use three pill kinds beyond the plain outline one:

- **Celebratory** ("Follow up", active nav): on midnight a `--celebrate-edge`
  border over a `--glow` tint with edge-coloured text; on daylight a
  gradient fill with `--celebrate-ink`.
- **Counting down** (`24s`): amber. `#FFAE00` edge, `rgba(255,174,0,.16)` fill,
  `#FFD68A` text on midnight; white fill with dark ink on daylight.
- **Settled** ("Connected"): green, `#31C431` family.

Add these as tokens in both themes — a `warn` trio and a `go` trio, fill, edge
and ink — and **add them to the contrast test's `onBackground` list**. Amber and
green text on a light ground both fail AA easily; that is the whole reason the
test computes ratios.

Drive them with `data-tone` on `.pill`, the attribute the component already
passes, rather than new class names.

### 3. The Connect screen's structure

Compare `Connect-Midnight.dc.html` with `components/NearbyPanel.tsx`. The
mockup is not one card containing a list; it is:

- `Who else is here` as a page-level display heading, not an `h3` inside a card
- a small live dot plus `You are visible · stops when you leave`
- each nearby person as **their own card**: gradient avatar, name at 16px/600,
  distance at 13px muted, and a filled Connect button on the right
- `Already` as a plain outline pill where the person is already connected
- `OR USE A CODE` as an `.eyebrow`, not an `h2`

The panel's status copy (`off`, `denied`, `unsupported`) stays as written — it
is correct and carefully worded. Only its presentation changes.

### 4. The confirmation prompt

`ConfirmPrompt.tsx` against the Connect boards:

- the question is a 30px display line, deliberately breaking across two lines
- the countdown is the amber pill, not the accent pill
- the progress bar is 3px and filled with a gradient, not 2px and flat
- Confirm fills the width (`flex-grow`) with "Not now" beside it, not two
  equal buttons
- weight 700 on Confirm; it is the most consequential button in the app

### 5. The contacts list and the shared-fields card

Compare the Contacts boards with `app/contacts/page.tsx`:

- rows carry the gradient avatar and a `--border-strong`-ish edge when they want
  attention; quiet rows sit on `--surface` with a plain border
- the detail card is led by an `.eyebrow` (`WHAT PRIYA SHARES`), then
  label/value rows with a fixed ~92px label column
- the `-` for a shared-but-empty field uses `--text-muted` and must stay
  distinguishable from an absent field, which renders nothing at all

Note while you are there: `Card.tsx` renders `—` (em dash) where
`EMPTY_SHARED_VALUE` is `-` (hyphen). Leave the semantics alone, but pick one
character and use it in both places.

### 6. Buttons, bars, and touch targets

- primary buttons: 44px minimum height, weight 600–700, 8px radius
- the active bottom-bar tab is a celebratory pill, matching the mockups and
  matching the reference, which does use a colour for the active nav item
- bottom-bar badges stay `--accent` filled with `--on-accent` text
- every tappable thing is at least 44px in its smaller dimension

### 7. Sign in

`Login-Midnight.dc.html` has the wordmark inside the gradient, the headline
below it, and a closing reassurance line at the foot of the screen
("Nothing about you is visible to anyone until you both tap confirm, standing
in the same room."). The app has the headline only.

## Constraints

- **No literal colours in any `.tsx` or in any CSS rule outside the two token
  blocks.** This currently holds — verify it still does when you finish:
  `grep -rn "#[0-9a-f]\{3,8\}\|rgba\?(" apps/web --include=*.tsx --include=*.css`
  should return only the token blocks.
- Both themes must carry identical token names. A token in one and not the other
  is a component that breaks on one ground, and a test fails on it.
- **Do not touch anything in `supabase/`, any SQL, or any server action's
  behaviour.** Read `CLAUDE.md` first. This is presentation only.
- Keep the navigation arrangement: Connect top left; Profile, username, sign out
  top right; Contacts, Follow-ups, 1:1s in a fixed bottom bar with badges.
- The top bar already runs out of room at 375px and has breakpoints at 560px and
  400px holding it together. Larger type will press on that. Check it.
- Gate any motion behind `prefers-reduced-motion`.
- `npm test` must pass. Extend the contrast test to cover every new colour
  token rather than exempting them.

## How to verify, and one trap

**Stop the dev server before running `next build`.** Both write to
`apps/web/.next`, and running them together corrupts it: the dev server starts
404ing its own stylesheet and throwing `Cannot find module './385.js'`, which
looks exactly like a catastrophic CSS bug and is not one. This has already
wasted time twice. Either stop the server, build, and restart it, or do not
build while it runs.

To see rendered markup without logging in, run a dev server with
`SUPABASE_DB_URL=""` — the demo database has no accounts and seeds four people —
but **only one server at a time from this directory**, for the same reason.

Say plainly at the end which things you verified and which you could not check
without eyes on a browser.

## Done looks like

Screenshots of the running app and the artboards side by side are hard to tell
apart: the same gradients in the same places, the same type at the same sizes,
the same pills, the same spacing. And both grounds still pass the contrast test.
