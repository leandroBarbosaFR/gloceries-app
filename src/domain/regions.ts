import type { Coordinates, NearbyStore } from '../lib/types';
import { clamp, metersBetween } from './geo';

/**
 * iOS allows 20 monitored regions per app (shared with beacon regions).
 * We use at most 18 store regions + 1 "anchor" region, leaving one slot of headroom.
 */
export const MAX_STORE_REGIONS = 18;
export const ANCHOR_REGION_ID = 'psst-anchor';
export const MIN_ANCHOR_RADIUS_METERS = 1_000;
export const MAX_ANCHOR_RADIUS_METERS = 5_000;
/** Core Location is unreliable with tiny regions; Apple recommends ≥ 100–200 m. */
export const MIN_STORE_RADIUS_METERS = 200;

export type RegionSpec = {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  /**
   * Exit events are REQUIRED: expo-location de-duplicates by remembered state, so without exit
   * notifications a region stays "inside" forever and the next real entry is never delivered.
   */
  notifyOnExit: boolean;
};

export type RegionSelection = {
  storeRegions: RegionSpec[];
  anchor: RegionSpec | null;
  monitoredStoreIds: string[];
};

export type RegionSelectionInput = {
  stores: NearbyStore[];
  /** Best-known current position; falls back to the pool center. */
  center: Coordinates;
  radiusMeters: number;
  excludedStoreIds?: string[];
  maxStoreRegions?: number;
};

/**
 * Picks the nearest eligible stores around `center`. When the pool has more stores than iOS
 * can monitor, an anchor region centered on the user is added: leaving it means we should
 * rotate to the stores that are now closest (done in the background task, without GPS polling).
 */
export function selectMonitoredRegions(input: RegionSelectionInput): RegionSelection {
  const maxStoreRegions = input.maxStoreRegions ?? MAX_STORE_REGIONS;
  const excluded = new Set(input.excludedStoreIds ?? []);
  const storeRadius = Math.max(MIN_STORE_RADIUS_METERS, input.radiusMeters);

  const seenIds = new Set<string>();
  const eligible = input.stores
    .filter((store) => {
      if (excluded.has(store.id) || seenIds.has(store.id) || store.id === ANCHOR_REGION_ID) return false;
      seenIds.add(store.id);
      return true;
    })
    .map((store) => ({ store, distance: metersBetween(input.center, store) }))
    .sort((left, right) => left.distance - right.distance);

  const chosen = eligible.slice(0, maxStoreRegions);
  const storeRegions: RegionSpec[] = chosen.map(({ store }) => ({
    identifier: store.id,
    latitude: store.latitude,
    longitude: store.longitude,
    radius: storeRadius,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  let anchor: RegionSpec | null = null;
  if (eligible.length > maxStoreRegions && chosen.length > 0) {
    const farthestChosen = chosen[chosen.length - 1].distance;
    anchor = {
      identifier: ANCHOR_REGION_ID,
      latitude: input.center.latitude,
      longitude: input.center.longitude,
      radius: computeAnchorRadius(farthestChosen),
      notifyOnEnter: false,
      notifyOnExit: true,
    };
  }

  return { storeRegions, anchor, monitoredStoreIds: chosen.map(({ store }) => store.id) };
}

/**
 * Half the distance to the farthest monitored store, clamped to a sensible range and rounded to
 * 100 m so small GPS jitter does not change the region signature (which would force a re-registration).
 */
export function computeAnchorRadius(farthestStoreDistanceMeters: number): number {
  const radius = clamp(farthestStoreDistanceMeters / 2, MIN_ANCHOR_RADIUS_METERS, MAX_ANCHOR_RADIUS_METERS);
  return Math.round(radius / 100) * 100;
}

export function allRegions(selection: RegionSelection): RegionSpec[] {
  return selection.anchor ? [...selection.storeRegions, selection.anchor] : selection.storeRegions;
}

/**
 * Stable signature used to avoid re-registering identical regions. Re-registration makes
 * expo-location call requestStateForRegion, which emits synthetic enter/exit events.
 * The anchor center is rounded to ~100 m so tiny GPS jitter does not trigger a re-registration.
 */
export function regionSignature(regions: RegionSpec[]): string {
  return regions
    .map((region) => {
      const precision = region.identifier === ANCHOR_REGION_ID ? 3 : 5;
      return `${region.identifier}@${region.latitude.toFixed(precision)},${region.longitude.toFixed(precision)}r${Math.round(region.radius)}`;
    })
    .sort()
    .join('|');
}

/** True when the user is far enough from the pool center that a new store search is advisable. */
export function isOutsidePoolCoverage(poolCenter: Coordinates, position: Coordinates, coverageMeters = 4_000): boolean {
  return metersBetween(poolCenter, position) > coverageMeters;
}
