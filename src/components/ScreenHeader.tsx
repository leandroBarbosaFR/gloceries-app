import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme/tokens';
import { AppText } from './AppText';

/** iOS large-title header. */
export function ScreenHeader({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.texts}>
        <AppText variant="largeTitle" accessibilityRole="header" maxFontSizeMultiplier={1.4} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="subhead" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  texts: { flex: 1, gap: spacing.xxs },
});
