# Guy, as an installable app

The web app in a native shell, so Guy can be downloaded from a store and live on
a home screen instead of being a tab with a URL bar.

## What this is, and is not

The screens are the web app, loaded in a WebView. That is a first step, chosen
because the web app is finished and rewriting ten screens in React Native to
look identical would buy nothing today.

What the shell adds, and a website cannot have on iOS:

- **Native push.** A WebView cannot receive web push at all, so without the
  shell the app would be worse at notifications than the site it wraps.
- **Camera and location held by the app**, declared in `app.json` with reasons
  the person reads at the prompt.
- **A store listing and an install** that survives, rather than a bookmark.

Screens can be replaced with native ones one at a time. The one that will have
to be is the tap: ultra-wideband has no web API, so whenever Nearby Interaction
gets built it lands here.

## It is NOT a workspace

`apps/mobile` is deliberately outside the npm workspaces in the root
`package.json`. React Native pins its own React and Metro resolves differently;
sharing one `node_modules` with Next is a well-known source of two-Reacts bugs
that appear as blank screens. It gets its own install.

```
cd apps/mobile
npm install
```

## Run it today, without paying anything

```
cd apps/mobile
npm start
```

Scan the QR with the **Expo Go** app from the App Store. The real app, on your
real phone, no developer account. This is the fastest way to see whether the
shell is worth building out.

What will not work in Expo Go: push notifications, because they need a project
id and credentials that only exist after `eas init` and a paid account.

## What still needs the $99

In order:

1. **Apple Developer Program**, $99/year, recurring. Enrol at developer.apple.com.
2. `npx eas login` then `npx eas init` — writes a real `projectId` into
   `app.json`, replacing the `set-by-eas-init` placeholder.
3. `npm run build:ios` — EAS builds and signs on their machines, about twenty
   minutes. **No Mac required**, which is the reason this is Expo and not
   Capacitor.
4. `npx eas submit --platform ios` → TestFlight. Internal testers need no review.
5. App Store Connect: screenshots, description, the privacy policy at
   `/privacy`, and the App Privacy questionnaire. Declare location as used, not
   linked to identity, not used for tracking.
6. Submit. First review is usually one to three days.

Android is $25 once, and `npm run build:android` produces an APK you can install
directly without any account at all.

## The one piece of server work left

`registerForPush` sends its token to `/api/push/register`, which stores it with
`platform` of `ios` or `android`. That half works today.

The other half does not: the worker at `apps/web/app/api/push/drain` only knows
how to send **web** push. Sending to a native token needs an APNs or FCM branch
there, and credentials that only exist once the Apple account is paid for. So
tokens are collected correctly now and messages start arriving the day that
branch is written. Nothing in this app has to change for it.

## Will Apple reject it?

Guideline 4.2 turns away apps that are only a website in a frame, so it is a
real risk and worth knowing rather than discovering.

What answers it: native push, camera and location held by the app, and — when it
exists — the tap, which cannot be done on the web at all. What would not answer
it is shipping this shell with none of that wired up.

## Checked, and not checked

Installs and resolves on Expo SDK 57, React Native 0.86, React 19.2.

Not checked: anything that needs a device or a build. Nobody has run this in
Expo Go, no build has been made, and the cookie sharing that `/api/push/register`
depends on — `sharedCookiesEnabled` on iOS — has not been confirmed on real
hardware. Verify that before trusting push registration.
