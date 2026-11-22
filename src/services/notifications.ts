import * as Notifications from 'expo-notifications';
import { ACTION_DISMISS, ACTION_NAVIGATE, REMINDER_CATEGORY_ID, reminderActionTitles, type ReminderContent } from '../domain/notificationContent';
import type { Language } from '../lib/types';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

// Module scope: also applies when the JS runtime is started in the background by a geofence event.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let categoryLanguage: Language | null = null;

/** "Itinéraire/Directions" opens the app on the store sheet; "Ignorer/Dismiss" just dismisses (no app launch). */
export async function ensureReminderCategory(language: Language): Promise<void> {
  if (categoryLanguage === language) return;
  const titles = reminderActionTitles(language);
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
    { identifier: ACTION_NAVIGATE, buttonTitle: titles.navigate, options: { opensAppToForeground: true } },
    { identifier: ACTION_DISMISS, buttonTitle: titles.dismiss, options: { opensAppToForeground: false } },
  ]);
  categoryLanguage = language;
}

export async function presentReminder(content: ReminderContent, language: Language): Promise<void> {
  await ensureReminderCategory(language).catch((error) => console.warn('[notifications] category', error));
  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title,
      body: content.body,
      data: content.data,
      categoryIdentifier: REMINDER_CATEGORY_ID,
      threadIdentifier: 'psst-store-reminders',
      sound: 'default',
    },
    trigger: null,
  });
}

function toPermission(response: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (response.granted) return 'granted';
  const iosStatus = response.ios?.status;
  if (iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL || iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL) {
    return 'granted';
  }
  return response.canAskAgain ? 'undetermined' : 'denied';
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const response = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return toPermission(response);
}
