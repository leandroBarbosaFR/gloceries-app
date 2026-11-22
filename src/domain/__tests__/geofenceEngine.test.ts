import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings, type StorePool } from '../../lib/types';
import { processGeofenceEvent, type GeofenceEngineDeps, type ListSnapshot, type ListSnapshotItem } from '../geofenceEngine';
import type { ReminderContent } from '../notificationContent';
import { ANCHOR_REGION_ID } from '../regions';
import { EMPTY_REMINDER_STATE, MAX_SNAPSHOT_AGE_MS, MIN_ROTATION_INTERVAL_MS, type ReminderState } from '../reminderPolicy';

const noon = new Date(2026, 10, 22, 12, 0, 0).getTime();

const pool: StorePool = {
  center: { latitude: 48.8566, longitude: 2.3522 },
  searchedAt: noon - 1000,
  source: 'location',
  stores: [{ id: 'node-1', name: 'Biocoop Bastille', latitude: 48.853, longitude: 2.369, distanceMeters: 1200 }],
};

const items: ListSnapshotItem[] = [
  { id: 'milk', name: 'Lait', quantity: 2, checked: false, mute_reminders: false },
  { id: 'bread', name: 'Pain', quantity: 1, checked: true, mute_reminders: false },
  { id: 'wine', name: 'Vin', quantity: 1, checked: false, mute_reminders: true },
  { id: 'eggs', name: 'Œufs', quantity: 1, checked: false, mute_reminders: false },
];

type Harness = {
  deps: GeofenceEngineDeps;
  presented: ReminderContent[];
  rotations: number;
  getState: () => ReminderState;
  savedSnapshots: ListSnapshot[];
};

function createHarness(options: {
  state?: Partial<ReminderState>;
  settings?: Partial<ReminderSettings>;
  language?: 'fr' | 'en';
  fresh?: ListSnapshotItem[] | null | 'throw';
  snapshot?: ListSnapshot | null;
  pool?: StorePool | null;
  now?: number;
} = {}): Harness {
  let state: ReminderState = { ...EMPTY_REMINDER_STATE, ...options.state };
  const presented: ReminderContent[] = [];
  const savedSnapshots: ListSnapshot[] = [];
  const harness: Harness = {
    presented,
    rotations: 0,
    savedSnapshots,
    getState: () => state,
    deps: {
      now: () => options.now ?? noon,
      loadState: async () => state,
      saveState: async (next) => {
        state = next;
      },
      loadSettings: async () => ({ ...DEFAULT_REMINDER_SETTINGS, enabled: true, ...options.settings }),
      loadPool: async () => (options.pool === undefined ? pool : options.pool),
      loadListSnapshot: async () =>
        options.snapshot === undefined ? { householdId: 'house', items, savedAt: noon - 60_000 } : options.snapshot,
      fetchFreshItems: async () => {
        if (options.fresh === 'throw') throw new Error('Network request failed');
        return options.fresh === undefined ? null : options.fresh;
      },
      saveListSnapshot: async (snapshot) => {
        savedSnapshots.push(snapshot);
      },
      presentReminder: async (content) => {
        presented.push(content);
      },
      loadLanguage: async () => options.language ?? 'fr',
      rotateRegions: async () => {
        harness.rotations += 1;
      },
    },
  };
  return harness;
}

const enterStore = { type: 'enter' as const, regionId: 'node-1' };

