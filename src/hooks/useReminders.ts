import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '../domain/errors';
import { getActiveLanguage, getActiveStrings } from '../i18n';
import { isOutsidePoolCoverage } from '../domain/regions';
import { DEFAULT_REMINDER_SETTINGS, type Coordinates, type ReminderSettings, type StorePool } from '../lib/types';
import {
  loadReminderSettings,
  loadStorePool,
  saveReminderSettings,
  saveStorePool,
  stopMonitoring,
  syncMonitoring,
  type MonitoringStatus,
} from '../services/geofencing';
import { getNotificationPermission, requestNotificationPermission, type NotificationPermission } from '../services/notifications';
import {
  getCachedCoordinates,
  getCurrentCoordinates,
  getLocationPermissionSummary,
  requestBackgroundLocation,
  requestForegroundLocation,
  type LocationPermissionSummary,
  type PermissionState,
} from '../services/permissions';
import { removeKeys, StorageKeys } from '../services/storage';
import { findNearbySupermarkets, geocodePlace } from '../services/storesApi';
import { useOnForeground } from './useAppState';

export type RemindersState = {
  loaded: boolean;
  settings: ReminderSettings;
  pool: StorePool | null;
  location: LocationPermissionSummary | null;
  notifications: NotificationPermission | null;
  monitoring: MonitoringStatus | null;
  searching: boolean;
  searchError: string | null;
  farFromPool: boolean;
  updateSettings: (patch: Partial<ReminderSettings>) => Promise<void>;
  toggleStoreExcluded: (storeId: string) => Promise<void>;
  searchNearMe: () => Promise<StorePool | null>;
  searchByPlace: (query: string) => Promise<StorePool | null>;
  requestForeground: () => Promise<PermissionState>;
  requestBackground: () => Promise<PermissionState>;
  requestNotifications: () => Promise<NotificationPermission>;
  enable: () => Promise<MonitoringStatus>;
  disable: () => Promise<void>;
  clearStores: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
};

export function useReminders(): RemindersState {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [pool, setPool] = useState<StorePool | null>(null);
  const [location, setLocation] = useState<LocationPermissionSummary | null>(null);
  const [notifications, setNotifications] = useState<NotificationPermission | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringStatus | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [farFromPool, setFarFromPool] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const refreshPermissions = useCallback(async () => {
    const [locationSummary, notificationPermission] = await Promise.all([
      getLocationPermissionSummary().catch(() => null),
      getNotificationPermission().catch(() => null),
    ]);
    setLocation(locationSummary);
    setNotifications(notificationPermission);
    return locationSummary;
  }, []);

  /** Uses only the cached system location (no GPS power-up) when allowed. */
  const resync = useCallback(async (locationSummary: LocationPermissionSummary | null) => {
    const position = locationSummary?.foreground === 'granted' ? await getCachedCoordinates(10 * 60 * 1000) : null;
    const currentPool = await loadStorePool();
    setFarFromPool(!!(position && currentPool && currentPool.source === 'location' && isOutsidePoolCoverage(currentPool.center, position)));
    try {
      setMonitoring(await syncMonitoring({ position }));
    } catch (error) {
      console.warn('[reminders] sync failed', error);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [storedSettings, storedPool] = await Promise.all([loadReminderSettings(), loadStorePool()]);
      setSettings(storedSettings);
      setPool(storedPool);
      setLoaded(true);
      const summary = await refreshPermissions();
      await resync(summary);
    })();
  }, [refreshPermissions, resync]);

  useOnForeground(() => {
    void refreshPermissions().then(resync);
  });

  const persistSettings = useCallback(
    async (next: ReminderSettings) => {
      setSettings(next);
      await saveReminderSettings(next);
      await resync(location);
    },
    [location, resync],
  );

  const updateSettings = useCallback((patch: Partial<ReminderSettings>) => persistSettings({ ...settingsRef.current, ...patch }), [persistSettings]);

  const toggleStoreExcluded = useCallback(
    (storeId: string) => {
      const current = settingsRef.current.excludedStoreIds;
      const excludedStoreIds = current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId];
      return persistSettings({ ...settingsRef.current, excludedStoreIds });
    },
    [persistSettings],
  );

  const runSearch = useCallback(
    async (resolveCenter: () => Promise<{ center: Coordinates; source: StorePool['source']; label?: string } | null>) => {
      setSearching(true);
      setSearchError(null);
      try {
        const origin = await resolveCenter();
        if (!origin) return null;
        const stores = await findNearbySupermarkets(origin.center);
        const nextPool: StorePool = { center: origin.center, searchedAt: Date.now(), source: origin.source, label: origin.label, stores };
        setPool(nextPool);
        await saveStorePool(nextPool);
        setFarFromPool(false);
        setMonitoring(await syncMonitoring({ position: origin.source === 'location' ? origin.center : null }).catch(() => null));
        return nextPool;
      } catch (error) {
        setSearchError(error instanceof Error && error.message.startsWith('Service magasins') ? getActiveStrings().stores.serviceDown : toUserMessage(error, getActiveLanguage()));
        return null;
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const searchNearMe = useCallback(
    () =>
      runSearch(async () => {
        const permission = await requestForegroundLocation();
        await refreshPermissions();
        if (permission !== 'granted') {
          setSearchError(getActiveStrings().stores.locationOrAddress);
          return null;
        }
        return { center: await getCurrentCoordinates(), source: 'location' };
      }),
    [refreshPermissions, runSearch],
  );

  const searchByPlace = useCallback(
    (query: string) =>
      runSearch(async () => {
        const center = await geocodePlace(query);
        if (!center) {
          setSearchError(getActiveStrings().stores.addressNotFound);
          return null;
        }
        return { center, source: 'address', label: query.trim() };
      }),
    [runSearch],
  );

  const requestForeground = useCallback(async () => {
    const result = await requestForegroundLocation();
    await refreshPermissions();
    return result;
  }, [refreshPermissions]);

  const requestBackground = useCallback(async () => {
    const result = await requestBackgroundLocation();
    await refreshPermissions();
    return result;
  }, [refreshPermissions]);

  const requestNotifications = useCallback(async () => {
    const result = await requestNotificationPermission();
    await refreshPermissions();
    return result;
  }, [refreshPermissions]);

  const enable = useCallback(async () => {
    const next = { ...settingsRef.current, enabled: true };
    setSettings(next);
    await saveReminderSettings(next);
    const summary = await refreshPermissions();
    const position = summary?.foreground === 'granted' ? await getCachedCoordinates(10 * 60 * 1000) : null;
    const status = await syncMonitoring({ position, force: true });
    setMonitoring(status);
    return status;
  }, [refreshPermissions]);

  const clearStores = useCallback(async () => {
    await stopMonitoring();
    await removeKeys([StorageKeys.storePool]);
    setPool(null);
    setFarFromPool(false);
    setMonitoring({ kind: 'stopped', reason: 'no-stores' });
  }, []);

  const disable = useCallback(async () => {
    const next = { ...settingsRef.current, enabled: false };
    setSettings(next);
    await saveReminderSettings(next);
    await stopMonitoring();
    setMonitoring({ kind: 'stopped', reason: 'disabled' });
  }, []);

  return {
    loaded,
    settings,
    pool,
    location,
    notifications,
    monitoring,
    searching,
    searchError,
    farFromPool,
    updateSettings,
    toggleStoreExcluded,
    searchNearMe,
    searchByPlace,
    requestForeground,
    requestBackground,
    requestNotifications,
    enable,
    disable,
    clearStores,
    refreshPermissions: async () => {
      await resync(await refreshPermissions());
    },
  };
}
