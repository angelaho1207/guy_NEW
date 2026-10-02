# Brief — close the gap to the approved mockups, exactly

A prompt for Claude Code. Written 2 Oct 2026, after two passes that got the
tokens and most of the structure but not the look.

**The approved design:** https://claude.ai/artifact/28WgeCCBmohqTAbepNKkNf

Read every artboard with the Artifact tool (`action: "read"` with `path`), not
WebFetch. They are HTML with inline styles, so they are an exact specification —
every hex value, pixel size, weight and padding is in there. Read all seven
before changing anything:

```
project/Main.dc.html
project/Connect-Midnight.dc.html     project/Connect-Daylight.dc.html
project/Contacts-Midnight.dc.html    project/Contacts-Daylight.dc.html
project/Login-Midnight.dc.html       project/Login-Daylight.dc.html
```

**The artboard wins every disagreement with this document.**

## 1. Fix the gradients first — they are the reported problem

The user reports "some of the blocks that should be gradients are solid purple."
Diagnose before changing anything, but the leading hypothesis is this:

`--celebrate` is `linear-gradient(140deg, #f8c4ff 0%, #f0b6e0 100%)`. Those two
stops are nearly the same hue and lightness. Over a large area — the sign-in
hero especially — that reads as a flat purple-pink block, not a gradient. The
artboards do not use one gradient everywhere. They use **different, wider
gradients in different places**:

- **The sign-in hero** (`Login-Midnight.dc.html`) is three stops over 300px,
  fading into the page ground:
  `linear-gradient(165deg, #F8C4FF 0%, #C9B6F0 48%, #0B0B0D 100%)` — and on
  daylight the same two first stops ending at `#FFFFFF`. That final stop is the
  page background, which is why it reads as a wash rather than a band. The app
  currently paints `--celebrate` there, which is why it looks like a solid slab.
- **The confirmation meter** is pink into amber, horizontally:
  `linear-gradient(90deg, #F8C4FF 0%, #FFD88A 100%)`. The app uses
  `--celebrate`, which is the wrong axis and the wrong colours.
- **Avatars** use the three two-stop gradients, which are correct as they are —
  small discs, where a tight gradient is right.

So: add the gradients the artboards actually contain as their own tokens
(`--hero-wash`, `--meter-fill`, whatever else a read turns up), one per theme,
with the hero's last stop being that theme's background. Keep `--celebrate` for
pills and small surfaces where a tight gradient belongs.

If diagnosis shows something else is also wrong — a `background-color` holding a
gradient value, which silently does nothing, is the other classic cause — fix
that too and say what it was.

## 2. Then do a systematic element-by-element diff

Not "make it look more like the design". For each artboard, walk its elements in
order and compare against the live component: font size, weight, letter-spacing,
line-height, padding, gap, radius, border, background, colour. Fix each
mismatch. Values from the artboards that matter and are easy to miss:

**Connect**
| Element | Spec |
|---|---|
| Confirm card | padding 20, radius 12, `--surface`, 1px `--celebrate-edge`, `box-shadow: 0 0 28px` glow |
| "Share with X?" | 30px display, 600, −0.02em, line-height 1.04, breaking to two lines |
| Countdown pill | padding 5px 12px, 13px, **700** |
| Meter | 3px, track `--border`, pink→amber fill |
| Body line | 14px `--text-secondary` |
| Confirm button | min-height 46, 16px, **700**, flex-grow |
| "Not now" | min-height 46, padding 0 20, 15px, 500, `--border-strong` |
| "Who else is here" | 34px display, 600, −0.03em |
| Live line | 7px dot + 13px `--text-secondary` |
| Person row | padding 13px 14px, radius 12, gap 12, avatar 40px |
| Row name / distance | 16px 600 / 13px `--text-muted` |
| Row Connect button | min-height 44, padding 0 18, 14px, 700 |
| "Already" pill | padding 5px 12px, 12px, 600, plain border |
| Eyebrow | 13px, 600, 0.08em tracking, `--text-muted` |

