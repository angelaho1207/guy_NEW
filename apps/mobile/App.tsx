import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import Constants from 'expo-constants';
import { registerForPush } from './push';

/**
 * Guy, as an app you install rather than a tab you keep.
 *
 * ## What this is, honestly
 *
 * The screens are the web app, running inside a native shell. That is a
 * deliberate first step, not the end state: the web app is finished and
 * rewriting ten screens in React Native to look identical would buy nothing
 * today. What the shell buys is the things a website cannot have — a home
 * screen presence that survives, native push, and a route into the App Store.
 *
 * Screens can be replaced with native ones one at a time afterwards, and the
 * one that will have to be is the tap: ultra-wideband has no web API, so
 * whenever that gets built it lands here rather than in the browser.
 *
 * ## Why Apple might reject this, and what answers it
 *
 * Guideline 4.2 turns away apps that are only a website in a frame. What makes
 * this not that: it registers for native push and delivers notifications the
 * web cannot on iOS, it holds the camera and location permissions itself, and
 * it keeps working as an installed app with its own identity. Those are real
 * capabilities, declared in app.json, not decoration.
 */

const SITE: string =
  (Constants.expoConfig?.extra as { siteUrl?: string } | undefined)?.siteUrl ??
  'https://guynew-virid.vercel.app';

const BG = '#0B0B0D';
const INK = '#F2F1EE';
const MUTED = '#9A9A9E';

/** Is this a page of ours, or somewhere else the person tapped through to? */
function isOurs(url: string): boolean {
  try {
    return new URL(url).origin === new URL(SITE).origin;
  } catch {
    return false;
  }
}

export default function App() {
  const webview = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Asked for once the shell is up rather than on the very first frame, so the
  // permission prompt does not land before the person has seen what the app is.
  useEffect(() => {
    const timer = setTimeout(() => {
      void registerForPush(SITE);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Android's back button should walk back through the app, not close it.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webview.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // A link to somewhere else opens in the real browser. Letting an arbitrary
  // site load inside this frame would be both confusing and the kind of thing
  // app review asks about.
  const onNavigate = useCallback((event: WebViewNavigation) => {
    if (!event.url.startsWith('http')) return true;
    if (isOurs(event.url)) return true;
    void Linking.openURL(event.url);
    return false;
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    webview.current?.reload();
  }, []);

  if (failed) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.fill}>
          <StatusBar style="light" />
          <ScrollView
            contentContainerStyle={styles.centre}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={retry} tintColor={MUTED} />
            }
          >
            <Text style={styles.title}>No connection</Text>
            <Text style={styles.body}>
              Guy needs the internet to do anything useful — everything it shows
              you belongs to someone else, and nothing is kept on this phone.
            </Text>
            <TouchableOpacity style={styles.button} onPress={retry} accessibilityRole="button">
              <Text style={styles.buttonText}>Try again</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <WebView
          ref={webview}
          source={{ uri: SITE }}
          style={styles.fill}
          // The page paints its own background; this stops a white flash on the
          // way in, which is jarring on a dark app opened in a dim room.
          containerStyle={styles.fill}
          // Camera for the QR scanner, location for nearby. Without these the
          // two features that matter most silently do nothing.
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          geolocationEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Keeps the session across launches, so people are not signed out
          // every time they close the app.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          pullToRefreshEnabled
          onShouldStartLoadWithRequest={onNavigate}
          onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
          onLoadEnd={() => {
            setLoading(false);
            setRefreshing(false);
          }}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
          onHttpError={({ nativeEvent }) => {
            // A 500 from our own server is worth showing as a failure rather
            // than rendering the error page inside a frame with no way out.
            if (nativeEvent.statusCode >= 500) setFailed(true);
          }}
        />
        {loading && (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color={MUTED} />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BG },
  centre: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: INK, fontSize: 28, fontWeight: '600', marginBottom: 10 },
  body: { color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  button: {
    minHeight: 44,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: BG, fontSize: 16, fontWeight: '700' },
  loading: {
    // Written out rather than spreading StyleSheet.absoluteFillObject, which
    // this version of React Native no longer types.
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
});
