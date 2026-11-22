import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, LayoutAnimation, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ItemRow } from '../components/ItemRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { Banner, Card, EmptyState, IconButton } from '../components/Surfaces';
import type { GroceryListState } from '../hooks/useGroceryList';
import { useI18n } from '../i18n';
import type { GroceryItem, Household } from '../lib/types';
import { colors, radii, shadows, spacing, touch, typography } from '../theme/tokens';

type ListScreenProps = {
  household: Household;
  list: GroceryListState;
  remindersEnabled: boolean;
  reduceMotion: boolean;
  onInvite: () => void;
  onSetupReminders: () => void;
};

function formatSyncTime(timestamp: number | null, locale: string): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function ListScreen({ household, list, remindersEnabled, reduceMotion, onInvite, onSetupReminders }: ListScreenProps) {
  const { strings } = useI18n();
  const copy = strings.list;
  const [draft, setDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const toBuy = list.items.filter((item) => !item.checked);
  const inBasket = list.items.filter((item) => item.checked);

  const animate = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
  };

  const submit = () => {
    animate();
    if (list.addItem(draft)) {
      setDraft('');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  };

  const confirmDelete = (item: GroceryItem) =>
    Alert.alert(copy.deleteTitle, item.name, [
      { text: strings.common.cancel, style: 'cancel' },
      {
        text: strings.common.delete,
        style: 'destructive',
        onPress: () => {
          animate();
          list.removeItem(item);
        },
      },
    ]);

  const confirmClear = () =>
    Alert.alert(copy.clearTitle, copy.clearBody(inBasket.length), [
      { text: strings.common.cancel, style: 'cancel' },
      {
        text: copy.clearConfirm,
        style: 'destructive',
        onPress: () => {
          animate();
          list.clearChecked();
        },
      },
    ]);

  const subtitle = list.status === 'loading' ? copy.loading : toBuy.length === 0 ? copy.allBought : copy.toBuyCount(toBuy.length);

  const renderRow = (item: GroceryItem) => (
    <ItemRow
      key={item.id}
      item={item}
      pendingSync={list.pendingItemIds.has(item.id)}
      reduceMotion={reduceMotion}
      onToggleChecked={(target) => {
        animate();
        list.toggleChecked(target);
      }}
      onToggleMute={list.toggleMute}
      onDelete={confirmDelete}
    />
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={async () => {
            setRefreshing(true);
            await list.refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <ScreenHeader title={household.name} subtitle={subtitle} trailing={<IconButton icon="person-add-outline" label={copy.inviteA11y} tint={colors.primary} onPress={onInvite} />} />

      {list.status === 'offline' ? (
        <Banner tone="warning" message={copy.offline(formatSyncTime(list.lastSyncedAt, strings.locale))} />
      ) : null}
      {list.lastError ? <Banner tone="danger" message={list.lastError} actionLabel={strings.common.ok} onAction={list.dismissError} /> : null}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={copy.composerPlaceholder}
          placeholderTextColor={colors.inkTertiary}
          selectionColor={colors.primary}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={submit}
          maxLength={120}
          accessibilityLabel={copy.composerA11y}
          accessibilityHint={copy.composerHint}
          style={styles.composerInput}
          maxFontSizeMultiplier={1.6}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.addA11y}
          accessibilityState={{ disabled: !draft.trim() }}
          disabled={!draft.trim()}
          onPress={submit}
          style={({ pressed }) => [styles.addButton, !draft.trim() && styles.addButtonDisabled, pressed && { backgroundColor: colors.primaryPressed }]}
        >
          <Ionicons name="add" size={28} color={colors.onPrimary} />
        </Pressable>
      </View>

      {!remindersEnabled && list.items.length > 0 ? (
        <Card style={styles.promo}>
          <View style={styles.promoHeader}>
            <Ionicons name="location" size={20} color={colors.primary} />
            <AppText variant="headline" style={styles.flex}>
              {copy.promoTitle}
            </AppText>
          </View>
          <AppText variant="subhead" tone="secondary">
            {copy.promoBody}
          </AppText>
          <Button title={copy.promoButton} variant="secondary" compact onPress={onSetupReminders} />
        </Card>
      ) : null}

      {list.status === 'loading' && list.items.length === 0 ? null : toBuy.length === 0 && inBasket.length === 0 ? (
        <EmptyState icon="basket-outline" title={copy.emptyTitle} message={copy.emptyBody} />
      ) : (
        <>
          {toBuy.length > 0 ? (
            <View style={styles.group} accessibilityLabel={copy.toBuyA11y}>
              {toBuy.map(renderRow)}
            </View>
          ) : (
            <Card style={styles.allDone}>
              <Ionicons name="checkmark-done-circle" size={28} color={colors.primary} />
              <AppText variant="callout" style={styles.flex}>
                {copy.allInBasket}
              </AppText>
            </Card>
          )}
          {inBasket.length > 0 ? (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <AppText variant="overline" tone="secondary" accessibilityRole="header">
                  {copy.basketHeader(inBasket.length)}
                </AppText>
                <Button title={copy.clearAll} variant="ghost" compact onPress={confirmClear} />
              </View>
              {inBasket.map(renderRow)}
            </View>
          ) : null}
          <AppText variant="footnote" tone="tertiary" align="center" style={styles.hint}>
            {copy.hint}
          </AppText>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  composer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  composerInput: {
    ...typography.body,
    flex: 1,
    minHeight: touch.large,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    color: colors.ink,
    ...shadows.card,
  },
  addButton: { width: touch.large, height: touch.large, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addButtonDisabled: { backgroundColor: colors.primaryMuted },
  promo: { gap: spacing.sm, backgroundColor: colors.primarySoft, shadowOpacity: 0 },
  promoHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  group: { gap: spacing.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.xs },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hint: { marginTop: spacing.sm },
});
