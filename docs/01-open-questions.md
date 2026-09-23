# Open questions

The brief says to stop and ask rather than guess. These are the points where
the specification does not determine the behaviour, ordered by how much damage
the wrong choice does.

Each one says what is blocked. Where I had to proceed to keep building, I have
said which way I went and where the single line of code is that changes it.

---

## Q1 — Does turning a "shareable" toggle off retract what was already shared?

**This is the one I would most like answered before the tap flow is built.**

The brief says a connection holds "a copy of whichever of the other person's
fields were shareable **at the moment of the exchange**", and that this copy
live-updates when they edit their profile later.

Read literally, that means two different things are frozen and live:

- **Which fields** are shared: frozen at the exchange.
- **The values** in those fields: live, always current.

That combination has a consequence worth stating plainly. Suppose I share my
phone number with you on Monday. On Tuesday I turn the phone toggle off. On
Wednesday I change my number. Under the literal reading, you now see my *new*
number, because the field is still in your frozen set and values are live.
Turning the toggle off did nothing for our existing connection. It only
affects people I meet from Tuesday onward.

There are three coherent options:

| | Behaviour | Feels like |
|---|---|---|
| **A** | Frozen set, live values. Toggling off affects only future exchanges. | Giving someone your number. You can't un-give it. |
| **B** | Effective set = frozen set ∩ currently shareable. Toggling off hides the field from everyone, immediately. | A permission you can revoke. |
| **C** | Frozen set, and values frozen too for any field you later revoke. | They keep what they were given, but it stops updating. |

**Currently implemented: A**, because it is what the document literally says.

**My recommendation is B.** An app whose whole premise is consent should make
the consent toggle mean something after the fact, and a user who switches a
field off will almost certainly expect it to disappear from the people who have
it. A is the more surprising behaviour, and the surprise runs in the direction
of leaking rather than withholding.

Changing to B is a one-line change in `public.project_shared_profile`: intersect
the passed field list with a lookup against `profile_field_shares`. Changing to
C means snapshotting values at revocation time and is the most work.

**Blocks:** nothing structurally, but it should be settled before real users
exist, because migrating people's expectations afterwards is unpleasant.

---

## Q2 — The reminder notification says `[First] [Last]`, but a profile has one `name` field

The brief specifies the push copy as "To do: Follow up with [First] [Last]."
The data model has a single optional `name`, not a first and last name.

Related: a name is also a shareable field, and it is optional. So there are
three cases the copy does not cover.

- They shared a name: fine.
- They left the name blank: nothing to say.
- They did not share the name field at all.

**Currently implemented:** the notification uses the single `name` field, and
falls back to their username when the name is blank *or* was not shared. So it
reads "Follow up with Bob Birch." or "Follow up with bob." A notification
never shows a name the recipient has no right to see, which is
`public.display_name_for()` and is covered by a test.

**Questions:** should the profile collect first and last name separately? And
is falling back to the username the right thing, or should it say something
like "Follow up with your contact from Sept 14"?

**Blocks:** nothing. The fallback is safe. But the copy is yours to specify.

---

## Q3 — Discord: plain text, or also collect the numeric ID?

This is the open question the brief itself raises. A Discord username cannot be
turned into a profile link; the numeric user ID can
(`discord://-/users/{id}`, or `https://discord.com/users/{id}`).

**Currently implemented:** Discord is stored and shown as plain, non-tappable
text. `linkFor('discord', ...)` returns `null` on purpose, and the test says
why, so the UI renders text rather than a link that fails.

**Options:** leave as text; or add a second optional `discord_id` field, which
means one more field in the enum, one more row in the share table, and asking
users for a value most of them will have to go and look up.

**Blocks:** the handles section of the profile editor, mildly. Text is a fine
default to ship with.

---

## Q4 — `declined` is missing from the 1:1 status list

The brief lists the statuses as pending, approved, scheduled, expired, and
separately says "approval, decline, and scheduling all trigger a push
notification." A declined request has nowhere to go.

**Currently implemented:** I added `declined` to the enum. A declined request
is terminal and frees the pair to send a new one.

**Question:** confirm that is what you want, rather than a decline simply
deleting the request.

**Blocks:** nothing.

---

## Q5 — What exactly does the 2-week outer limit limit?

The brief says the 3-day scheduling window and the 2-week outer limit both
start at approval, but only says what the 3-day one does.

**Currently implemented:** the meeting itself must be scheduled to occur no
later than 14 days after approval. Proposing a time beyond that is refused with
"The 1:1 must fall within 2 weeks of approval."

