/**
 * Design tokens, shared by the web app and the mobile app so the two cannot
 * drift apart.
 *
 * ## The rule the palette follows
 *
 * **Colour is decoration. Contrast is action.** Every button, badge and active
 * state is drawn in `accent`, which is deliberately near-neutral: near-white on
 * the dark ground, pure black on the light one. All the personality lives in
 * `celebrate`, a gradient that is never a control and never carries meaning.
 *
 * That split is what lets the app look like it belongs to the people using it
 * without looking untrustworthy. A neon "Confirm" button on a screen that is
 * about to exchange two people's personal information reads as a trick. A
 * black one does not, and the gradient behind it still says this is a good
 * moment.
 *
 * ## Two themes
 *
 * `midnight` and `daylight` carry the same keys and differ only in values.
 * Every component reads tokens, never literals, so switching the ground is a
 * token swap and nothing else — with the handful of genuine exceptions noted in
 * globals.css, where a treatment rather than a value has to change.
 *
 * A test asserts both themes against the web stylesheet, and asserts that every
 * text colour clears WCAG AA against its own background. Neon on near-black and
 * grey on white are both easy to get wrong, so that check is automated rather
 * than remembered.
 */

export type ThemeColors = {
  background: string;
  surface: string;
  /** One step above `surface`, for cards resting on a raised sheet. */
  surfaceRaised: string;
  border: string;
  /** A border that has to be seen: a hover edge, a quiet button's outline. */
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;
  /** Placeholder copy, and the shared-but-empty "-". Must clear AA. */
  textMuted: string;

  /** Near-neutral by design. Primary actions, active states, badges. */
  accent: string;
  accentPressed: string;
  /** Accent at low opacity, for a tint behind an active row. */
  accentSubtle: string;
  /** Text and icons on top of an accent fill. */
  onAccent: string;

  danger: string;
  success: string;

  /** The expressive gradient. Decoration only: never a control. */
  celebrate: string;

  /**
   * The three avatar gradients, each with the ink that sits on it.
   *
   * Which one a person gets is derived from their id, not from their position
   * in a list: a contact that changed colour when the list reordered would be
   * worse than no colour at all. See `avatarGradient`.
   *
   * All three are light in both themes, like `celebrate`, so all three inks are
   * dark in both themes.
   */
  gradBloom: string;
  gradBloomInk: string;
  gradPeriwinkle: string;
  gradPeriwinkleInk: string;
  gradDusk: string;
  gradDuskInk: string;

  /**
   * Two semantic pill families: `warn` counts down, `go` is settled.
   *
   * Each is an edge, a low-opacity fill, and the ink that has to be read on the
   * page background. Amber and green ink both fail AA on white almost by
   * default, so the light values are darkened well past their midnight
   * counterparts and the contrast test checks every one of them.
   */
  warn: string;
  warnSubtle: string;
  warnInk: string;
  go: string;
  goSubtle: string;
  goInk: string;
  /** Text laid over `celebrate`. Dark in both themes, because the gradient is. */
  celebrateInk: string;
  /** The bloom a celebratory surface casts on the ground behind it. */
  glow: string;
  /** The lit edge of a celebratory surface. Unused where it cannot be seen. */
  celebrateEdge: string;
  /** The translucent fill behind the fixed top and bottom bars. */
  scrim: string;
  /**
   * The quiet zone behind a QR code. Light in BOTH themes, with no dark
   * counterpart: a scanner needs a light field around the pattern, so this is
   * one token whose value is a fact about cameras rather than a style choice.
   */
  qrPaper: string;
  /** Ink on that quiet zone. Dark in both themes, for the same reason. */
  qrInk: string;
};

export type Theme = {
  name: string;
  /** Drives the CSS `color-scheme` property, so form controls match. */
  scheme: 'dark' | 'light';
  colors: ThemeColors;
};

export const midnight: Theme = {
  name: 'midnight',
  scheme: 'dark',
  colors: {
    background: '#0B0B0D',
    surface: '#17171A',
    surfaceRaised: '#1F1F23',
    border: '#2A2A2E',
    borderStrong: '#3A3A40',

    textPrimary: '#F2F1EE',
    textSecondary: '#9A9A9E',
    textMuted: '#8A8A90',

    accent: '#F2F1EE',
    accentPressed: '#D8D6D1',
    accentSubtle: 'rgba(242, 241, 238, 0.12)',
    onAccent: '#0B0B0D',

    danger: '#FF9B95',
    success: '#7FE0A8',

    celebrate: 'linear-gradient(140deg, #F8C4FF 0%, #F0B6E0 100%)',
    celebrateInk: '#2E0F28',

    gradBloom: 'linear-gradient(140deg, #F8C4FF 0%, #F0B6E0 100%)',
    gradBloomInk: '#3A1733',
    gradPeriwinkle: 'linear-gradient(140deg, #96C4FF 0%, #C9B6F0 100%)',
    gradPeriwinkleInk: '#15213A',
    gradDusk: 'linear-gradient(140deg, #FFD88A 0%, #F8A0C0 100%)',
    gradDuskInk: '#3A2410',

    warn: '#FFAE00',
    warnSubtle: 'rgba(255, 174, 0, 0.16)',
    warnInk: '#FFD68A',
    go: '#31C431',
    goSubtle: 'rgba(49, 196, 49, 0.16)',
    goInk: '#8FE88F',

    glow: 'rgba(248, 196, 255, 0.16)',
    celebrateEdge: '#F8C4FF',
    scrim: 'rgba(11, 11, 13, 0.85)',
    qrPaper: '#FFFFFF',
    qrInk: '#0B0B0D',
  },
};

