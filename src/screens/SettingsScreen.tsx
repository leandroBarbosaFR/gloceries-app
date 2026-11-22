import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { ScreenHeader } from '../components/ScreenHeader';
import { Row, Section, SegmentedControl, ToggleRow } from '../components/Surfaces';
import { formatExpiry, formatInviteCode } from '../domain/invite';
import type { RemindersState } from '../hooks/useReminders';
import { useI18n, type LanguagePreference, type Strings } from '../i18n';
import type { Household, MapsPreference, ReminderRadius } from '../lib/types';
import { readDevLog, resetReminderCooldowns, simulateStoreEntry, type DevLogEntry } from '../services/geofencing';
import { colors, spacing } from '../theme/tokens';

type SettingsScreenProps = {
  household: Household;
  memberCount: number | null;
  email: string | null;
  reminders: RemindersState;
  onSetupReminders: () => void;
  onShareInvite: () => void;
  onRotateInvite: () => void;
  onLeaveHousehold: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onOpenPrivacy: () => void;
  onClearStores: () => void;
};

const RADIUS_OPTIONS: { value: ReminderRadius; label: string }[] = [
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
];

function reminderStatusText(reminders: RemindersState, copy: Strings['settings']): { text: string; needsAction: boolean } {
  const { settings, location, notifications, monitoring, pool } = reminders;
  if (!settings.enabled) return { text: copy.statusOff, needsAction: false };
  if (location && !location.servicesEnabled) return { text: copy.statusServicesOff, needsAction: true };
  if (location?.background !== 'granted') return { text: copy.statusAlwaysMissing, needsAction: true };
  if (notifications !== 'granted') return { text: copy.statusNotificationsOff, needsAction: true };
  if (!pool || pool.stores.length === 0) return { text: copy.statusNoStores, needsAction: true };
  if (monitoring?.kind === 'monitoring') {
    const approximate = location?.preciseLocation === false;
    return { text: copy.statusActive(monitoring.storeCount, approximate), needsAction: approximate };
  }
  return { text: copy.statusPending, needsAction: false };
}

