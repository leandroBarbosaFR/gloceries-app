import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { Banner, Card, EmptyState } from '../components/Surfaces';
import { TextField } from '../components/TextField';
import { formatDistance } from '../domain/geo';
import type { RemindersState } from '../hooks/useReminders';
import { useI18n, type Strings } from '../i18n';
import type { NearbyStore } from '../lib/types';
import { colors, radii, shadows, spacing, touch } from '../theme/tokens';

type StoresScreenProps = {
  reminders: RemindersState;
  pendingCount: number;
  onOpenStore: (store: NearbyStore) => void;
  onSetupReminders: () => void;
};

function searchedLabel(strings: Strings, timestamp: number, label?: string): string {
  const day = new Date(timestamp).toLocaleDateString(strings.locale, { day: 'numeric', month: 'long' });
  return label ? strings.stores.searchedAround(label, day) : strings.stores.searchedNearYou(day);
}

export function StoresScreen({ reminders, pendingCount, onOpenStore, onSetupReminders }: StoresScreenProps) {
  const { strings, language } = useI18n();
  const copy = strings.stores;
  const [place, setPlace] = useState('');
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const { pool, settings, monitoring } = reminders;
  const stores = pool?.stores ?? [];
  const monitoringActive = monitoring?.kind === 'monitoring';

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <ScreenHeader title={copy.title} subtitle={pool ? searchedLabel(strings, pool.searchedAt, pool.label) : copy.subtitle} />

      {reminders.farFromPool ? (
        <Banner tone="info" icon="navigate" message={copy.farFromPool} actionLabel={copy.refresh} onAction={() => void reminders.searchNearMe()} />
      ) : null}

      <Card style={styles.searchCard}>
        <Button title={copy.searchNearMe} icon="locate" onPress={() => void reminders.searchNearMe()} loading={reminders.searching && !showPlaceSearch} disabled={reminders.searching} />
        {showPlaceSearch ? (
          <View style={styles.placeSearch}>
            <TextField
              label={copy.placeLabel}
              value={place}
              onChangeText={setPlace}
              placeholder={copy.placePlaceholder}
              returnKeyType="search"
              autoCorrect={false}
              onSubmitEditing={() => void reminders.searchByPlace(place)}
            />
            <Button title={copy.searchThisAddress} variant="secondary" onPress={() => void reminders.searchByPlace(place)} loading={reminders.searching} disabled={place.trim().length < 2} />
          </View>
        ) : (
          <Button title={copy.searchAddress} variant="ghost" compact onPress={() => setShowPlaceSearch(true)} accessibilityHint={copy.searchAddressHint} />
        )}
        {reminders.searchError ? (
          <AppText variant="footnote" tone="danger" accessibilityRole="alert">
            {reminders.searchError}
          </AppText>
        ) : null}
      </Card>

      {stores.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSetupReminders}
          style={({ pressed }) => [styles.status, monitoringActive ? styles.statusOn : styles.statusOff, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name={monitoringActive ? 'notifications' : 'notifications-off-outline'} size={20} color={monitoringActive ? colors.primary : colors.inkSecondary} />
          <AppText variant="subhead" style={styles.flex} tone={monitoringActive ? 'brand' : 'secondary'}>
            {monitoringActive
              ? copy.statusActive(monitoring.storeCount, formatDistance(settings.radiusMeters, language))
              : settings.enabled
                ? copy.statusPending
                : copy.statusOff}
          </AppText>
          <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
        </Pressable>
      ) : null}

      {stores.length === 0 && !reminders.searching ? (
        <EmptyState
          icon="storefront-outline"
          title={pool ? copy.emptyNoneTitle : copy.emptyFirstTitle}
          message={pool ? copy.emptyNoneBody : copy.emptyFirstBody}
        />
      ) : null}

      <View style={styles.list}>
        {stores.map((store) => {
          const excluded = settings.excludedStoreIds.includes(store.id);
          return (
            <Pressable
              key={store.id}
              accessibilityRole="button"
              accessibilityLabel={copy.storeA11y(store.name, formatDistance(store.distanceMeters, language), excluded)}
              accessibilityHint={copy.storeHint}
              onPress={() => onOpenStore(store)}
              style={({ pressed }) => [styles.storeRow, pressed && { backgroundColor: colors.surfacePressed }]}
            >
              <View style={styles.storeIcon}>
                <Ionicons name="storefront" size={20} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <AppText variant="headline" numberOfLines={1}>
                  {store.name}
                </AppText>
                <AppText variant="footnote" tone="secondary" numberOfLines={1}>
                  {[formatDistance(store.distanceMeters, language), store.address].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              {excluded ? <Ionicons name="notifications-off-outline" size={18} color={colors.inkTertiary} /> : null}
              <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
            </Pressable>
          );
        })}
      </View>

      {stores.length > 0 ? (
        <AppText variant="footnote" tone="tertiary">
          {copy.footer(pendingCount)}
        </AppText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  searchCard: { gap: spacing.sm },
  placeSearch: { gap: spacing.sm, marginTop: spacing.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.md, minHeight: touch.comfortable },
  statusOn: { backgroundColor: colors.primarySoft },
  statusOff: { backgroundColor: colors.surfaceMuted },
  list: { gap: spacing.sm },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
    ...shadows.card,
  },
  storeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
