import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Card } from '../components/Surfaces';
import { TextField } from '../components/TextField';
import { toUserMessage } from '../domain/errors';
import { isPlausibleInviteCode } from '../domain/invite';
import { useI18n } from '../i18n';
import type { Household } from '../lib/types';
import { createHousehold, joinHousehold } from '../services/householdApi';
import { colors, spacing } from '../theme/tokens';

export function HouseholdSetupScreen({ onReady, onSignOut, loadError, onRetry }: {
  onReady: (household: Household) => void;
  onSignOut: () => void;
  loadError: string | null;
  onRetry: () => void;
}) {
  const { strings, language } = useI18n();
  const copy = strings.household;
  const [name, setName] = useState(copy.defaultName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy('create');
    setCreateError(null);
    try {
      onReady(await createHousehold(name));
    } catch (error) {
      setCreateError(toUserMessage(error, language));
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    if (busy) return;
    if (!isPlausibleInviteCode(code)) {
      setJoinError(copy.codeFormat);
      return;
    }
    setBusy('join');
    setJoinError(null);
    try {
      onReady(await joinHousehold(code));
    } catch (error) {
      setJoinError(toUserMessage(error, language));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText variant="largeTitle" accessibilityRole="header">
            {copy.title}
          </AppText>
          <AppText variant="body" tone="secondary">
            {copy.intro}
          </AppText>
          {loadError ? (
            <Card style={styles.errorCard}>
              <AppText variant="callout" tone="danger">
                {loadError}
              </AppText>
              <Button title={strings.common.retry} variant="secondary" compact onPress={onRetry} />
            </Card>
          ) : null}
          <Card style={styles.card}>
            <AppText variant="headline">{copy.createTitle}</AppText>
            <TextField label={copy.nameLabel} value={name} onChangeText={setName} maxLength={80} returnKeyType="done" onSubmitEditing={create} error={createError} />
            <Button title={copy.create} onPress={create} loading={busy === 'create'} disabled={!name.trim() || busy !== null} />
          </Card>
          <View style={styles.divider}>
            <View style={styles.line} />
            <AppText variant="footnote" tone="tertiary">
              {strings.common.or}
            </AppText>
            <View style={styles.line} />
          </View>
          <Card style={styles.card}>
            <AppText variant="headline">{copy.joinTitle}</AppText>
            <TextField
              label={copy.codeLabel}
              hint={copy.codeHint}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="ABCD-EF12-3456-7890"
              returnKeyType="join"
              onSubmitEditing={join}
              error={joinError}
            />
            <Button title={copy.join} variant="secondary" onPress={join} loading={busy === 'join'} disabled={!code.trim() || busy !== null} />
          </Card>
          <Button title={copy.signOut} variant="ghost" onPress={onSignOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  card: { gap: spacing.md },
  errorCard: { gap: spacing.sm, backgroundColor: colors.dangerSoft },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
