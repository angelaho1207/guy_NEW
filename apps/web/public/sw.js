/*
 * The service worker. Its whole job is notifications.
 *
 * Deliberately not a caching layer. A cache that serves a stale Connect screen
 * would hand someone an expired code, or hide a confirmation prompt that is
 * counting down, and both of those are worse than being offline. Everything
 * here is about receiving a push and opening the right screen.
 */

self.addEventListener('install', () => {
  // Take over straight away rather than waiting for every tab to close, so
  // turning notifications on works without a reload.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with no readable body still deserves to show something, since the
    // alternative is a silent notification the browser may complain about.
  }

  const title = payload.title || 'Guy';
  const body = payload.body || '';
  const url = (payload.data && payload.data.url) || '/follow-ups';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      // Collapses repeats of the same reminder rather than stacking them.
      tag: (payload.data && payload.data.tag) || 'guy',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/follow-ups';

  event.waitUntil(
    (async () => {
      // Focus an existing window if one is open, rather than opening a second
      // copy of the app on top of the first.
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
