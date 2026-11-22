import AsyncStorage from '@react-native-async-storage/async-storage';

/** All AsyncStorage keys in one place. Versioned so formats can evolve safely. */
export const StorageKeys = {
  onboardingDone: 'psst:onboarding-done:v1',
  language: 'psst:language:v1',
  reminderSettings: 'psst:reminder-settings:v1',
  storePool: 'psst:store-pool:v1',
  reminderState: 'psst:reminder-state:v1',
  listSnapshot: 'psst:list-snapshot:v1',
  monitoring: 'psst:monitoring:v1',
  devEventLog: 'psst:dev-event-log:v1',
  listCache: (householdId: string) => `psst:list-cache:v1:${householdId}`,
  offlineQueue: (householdId: string) => `psst:queue:v1:${householdId}`,
} as const;

/** Keys from the original starter, removed on sign-out / data deletion. */
const LEGACY_KEY_PREFIXES = ['psst:settings', 'psst:stores', 'psst:geofence-snapshot', 'psst:cooldown:'];

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[storage] unreadable key ${key}`, error);
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeKeys(keys: string[]): Promise<void> {
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

/**
 * Removes every Psst! key except the Supabase session (handled by supabase.auth.signOut)
 * and, optionally, the onboarding flag.
 */
export async function clearPsstData(options: { keepOnboarding?: boolean } = {}): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const toRemove = allKeys.filter((key) => {
    if (options.keepOnboarding && (key === StorageKeys.onboardingDone || key === StorageKeys.language)) return false;
    return key.startsWith('psst:') || LEGACY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
  });
  await removeKeys(toRemove);
}
