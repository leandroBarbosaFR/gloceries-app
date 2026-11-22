import type { Coordinates, ReminderSettings } from '../lib/types';
import { metersBetween } from './geo';
import type { RegionSpec } from './regions';

export const STORE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Never more than one reminder (any store) in this window, e.g. when driving past several stores. */
export const GLOBAL_COOLDOWN_MS = 45 * 60 * 1000;
/**
 * Right after (re)registering regions, expo-location calls requestStateForRegion and emits
 * synthetic events for regions we are already inside. Entries in this window only update state.
 */
export const REGISTRATION_GRACE_MS = 90 * 1000;
/** If the list could not be refreshed and the local copy is older than this, stay silent. */
export const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_ROTATION_INTERVAL_MS = 2 * 60 * 1000;

export type RegionPresence = 'inside' | 'outside';

export type ReminderState = {
  regionStates: Record<string, RegionPresence>;
  storeCooldowns: Record<string, number>;
  lastReminderAt: number | null;
  lastRotationAt: number | null;
  registeredAt: number | null;
};

export const EMPTY_REMINDER_STATE: ReminderState = {
  regionStates: {},
  storeCooldowns: {},
  lastReminderAt: null,
  lastRotationAt: null,
  registeredAt: null,
};

export type TransitionResult = { next: RegionPresence; isGenuineEntry: boolean };

/**
 * Only an observed outside → inside transition counts as a real entry.
 * An "enter" with no prior knowledge is the initial state determination, not a movement.
 */
export function evaluateTransition(previous: RegionPresence | undefined, eventType: 'enter' | 'exit'): TransitionResult {
  if (eventType === 'exit') return { next: 'outside', isGenuineEntry: false };
  return { next: 'inside', isGenuineEntry: previous === 'outside' };
}

/**
 * Seeds presence for newly monitored regions from a known position so the first real entry
 * is not mistaken for the initial state determination. Existing knowledge is preserved.
 */
export function seedRegionStates(
  previous: Record<string, RegionPresence>,
  regions: RegionSpec[],
  position: Coordinates | null,
): Record<string, RegionPresence> {
  const seeded: Record<string, RegionPresence> = {};
  for (const region of regions) {
    const known = previous[region.identifier];
    if (known) {
      seeded[region.identifier] = known;
    } else if (position) {
      seeded[region.identifier] = metersBetween(position, region) <= region.radius ? 'inside' : 'outside';
    }
  }
  return seeded;
}

export function isWithinQuietHours(date: Date, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  const hour = date.getHours();
  return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

export type SkipReason =
  | 'disabled'
  | 'registration-grace'
  | 'unknown-store'
  | 'excluded-store'
  | 'quiet-hours'
  | 'store-cooldown'
  | 'global-cooldown'
  | 'no-pending-items'
  | 'stale-list'
  | 'no-list';

export type PreCheckResult = { allowed: true } | { allowed: false; reason: SkipReason };

/** Checks that do not need the network. Run before fetching fresh items. */
export function preCheckReminder(input: {
  storeId: string;
  storeKnown: boolean;
  settings: ReminderSettings;
  state: ReminderState;
  now: number;
}): PreCheckResult {
  const { storeId, settings, state, now } = input;
  if (!settings.enabled) return { allowed: false, reason: 'disabled' };
  if (state.registeredAt !== null && now - state.registeredAt < REGISTRATION_GRACE_MS) {
    return { allowed: false, reason: 'registration-grace' };
  }
  if (!input.storeKnown) return { allowed: false, reason: 'unknown-store' };
  if (settings.excludedStoreIds.includes(storeId)) return { allowed: false, reason: 'excluded-store' };
  if (settings.quietHoursEnabled && isWithinQuietHours(new Date(now), settings.quietHoursStart, settings.quietHoursEnd)) {
    return { allowed: false, reason: 'quiet-hours' };
  }
  const lastForStore = state.storeCooldowns[storeId];
  if (lastForStore !== undefined && now - lastForStore < STORE_COOLDOWN_MS) return { allowed: false, reason: 'store-cooldown' };
  if (state.lastReminderAt !== null && now - state.lastReminderAt < GLOBAL_COOLDOWN_MS) {
    return { allowed: false, reason: 'global-cooldown' };
  }
  return { allowed: true };
}

export function recordReminderSent(state: ReminderState, storeId: string, now: number): ReminderState {
  return {
    ...state,
    lastReminderAt: now,
    storeCooldowns: pruneCooldowns({ ...state.storeCooldowns, [storeId]: now }, now),
  };
}

/** Drops expired cooldown entries so persisted state does not grow without bound. */
export function pruneCooldowns(cooldowns: Record<string, number>, now: number): Record<string, number> {
  const pruned: Record<string, number> = {};
  for (const [storeId, timestamp] of Object.entries(cooldowns)) {
    if (now - timestamp < STORE_COOLDOWN_MS) pruned[storeId] = timestamp;
  }
  return pruned;
}
