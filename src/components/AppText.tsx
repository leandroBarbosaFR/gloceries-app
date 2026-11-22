import { Text, type TextProps } from 'react-native';
import { colors, typography, type TypographyVariant } from '../theme/tokens';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'danger' | 'inverse' | 'warning';

const toneColors: Record<Tone, string> = {
  primary: colors.ink,
  secondary: colors.inkSecondary,
  tertiary: colors.inkTertiary,
  brand: colors.primary,
  danger: colors.danger,
  inverse: colors.onPrimary,
  warning: colors.warning,
};

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
  weight?: '400' | '500' | '600' | '700';
};

/** Text with design-system typography. Supports Dynamic Type, capped to keep layouts intact. */
export function AppText({ variant = 'body', tone = 'primary', align, weight, style, maxFontSizeMultiplier = 1.8, ...rest }: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typography[variant], { color: toneColors[tone] }, align && { textAlign: align }, weight && { fontWeight: weight }, style]}
      {...rest}
    />
  );
}
