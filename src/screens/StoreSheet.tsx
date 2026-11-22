import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { IconButton, Section, ToggleRow } from '../components/Surfaces';
import { formatDistance } from '../domain/geo';
import { useI18n } from '../i18n';
import type { GroceryItem, MapsProvider, ReminderStore } from '../lib/types';
import { colors, radii, spacing, touch } from '../theme/tokens';

export type StoreSheetStore = ReminderStore & { address?: string; distanceMeters?: number };

type StoreSheetProps = {
  store: StoreSheetStore | null;
  fromNotification: boolean;
  items: GroceryItem[];
  excluded: boolean;
  onClose: () => void;
  onNavigate: (provider: MapsProvider) => void;
  onToggleMute: (item: GroceryItem) => void;
  onToggleChecked: (item: GroceryItem) => void;
  onToggleExcluded: () => void;
};

const PROVIDER_ICONS: Record<MapsProvider, keyof typeof Ionicons.glyphMap> = { apple: 'map', google: 'logo-google', waze: 'car' };

export function StoreSheet({ store, fromNotification, items, excluded, onClose, onNavigate, onToggleMute, onToggleChecked, onToggleExcluded }: StoreSheetProps) {
  const { strings, language } = useI18n();
  const copy = strings.storeSheet;
  const pending = items.filter((item) => !item.checked);
  const reminded = pending.filter((item) => !item.mute_reminders);

  return (
    <Sheet
      visible={store !== null}
      title={store?.name ?? ''}
      onClose={onClose}
      footer={<Button title={fromNotification ? copy.ignore : strings.common.close} variant="ghost" onPress={onClose} />}
    >
      {store ? (
        <>
          {store.address || store.distanceMeters !== undefined ? (
            <AppText variant="subhead" tone="secondary">
              {[store.distanceMeters !== undefined ? copy.distanceFrom(formatDistance(store.distanceMeters, language)) : null, store.address].filter(Boolean).join(' · ')}
            </AppText>
          ) : null}

          <View style={styles.providers} accessibilityRole="toolbar" accessibilityLabel={copy.navigateToolbar}>
            {(['apple', 'google', 'waze'] as MapsProvider[]).map((provider) => (
              <Pressable
                key={provider}
                accessibilityRole="button"
                accessibilityLabel={copy.navigateWith(strings.maps[provider])}
                onPress={() => onNavigate(provider)}
                style={({ pressed }) => [styles.provider, pressed && { backgroundColor: colors.primaryMuted }]}
              >
                <Ionicons name={PROVIDER_ICONS[provider]} size={22} color={colors.primary} />
                <AppText variant="footnote" weight="600" tone="brand" maxFontSizeMultiplier={1.3}>
                  {strings.maps[provider]}
                </AppText>
              </Pressable>
            ))}
          </View>

          <Section
            title={copy.toBuy(pending.length)}
            footer={pending.length > 0 ? copy.remindedFooter(reminded.length) : undefined}
          >
            {pending.length === 0 ? (
              <View style={styles.emptyRow}>
                <AppText variant="callout" tone="secondary">
                  {copy.nothingToBuy}
                </AppText>
              </View>
            ) : (
              pending.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: false }}
                    accessibilityLabel={item.name}
                    accessibilityHint={copy.checkHint}
                    onPress={() => onToggleChecked(item)}
                    style={styles.itemMain}
                  >
                    <View style={styles.checkbox} />
                    <AppText variant="body" tone={item.mute_reminders ? 'tertiary' : 'primary'} style={styles.flex} numberOfLines={2}>
                      {item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}
                    </AppText>
                  </Pressable>
                  <IconButton
                    icon={item.mute_reminders ? 'notifications-off-outline' : 'notifications-outline'}
                    label={item.mute_reminders ? strings.item.unmute(item.name) : strings.item.mute(item.name)}
                    tint={item.mute_reminders ? colors.inkTertiary : colors.primary}
                    size={20}
                    onPress={() => onToggleMute(item)}
                  />
                </View>
              ))
            )}
          </Section>

          <Section footer={copy.storeRemindersFooter}>
            <ToggleRow title={copy.storeReminders} icon="notifications-outline" value={!excluded} onValueChange={onToggleExcluded} />
          </Section>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  providers: { flexDirection: 'row', gap: spacing.sm },
  provider: {
    flex: 1,
    minHeight: 72,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  emptyRow: { padding: spacing.lg },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg, paddingVertical: spacing.sm, minHeight: touch.comfortable },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.primaryMuted },
});
