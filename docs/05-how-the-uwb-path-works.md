# How the UWB path works

Answering Q7. The short version is that ultra wideband is a tape measure, not a
walkie-talkie, and almost everything people assume it does is actually done by
something else.

## The one surprising fact

**Nearby Interaction cannot find the other phone, and cannot carry any data.**

It does exactly one thing: given a phone you have *already* made contact with
by some other means, it tells you how far away it is, accurate to roughly ten
centimetres, and on some models which direction it is in.

That means UWB is a sensor. It is the thing that answers "are these two phones
touching right now". It is not the thing that finds the other person, and it is
not the thing that moves the profile data. Both of those are jobs for other
parts of the stack.

## The five steps

Say Ana and Ben are both holding phones with Guy open.

**1. Each app creates a session and gets a token.**
Each device makes an `NISession` and reads its `discoveryToken`. The token is
an opaque, ephemeral handle for "this device, in this session, right now". It
is not an account, not a device id, and not stable across sessions. It is
meaningless to anyone who does not already have a session running.

**2. The phones find each other, over something that is not UWB.**
This is the part people assume UWB does. It does not. Discovery runs over
Bluetooth, usually through MultipeerConnectivity or CoreBluetooth directly.
The `ios-spike/` harness uses MultipeerConnectivity because it is the shortest
path to a working spike.

**3. They swap discovery tokens over that Bluetooth channel.**
Ana's app sends Ana's token to Ben's app and vice versa. Still no ranging, and
still nothing to do with UWB.

**4. Now ranging starts.**
Each side calls `session.run(NINearbyPeerConfiguration(peerToken:))` with the
token it just received. From here the UWB radios talk to each other, and each
app's delegate starts receiving a stream of distance readings, several times a
second.

**5. The app decides "that was a tap".**
Nothing tells you two phones touched. You get a distance, and you pick a
threshold and a dwell time. Those two numbers are `TAP_DISTANCE_METRES` and
`TAP_DWELL_MS` in `packages/shared/src/connect.ts`. The dwell requirement is
what stops a phone carried past you from raising a prompt. When it fires, the
app raises the confirmation prompt, both people confirm, and only then does the
server create the two connection rows.

Steps 1 through 3 take a moment. Step 4 to first reading is one of the things
the spike measures.

## What actually carries the data

Nothing goes over UWB or Bluetooth except the discovery tokens. The profile
exchange itself is an ordinary server call, exactly the same one the QR path
makes. Both phones talk to Supabase. `open_exchange()` opens the handshake,
each side calls `confirm_exchange()`, and the second confirmation creates both
connection rows.

So the UWB path and the QR path differ only in how the two phones first learn
about each other. Everything after that is shared:

| | UWB path | QR path |
|---|---|---|
| Finding the other person | Bluetooth discovery | Camera reads a code |
| Confirming it is a deliberate tap | Distance under a threshold | The scan itself |
| Proving which account | Short-lived single-use token | Short-lived single-use token |
| Both people confirm | Same | Same |
| Creating the connection | Same | Same |

Only the first two rows differ, and both of those live on the phone. Everything
from "prove which account" onward is literally the same function.

## Proving which account the other phone belongs to

Look again at step 3. The two apps swapped discovery tokens over Bluetooth. A
discovery token says "this radio", not "this Guy account". Something has to
carry the claim *"the phone you are ranging against belongs to @ana"*, and
whatever carries that claim is what an attacker would forge.

An earlier version took the peer's account id as an argument and believed it.
That let a modified client call the server with any account id at all and raise
a confirmation prompt on a stranger's phone, with no UWB, no Bluetooth and no
proximity involved. Nothing leaked, because the stranger still had to confirm,
but it was a spam and social-engineering vector.

**Now both paths redeem a connect token**, and neither accepts an account id.

1. When the connect screen opens, the app mints a token from the server. Random,
   single use, short lived.
2. During step 3, each phone broadcasts that token alongside its discovery
   token.
3. Once ranging says the phones touched, the app calls
   `public.open_exchange(token, 'uwb')` with the token it received.
4. The server resolves the token to an account. A client that names an account
   gets nowhere, because an account id is not a token and simply does not
   resolve.

A client that keeps the connect screen open past the token's life re-mints,
which retires the previous one. Only the current token is ever redeemable.

The `method` argument records how the two met, for the connection row and the
UI. It is not a trust input, and a client that misreports it gains nothing.

### What this does and does not buy

It makes the two paths structurally identical: one trust model to reason about
rather than two. To open an exchange with someone you must present a token you
could only have obtained by reading their screen or by being in Bluetooth range
of their phone.

The honest caveat: a Bluetooth broadcast can be overheard at range, while a QR
code has to be pointed at. So the UWB token has a wider exposure than the QR
one. Three things bound it. The token is single use, so whoever redeems it
first spends it. It expires quickly. And redeeming it only opens a handshake
that the other person still has to confirm, on a prompt naming someone they are
not standing next to.

That is why the token life is kept short rather than stretched for convenience,
and why the refresh interval sits just inside it rather than well inside it.
Both numbers live in `packages/shared/src/connect.ts`, with a test that fails if
they drift from the database.

## What is left

The spike. It decides *when* the prompt can be raised and therefore how long a
token has to stay live: a foreground-only flow mints when the connect screen
opens, while a backgrounded flow would need a token alive for longer and would
widen the exposure above. The mechanism does not change either way, only the
tuning.
