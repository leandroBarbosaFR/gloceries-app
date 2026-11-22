import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n';
import type { GroceryItem } from '../lib/types';
import { colors, radii, spacing, touch } from '../theme/tokens';
import { AppText } from './AppText';
import { IconButton } from './Surfaces';

type ItemRowProps = {
  item: GroceryItem;
  pendingSync: boolean;
  reduceMotion: boolean;
  onToggleChecked: (item: GroceryItem) => void;
  onToggleMute: (item: GroceryItem) => void;
  onDelete: (item: GroceryItem) => void;
};

export function ItemRow({ item, pendingSync, reduceMotion, onToggleChecked, onToggleMute, onDelete }: ItemRowProps) {
  const { strings } = useI18n();
  const progress = useRef(new Animated.Value(item.checked ? 1 : 0)).current;

  useEffect(() => {
    const target = item.checked ? 1 : 0;
    if (reduceMotion) progress.setValue(target);
    else Animated.spring(progress, { toValue: target, useNativeDriver: true, speed: 22, bounciness: 8 }).start();
  }, [item.checked, progress, reduceMotion]);

  const label = strings.item.a11yLabel(item.name, item.quantity);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={label}
        accessibilityHint={item.checked ? strings.item.hintUncheck : strings.item.hintCheck}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => undefined);
          onToggleChecked(item);
        }}
        style={styles.checkArea}
      >
        <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
          <Animated.View style={{ transform: [{ scale: progress }], opacity: progress }}>
            <Ionicons name="checkmark" size={17} color={colors.onPrimary} />
          </Animated.View>
        </View>
        <View style={styles.texts}>
          <AppText variant="body" tone={item.checked ? 'tertiary' : 'primary'} style={item.checked && styles.strike} numberOfLines={2}>
            {item.name}
            {item.quantity > 1 ? <AppText variant="body" tone="secondary">{`  ×${item.quantity}`}</AppText> : null}
          </AppText>
          {item.mute_reminders && !item.checked ? (
            <AppText variant="caption" tone="tertiary">
              {strings.item.muted}
            </AppText>
          ) : null}
        </View>
        {pendingSync ? (
          <Ionicons name="cloud-upload-outline" size={15} color={colors.inkTertiary} accessibilityLabel={strings.item.pendingSync} />
        ) : null}
      </Pressable>
      {!item.checked ? (
        <IconButton
          icon={item.mute_reminders ? 'notifications-off-outline' : 'notifications-outline'}
          label={item.mute_reminders ? strings.item.unmute(item.name) : strings.item.mute(item.name)}
          tint={item.mute_reminders ? colors.inkTertiary : colors.primary}
          size={20}
          onPress={() => onToggleMute(item)}
        />
      ) : null}
      <IconButton icon="trash-outline" label={strings.item.delete(item.name)} size={19} tint={colors.inkTertiary} onPress={() => onDelete(item)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingRight: spacing.xs,
    minHeight: touch.large,
  },
  checkArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingLeft: spacing.lg, minHeight: touch.large },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  texts: { flex: 1, gap: 2 },
  strike: { textDecorationLine: 'line-through' },
});
