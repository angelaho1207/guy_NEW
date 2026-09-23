/**
 * The connect flow: how two phones establish which accounts they belong to.
 *
 * Both paths work the same way, deliberately. Neither ever sends an account
 * id. Each phone mints a short-lived, single-use connect token when the
 * connect screen opens, and the other phone redeems it:
 *
 *   QR   the token is the code on screen. Redeeming it requires pointing a
 *        camera at that screen.
 *   UWB  the token is broadcast over the Bluetooth discovery channel next to
 *        the Nearby Interaction discovery token. Nearby Interaction proves the
 *        phones are touching; the connect token proves whose phone it is.
 *
 * Redeeming only opens a handshake. Both people still confirm, within
 * CONFIRMATION_TIMEOUT_MS, and only the second confirmation shares anything.
 */

export type ConnectMethod = 'qr' | 'uwb';

/** What `public.open_exchange()` returns in its `status` column. */
export type OpenExchangeStatus = 'opened' | 'already_connected';

/**
 * How long a freshly minted connect token stays valid.
 *
 * Mirrors the default on `public.mint_connect_token()`, and a test fails if
 * the two drift apart. Long enough to hold a phone out across a noisy room,
 * short enough that a screenshot or an overheard broadcast is soon worthless.
 */
export const CONNECT_TOKEN_TTL_SECONDS = 120;

/**
 * When to mint a replacement while the connect screen is still open.
 *
 * The UWB path broadcasts its token continuously, so a screen left open past
 * the TTL would stop working. Re-minting before expiry keeps a live token
 * available without stretching any single token's lifetime. Minting retires
 * the previous one, so only the current token is ever redeemable.
 */
export const CONNECT_TOKEN_REFRESH_SECONDS = 90;

/** How long each person has to confirm before the exchange is cancelled. */
export const CONFIRMATION_TIMEOUT_MS = 30_000;

/** Distance under which the UWB path treats two phones as touching. */
export const TAP_DISTANCE_METRES = 0.1;

/**
 * How long the phones must stay that close before it counts as a tap.
 *
 * Ranging is noisy and people wave phones around. Requiring the distance to
 * hold briefly stops a passing phone from raising a prompt.
 */
export const TAP_DWELL_MS = 500;

/** Whether a reading should raise the confirmation prompt. */
export function isTap(distanceMetres: number | null, heldForMs: number): boolean {
  if (distanceMetres === null) return false;
  return distanceMetres <= TAP_DISTANCE_METRES && heldForMs >= TAP_DWELL_MS;
}

/** Milliseconds left to confirm; zero once the window has closed. */
export function confirmationTimeLeftMs(openedAt: Date, now: Date = new Date()): number {
  const elapsed = now.getTime() - openedAt.getTime();
  return Math.max(0, CONFIRMATION_TIMEOUT_MS - elapsed);
}
