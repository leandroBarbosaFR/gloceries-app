import type { Coordinates, NearbyStore } from '../lib/types';
import { metersBetween } from './geo';

export const MAX_POOL_SIZE = 80;
/** Two results with the same name closer than this are the same store (both Apple queries return it). */
const DUPLICATE_DISTANCE_METERS = 60;

export type RawAppleStore = { name: string; latitude: number; longitude: number; street: string; city: string; identifier?: string };

export type OverpassElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function normalizedName(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Sorts by distance, removes duplicates and results outside the search radius, caps the pool. */
export function finalizeStores(stores: NearbyStore[], radiusMeters: number): NearbyStore[] {
  const kept: NearbyStore[] = [];
  const seenIds = new Set<string>();
  for (const store of [...stores].sort((left, right) => left.distanceMeters - right.distanceMeters)) {
    if (store.distanceMeters > radiusMeters * 1.1 || seenIds.has(store.id)) continue;
    const duplicate = kept.some(
      (existing) => normalizedName(existing.name) === normalizedName(store.name) && metersBetween(existing, store) < DUPLICATE_DISTANCE_METERS,
    );
    if (duplicate) continue;
    seenIds.add(store.id);
    kept.push(store);
    if (kept.length >= MAX_POOL_SIZE) break;
  }
  return kept;
}

export function normalizeAppleStores(results: RawAppleStore[], origin: Coordinates, radiusMeters: number): NearbyStore[] {
  const stores = results
    .filter((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude))
    .map((result): NearbyStore => {
      const address = [result.street, result.city].filter((part) => part && part.trim()).join(', ');
      return {
        // Apple identifiers are stable (iOS 18+); otherwise derive a deterministic id from the location.
        id: result.identifier ? `apple-${result.identifier}` : `apple-${result.latitude.toFixed(5)},${result.longitude.toFixed(5)}`,
        name: result.name.trim() || 'Supermarché',
        address: address || undefined,
        latitude: result.latitude,
        longitude: result.longitude,
        distanceMeters: metersBetween(origin, result),
      };
    });
  return finalizeStores(stores, radiusMeters);
}

export function parseOverpassStores(elements: OverpassElement[], origin: Coordinates, radiusMeters: number): NearbyStore[] {
  const stores: NearbyStore[] = [];
  for (const element of elements) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (latitude === undefined || longitude === undefined) continue;
    const tags = element.tags ?? {};
    const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    const address = [street, tags['addr:city']].filter(Boolean).join(', ');
    stores.push({
      id: `${element.type}-${element.id}`,
      name: tags.name || tags.brand || 'Supermarché',
      brand: tags.brand,
      address: address || undefined,
      latitude,
      longitude,
      distanceMeters: metersBetween(origin, { latitude, longitude }),
    });
  }
  return finalizeStores(stores, radiusMeters);
}
