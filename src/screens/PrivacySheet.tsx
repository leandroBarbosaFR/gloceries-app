import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Sheet } from '../components/Sheet';
import { Card } from '../components/Surfaces';
import { useI18n } from '../i18n';
import { spacing } from '../theme/tokens';

export function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { strings } = useI18n();
  return (
    <Sheet visible={visible} title={strings.privacy.title} onClose={onClose}>
      {strings.privacy.sections.map((section) => (
        <Card key={section.title} style={styles.card}>
          <AppText variant="headline" accessibilityRole="header">
            {section.title}
          </AppText>
          <AppText variant="callout" tone="secondary">
            {section.body}
          </AppText>
        </Card>
      ))}
      <View>
        <AppText variant="footnote" tone="tertiary">
          {strings.privacy.disclaimer}
        </AppText>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
