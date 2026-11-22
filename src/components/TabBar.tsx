import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { colors, spacing } from '../theme/tokens';
import { AppText } from './AppText';

export type TabKey = 'list' | 'stores' | 'settings';

const TABS: { key: TabKey; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'list', icon: 'list-outline', activeIcon: 'list' },
  { key: 'stores', icon: 'storefront-outline', activeIcon: 'storefront' },
  { key: 'settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export function TabBar({ active, onChange, badges }: { active: TabKey; onChange: (tab: TabKey) => void; badges?: Partial<Record<TabKey, number>> }) {
  const insets = useSafeAreaInsets();
  const { strings } = useI18n();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const selected = tab.key === active;
        const badge = badges?.[tab.key];
        const label = strings.tabs[tab.key];
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={badge ? strings.tabs.listBadge(label, badge) : label}
            onPress={() => onChange(tab.key)}
            style={styles.tab}
          >
            <View>
              <Ionicons name={selected ? tab.activeIcon : tab.icon} size={25} color={selected ? colors.primary : colors.inkTertiary} />
              {badge ? (
                <View style={styles.badge}>
                  <AppText variant="caption" tone="inverse" maxFontSizeMultiplier={1.2} style={styles.badgeText}>
                    {badge > 99 ? '99+' : String(badge)}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="caption" tone={selected ? 'brand' : 'tertiary'} weight={selected ? '600' : '500'} maxFontSizeMultiplier={1.3}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 48, justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
});
