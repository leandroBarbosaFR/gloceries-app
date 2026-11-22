import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, shadows, spacing, touch } from '../theme/tokens';
import { AppText } from './AppText';

type IconName = keyof typeof Ionicons.glyphMap;

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** iOS "inset grouped" section with optional header and footer. */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title ? (
        <AppText variant="overline" tone="secondary" style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      <View style={styles.sectionBody}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={styles.separator} /> : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? (
        <AppText variant="footnote" tone="secondary" style={styles.sectionFooter}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

export type RowProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTint?: string;
  onPress?: () => void;
  accessory?: React.ReactNode;
  showChevron?: boolean;
  destructive?: boolean;
  accessibilityHint?: string;
};

export function Row({ title, subtitle, icon, iconTint = colors.primary, onPress, accessory, showChevron, destructive, accessibilityHint }: RowProps) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: destructive ? colors.dangerSoft : colors.primarySoft }]}>
          <Ionicons name={icon} size={18} color={destructive ? colors.danger : iconTint} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <AppText variant="body" tone={destructive ? 'danger' : 'primary'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="footnote" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {accessory}
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {content}
    </Pressable>
  );
}

export function ToggleRow({
  title,
  subtitle,
  icon,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <AppText variant="body">{title}</AppText>
        {subtitle ? (
          <AppText variant="footnote" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <AppText variant="subhead" weight={selected ? '600' : '500'} tone={selected ? 'brand' : 'secondary'} maxFontSizeMultiplier={1.3}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tint = colors.inkSecondary,
  size = 22,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tint?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.surfacePressed }, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={size} color={tint} />
    </Pressable>
  );
}

type BannerTone = 'info' | 'warning' | 'danger' | 'success';
const bannerColors: Record<BannerTone, { background: string; foreground: string; icon: IconName }> = {
  info: { background: colors.infoSoft, foreground: colors.info, icon: 'information-circle' },
  warning: { background: colors.warningSoft, foreground: colors.warning, icon: 'cloud-offline' },
  danger: { background: colors.dangerSoft, foreground: colors.danger, icon: 'alert-circle' },
  success: { background: colors.primarySoft, foreground: colors.primary, icon: 'checkmark-circle' },
};

export function Banner({
  tone,
  message,
  icon,
  actionLabel,
  onAction,
}: {
  tone: BannerTone;
  message: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette = bannerColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.background }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={icon ?? palette.icon} size={20} color={palette.foreground} />
      <AppText variant="footnote" style={[styles.bannerText, { color: palette.foreground }]}>
        {message}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10} style={styles.bannerAction}>
          <AppText variant="footnote" weight="700" style={{ color: palette.foreground }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon, title, message, children }: { icon: IconName; title: string; message: string; children?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <AppText variant="title3" align="center">
        {title}
      </AppText>
      <AppText variant="callout" tone="secondary" align="center">
        {message}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, ...shadows.card },
  section: { gap: spacing.sm },
  sectionTitle: { marginLeft: spacing.lg },
  sectionBody: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden', ...shadows.card },
  sectionFooter: { marginHorizontal: spacing.lg },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: spacing.lg },
  row: { minHeight: touch.comfortable, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: 3 },
  segment: { flex: 1, minHeight: touch.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  segmentSelected: { backgroundColor: colors.surface, ...shadows.card },
  iconButton: { width: touch.minimum, height: touch.minimum, borderRadius: touch.minimum / 2, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  bannerText: { flex: 1 },
  bannerAction: { minHeight: 32, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
});
