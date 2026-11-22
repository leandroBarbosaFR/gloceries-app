import type { Coordinates, Language } from '../lib/types';

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle (haversine) distance in meters. */
export function metersBetween(origin: Coordinates, destination: Coordinates): number {
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(origin.latitude)) * Math.cos(toRadians(destination.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function isValidCoordinate(candidate: Partial<Coordinates> | null | undefined): candidate is Coordinates {
  return (
    !!candidate &&
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    Math.abs(candidate.latitude) <= 90 &&
    Math.abs(candidate.longitude) <= 180
  );
}

/** Distance label: "350 m", "1,2 km" (fr, pt) or "1.2 km" (en). */
export function formatDistance(meters: number, language: Language = 'fr'): string {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const kilometers = meters / 1000;
  const rounded = (kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers).toString()).replace(/\.0$/, '');
  return `${language === 'en' ? rounded : rounded.replace('.', ',')} km`;
}
