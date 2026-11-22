import { Platform, type TextStyle } from 'react-native';

/**
 * Psst! design tokens — soft green on warm white.
 * Text colors are checked against WCAG AA (≥ 4.5:1) on `background` and `surface`.
 */
export const colors = {
  background: '#FAF8F3', // warm white
  surface: '#FFFFFF',
  surfaceMuted: '#F2EFE7',
  surfacePressed: '#ECE8DE',
  border: '#E6E1D6',
  separator: '#EDE9E0',

  primary: '#2F6B4F', // soft deep green (6.3:1 on white)
  primaryPressed: '#255940',
  primarySoft: '#E4EFE7',
  primaryMuted: '#9CC3AA',
  onPrimary: '#FFFFFF',

  ink: '#1D2A23',
  inkSecondary: '#55645B', // 5.9:1 on background
  inkTertiary: '#6F7C74', // 4.5:1 on background — use for non-essential text only

  danger: '#A63D2B',
  dangerSoft: '#F7E6E1',
  warning: '#8A5A00',
  warningSoft: '#FBF0D9',
  info: '#2E5E7E',
  infoSoft: '#E3EEF5',

  overlay: 'rgba(29, 42, 35, 0.35)',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

export const radii = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Apple HIG: 44 pt minimum. We use 48–56 for primary interactions. */
export const touch = { minimum: 44, comfortable: 52, large: 56 } as const;

const systemFont = Platform.select({ ios: 'System', default: undefined });

/** Mirrors the iOS Dynamic Type scale (sizes in pt at the default "Large" setting). */
export const typography = {
  largeTitle: { fontFamily: systemFont, fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
  title1: { fontFamily: systemFont, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.36 },
  title2: { fontFamily: systemFont, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35 },
  title3: { fontFamily: systemFont, fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: 0.38 },
  headline: { fontFamily: systemFont, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
  body: { fontFamily: systemFont, fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: -0.41 },
  callout: { fontFamily: systemFont, fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.32 },
  subhead: { fontFamily: systemFont, fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.24 },
  footnote: { fontFamily: systemFont, fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
  caption: { fontFamily: systemFont, fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
  overline: { fontFamily: systemFont, fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.2, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const shadows = {
  card: {
    shadowColor: '#3B3A2E',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  floating: {
    shadowColor: '#2A2A20',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
} as const;

export const motion = { fast: 160, normal: 240 } as const;