describe('processGeofenceEvent', () => {
  it('sends ONE grouped notification on a genuine entry, excluding checked and muted items', async () => {
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } } });
    const outcome = await processGeofenceEvent(enterStore, harness.deps);

    expect(outcome).toEqual({ kind: 'notified', storeId: 'node-1', itemCount: 2, usedFreshList: false });
    expect(harness.presented).toHaveLength(1);
    expect(harness.presented[0].title).toBe('Psst ! Biocoop Bastille est tout près');
    expect(harness.presented[0].body).toBe('2 articles à acheter : Lait (×2) et Œufs.');
    expect(harness.presented[0].data.itemIds).toEqual(['milk', 'eggs']);
    expect(harness.getState().storeCooldowns['node-1']).toBe(noon);
    expect(harness.getState().lastReminderAt).toBe(noon);
  });

  it('writes the reminder in English when the app language is English', async () => {
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } }, language: 'en' });
    await processGeofenceEvent(enterStore, harness.deps);
    expect(harness.presented[0].title).toBe('Psst! Biocoop Bastille is nearby');
    expect(harness.presented[0].body).toBe('2 items to buy: Lait (×2) and Œufs.');
  });

  it('does not notify for the initial state determination after registration', async () => {
    const harness = createHarness();
    expect(await processGeofenceEvent(enterStore, harness.deps)).toEqual({ kind: 'state-updated' });
    expect(harness.getState().regionStates['node-1']).toBe('inside');
    expect(harness.presented).toHaveLength(0);
  });

  it('notifies at most once for duplicate enter events', async () => {
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } } });
    await processGeofenceEvent(enterStore, harness.deps);
    await processGeofenceEvent(enterStore, harness.deps);
    expect(harness.presented).toHaveLength(1);
  });

  it('honours the per-store cooldown after exit and re-entry', async () => {
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } } });
    await processGeofenceEvent(enterStore, harness.deps);
    await processGeofenceEvent({ type: 'exit', regionId: 'node-1' }, harness.deps);
    const outcome = await processGeofenceEvent(enterStore, harness.deps);
    expect(outcome).toEqual({ kind: 'skipped', reason: 'store-cooldown' });
    expect(harness.presented).toHaveLength(1);
  });

  it('prefers the fresh server list and caches it', async () => {
    const fresh: ListSnapshotItem[] = [{ id: 'coffee', name: 'Café', quantity: 1, checked: false, mute_reminders: false }];
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } }, fresh });
    const outcome = await processGeofenceEvent(enterStore, harness.deps);
    expect(outcome).toMatchObject({ kind: 'notified', itemCount: 1, usedFreshList: true });
    expect(harness.presented[0].body).toBe('1 article à acheter : Café.');
    expect(harness.savedSnapshots).toHaveLength(1);
  });

  it('falls back to the local snapshot when the network fails', async () => {
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } }, fresh: 'throw' });
    expect(await processGeofenceEvent(enterStore, harness.deps)).toMatchObject({ kind: 'notified', usedFreshList: false });
  });

  it('stays silent when offline with a very old snapshot', async () => {
    const harness = createHarness({
      state: { regionStates: { 'node-1': 'outside' } },
      snapshot: { householdId: 'house', items, savedAt: noon - MAX_SNAPSHOT_AGE_MS - 1 },
    });
    expect(await processGeofenceEvent(enterStore, harness.deps)).toEqual({ kind: 'skipped', reason: 'stale-list' });
  });

  it('does not notify nor consume the cooldown when nothing is pending', async () => {
    const fresh: ListSnapshotItem[] = [{ id: 'a', name: 'A', quantity: 1, checked: true, mute_reminders: false }];
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } }, fresh });
    expect(await processGeofenceEvent(enterStore, harness.deps)).toEqual({ kind: 'skipped', reason: 'no-pending-items' });
    expect(harness.getState().storeCooldowns).toEqual({});
  });

  it('ignores stores that are no longer in the pool', async () => {
    const harness = createHarness({ state: { regionStates: { 'node-9': 'outside' } } });
    expect(await processGeofenceEvent({ type: 'enter', regionId: 'node-9' }, harness.deps)).toEqual({
      kind: 'skipped',
      reason: 'unknown-store',
    });
  });

  it('does nothing when reminders were disabled', async () => {
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } }, settings: { enabled: false } });
    expect(await processGeofenceEvent(enterStore, harness.deps)).toEqual({ kind: 'skipped', reason: 'disabled' });
  });

  it('skips when the user has no list snapshot (signed out)', async () => {
    const harness = createHarness({ state: { regionStates: { 'node-1': 'outside' } }, snapshot: null });
    expect(await processGeofenceEvent(enterStore, harness.deps)).toEqual({ kind: 'skipped', reason: 'no-list' });
  });

  describe('anchor region', () => {
    it('rotates regions when leaving the anchor', async () => {
      const harness = createHarness();
      expect(await processGeofenceEvent({ type: 'exit', regionId: ANCHOR_REGION_ID }, harness.deps)).toEqual({ kind: 'rotated' });
      expect(harness.rotations).toBe(1);
      expect(harness.getState().lastRotationAt).toBe(noon);
    });

    it('throttles rotations', async () => {
      const harness = createHarness({ state: { lastRotationAt: noon - MIN_ROTATION_INTERVAL_MS + 1 } });
      expect(await processGeofenceEvent({ type: 'exit', regionId: ANCHOR_REGION_ID }, harness.deps)).toEqual({
        kind: 'rotation-throttled',
      });
      expect(harness.rotations).toBe(0);
    });

    it('never notifies for the anchor', async () => {
      const harness = createHarness();
      await processGeofenceEvent({ type: 'enter', regionId: ANCHOR_REGION_ID }, harness.deps);
      expect(harness.presented).toHaveLength(0);
      expect(harness.rotations).toBe(0);
    });
  });
});