export function SettingsScreen(props: SettingsScreenProps) {
  const { household, reminders } = props;
  const { settings } = reminders;
  const { strings, language, preference, setPreference } = useI18n();
  const copy = strings.settings;
  const status = reminderStatusText(reminders, copy);
  const expiry = formatExpiry(household.invite_expires_at, new Date(), language);
  const mapsOptions: { value: MapsPreference; label: string }[] = [
    { value: 'ask', label: copy.mapsAsk },
    { value: 'apple', label: copy.mapsApple },
    { value: 'google', label: 'Google' },
    { value: 'waze', label: 'Waze' },
  ];
  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: strings.language.automatic },
    { value: 'fr', label: strings.language.french },
    { value: 'en', label: strings.language.english },
    { value: 'pt', label: strings.language.portuguese },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title={copy.title} />

      <Section
        title={copy.remindersSection}
        footer={copy.remindersFooter}
      >
        <ToggleRow
          title={copy.remindersToggle}
          icon="notifications-outline"
          value={settings.enabled}
          onValueChange={(next) => (next ? props.onSetupReminders() : void reminders.disable())}
        />
        <Row
          title={copy.status}
          subtitle={status.text}
          icon={status.needsAction ? 'alert-circle-outline' : 'pulse-outline'}
          iconTint={status.needsAction ? colors.warning : colors.primary}
          onPress={status.needsAction ? () => (reminders.location?.background !== 'granted' || reminders.notifications !== 'granted' ? void Linking.openSettings() : props.onSetupReminders()) : undefined}
          showChevron={status.needsAction}
          accessibilityHint={status.needsAction ? copy.statusFixHint : undefined}
        />
        <View style={styles.inlineControl}>
          <AppText variant="subhead" tone="secondary">
            {copy.distance}
          </AppText>
          <SegmentedControl options={RADIUS_OPTIONS} value={settings.radiusMeters} onChange={(radiusMeters) => void reminders.updateSettings({ radiusMeters })} accessibilityLabel={copy.distance} />
        </View>
        <ToggleRow
          title={copy.quietHours}
          subtitle={copy.quietHoursRange(settings.quietHoursStart, settings.quietHoursEnd)}
          icon="moon-outline"
          value={settings.quietHoursEnabled}
          onValueChange={(quietHoursEnabled) => void reminders.updateSettings({ quietHoursEnabled })}
        />
      </Section>

      <Section title={copy.navigationSection} footer={copy.navigationFooter}>
        <View style={styles.inlineControl}>
          <SegmentedControl options={mapsOptions} value={settings.mapsPreference} onChange={(mapsPreference) => void reminders.updateSettings({ mapsPreference })} accessibilityLabel={copy.navigationA11y} />
        </View>
      </Section>

      <Section title={strings.language.section} footer={strings.language.footer}>
        <View style={styles.inlineControl}>
          <SegmentedControl options={languageOptions} value={preference} onChange={setPreference} accessibilityLabel={strings.language.section} />
        </View>
      </Section>

      <Section title={copy.familySection} footer={expiry ? copy.inviteFooter(expiry) : undefined}>
        <Row title={household.name} subtitle={props.memberCount !== null ? copy.members(props.memberCount) : undefined} icon="home-outline" />
        <View style={styles.inviteBox} accessible accessibilityLabel={copy.inviteCodeA11y(formatInviteCode(household.invite_code).split('').join(' '))}>
          <AppText variant="footnote" tone="secondary">
            {copy.inviteCode}
          </AppText>
          <AppText variant="title2" tone="brand" selectable style={styles.inviteCode}>
            {formatInviteCode(household.invite_code)}
          </AppText>
        </View>
        <Row title={copy.shareCode} icon="share-outline" onPress={props.onShareInvite} showChevron />
        <Row title={copy.newCode} icon="refresh-outline" onPress={props.onRotateInvite} />
        <Row title={copy.leave} icon="exit-outline" destructive onPress={props.onLeaveHousehold} />
      </Section>

      <Section title={copy.privacySection}>
        <Row title={copy.privacyRow} icon="shield-checkmark-outline" onPress={props.onOpenPrivacy} showChevron />
        <Row title={copy.clearStores} subtitle={copy.clearStoresSubtitle} icon="trash-outline" onPress={props.onClearStores} />
      </Section>

      <Section title={copy.accountSection}>
        {props.email ? <Row title={props.email} icon="person-circle-outline" /> : null}
        <Row title={copy.signOut} icon="log-out-outline" onPress={props.onSignOut} />
        <Row title={copy.deleteAccount} icon="close-circle-outline" destructive onPress={props.onDeleteAccount} />
      </Section>

      {__DEV__ ? <DevTools reminders={reminders} /> : null}

      <AppText variant="footnote" tone="tertiary" align="center">
        {copy.footer}
      </AppText>
    </ScrollView>
  );
}

/** Development builds only: lets QA exercise the full reminder pipeline on a physical iPhone. */
function DevTools({ reminders }: { reminders: RemindersState }) {
  const { strings } = useI18n();
  const copy = strings.settings;
  const [log, setLog] = useState<DevLogEntry[]>([]);
  useEffect(() => {
    void readDevLog().then(setLog);
  }, []);
  const nearest = reminders.pool?.stores[0];
  return (
    <Section title={copy.devSection} footer={copy.devFooter}>
      <Row
        title={copy.devSimulate}
        subtitle={nearest ? nearest.name : copy.devSearchFirst}
        icon="flask-outline"
        onPress={
          nearest
            ? async () => {
                const outcome = await simulateStoreEntry(nearest.id);
                setLog(await readDevLog());
                Alert.alert(copy.devResult, JSON.stringify(outcome));
              }
            : undefined
        }
      />
      <Row title={copy.devReset} icon="timer-outline" onPress={() => void resetReminderCooldowns().then(() => Alert.alert(strings.common.ok, copy.devResetDone))} />
      {log.slice(0, 8).map((entry) => (
        <Row key={`${entry.at}-${entry.regionId}`} title={`${entry.type} · ${entry.outcome}`} subtitle={`${new Date(entry.at).toLocaleString(strings.locale)} · ${entry.regionId}`} />
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.xl },
  inlineControl: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  inviteBox: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  inviteCode: { letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
});
