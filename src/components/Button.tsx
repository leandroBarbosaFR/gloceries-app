import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, touch } from '../theme/tokens';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

const palette: Record<Variant, { background: string; pressed: string; text: string; border?: string }> = {
  primary: { background: colors.primary, pressed: colors.primaryPressed, text: colors.onPrimary },
  secondary: { background: colors.primarySoft, pressed: '#D6E8DB', text: colors.primary },
  ghost: { background: 'transparent', pressed: colors.surfacePressed, text: colors.primary },
  destructive: { background: colors.dangerSoft, pressed: '#F0D5CD', text: colors.danger },
};

export function Button({ title, onPress, variant = 'primary', icon, loading = false, disabled = false, compact = false, accessibilityHint, style }: ButtonProps) {
  const tone = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.regular,
        { backgroundColor: pressed ? tone.pressed : tone.background },
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={compact ? 17 : 19} color={tone.text} /> : null}
          <AppText variant="headline" style={{ color: tone.text }} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  regular: { minHeight: touch.large },
  compact: { minHeight: touch.minimum, paddingHorizontal: spacing.lg, borderRadius: radii.sm },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
});