**Contacts**
| Element | Spec |
|---|---|
| h1 | 44px display, 600, −0.03em, line-height 1.0 |
| Lede | 14px `--text-secondary` |
| Row card | padding 14, radius 12, gap 12, avatar 42px, 14px 700 initials |
| Row name / timestamp | 17px 600 / 12px `--text-muted` |
| Row context | 13px `--text-secondary` |
| Row pills | padding 4px 11px, 11px, 600 |
| Shared-fields card | eyebrow, then rows with a **92px** label column, label 13px `--text-secondary`, value 14px |
| Attention row vs quiet row | the one wanting attention takes a stronger border; the quiet one sits on `--surface` with a plain one |

**Bottom bar and badges**: links min-height 44, padding 10px 14px, radius 999,
14px; badge min-width 20, height 20, padding 0 6, 11px, 700, `--accent` filled.

**Sign in**: the wash is 300px tall with the wordmark 44px from the top, the
headline at 52px/600/−0.03em/line-height 0.98 below it, and the reassurance line
at the foot of the screen.

## 3. Make every screen reviewable without data

The user has no contacts, follow-ups or 1:1s on their real account, so most of
the UI cannot be looked at. Two things fix that, and both are worth doing.

**A dev-only `npm run dev:demo` script.** The demo database already seeds four
people, a follow-up and a 1:1 through the real functions, and it runs when
`SUPABASE_DB_URL` is unset — but it is set in `.env.local`, so the normal dev
server never uses it. Add a script that starts the dev server with it unset, so
every populated screen can be seen in one command. **It must use a different
port and a different `.next` directory from `npm run dev`** — see the trap
below.

**A dev-only `/preview` route.** One page rendering every component in every
state: all three avatar gradients, every pill tone, a card, a live confirmation
prompt mid-countdown, the meter at several widths, buttons in both variants, an
eyebrow, the hero wash, the `-` for a shared-but-empty field. It must refuse to
render in production (`process.env.NODE_ENV === 'production'` → `notFound()`),
and it must not be linked from the navigation. This is how the design gets
checked from now on, in both themes, without needing someone to have met anyone.

## 4. Constraints — unchanged, and still not negotiable

- **No literal colours in any `.tsx`, and none in any CSS rule outside the two
  token blocks.** Verify at the end:
  `grep -rn "#[0-9a-fA-F]\{3,8\}\|rgba\?(" apps/web --include=*.tsx --include=*.css`
  returns only the token blocks.
- Both themes carry identical token names. Every new colour goes into both.
- **Every new ink goes into the contrast test**, not around it. A gradient's ink
  is checked against that gradient's darkest stop. Do not lower a threshold to
  make something pass; change the colour.
- **Nothing in `supabase/`, no SQL, no change to any server action's behaviour.**
  Read `CLAUDE.md` first.
- Keep the navigation arrangement and the copy. Wording in the nearby panel, the
  confirmation prompt and the consent explanations is deliberate — presentation
  changes, words do not.
- The top bar is tight at 375px with breakpoints at 560 and 400 holding it.
  Check it again after any type change.
- `npm test` must pass. Note that two database test files occasionally time out
  under parallel load; re-run before believing a failure, and check in isolation
  with `npm run test:db`.

## 5. The trap, which has now cost time twice

**`next build` and `next dev` both write to `apps/web/.next` and corrupt each
other.** The symptom is the dev server serving a 404 for its own stylesheet and
throwing `Cannot find module './385.js'` — which looks exactly like a
catastrophic CSS bug and is not one. The page renders as unstyled black text on
white.

So: stop the dev server before building, and never run two dev servers from this
directory at once. If `dev:demo` is added, give it its own `distDir` (via
`NEXT_DIST_DIR` or a separate config) and its own port so the two can coexist.

## 6. Report honestly

At the end, say:

- what the solid-purple bug actually was
- which artboard values were matched, and any you deliberately did not match and
  why
- what you verified (tests, build, served CSS, rendered markup)
- **what you could not check without eyes on a browser** — be specific rather
  than general about this

Do not claim the design matches. You cannot see it. Say what you changed and let
the user judge.
