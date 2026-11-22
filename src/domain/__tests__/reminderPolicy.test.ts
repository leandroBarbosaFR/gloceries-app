import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '../../lib/types';
import {
  EMPTY_REMINDER_STATE,
  GLOBAL_COOLDOWN_MS,
  REGISTRATION_GRACE_MS,
  STORE_COOLDOWN_MS,
  evaluateTransition,
  isWithinQuietHours,
  preCheckReminder,
  pruneCooldowns,
  recordReminderSent,
  seedRegionStates,
  type ReminderState,
} from '../reminderPolicy';

const noon = new Date(2026, 10, 22, 12, 0, 0).getTime();
const enabled: ReminderSettings = { ...DEFAULT_REMINDER_SETTINGS, enabled: true };

function check(overrides: { settings?: Partial<ReminderSettings>; state?: Partial<ReminderState>; now?: number; storeKnown?: boolean } = {}) {
  return preCheckReminder({
    storeId: 'store-a',
    storeKnown: overrides.storeKnown ?? true,
    settings: { ...enabled, ...overrides.settings },
    state: { ...EMPTY_REMINDER_STATE, ...overrides.state },
    now: overrides.now ?? noon,
  });
}

describe('evaluateTransition', () => {
  it('treats outside → inside as a genuine entry', () => {
    expect(evaluateTransition('outside', 'enter')).toEqual({ next: 'inside', isGenuineEntry: true });
  });

  it('ignores the initial state determination (unknown → inside)', () => {
    expect(evaluateTransition(undefined, 'enter')).toEqual({ next: 'inside', isGenuineEntry: false });
  });

  it('ignores duplicate enters (iOS can call didEnterRegion several times)', () => {
    expect(evaluateTransition('inside', 'enter').isGenuineEntry).toBe(false);
  });

  it('records exits', () => {
    expect(evaluateTransition('inside', 'exit')).toEqual({ next: 'outside', isGenuineEntry: false });
    expect(evaluateTransition(undefined, 'exit').next).toBe('outside');
  });
});

describe('seedRegionStates', () => {
  const regions = [
    { identifier: 'near', latitude: 48.8566, longitude: 2.3522, radius: 1000, notifyOnEnter: true, notifyOnExit: true },
    { identifier: 'far', latitude: 48.9566, longitude: 2.3522, radius: 1000, notifyOnEnter: true, notifyOnExit: true },
  ];

  it('seeds from geometry when the position is known', () => {
    expect(seedRegionStates({}, regions, { latitude: 48.8566, longitude: 2.3522 })).toEqual({ near: 'inside', far: 'outside' });
  });

  it('preserves known presence and drops regions no longer monitored', () => {
    expect(seedRegionStates({ near: 'outside', gone: 'inside' }, regions, null)).toEqual({ near: 'outside' });
  });
});

describe('isWithinQuietHours', () => {
  it('handles ranges wrapping past midnight', () => {
    expect(isWithinQuietHours(new Date(2026, 0, 1, 23, 0), 22, 7)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 6, 59), 22, 7)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 7, 0), 22, 7)).toBe(false);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 12, 0), 22, 7)).toBe(false);
  });

  it('handles same-day ranges and empty ranges', () => {
    expect(isWithinQuietHours(new Date(2026, 0, 1, 13, 0), 12, 14)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 14, 0), 12, 14)).toBe(false);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 14, 0), 9, 9)).toBe(false);
  });
});

describe('preCheckReminder', () => {
  it('allows a reminder in the nominal case', () => {
    expect(check()).toEqual({ allowed: true });
  });

  type CheckOverrides = Parameters<typeof check>[0];
  it.each<[string, CheckOverrides]>([
    ['disabled', { settings: { enabled: false } }],
    ['unknown-store', { storeKnown: false }],
    ['excluded-store', { settings: { excludedStoreIds: ['store-a'] } }],
    ['quiet-hours', { now: new Date(2026, 10, 22, 23, 30).getTime() }],
    ['store-cooldown', { state: { storeCooldowns: { 'store-a': noon - STORE_COOLDOWN_MS + 60_000 } } }],
    ['global-cooldown', { state: { lastReminderAt: noon - GLOBAL_COOLDOWN_MS + 60_000 } }],
    ['registration-grace', { state: { registeredAt: noon - REGISTRATION_GRACE_MS + 1_000 } }],
  ])('skips with reason %s', (reason, overrides) => {
    expect(check(overrides)).toEqual({ allowed: false, reason });
  });

  it('allows again once cooldowns have elapsed', () => {
    expect(check({ state: { storeCooldowns: { 'store-a': noon - STORE_COOLDOWN_MS }, lastReminderAt: noon - GLOBAL_COOLDOWN_MS } })).toEqual({
      allowed: true,
    });
  });

  it('respects quiet hours only when enabled', () => {
    expect(check({ now: new Date(2026, 10, 22, 23, 30).getTime(), settings: { quietHoursEnabled: false } })).toEqual({ allowed: true });
  });
});

describe('cooldown bookkeeping', () => {
  it('records the reminder and prunes expired cooldowns', () => {
    const state = recordReminderSent({ ...EMPTY_REMINDER_STATE, storeCooldowns: { old: noon - STORE_COOLDOWN_MS - 1 } }, 'store-a', noon);
    expect(state.lastReminderAt).toBe(noon);
    expect(state.storeCooldowns).toEqual({ 'store-a': noon });
  });

  it('pruneCooldowns keeps recent entries', () => {
    expect(pruneCooldowns({ recent: noon - 1000 }, noon)).toEqual({ recent: noon - 1000 });
  });
});
