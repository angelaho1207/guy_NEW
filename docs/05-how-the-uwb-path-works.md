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
threshold and a dwell time: something like "under 10cm for at least half a
second". When that fires, the app raises the confirmation prompt. Both people
confirm, and only then does the server create the two connection rows.

Steps 1 through 3 take a moment. Step 4 to first reading is one of the things
the spike measures.

## What actually carries the data

Nothing goes over UWB or Bluetooth except the discovery tokens. The profile
exchange itself is an ordinary server call, exactly the same one the QR path
makes. Both phones talk to Supabase. `open_uwb_exchange()` opens the handshake,
each side calls `confirm_exchange()`, and the second confirmation creates both
connection rows.

So the UWB path and the QR path differ only in how the two phones first learn
about each other. Everything after that is shared:

| | UWB path | QR path |
|---|---|---|
| Finding the other person | Bluetooth discovery | Camera reads a code |
| Confirming it is a deliberate tap | Distance under a threshold | The scan itself |
| Proving which account | **unsolved, see below** | Short-lived single-use token |
| Both people confirm | Same | Same |
| Creating the connection | Same | Same |

That last column is why the QR path was built first and is fully tested, while
the UWB path stops at the server boundary.

## Where the hole is

Look again at step 3. The two apps swapped discovery tokens over Bluetooth. A
discovery token says "this radio", not "this Guy account". Something has to
carry the claim *"the phone you are ranging against belongs to @ana"*, and
whatever carries that claim is what an attacker would forge.

Right now `public.open_uwb_exchange(p_other uuid)` takes the peer's account id
as an argument and believes it. A modified client can call it with any account
id at all and make a confirmation prompt appear on a stranger's phone, with no
UWB, no Bluetooth and no proximity involved.

To be clear about the blast radius: this is a nuisance, not a data leak.
Nothing is shared unless that stranger taps confirm on a prompt naming someone
they are not standing next to. But it is a spam and social-engineering vector,
and it should not ship.

## How I would fix it

Reuse the QR path's answer, because it is the same problem.

The QR path already solves "prove which account" with a short-lived, single-use
token minted by the server. A screenshot of a code is worthless because the
token expires and can only be spent once. The UWB path can do the same thing,
with the Bluetooth channel standing in for the camera:

1. When the connect screen opens, the app mints a token, exactly as the code
   screen does today.
2. During step 3, each phone sends that token alongside its discovery token.
3. Once ranging says the phones touched, the app calls
   `open_uwb_exchange(p_token text)` with the token it received.
4. The server resolves token to account. It never takes an account id from a
   client.

That makes the two paths structurally identical, which is worth something on
its own: one trust model to reason about rather than two. `mint_qr_token()`
would want a more honest name, since it would no longer be QR-specific.

The one thing to watch is that a token broadcast over Bluetooth is observable
by anything in radio range, unlike a QR code which has to be pointed at. Single
use plus a short expiry plus the fact that both people still have to confirm
makes that acceptable, but it is the reason the expiry should stay short rather
than being relaxed for convenience.

## Why this is still open

Two reasons, and only one of them is the spike.

The spike decides *when* the prompt can be raised, which changes where in the
flow the token is minted and how long it has to stay valid. If both apps must
be in the foreground, the token can be minted when the connect screen opens and
live for a minute. If backgrounding works, the token has to survive longer, and
its exposure window grows.

The second reason is that this is a product decision as much as a security one.
Making the UWB path token-based means the app has to have reached the server
before two people can tap, which rules out connecting on a conference floor
with no signal. That may be a fine trade, or it may not be, and it is not my
call to make silently.

Say the word and I will implement the token version. It does not depend on the
spike's outcome, only on the exposure window, so it can be built now and tuned
after.