**Alternative readings:** the request is deleted 2 weeks after approval
regardless; or a scheduled meeting can be rescheduled freely within 2 weeks.

**Blocks:** nothing, but my reading is a guess.

---

## Q6 — What happens when two people who are already connected tap again?

Not addressed. It will happen, by accident and on purpose.

**Currently implemented:** the exchange completes, the frozen field set is
refreshed to whatever each person currently shares, and all existing notes,
reminders and follow-up intent are left untouched.

That choice has a subtlety worth flagging: it means re-tapping is the way to
*re-widen* a field set, but it also silently re-widens it, since a person who
had withheld a field and later turned it back on will share it on the next tap
without being told.

**Question:** should a repeat tap say "you already know this person" and offer
to do nothing?

**Blocks:** nothing.

---

## Q7 — How does the UWB path prove who the nearby device belongs to?

Nearby Interaction gives you a discovery token and a distance. It does not tell
you which Guy account is holding the other phone. Something has to carry that
claim across, and whatever carries it is the thing an attacker would forge.

`public.open_uwb_exchange(p_other uuid)` currently takes the peer's user id on
trust from the client. As written, a modified client could call it with any
account id and make a confirmation prompt appear on a stranger's phone. That is
a spam and social-engineering vector, not a data leak: nothing is shared unless
that stranger taps confirm.

Fixing it properly probably means the same short-lived token idea as the QR
path, passed over the Bluetooth channel during discovery, so the server checks
a token rather than believing a user id.

**Blocks:** shipping the UWB path to real users. It does not block the spike,
and the fix depends on the spike's outcome, so it is deliberately still open.

---

## Q8 — How long should a QR code live?

The brief says short-lived or rotating, regenerated each time the code screen
opens, and leaves the duration open.

**Currently implemented:** 120 seconds, single use, and opening the code screen
again immediately retires the previous code. Callers may request 15 to 300
seconds.

**Question:** 120 seconds is a guess at "long enough to hold your phone out
across a noisy room, short enough that a screenshot is worthless." Tell me if
you want it tighter.

**Blocks:** nothing.

---

## Q9 — Username rules

Not specified anywhere.

**Currently implemented:** 3 to 30 characters, lowercase letters, digits, dot
and underscore, case-insensitively unique. Rejected at signup.

**Question:** is that the shape you want, and is there a reserved list
(`admin`, `support`, `guy`)?

**Blocks:** nothing.

---

## Q10 — Two smaller reminder questions

The duration is "x days plus y hours". Nothing says whether hours may exceed
23, and nothing says what happens after a reminder is marked done.

**Currently implemented:** hours is 0 to 23, because a days-plus-hours picker
implies it. One reminder slot per connection; marking it done leaves it in
place, and setting a new one overwrites it and clears the done state.

**Question:** after marking a follow-up done, should the connection be able to
carry a fresh reminder straight away, or is one reminder per connection the
lifetime rule?

**Blocks:** nothing.

---

## Q11 — Does the web app do the tap/connect flow at all?

The brief lists the tap/connect flow as "all platforms", but lists contacts and
undone follow-ups as "web and mobile" specifically, which implies the split is
meaningful.

A browser can display a QR code and, with camera permission, scan one. UWB is
iPhone-only regardless.

**Question:** for v1, is web read-and-manage only (contacts, notes, reminders,
1:1), with connecting done on the phone? That is the smaller, more likely
answer, and it is what I would build unless told otherwise.

**Blocks:** the web app's navigation. Not yet started, so not urgent.

---

## Q12 — What happens to a connection when someone deletes their account?

Not addressed. Today the schema cascades: deleting an account removes the
profile, which removes both connection rows, which removes the other person's
notes about them.

That is almost certainly wrong. Those notes are the other person's own writing
about their own life, and the brief is emphatic that notes belong to their
author. Deleting my account should probably not delete your diary.

**Question:** on account deletion, should the other person keep their notes
against a tombstoned contact showing only a username or "deleted account"?

**Blocks:** nothing yet, but it is a data-loss bug waiting to happen, and I
would rather fix it before there is data to lose.

---

## Q13 — Smaller things I picked a default for

| | Chose | Note |
|---|---|---|
| `class_year` type | text | "2027", "Grad '26" and "5th year" all show up in practice |
| "How you met" date | defaults to today, editable | Day-level, per the brief |
| Note entry date | defaults to today | Day-level, per the brief |
| Push notification title | "To do" for reminders, "Guy" otherwise | Brief gives the body copy only |
| Notes ordering | newest first | Unspecified |