export const daylight: Theme = {
  name: 'daylight',
  scheme: 'light',
  colors: {
    background: '#FFFFFF',
    surface: '#F6F4F8',
    surfaceRaised: '#FFFFFF',
    border: '#E4E4E8',
    borderStrong: '#CCCCCC',

    textPrimary: '#000000',
    textSecondary: '#666666',
    textMuted: '#757575',

    accent: '#000000',
    accentPressed: '#333333',
    accentSubtle: 'rgba(0, 0, 0, 0.07)',
    onAccent: '#FFFFFF',

    danger: '#B3231C',
    success: '#1E7A3C',

    celebrate: 'linear-gradient(140deg, #F8C4FF 0%, #F0B6E0 100%)',
    celebrateInk: '#2E0F28',

    gradBloom: 'linear-gradient(140deg, #F8C4FF 0%, #F0B6E0 100%)',
    gradBloomInk: '#3A1733',
    gradPeriwinkle: 'linear-gradient(140deg, #96C4FF 0%, #C9B6F0 100%)',
    gradPeriwinkleInk: '#15213A',
    gradDusk: 'linear-gradient(140deg, #FFD88A 0%, #F8A0C0 100%)',
    gradDuskInk: '#3A2410',

    warn: '#B37A00',
    warnSubtle: 'rgba(255, 174, 0, 0.18)',
    warnInk: '#7A4B00',
    go: '#1E9E35',
    goSubtle: 'rgba(49, 196, 49, 0.16)',
    goInk: '#176B33',

    glow: 'rgba(0, 0, 0, 0.1)',
    celebrateEdge: 'transparent',
    scrim: 'rgba(255, 255, 255, 0.85)',
    qrPaper: '#FFFFFF',
    qrInk: '#0B0B0D',
  },
};

export const themes = { midnight, daylight } as const;

export type ThemeName = keyof typeof themes;

export const THEME_NAMES = ['midnight', 'daylight'] as const;

/**
 * What you get before anyone has chosen, and what a browser with no JavaScript
 * renders. The app resolves the viewer's system preference into an explicit
 * choice on first paint; this is the fallback when it cannot.
 */
export const DEFAULT_THEME: ThemeName = 'midnight';

/** The mobile app and older code read this. It is the dark theme's palette. */
export const colors = midnight.colors;

export type ColorToken = keyof ThemeColors;

/** The avatar gradients, in the order `avatarGradient` indexes them. */
export const AVATAR_GRADIENTS = ['bloom', 'periwinkle', 'dusk'] as const;

export type AvatarGradient = (typeof AVATAR_GRADIENTS)[number];

/**
 * Which gradient a person's avatar gets.
 *
 * Derived from their id so it is stable: the same person is always the same
 * colour, on every screen, for every viewer, forever. Picking by list position
 * would be easier and would mean a contact changed colour whenever the list
 * reordered, which turns a useful recognition cue into noise.
 *
 * An unremarkable string hash is plenty here. Nothing depends on it being hard
 * to predict, only on it being the same answer every time.
 */
export function avatarGradient(seed: string | null | undefined): AvatarGradient {
  const text = (seed ?? '').trim();
  if (text === '') return AVATAR_GRADIENTS[0];

  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 0x7fffffff;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Button 8, card 12, hero 20, pill full — the reference's proportions. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/**
 * Two faces. Outfit is a geometric sans with slightly rounded letterforms that
 * carries confidence at large sizes, which is the whole job of the display
 * face. Hanken Grotesk is the workhorse: neutral, legible at 13px, and it has
 * the heavy weights the display face borrows for emphasis.
 */
export const fontFamily = {
  sans: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  display: "'Outfit', 'Hanken Grotesk', -apple-system, system-ui, sans-serif",
} as const;

/**
 * Display and title run large with tight tracking, which is where the
 * reference gets its character. Everything from `heading` down is ordinary and
 * should stay ordinary: these are the sizes people read paragraphs at.
 */
export const type = {
  display: { size: 44, lineHeight: 46, weight: '600', tracking: '-0.03em' },
  title: { size: 28, lineHeight: 32, weight: '600', tracking: '-0.02em' },
  heading: { size: 18, lineHeight: 24, weight: '600', tracking: '0' },
  body: { size: 16, lineHeight: 24, weight: '400', tracking: '0' },
  label: { size: 13, lineHeight: 18, weight: '500', tracking: '0' },
  caption: { size: 12, lineHeight: 16, weight: '400', tracking: '0' },
} as const;
