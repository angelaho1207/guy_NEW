import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Native push registration.
 *
 * This is the main reason the shell exists rather than an Add to Home Screen
 * shortcut. A WebView on iOS cannot receive web push at all, so without this the
 * app would be strictly worse at notifications than the website it wraps — and
 * it is also the clearest answer to App Review's "this is just a website"
 * question.
 *
 * ## What it does not do yet, and why that is fine
 *
 * The token goes to `public.register_push_token(token, 'ios' | 'android')`,
 * which has accepted a platform since 0001 and needs no change. The part that
 * is missing is the other end: the worker in apps/web/app/api/push/drain only
 * knows how to send web push. Sending to a native token means an APNs or FCM
 * branch there, which needs credentials that only exist once the Apple account
 * is paid for.
 *
 * So this registers and stores correctly today, and the messages start arriving
 * the day that branch is written. Nothing here has to change for that.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for permission, gets a token, and hands it to the site.
 *
 * Returns quietly rather than throwing: failing to register for notifications
 * must never stop the app opening.
 */
export async function registerForPush(site: string): Promise<string | null> {
  // A simulator has no push token. Asking produces a confusing error rather
  // than a useful one.
  if (!Device.isDevice) return null;

  try {
    if (Platform.OS === 'android') {
      // Android will not show anything without a channel, and silently drops
      // the notification rather than telling you.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#F8C4FF',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }

    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    // Before `eas init` has run there is no project id and no token to get.
    // Not an error: the app works, it simply cannot be notified yet.
    if (!projectId || projectId === 'set-by-eas-init') return null;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await send(site, token);
    return token;
  } catch {
    return null;
  }
}

/**
 * Hands the token to the site, as the signed-in person.
 *
 * Posting to the site rather than to Supabase directly is what makes this safe:
 * the request carries the session cookie the WebView already holds, so the
 * server knows who this is. The app never sees a key, and a token cannot be
 * registered against somebody else's account.
 */
async function send(site: string, token: string): Promise<void> {
  await fetch(`${site}/api/push/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  }).catch(() => undefined);
}
