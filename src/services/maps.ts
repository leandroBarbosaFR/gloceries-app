import { Linking } from 'react-native';
import { buildMapsLinks } from '../domain/maps';
import type { MapsProvider, ReminderStore } from '../lib/types';

/** Opens the native app when installed (needs LSApplicationQueriesSchemes), else the web/universal link. */
export async function openDirections(store: ReminderStore, provider: MapsProvider): Promise<void> {
  const links = buildMapsLinks(store, provider);
  if (links.appUrl) {
    const installed = await Linking.canOpenURL(links.appUrl).catch(() => false);
    if (installed) {
      await Linking.openURL(links.appUrl);
      return;
    }
  }
  await Linking.openURL(links.webUrl);
}
