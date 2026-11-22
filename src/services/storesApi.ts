import * as Location from 'expo-location';
import { StoreSearch } from '../../modules/store-search';
import { normalizeAppleStores, parseOverpassStores, type OverpassElement } from '../domain/stores';
import type { Coordinates, NearbyStore } from '../lib/types';

export const STORE_SEARCH_RADIUS_METERS = 5_000;

/**
 * Store discovery, only on explicit user action (never from the background task).
 * 1. Apple Maps (MapKit, local native module): free, no key, no third party. iOS builds only.
 * 2. Fallback: OpenStreetMap Overpass public mirrors — no SLA, often saturated.
 */
export async function findNearbySupermarkets(origin: Coordinates): Promise<NearbyStore[]> {
  let appleError: unknown = null;
  if (StoreSearch) {
    try {
      const results = await withTimeout(StoreSearch.searchSupermarkets(origin.latitude, origin.longitude, STORE_SEARCH_RADIUS_METERS), 15_000);
      const stores = normalizeAppleStores(results, origin, STORE_SEARCH_RADIUS_METERS);
      if (stores.length > 0) return stores;
    } catch (error) {
      appleError = error;
    }
  }
  try {
    return await findWithOverpass(origin);
  } catch (overpassError) {
    // Apple answered "nothing here" and OSM is down: report an empty area rather than an outage.
    if (StoreSearch && !appleError) return [];
    throw overpassError;
  }
}

const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function queryOverpass(endpoint: string, body: string, timeoutMs: number): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      // overpass-api.de rejects requests without an identifying User-Agent (HTTP 406).
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'Psst/0.1 (iOS grocery list app)' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
    const json = (await response.json()) as { elements?: OverpassElement[] };
    return json.elements ?? [];
  } finally {
    clearTimeout(timer);
  }
}

async function findWithOverpass(origin: Coordinates): Promise<NearbyStore[]> {
  const around = `around:${STORE_SEARCH_RADIUS_METERS},${origin.latitude},${origin.longitude}`;
  const query = `[out:json][timeout:20];(nwr["shop"="supermarket"](${around}););out center 160;`;
  const body = `data=${encodeURIComponent(query)}`;
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return parseOverpassStores(await queryOverpass(endpoint, body, 12_000), origin, STORE_SEARCH_RADIUS_METERS);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Service magasins indisponible (${lastError instanceof Error ? lastError.message : 'inconnu'})`);
}

/**
 * Non-geolocation fallback: resolves a city/address with Apple's geocoder (CLGeocoder on iOS,
 * no location permission needed). Returns null when nothing matches.
 */
export async function geocodePlace(query: string): Promise<Coordinates | null> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;
  const results = await Location.geocodeAsync(trimmed);
  const first = results[0];
  return first ? { latitude: first.latitude, longitude: first.longitude } : null;
}
