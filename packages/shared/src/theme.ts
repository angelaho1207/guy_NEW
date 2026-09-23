/**
 * Design tokens, shared by the web app and the mobile app so the two cannot
 * drift apart.
 *
 * Dark mode only for v1, per the brief. The structure here anticipates a light
 * theme without building one: swap the token values and nothing else changes.
 *
 * The starting palette came from the brief and is explicitly adjustable. The
 * only hard rule is that the accent stays a deep, muted burgundy and is used
 * sparingly, for primary actions, active states and notification badges. Never
 * a bright or neon red or pink.
 */

export const colors = {
  background: '#0B0B0D',
  surface: '#17171A',
  /** One step above `surface`, for cards resting on a raised sheet. */
  surfaceRaised: '#1F1F23',
  border: '#2A2A2E',

  textPrimary: '#F2F1EE',
  textSecondary: '#9A9A9E',
  /** Placeholder copy in an empty text box, and shared-but-empty "-" values. */
  textMuted: '#6A6A70',

  accent: '#8C2F42',
  /** Pressed state for an accent-filled control. */
  accentPressed: '#732636',
  /** Accent at low opacity, for a tint behind an active row. */
  accentSubtle: 'rgba(140, 47, 66, 0.16)',
  /** Text and icons that sit on top of an accent fill. */
  onAccent: '#F7F2F3',

  /** Destructive actions. Distinct from the accent so the two never blur. */
  danger: '#B3423C',
  success: '#3F7D62',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/**
 * A clean, modern sans-serif with a clear hierarchy. The stack resolves to the
 * platform UI face first, which is what makes it feel native on each device.
 */
export const fontFamily = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
} as const;

export const type = {
  display: { size: 32, lineHeight: 38, weight: '600' },
  title: { size: 22, lineHeight: 28, weight: '600' },
  heading: { size: 17, lineHeight: 24, weight: '600' },
  body: { size: 16, lineHeight: 24, weight: '400' },
  label: { size: 13, lineHeight: 18, weight: '500' },
  caption: { size: 12, lineHeight: 16, weight: '400' },
} as const;

export type ColorToken = keyof typeof colors;
