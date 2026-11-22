/**
 * Background geofencing (iOS region monitoring via expo-location + expo-task-manager).
 *
 * - The task is defined at MODULE SCOPE and this file is imported from index.ts before the
 *   React tree, so it exists when iOS relaunches the app in the background for a region event.
 * - No continuous GPS: iOS wakes the app on region boundary crossings only. A one-shot position
 *   is requested only when the user leaves the "anchor" region (to rotate monitored stores).
 * - All decision logic lives in src/domain/geofenceEngine.ts (unit-tested).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { processGeofenceEvent, type GeofenceEngineDeps, type GeofenceEvent, type GeofenceOutcome, type ListSnapshot } from '../domain/geofenceEngine';
import { allRegions, regionSignature, selectMonitoredRegions } from '../domain/regions';
import { EMPTY_REMINDER_STATE, seedRegionStates, type ReminderState } from '../domain/reminderPolicy';
import { DEFAULT_REMINDER_SETTINGS, type Coordinates, type ReminderSettings, type StorePool } from '../lib/types';
import { loadLanguage } from '../i18n';
import { fetchItemsForReminder } from './householdApi';
import { presentReminder } from './notifications';
import { getCachedCoordinates, getLocationPermissionSummary } from './permissions';
import { readJson, removeKeys, StorageKeys, writeJson } from './storage';

export const GEOFENCE_TASK = 'psst-geofence';

type MonitoringRecord = { signature: string; monitoredStoreIds: string[]; updatedAt: number };

export type MonitoringStatus =
  | { kind: 'monitoring'; storeCount: number; changed: boolean }
  | { kind: 'stopped'; reason: 'disabled' | 'no-stores' | 'permission-missing' | 'services-disabled' };

// ---------------------------------------------------------------------------
// Persistence helpers (shared by the task and the UI)
// ---------------------------------------------------------------------------
export async function loadReminderSettings(): Promise<ReminderSettings> {
  const stored = await readJson<Partial<ReminderSettings>>(StorageKeys.reminderSettings, {});
  return { ...DEFAULT_REMINDER_SETTINGS, ...stored };
}
export const saveReminderSettings = (settings: ReminderSettings) => writeJson(StorageKeys.reminderSettings, settings);
export const loadStorePool = () => readJson<StorePool | null>(StorageKeys.storePool, null);
export const saveStorePool = (pool: StorePool) => writeJson(StorageKeys.storePool, pool);
export const loadReminderState = async (): Promise<ReminderState> => ({
  ...EMPTY_REMINDER_STATE,
  ...(await readJson<Partial<ReminderState>>(StorageKeys.reminderState, {})),
});
const saveReminderState = (state: ReminderState) => writeJson(StorageKeys.reminderState, state);
export const loadListSnapshot = () => readJson<ListSnapshot | null>(StorageKeys.listSnapshot, null);
export const saveListSnapshot = (snapshot: ListSnapshot) => writeJson(StorageKeys.listSnapshot, snapshot);
export const loadMonitoringRecord = () => readJson<MonitoringRecord | null>(StorageKeys.monitoring, null);

// ---------------------------------------------------------------------------
// Serialization: task events and UI-driven syncs share persisted state.
// ---------------------------------------------------------------------------
let queueTail: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = queueTail.then(work, work);
  queueTail = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Dev-only event log (never in release builds: it would amount to a movement history)
// ---------------------------------------------------------------------------
export type DevLogEntry = { at: number; regionId: string; type: string; outcome: string };
async function devLog(event: GeofenceEvent, outcome: GeofenceOutcome | { kind: 'error'; message: string }): Promise<void> {
  if (!__DEV__) return;
  const entries = await readJson<DevLogEntry[]>(StorageKeys.devEventLog, []);
  const description = outcome.kind === 'skipped' ? `skipped:${outcome.reason}` : outcome.kind === 'error' ? `error:${outcome.message}` : outcome.kind;
  const next = [{ at: Date.now(), regionId: event.regionId, type: event.type, outcome: description }, ...entries].slice(0, 30);
  await writeJson(StorageKeys.devEventLog, next);
}
export const readDevLog = () => readJson<DevLogEntry[]>(StorageKeys.devEventLog, []);

// ---------------------------------------------------------------------------
// Region registration
// ---------------------------------------------------------------------------
async function positionForRotation(): Promise<Coordinates | null> {
  const cached = await getCachedCoordinates(2 * 60 * 1000);
  if (cached) return cached;
  // One-shot fix (Wi-Fi/cell level accuracy), bounded in time. Only on anchor exit, never in a loop.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000));
  const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    .then((location) => ({ latitude: location.coords.latitude, longitude: location.coords.longitude }))
    .catch(() => null);
  return Promise.race([fix, timeout]);
}

async function stopNative(): Promise<void> {
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}

async function syncMonitoringUnsafe(options: { position?: Coordinates | null; force?: boolean }): Promise<MonitoringStatus> {
  const [settings, pool] = await Promise.all([loadReminderSettings(), loadStorePool()]);
  const stop = async (reason: Extract<MonitoringStatus, { kind: 'stopped' }>['reason']): Promise<MonitoringStatus> => {
    await stopNative();
    await removeKeys([StorageKeys.monitoring]);
    return { kind: 'stopped', reason };
  };

  if (!settings.enabled) return stop('disabled');
  if (!pool || pool.stores.length === 0) return stop('no-stores');
  const permissions = await getLocationPermissionSummary();
  if (!permissions.servicesEnabled) return stop('services-disabled');
  if (permissions.background !== 'granted') return stop('permission-missing');

  const position = options.position ?? null;
  const selection = selectMonitoredRegions({
    stores: pool.stores,
    center: position ?? pool.center,
    radiusMeters: settings.radiusMeters,
    excludedStoreIds: settings.excludedStoreIds,
  });
  const regions = allRegions(selection);
  if (selection.storeRegions.length === 0) return stop('no-stores');

  const signature = regionSignature(regions);
  const [record, started] = await Promise.all([loadMonitoringRecord(), Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false)]);
  if (started && record?.signature === signature && !options.force) {
    return { kind: 'monitoring', storeCount: selection.storeRegions.length, changed: false };
  }

  const state = await loadReminderState();
  await saveReminderState({
    ...state,
    regionStates: seedRegionStates(state.regionStates, regions, position),
    // Grace window only when presence could not be seeded from a known position.
    registeredAt: position ? null : Date.now(),
  });
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  await writeJson(StorageKeys.monitoring, { signature, monitoredStoreIds: selection.monitoredStoreIds, updatedAt: Date.now() } satisfies MonitoringRecord);
  return { kind: 'monitoring', storeCount: selection.storeRegions.length, changed: true };
}

/**
 * Brings native monitoring in line with saved settings + store pool. Cheap and idempotent:
 * regions are only re-registered when the selection actually changes.
 */
