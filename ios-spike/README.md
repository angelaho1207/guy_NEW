# NI background spike

Throwaway measurement app for the question in
[`../docs/02-uwb-spike.md`](../docs/02-uwb-spike.md): does a Nearby Interaction
session between two iPhones survive backgrounding, or must both apps be in the
foreground?

This is not a draft of the real native module. It exists to produce an answer
and then be deleted.

## What you need

- A Mac with Xcode.
- An Apple Developer Program account, for device provisioning.
- **Two** physical iPhones, model 11 or later, for the U1 or U2 chip. The
  Simulator cannot run Nearby Interaction, so it cannot answer this.

## Setting it up

The three Swift files in `NISpike/` are the whole app. There is no `.xcodeproj`
in the repo, because a generated one would be a large binary blob that hides
the two settings that actually matter. Making one takes a minute.

1. Xcode, **File → New → Project → iOS → App**. Name it `NISpike`, interface
   **SwiftUI**, language **Swift**. Save it inside `ios-spike/`.
2. Delete the `ContentView.swift` and `NISpikeApp.swift` Xcode generated, then
   drag in all three files from `ios-spike/NISpike/`.
3. **Signing & Capabilities:** pick your team. The bundle id just has to be
   unique to you.
4. **Info tab**, add these three keys. Without them the app is denied at
   runtime and nothing works:

   | Key | Value |
   |---|---|
   | `NSNearbyInteractionUsageDescription` | Measures distance to the other phone for this spike. |
   | `NSLocalNetworkUsageDescription` | Finds the other phone running this spike. |
   | `NSBonjourServices` | array with one item: `_guy-ni-spike._tcp` |

5. Build to both phones. Accept the permission prompts on each.

## Running it

Follow the five steps in the protocol in
[`../docs/02-uwb-spike.md`](../docs/02-uwb-spike.md#the-protocol). Both phones
should reach `ranging` with a live distance before you start step 2.

The two log lines to watch for are `*** sessionWasSuspended ***` and
`*** sessionSuspensionEnded ***`, shown in red. They are the framework telling
you directly what it does when the app leaves the foreground.

**Copy log** puts the full timestamped transcript on the clipboard. Take it
from both phones after each step, and record what step 3 in particular
required: whether ranging resumed on its own, or only after you tapped
**Restart session**. That difference is the finding.

## What the state values mean

| State | Meaning |
|---|---|
| `discovering` | Looking for the other phone over Bluetooth and local network |
| `connected` | Found it, discovery tokens not yet swapped |
| `ranging` | Receiving distance updates. This is the working state |
| `suspended` | `NISession` reported suspension, which is the thing being measured |
| `unsupported` | No U1/U2 chip. Wrong phone |
