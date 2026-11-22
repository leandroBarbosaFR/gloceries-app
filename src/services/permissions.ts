import * as Location from 'expo-location';
import type { Coordinates } from '../lib/types';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export type LocationPermissionSummary = {
  servicesEnabled: boolean;
  foreground: PermissionState;
  /** iOS "Toujours" — required for region monitoring while the app is closed. */
  background: PermissionState;
  /** iOS 14+ "Position exacte" toggle. Geofences still work with approximate location but far less reliably. */
  preciseLocation: boolean | null;
};

function toState(response: Location.LocationPermissionResponse): PermissionState {
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'undetermined' : 'denied';
}

export async function getLocationPermissionSummary(): Promise<LocationPermissionSummary> {
  const [servicesEnabled, foreground, background] = await Promise.all([
    Location.hasServicesEnabledAsync().catch(() => true),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  const accuracy = foreground.ios?.accuracy;
  return {
    servicesEnabled,
    foreground: toState(foreground),
    background: toState(background),
    preciseLocation: accuracy === undefined ? null : accuracy === 'full',
  };
}

export async function requestForegroundLocation(): Promise<PermissionState> {
  return toState(await Location.requestForegroundPermissionsAsync());
}

/** Must only be called after a clear in-app explanation, when the user enables reminders. */
export async function requestBackgroundLocation(): Promise<PermissionState> {
  return toState(await Location.requestBackgroundPermissionsAsync());
}

/** One-shot position for a store search. No continuous tracking. */
export async function getCurrentCoordinates(): Promise<Coordinates> {
  const recent = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000, requiredAccuracy: 300 }).catch(() => null);
  if (recent) return { latitude: recent.coords.latitude, longitude: recent.coords.longitude };
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

/** Cheap: cached system location only, never powers up GPS. */
export async function getCachedCoordinates(maxAgeMs: number): Promise<Coordinates | null> {
  const known = await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs, requiredAccuracy: 2_000 }).catch(() => null);
  return known ? { latitude: known.coords.latitude, longitude: known.coords.longitude } : null;
}
