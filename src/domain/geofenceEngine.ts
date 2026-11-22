import type { GroceryItem, Language, ReminderSettings, StorePool } from '../lib/types';
import { buildReminderContent, type ReminderContent, type ReminderItem } from './notificationContent';
import { ANCHOR_REGION_ID } from './regions';
import {
  evaluateTransition,
  MAX_SNAPSHOT_AGE_MS,
  MIN_ROTATION_INTERVAL_MS,
  preCheckReminder,
  recordReminderSent,
  type ReminderState,
  type SkipReason,
} from './reminderPolicy';

export type GeofenceEvent = { type: 'enter' | 'exit'; regionId: string };

export type ListSnapshotItem = Pick<GroceryItem, 'id' | 'name' | 'quantity' | 'checked' | 'mute_reminders'>;
export type ListSnapshot = { householdId: string; items: ListSnapshotItem[]; savedAt: number };

export type GeofenceEngineDeps = {
  now: () => number;
  loadState: () => Promise<ReminderState>;
  saveState: (state: ReminderState) => Promise<void>;
  loadSettings: () => Promise<ReminderSettings>;
  loadPool: () => Promise<StorePool | null>;
  loadListSnapshot: () => Promise<ListSnapshot | null>;
  /** Best effort, bounded by a short timeout. Returns null when offline / signed out / failing. */
  fetchFreshItems: (householdId: string) => Promise<ListSnapshotItem[] | null>;
  saveListSnapshot: (snapshot: ListSnapshot) => Promise<void>;
  presentReminder: (content: ReminderContent, language: Language) => Promise<void>;
  loadLanguage: () => Promise<Language>;
  rotateRegions: () => Promise<void>;
};

export type GeofenceOutcome =
  | { kind: 'notified'; storeId: string; itemCount: number; usedFreshList: boolean }
  | { kind: 'skipped'; reason: SkipReason }
  | { kind: 'state-updated' }
  | { kind: 'rotated' }
  | { kind: 'rotation-throttled' };

export function pendingReminderItems(items: ListSnapshotItem[]): ReminderItem[] {
  return items
    .filter((item) => !item.checked && !item.mute_reminders)
    .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity }));
}

/**
 * Pure orchestration of one geofence event. All side effects are injected, so this is
 * exercised by unit tests; the TaskManager task only wires real dependencies.
 */
export async function processGeofenceEvent(event: GeofenceEvent, deps: GeofenceEngineDeps): Promise<GeofenceOutcome> {
  const now = deps.now();
  let state = await deps.loadState();

  if (event.regionId === ANCHOR_REGION_ID) {
    if (event.type !== 'exit') return { kind: 'state-updated' };
    if (state.lastRotationAt !== null && now - state.lastRotationAt < MIN_ROTATION_INTERVAL_MS) {
      return { kind: 'rotation-throttled' };
    }
    await deps.saveState({ ...state, lastRotationAt: now });
    await deps.rotateRegions();
    return { kind: 'rotated' };
  }

  const transition = evaluateTransition(state.regionStates[event.regionId], event.type);
  state = { ...state, regionStates: { ...state.regionStates, [event.regionId]: transition.next } };
  await deps.saveState(state);
  if (!transition.isGenuineEntry) return { kind: 'state-updated' };

  const [settings, pool] = await Promise.all([deps.loadSettings(), deps.loadPool()]);
  const store = pool?.stores.find((candidate) => candidate.id === event.regionId);
  const preCheck = preCheckReminder({ storeId: event.regionId, storeKnown: !!store, settings, state, now });
  if (!preCheck.allowed) return { kind: 'skipped', reason: preCheck.reason };
  if (!store) return { kind: 'skipped', reason: 'unknown-store' };

  const snapshot = await deps.loadListSnapshot();
  if (!snapshot) return { kind: 'skipped', reason: 'no-list' };

  let items = snapshot.items;
  let usedFreshList = false;
  const fresh = await deps.fetchFreshItems(snapshot.householdId).catch(() => null);
  if (fresh) {
    items = fresh;
    usedFreshList = true;
    await deps.saveListSnapshot({ householdId: snapshot.householdId, items: fresh, savedAt: now }).catch(() => undefined);
  } else if (now - snapshot.savedAt > MAX_SNAPSHOT_AGE_MS) {
    return { kind: 'skipped', reason: 'stale-list' };
  }

  const pending = pendingReminderItems(items);
  if (pending.length === 0) return { kind: 'skipped', reason: 'no-pending-items' };

  const language = await deps.loadLanguage().catch((): Language => 'fr');
  const content = buildReminderContent(
    { id: store.id, name: store.name, latitude: store.latitude, longitude: store.longitude },
    pending,
    now,
    language,
  );
  await deps.presentReminder(content, language);
  // Re-read before writing: another event may have updated presence meanwhile.
  const latest = await deps.loadState();
  await deps.saveState(recordReminderSent(latest, store.id, now));
  return { kind: 'notified', storeId: store.id, itemCount: pending.length, usedFreshList };
}
