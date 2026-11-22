import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { ACTION_DISMISS, ACTION_NAVIGATE, parseReminderPayload, type ReminderPayload } from '../domain/notificationContent';

export type ReminderOpenAction = 'open' | 'navigate';

/**
 * Routes notification taps to the app, including cold starts (app launched by the tap).
 * "Ignorer" never opens the app (opensAppToForeground: false) and is ignored here.
 */
export function useReminderNotifications(onReminder: (payload: ReminderPayload, action: ReminderOpenAction) => void, ready: boolean): void {
  const handlerRef = useRef(onReminder);
  handlerRef.current = onReminder;
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    if (!ready) return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const requestId = response.notification.request.identifier;
      if (handledIds.current.has(requestId)) return;
      handledIds.current.add(requestId);
      if (response.actionIdentifier === ACTION_DISMISS) return;
      const payload = parseReminderPayload(response.notification.request.content.data);
      if (!payload) return;
      handlerRef.current(payload, response.actionIdentifier === ACTION_NAVIGATE ? 'navigate' : 'open');
      Notifications.clearLastNotificationResponse();
    };

    handle(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [ready]);
}