export function syncMonitoring(options: { position?: Coordinates | null; force?: boolean } = {}): Promise<MonitoringStatus> {
  return serialized(() => syncMonitoringUnsafe(options));
}

export function stopMonitoring(): Promise<void> {
  return serialized(async () => {
    await stopNative();
    const state = await loadReminderState();
    // Native presence is forgotten when monitoring stops; keep cooldowns to avoid re-notifying.
    await saveReminderState({ ...state, regionStates: {}, registeredAt: null });
    await removeKeys([StorageKeys.monitoring]);
  });
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------
const engineDeps: GeofenceEngineDeps = {
  now: () => Date.now(),
  loadState: loadReminderState,
  saveState: saveReminderState,
  loadSettings: loadReminderSettings,
  loadPool: loadStorePool,
  loadListSnapshot,
  fetchFreshItems: (householdId) => fetchItemsForReminder(householdId),
  saveListSnapshot,
  presentReminder,
  loadLanguage,
  // Already inside the serialized section: call the unsafe variant to avoid a deadlock.
  rotateRegions: async () => {
    await syncMonitoringUnsafe({ position: await positionForRotation() });
  },
};

type GeofenceTaskData = { eventType: Location.GeofencingEventType; region: Location.LocationRegion };

function toEvent(data: GeofenceTaskData | undefined): GeofenceEvent | null {
  const identifier = data?.region?.identifier;
  if (!identifier) return null;
  if (data.eventType === Location.GeofencingEventType.Enter) return { type: 'enter', regionId: identifier };
  if (data.eventType === Location.GeofencingEventType.Exit) return { type: 'exit', regionId: identifier };
  return null;
}

export function handleGeofenceEvent(event: GeofenceEvent): Promise<GeofenceOutcome> {
  return serialized(async () => {
    try {
      const outcome = await processGeofenceEvent(event, engineDeps);
      await devLog(event, outcome);
      return outcome;
    } catch (error) {
      await devLog(event, { kind: 'error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
}

TaskManager.defineTask<GeofenceTaskData>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[geofence] task error', error.message);
    return;
  }
  const event = toEvent(data);
  if (!event) return;
  try {
    await handleGeofenceEvent(event);
  } catch (taskError) {
    console.warn('[geofence] event failed', taskError);
  }
});

// ---------------------------------------------------------------------------
// QA helpers (exposed in the UI only in __DEV__ builds)
// ---------------------------------------------------------------------------
/** Simulates leaving then entering a store region, bypassing cooldowns, to test the full pipeline on device. */
export async function simulateStoreEntry(storeId: string): Promise<GeofenceOutcome> {
  await serialized(async () => {
    const state = await loadReminderState();
    await saveReminderState({
      ...state,
      registeredAt: null,
      lastReminderAt: null,
      storeCooldowns: {},
      regionStates: { ...state.regionStates, [storeId]: 'outside' },
    });
  });
  return handleGeofenceEvent({ type: 'enter', regionId: storeId });
}

export function resetReminderCooldowns(): Promise<void> {
  return serialized(async () => {
    const state = await loadReminderState();
    await saveReminderState({ ...state, storeCooldowns: {}, lastReminderAt: null });
  });
}
