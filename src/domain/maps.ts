import type { MapsProvider, ReminderStore } from '../lib/types';

export type MapsLinks = {
  /** Native URL scheme (requires LSApplicationQueriesSchemes to be checked with canOpenURL). */
  appUrl: string | null;
  /** Universal link / web fallback. */
  webUrl: string;
};

export function buildMapsLinks(store: ReminderStore, provider: MapsProvider): MapsLinks {
  const coordinates = `${store.latitude},${store.longitude}`;
  const name = encodeURIComponent(store.name);
  switch (provider) {
    case 'google':
      return {
        appUrl: `comgooglemaps://?daddr=${coordinates}&directionsmode=driving`,
        webUrl: `https://www.google.com/maps/dir/?api=1&destination=${coordinates}`,
      };
    case 'waze':
      return {
        appUrl: `waze://?ll=${coordinates}&navigate=yes`,
        webUrl: `https://waze.com/ul?ll=${coordinates}&navigate=yes`,
      };
    case 'apple':
    default:
      // maps.apple.com links open the Plans app directly on iOS.
      return { appUrl: null, webUrl: `https://maps.apple.com/?daddr=${coordinates}&q=${name}&dirflg=d` };
  }
}
