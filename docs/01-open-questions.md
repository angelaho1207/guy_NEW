# Open questions

The brief says to stop and ask rather than guess. This file tracks those
points. Most were answered on 23 Sep 2026; the answers are recorded here and
the behaviour is implemented and tested.

**Still open:** Q7 (UWB identity). Everything else is settled.

---

## Resolved

### Q1 — Does turning a "shareable" toggle off retract what was already shared?

**Answered: yes, and the toggle is the only thing that matters.**

Turning a field off hides it from everyone who has it, immediately. Turning it
on reveals it to everyone, immediately, **including people met while it was
off**. There is no per-connection field set and no grandfathering: the exchange
decides whether you are connected, not which fields you get.

**Implemented** in `public.project_shared_profile()`, which now takes only a
user id and returns whatever that user is currently sharing. Covered by
`supabase/tests/revocation.test.ts`.

`connections.shared_fields` was renamed `fields_at_exchange` and demoted to a
historical record of what was being shared the day two people met. Nothing
reads it to decide access, and the column comment says so.

One consequence worth knowing: an unshared field reads as **absent**, not as
`-`. The empty marker means "shared but blank", and conflating the two would
make revocation look like an empty profile.

### Q2 — `[First] [Last]` in the notification, but one `name` field

**Answered: split it.** The profile now has `first_name` and `last_name`, and
they are the only required fields. Everything else stays optional.

Required means "must be filled in", not "must be shared": both still carry an
ordinary shareable toggle. If either is withheld or revoked, notifications fall
back to the username, because half a name is worse than no name.
`public.display_name_for()` applies the same test as the projection, so a push
notification can never carry a name the recipient is no longer allowed to see.

Collected at signup, since a profile cannot exist without them.

### Q3 — Discord: plain text, or collect the numeric ID?

**Answered: collect the ID**, since it is the only way to build a link.

The profile stores both. The username is what people recognise and is what
shows on screen; the numeric id is what a tap follows, to
`https://discord.com/users/{id}`. The id is **not** separately shareable: it
travels with the username, because sharing a username while withholding the
thing that makes it tappable is a setting with no sensible meaning. Withhold
Discord and both disappear together.

Without an id, the username still shares and simply renders as plain text.

### Q4 — `declined` is missing from the 1:1 status list

**Answered: decline is a real option, and a declined request silently
disappears** from both people's lists rather than sitting there reading
"declined".

The row is kept rather than deleted, because that is what frees the pair to
send a new request and it leaves a record. It is simply never listed. Clients
read `public.visible_one_on_ones` rather than the table, so "disappears" is
structural rather than something each screen has to remember.

An *expired* request does stay in the list, since someone who agreed to meet
and then ran out of time should be told so.

### Q5 — What does the 2-week outer limit limit?

**Answered: the two clocks do different jobs.** The pair has 3 days from
approval to agree on a time, and the time they agree on may be up to 2 weeks
out. That is what was already implemented, so nothing changed.

### Q6 — Two people who are already connected tap again

**Answered: a plain "Already connected!" with an OK button, and nothing else
happens.**

Both `open_qr_exchange()` and `open_uwb_exchange()` now return
`('already_connected', null)` instead of opening a handshake, so no prompt is
raised on either phone and nothing about the existing connection changes. The
scanned code is also left unspent, so a mistaken scan does not cost the other
person their live code.

`confirm_exchange()` was changed from `on conflict do update` to `on conflict
do nothing` to match: if two handshakes ever race, the safe outcome is to leave
the existing row alone.

### Q8 — How long should a QR code live?

**Answered: 120 seconds is reasonable.** Unchanged: 120 seconds, single use,
and opening the code screen retires the previous code.

### Q9 — Username rules

**Answered: confirmed, and no repeats.** 3 to 30 characters, lowercase
letters, digits, dot and underscore. Stored as `citext` with a unique index, so
`Angela` and `angela` cannot both exist. Usernames cannot be changed from the
client.

### Q10 — Reminder hours range

**Answered: hours may not exceed 23**; a longer reminder means more days.
Already implemented that way, so nothing changed.

### Q11 — Does the web app do the tap/connect flow?

**Answered: both web and app do it.** Web shows a QR code and scans one with
the camera. UWB stays iPhone-only, since it needs the U1/U2 chip.

No schema change; this shapes the web app's navigation when it is built.

### Q13 — Smaller defaults

Unchanged and still in force, except that `name` became `first_name` and
`last_name`.

| | Chose |
|---|---|
| `class_year` type | text, since "2027", "Grad '26" and "5th year" all occur |
| "How you met" date | defaults to today, editable |
| Note entry date | defaults to today |
| Push title | "To do" for reminders, "Guy" otherwise |
| Notes ordering | newest first |

### Q12 — What happens to a connection when someone deletes their account?

**Answered: your notes about them go too.** Acknowledged as not necessarily
the optimal answer, but it is what v1 will use.

That is what the schema already did, so nothing changed: deleting an account
cascades through the profile to both connection rows and to the notes hanging
off them. The cascade is now a decision rather than an accident, and it is
recorded in D10.

Worth revisiting if anyone ever loses notes they cared about, since the
alternative is a tombstoned contact showing only a username.

### Q4a — Does a decline notify the requester?

**Answered: no push on decline.** A declined request disappears from both
lists and sends nothing at all.

Approval and scheduling still notify. This narrows what the brief said, on the
grounds that turning someone down should not come with an announcement.

### Q10a — Can a connection carry a second reminder after the first is done?

**Answered: completing a follow-up frees the slot.**

`public.complete_follow_up()` marks it done and clears it from the undone list.
Setting a new reminder afterwards behaves exactly like a first one, with the
fired and done stamps cleared. Still one slot per connection, so reminders do
not accumulate into a history.

---

## Still open

### Q7 — How does the UWB path prove who the nearby device belongs to?

**Still open, and it blocks shipping the UWB path.**

[`05-how-the-uwb-path-works.md`](./05-how-the-uwb-path-works.md) explains the
mechanism end to end and where the hole is. In short: Nearby Interaction gives
you a distance, not an identity, and `open_uwb_exchange()` currently takes the
peer's account id from the client and believes it. A modified client could make
a confirmation prompt appear on a stranger's phone. Nothing leaks unless that
stranger confirms, so it is a nuisance rather than a breach, but it should not
ship.

The fix is to reuse the QR path's short-lived single-use token, passed over the
Bluetooth channel during discovery. It does not depend on the spike's outcome.
It does carry a product cost: two people could no longer tap with no signal,
because the token has to come from the server first. That trade is yours to
make.
