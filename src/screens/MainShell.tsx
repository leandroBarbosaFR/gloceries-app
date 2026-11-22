import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabBar, type TabKey } from '../components/TabBar';
import { toUserMessage } from '../domain/errors';
import { formatInviteCode } from '../domain/invite';
import { useNetworkStatus, useOnForeground, useReduceMotion } from '../hooks/useAppState';
import { useGroceryList } from '../hooks/useGroceryList';
import { useReminderNotifications } from '../hooks/useReminderNotifications';
import { useReminders } from '../hooks/useReminders';
import { getActiveLanguage, getActiveStrings, useI18n } from '../i18n';
import { supabase } from '../lib/supabase';
import { ensureReminderCategory } from '../services/notifications';
import type { Household, MapsProvider, NearbyStore } from '../lib/types';
import { stopMonitoring } from '../services/geofencing';
import { countMembers, deleteMyAccount, leaveHousehold, rotateInviteCode } from '../services/householdApi';
import { openDirections } from '../services/maps';
import { clearPsstData, removeKeys, StorageKeys } from '../services/storage';
import { colors } from '../theme/tokens';
import { ListScreen } from './ListScreen';
import { PrivacySheet } from './PrivacySheet';
import { ReminderSetupSheet } from './ReminderSetupSheet';
import { SettingsScreen } from './SettingsScreen';
import { StoreSheet, type StoreSheetStore } from './StoreSheet';
import { StoresScreen } from './StoresScreen';

const showError = (error: unknown) => Alert.alert(getActiveStrings().common.oops, toUserMessage(error, getActiveLanguage()));

/** Signs out and wipes local data. Stops geofencing first so nothing fires for a signed-out user. */
export async function signOutEverywhere(): Promise<void> {
  await stopMonitoring().catch(() => undefined);
  await clearPsstData({ keepOnboarding: true }).catch(() => undefined);
  await supabase.auth.signOut().catch(() => undefined);
}

export function MainShell({ session, household, setHousehold }: { session: Session; household: Household; setHousehold: (next: Household | null) => void }) {
  const { strings, language } = useI18n();
  const copy = strings.shell;
  const isOnline = useNetworkStatus();

  // Notification action buttons follow the app language.
  useEffect(() => {
    void ensureReminderCategory(language).catch(() => undefined);
  }, [language]);
  const reduceMotion = useReduceMotion();
  const list = useGroceryList(household.id, session.user.id, isOnline);
  const reminders = useReminders();
  const [tab, setTab] = useState<TabKey>('list');
  const [sheetStore, setSheetStore] = useState<{ store: StoreSheetStore; fromNotification: boolean } | null>(null);
  const [setupVisible, setSetupVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  const loadMembers = useCallback(() => {
    countMembers(household.id).then(setMemberCount).catch(() => undefined);
  }, [household.id]);
  useEffect(loadMembers, [loadMembers]);
  useOnForeground(loadMembers);

  useReminderNotifications((payload, action) => {
    const known = reminders.pool?.stores.find((store) => store.id === payload.store.id);
    setSheetStore({ store: { ...payload.store, address: known?.address }, fromNotification: true });
    const preference = reminders.settings.mapsPreference;
    if (action === 'navigate' && preference !== 'ask') void openDirections(payload.store, preference).catch(showError);
  }, reminders.loaded);

  const pendingCount = useMemo(() => list.items.filter((item) => !item.checked).length, [list.items]);

  const shareInvite = () => {
    const until = household.invite_expires_at ? new Date(household.invite_expires_at).toLocaleDateString(strings.locale) : null;
    void Share.share({ message: copy.inviteMessage(household.name, formatInviteCode(household.invite_code), until) });
  };

  const rotateInvite = () =>
    Alert.alert(copy.rotateTitle, copy.rotateBody, [
      { text: strings.common.cancel, style: 'cancel' },
      { text: copy.rotateConfirm, onPress: () => void rotateInviteCode(household.id).then(setHousehold).catch(showError) },
    ]);

  const leave = () =>
    Alert.alert(
      copy.leaveTitle,
      memberCount === 1 ? copy.leaveLast : copy.leaveOther,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: copy.leaveConfirm,
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveHousehold(household.id);
              await removeKeys([StorageKeys.listSnapshot, StorageKeys.listCache(household.id), StorageKeys.offlineQueue(household.id)]);
              setHousehold(null);
            } catch (error) {
              showError(error);
            }
          },
        },
      ],
    );

  const signOut = () =>
    Alert.alert(copy.signOutTitle, copy.signOutBody, [
      { text: strings.common.cancel, style: 'cancel' },
      { text: strings.settings.signOut, style: 'destructive', onPress: () => void signOutEverywhere() },
    ]);

  const deleteAccount = () =>
    Alert.alert(
      copy.deleteTitle,
      copy.deleteBody,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: strings.common.delete,
          style: 'destructive',
          onPress: () =>
            Alert.alert(copy.deleteFinalTitle, copy.deleteFinalBody, [
              { text: strings.common.cancel, style: 'cancel' },
              {
                text: copy.deleteFinalConfirm,
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteMyAccount();
                    await signOutEverywhere();
                  } catch (error) {
                    showError(error);
                  }
                },
              },
            ]),
        },
      ],
    );

  const clearStores = () =>
    Alert.alert(copy.clearStoresTitle, copy.clearStoresBody, [
      { text: strings.common.cancel, style: 'cancel' },
      { text: copy.clearStoresConfirm, style: 'destructive', onPress: () => void reminders.clearStores().catch(showError) },
    ]);

  const openStore = (store: NearbyStore) => setSheetStore({ store, fromNotification: false });

  const navigate = (provider: MapsProvider) => {
    if (sheetStore) void openDirections(sheetStore.store, provider).catch(showError);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.root}>
        {tab === 'list' ? (
          <ListScreen
            household={household}
            list={list}
            remindersEnabled={reminders.settings.enabled}
            reduceMotion={reduceMotion}
            onInvite={shareInvite}
            onSetupReminders={() => setSetupVisible(true)}
          />
        ) : null}
        {tab === 'stores' ? <StoresScreen reminders={reminders} pendingCount={pendingCount} onOpenStore={openStore} onSetupReminders={() => setSetupVisible(true)} /> : null}
        {tab === 'settings' ? (
          <SettingsScreen
            household={household}
            memberCount={memberCount}
            email={session.user.email ?? null}
            reminders={reminders}
            onSetupReminders={() => setSetupVisible(true)}
            onShareInvite={shareInvite}
            onRotateInvite={rotateInvite}
            onLeaveHousehold={leave}
            onSignOut={signOut}
            onDeleteAccount={deleteAccount}
            onOpenPrivacy={() => setPrivacyVisible(true)}
            onClearStores={clearStores}
          />
        ) : null}
      </SafeAreaView>
      <TabBar active={tab} onChange={setTab} badges={{ list: pendingCount }} />

      <StoreSheet
        store={sheetStore?.store ?? null}
        fromNotification={sheetStore?.fromNotification ?? false}
        items={list.items}
        excluded={!!sheetStore && reminders.settings.excludedStoreIds.includes(sheetStore.store.id)}
        onClose={() => setSheetStore(null)}
        onNavigate={navigate}
        onToggleMute={list.toggleMute}
        onToggleChecked={list.toggleChecked}
        onToggleExcluded={() => sheetStore && void reminders.toggleStoreExcluded(sheetStore.store.id)}
      />
      <ReminderSetupSheet visible={setupVisible} reminders={reminders} onClose={() => setSetupVisible(false)} />
      <PrivacySheet visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />
    </View>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
