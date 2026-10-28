import { Platform, type TextStyle } from 'react-native';

/**
 * Design tokens. Everything visual in the app derives from this file,
 * so the whole look can be re-tuned in one place.
 */

export const colors = {
  // Surfaces
  bg: '#121214',
  bgElevated: '#1A1A1E',
  surface: '#202026',
  surfaceRaised: '#26262E',
  hairline: 'rgba(255,255,255,0.06)',
  scrim: 'rgba(8,8,10,0.72)',

  // Typography (muted lavender family)
  text: '#F4F2FA',
  textSecondary: '#B9B3D6',
  textTertiary: '#7E7996',
  textFaint: '#4F4B62',

  // Accents
  lavender: '#C8BFF4',
  crimson: '#FF5A6E',
  amber: '#FFB347',
  teal: '#2FD4C4',
  cyan: '#5BE1E6',
  sage: '#7DDBA8',
  blue: '#86A9FF',
} as const;

/** Visual tone of a workout phase. Drives backgrounds, accents and pulse speed. */
export type Tone = 'warmup' | 'intense' | 'brisk' | 'recover' | 'easy' | 'cooldown' | 'complete';

export interface ToneStyle {
  accent: string;
  /** Top → bottom background wash used behind the timer. */
  wash: readonly [string, string, string];
  /** Duration of one pulse/breath of the glow, ms. Faster = more urgent. */
  pulseMs: number;
}

export const tones: Record<Tone, ToneStyle> = {
  warmup: { accent: '#C8B8FF', wash: ['#251F3A', '#16141F', '#121214'], pulseMs: 4200 },
  intense: { accent: colors.crimson, wash: ['#4E0F21', '#240A12', '#120A0D'], pulseMs: 1100 },
  brisk: { accent: colors.amber, wash: ['#4A2B0B', '#22160A', '#120E0A'], pulseMs: 1500 },
  recover: { accent: colors.teal, wash: ['#0A3A3B', '#0C1D1F', '#0E1213'], pulseMs: 4800 },
  easy: { accent: colors.sage, wash: ['#0F3527', '#0E1C17', '#0F1312'], pulseMs: 4800 },
  cooldown: { accent: colors.blue, wash: ['#15264C', '#10162A', '#0F1117'], pulseMs: 5200 },
  complete: { accent: colors.lavender, wash: ['#2A2342', '#17151F', '#121214'], pulseMs: 6000 },
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * Type scale. System fonts (SF Pro on iOS, Roboto on Android) at light
 * weights read as calm and premium without bundling font files.
 */
export const type = {
  clock: {
    fontSize: 92,
    fontWeight: '200',
    letterSpacing: -2,
    color: colors.text,
    fontVariant: tabular,
  },
  display: {
    fontSize: 40,
    fontWeight: '300',
    letterSpacing: -1,
    lineHeight: 46,
    color: colors.text,
  },
  title: {
    fontSize: 30,
    fontWeight: '300',
    letterSpacing: -0.6,
    lineHeight: 36,
    color: colors.text,
  },
  heading: {
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: -0.2,
    lineHeight: 26,
    color: colors.text,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: colors.textSecondary,
  },
  callout: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textTertiary,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  metric: {
    fontSize: 34,
    fontWeight: '200',
    letterSpacing: -0.8,
    color: colors.text,
    fontVariant: tabular,
  },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  default: { elevation: 8 },
});
