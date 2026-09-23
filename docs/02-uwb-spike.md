# The Nearby Interaction spike

The brief puts this first: find out whether a Nearby Interaction session
between two instances of Guy can be established and stay live while one or
both apps are backgrounded, or whether both apps must be open in the
foreground. Then stop and report, because the answer changes the tap UX.

## I could not run it, and here is exactly why

The spike needs macOS with Xcode, an Apple Developer Program membership for
provisioning, and two physical iPhones with a U1 or U2 chip. This machine is
Windows 11 with no Xcode, no Apple toolchain and no devices attached. The
brief is right that the Simulator cannot answer this; there is no substitute I
can run here.

So I have not answered the question. What follows is the prior I would go in
with, and a protocol precise enough that whoever has two iPhones can settle it
in about twenty minutes. The harness in [`ios-spike/`](../ios-spike/) is ready
to build.

## What I expect the answer to be, and why you should still check

**My strong expectation: both apps must be in the foreground.** Treat this as
a hypothesis to falsify, not as the finding. Three things point at it.

1. `NISession` is documented as suspending when its app leaves the foreground.
   The delegate receives `sessionWasSuspended(_:)` on backgrounding and
   `sessionSuspensionEnded(_:)` on return, and ranging updates stop in
   between. That is the framework telling you the session is a foreground
   activity.

2. The background support Apple added for Nearby Interaction is scoped to
   *accessories*: a session with a third-party UWB accessory, paired over
   Bluetooth, with the accessory-specific background entitlements. Two iPhones
   ranging against each other is the peer-to-peer case, which that support
   does not cover.

3. NameDrop, the interaction the brief compares against, is a system feature.
   It lives in Apple's own sharing stack, and there is no public API that lets
   a third-party app be woken by two phones touching. The gesture is not
   available to Guy at any price.

The thing I am least certain about is point 1's edges: how long a suspended
session survives before it must be re-established, and whether a short
background dip mid-exchange kills the session or merely pauses it. Those
details matter for the UX and are exactly what the protocol below measures.

**Caveat worth stating:** this is from documentation and platform behaviour as
I understand it, and I cannot check Apple's current docs from here. iOS
changes. The whole point of the brief's instruction is that this gets verified
on real hardware, and nothing above substitutes for that.

## The protocol

Two iPhones, 11 or later, both running the harness, signed with your team.
Call them **A** and **B**. Keep them about 15cm apart unless a step says
otherwise. Every step is logged on screen with a timestamp; the log is what
you record.

### Setup

1. Open `ios-spike/` in Xcode, set your team and bundle id, build to both
   phones. Setup detail is in [`ios-spike/README.md`](../ios-spike/README.md).
2. Launch on both. Grant local network and Nearby Interaction permission.
3. Wait for both to show `ranging` with a live distance. That is the baseline.

### The five measurements

| # | Do this | Record |
|---|---|---|
| 1 | With both in the foreground, bring the phones together. | Does ranging start, and how long from launch to first distance reading? |
| 2 | Background A with a single press of the home gesture. Leave B in the foreground. | Does B still receive distance updates? Does A's log show `sessionWasSuspended`? |
| 3 | Return A to the foreground. | Does ranging resume on its own, and how long does it take? Did the session survive, or did the harness have to rebuild it? |
| 4 | Background A, wait 30 seconds, then return it. | Same questions. Does a longer absence change the outcome? |
| 5 | Lock A's screen with the phones together. | Anything at all on B? |

Also worth noting while you are there: whether the Bluetooth discovery layer
keeps finding the peer while backgrounded even though ranging has stopped,
since that changes which fallback is available.

### What to send back

The on-screen log from both phones for each step, plus one sentence per row of
that table. That is enough to settle the UX question.

## What each outcome means for the tap flow

**If foreground is required** (what I expect), the flow has to make that
obvious rather than failing silently in someone's hand.

- Connecting is a place you go, not something that happens to you. A single
  prominent Connect action, and the tap only works while that screen is open
  on both phones.
- The screen says what it is waiting for, in words: "Open Guy on both phones,
  then hold them together."
- The two phones being close but only one being ready is the common failure,
  so the ready phone should say "waiting for the other phone" rather than
  nothing.
- Backgrounding mid-exchange cancels it cleanly, the same as the 30 second
  timeout, and says so.
- The QR path stops being the fallback for non-iPhone users and becomes a
  co-equal path, because it has exactly the same foreground requirement and is
  easier to explain.

**If backgrounding works**, the flow can be closer to the NameDrop feel: a
prompt raised on both phones by proximity alone, with the app closed. That is
a materially better product, and it is why the brief wants the answer before
the flow is designed rather than after.

## Status

**Open. Not answered.** Nothing in the tap flow beyond the server-side
handshake has been built, which is deliberate. The database side is done and
tested, and it is indifferent to the outcome: `public.open_exchange()` redeems
a connect token and both people still confirm, whichever way the session
behaves.

The identity question this spike does not cover, how the server knows which
account the nearby phone belongs to, has been answered separately and
implemented. See Q7 in [`01-open-questions.md`](./01-open-questions.md) and
[`05-how-the-uwb-path-works.md`](./05-how-the-uwb-path-works.md).

The one thing the spike still feeds back into that design is the token's
lifetime. A foreground-only flow mints when the connect screen opens; a
backgrounded flow would need a token alive for longer, which widens how long an
overheard broadcast stays useful.
