import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { Banner, Card } from '../components/Surfaces';
import { TextField } from '../components/TextField';
import { formatDistance } from '../domain/geo';
import type { RemindersState } from '../hooks/useReminders';
import { useI18n } from '../i18n';
import { colors, radii, spacing } from '../theme/tokens';

type Step = 'intro' | 'stores' | 'location' | 'always' | 'notifications' | 'done';

function Bullet({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <AppText variant="callout" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function StepHeader({ index, total, title, body }: { index: number; total: number; title: string; body: string }) {
  const { strings } = useI18n();
  return (
    <View style={styles.stepHeader}>
      <AppText variant="overline" tone="brand">
        {strings.reminderSetup.step(index, total)}
      </AppText>
      <AppText variant="title2" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="body" tone="secondary">
        {body}
      </AppText>
    </View>
  );
}

/**
 * Progressive permission flow. Nothing is requested until the user taps a button that
 * explains exactly what iOS is about to ask. Each refusal has a clear way out.
 */
export function ReminderSetupSheet({ visible, reminders, onClose }: { visible: boolean; reminders: RemindersState; onClose: () => void }) {
  const { strings, language } = useI18n();
  const copy = strings.reminderSetup;
  const [step, setStep] = useState<Step>('intro');
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStep('intro');
      setProblem(null);
    }
  }, [visible]);

  const { location, notifications, pool } = reminders;

  /** Skips steps that are already satisfied. */
  const advanceFrom = (current: Step) => {
    const order: Step[] = ['intro', 'stores', 'location', 'always', 'notifications', 'done'];
    for (const candidate of order.slice(order.indexOf(current) + 1)) {
      if (candidate === 'stores' && pool && pool.stores.length > 0) continue;
      if (candidate === 'location' && location?.foreground === 'granted') continue;
      if (candidate === 'always' && location?.background === 'granted') continue;
      if (candidate === 'notifications' && notifications === 'granted') continue;
      if (candidate === 'done') {
        void finish();
        return;
      }
      setProblem(null);
      setStep(candidate);
      return;
    }
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const finish = () =>
    run(async () => {
      const status = await reminders.enable();
      if (status.kind === 'monitoring') {
        setStep('done');
      } else {
        setProblem(
          status.reason === 'permission-missing' ? copy.problemAlways : status.reason === 'services-disabled' ? copy.problemServices : copy.problemNoStores,
        );
        setStep(status.reason === 'no-stores' ? 'stores' : 'always');
      }
    });

  const total = 4;
  const openSettings = () => void Linking.openSettings();

  return (
    <Sheet visible={visible} title={copy.title} onClose={onClose}>
      {problem ? <Banner tone="warning" icon="alert-circle" message={problem} /> : null}

      {step === 'intro' ? (
        <>
          <View style={styles.hero}>
            <Ionicons name="navigate-circle" size={56} color={colors.primary} />
          </View>
          <AppText variant="title2" accessibilityRole="header">
            {copy.introTitle}
          </AppText>
          <AppText variant="body" tone="secondary">
            {copy.introBody(formatDistance(reminders.settings.radiusMeters, language))}
          </AppText>
          <Card style={styles.bullets}>
            <Bullet icon="layers-outline" text={copy.bulletGrouped} />
            <Bullet icon="moon-outline" text={copy.bulletNight} />
            <Bullet icon="battery-half-outline" text={copy.bulletBattery} />
            <Bullet icon="lock-closed-outline" text={copy.bulletPrivacy} />
          </Card>
          <Button title={copy.configure} onPress={() => advanceFrom('intro')} />
          <Button title={strings.common.later} variant="ghost" onPress={onClose} />
        </>
      ) : null}

      {step === 'stores' ? (
        <>
          <StepHeader index={1} total={total} title={copy.storesTitle} body={copy.storesBody} />
          <Button
            title={strings.stores.searchNearMe}
            icon="locate"
            loading={busy}
            onPress={() =>
              run(async () => {
                const found = await reminders.searchNearMe();
                if (found && found.stores.length > 0) advanceFrom('location');
              })
            }
          />
          <AppText variant="footnote" tone="secondary">
            {copy.preferAddress}
          </AppText>
          <TextField label={copy.placeLabel} value={place} onChangeText={setPlace} placeholder={copy.placePlaceholder} returnKeyType="search" />
          <Button
            title={strings.stores.searchThisAddress}
            variant="secondary"
            disabled={place.trim().length < 2}
            loading={busy}
            onPress={() =>
              run(async () => {
                const found = await reminders.searchByPlace(place);
                if (found && found.stores.length > 0) advanceFrom('stores');
              })
            }
          />
          {reminders.searchError ? (
            <AppText variant="footnote" tone="danger">
              {reminders.searchError}
            </AppText>
          ) : null}
        </>
      ) : null}

      {step === 'location' ? (
        <>
          <StepHeader index={2} total={total} title={copy.locationTitle} body={copy.locationBody} />
          {location?.foreground === 'denied' ? (
            <>
              <Banner tone="warning" message={copy.locationDenied} />
              <Button title={strings.common.openSettings} icon="settings-outline" onPress={openSettings} />
              <Button title={strings.common.iChangedSetting} variant="ghost" onPress={() => run(async () => { await reminders.refreshPermissions(); advanceFrom('stores'); })} />
            </>
          ) : (
            <Button
              title={copy.allowLocation}
              loading={busy}
              onPress={() =>
                run(async () => {
                  const result = await reminders.requestForeground();
                  if (result === 'granted') advanceFrom('location');
                  else setProblem(copy.locationRefused);
                })
              }
            />
          )}
        </>
      ) : null}

      {step === 'always' ? (
        <>
          <StepHeader
            index={3}
            total={total}
            title={copy.alwaysTitle}
            body={copy.alwaysBody}
          />
          {location?.background === 'denied' ? (
            <>
              <Card style={styles.bullets}>
                <Bullet icon="settings-outline" text={copy.alwaysStep1} />
                <Bullet icon="checkmark-circle-outline" text={copy.alwaysStep2} />
                <Bullet icon="locate-outline" text={copy.alwaysStep3} />
              </Card>
              <Button title={strings.common.openSettings} icon="settings-outline" onPress={openSettings} />
              <Button title={strings.common.iChangedSetting} variant="ghost" onPress={() => run(async () => { await reminders.refreshPermissions(); advanceFrom('location'); })} />
            </>
          ) : (
            <Button
              title={copy.allowAlways}
              loading={busy}
              onPress={() =>
                run(async () => {
                  const result = await reminders.requestBackground();
                  if (result === 'granted') advanceFrom('always');
                  else setProblem(copy.alwaysRefused);
                })
              }
            />
          )}
          {location?.preciseLocation === false ? (
            <Banner tone="info" message={copy.preciseOff} />
          ) : null}
        </>
      ) : null}

      {step === 'notifications' ? (
        <>
          <StepHeader index={4} total={total} title={copy.notificationsTitle} body={copy.notificationsBody} />
          {notifications === 'denied' ? (
            <>
              <Banner tone="warning" message={copy.notificationsDenied} />
              <Button title={strings.common.openSettings} icon="settings-outline" onPress={openSettings} />
              <Button title={strings.common.iChangedSetting} variant="ghost" onPress={() => run(async () => { await reminders.refreshPermissions(); advanceFrom('always'); })} />
            </>
          ) : (
            <Button
              title={copy.allowNotifications}
              loading={busy}
              onPress={() =>
                run(async () => {
                  const result = await reminders.requestNotifications();
                  if (result === 'granted') advanceFrom('notifications');
                  else setProblem(copy.notificationsRefused);
                })
              }
            />
          )}
        </>
      ) : null}

      {step === 'done' ? (
        <>
          <View style={styles.hero}>
            <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
          </View>
          <AppText variant="title2" align="center" accessibilityRole="header">
            {copy.doneTitle}
          </AppText>
          <AppText variant="body" tone="secondary" align="center">
            {reminders.monitoring?.kind === 'monitoring' ? copy.doneBody(reminders.monitoring.storeCount) : copy.doneGeneric}
          </AppText>
          <Button title={strings.common.finish} onPress={onClose} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', paddingVertical: spacing.md },
  bullets: { gap: spacing.md },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bulletIcon: { width: 34, height: 34, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepHeader: { gap: spacing.sm },
});
