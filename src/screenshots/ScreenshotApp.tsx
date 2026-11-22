/**
 * App Store screenshot mode. Compiled in only when EXPO_PUBLIC_SCREENSHOT_MODE=1 at bundle time
 * (never set for EAS production builds). Renders the real screens with fixture data, no network.
 * Switch scenes and language with:
 *   xcrun simctl openurl booted "psst://screenshot/<list|stores|store|settings>?lang=<fr|en|pt>"
 */
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabBar, type TabKey } from '../components/TabBar';
import type { GroceryListState } from '../hooks/useGroceryList';
import type { RemindersState } from '../hooks/useReminders';
import { useI18n } from '../i18n';
import { DEFAULT_REMINDER_SETTINGS, type GroceryItem, type Household, type Language, type NearbyStore, type StorePool } from '../lib/types';
import { ListScreen } from '../screens/ListScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StoreSheet } from '../screens/StoreSheet';
import { StoresScreen } from '../screens/StoresScreen';
import { colors } from '../theme/tokens';

type Scene = 'list' | 'stores' | 'store' | 'settings';
const SCENES: Scene[] = ['list', 'stores', 'store', 'settings'];
const noop = () => undefined;
const asyncNoop = async () => undefined;

type Fixture = {
  household: Household;
  email: string;
  items: [string, Partial<GroceryItem>?][];
  center: { latitude: number; longitude: number };
  stores: [string, string, number, number][];
};

const FIXTURES: Record<Language, Fixture> = {
  fr: {
    household: { id: 'demo', name: 'Famille Martin', invite_code: '7F3A9C21B0E4D58A' },
    email: 'marie.martin@exemple.fr',
    items: [['Lait demi-écrémé', { quantity: 2 }], ['Pain complet'], ['Œufs bio'], ['Tomates cerises'], ['Café en grains'], ['Chocolat noir', { mute_reminders: true }], ['Bananes', { checked: true }], ['Pâtes', { checked: true }]],
    center: { latitude: 48.8534, longitude: 2.3692 },
    stores: [
      ['Marché Frais Bastille', '14 rue de la Roquette, Paris', 240, 40],
      ['Épicerie Bio du Faubourg', '52 rue du Faubourg Saint-Antoine, Paris', 480, 120],
      ['Supermarché Saint-Paul', '8 rue Saint-Antoine, Paris', 720, 260],
      ['Primeur & Co', '31 boulevard Beaumarchais, Paris', 910, 330],
      ['Superette des Vosges', '3 rue de Birague, Paris', 1150, 280],
      ['Halle Ledru-Rollin', '102 avenue Ledru-Rollin, Paris', 1420, 150],
    ],
  },
  en: {
    household: { id: 'demo', name: 'The Taylors', invite_code: '7F3A9C21B0E4D58A' },
    email: 'emma.taylor@example.com',
    items: [['Semi-skimmed milk', { quantity: 2 }], ['Wholemeal bread'], ['Free-range eggs'], ['Cherry tomatoes'], ['Coffee beans'], ['Dark chocolate', { mute_reminders: true }], ['Bananas', { checked: true }], ['Pasta', { checked: true }]],
    center: { latitude: 51.5390, longitude: -0.1426 },
    stores: [
      ['Fresh Market Camden', '14 Parkway, London', 240, 40],
      ['Organic Grocer', '52 Chalk Farm Road, London', 480, 120],
      ['Corner Supermarket', '8 Camden High Street, London', 720, 260],
      ['Greengrocer & Co', '31 Kentish Town Road, London', 910, 330],
      ['Primrose Food Hall', '3 Regent’s Park Road, London', 1150, 280],
      ['Market Hall Euston', '102 Eversholt Street, London', 1420, 150],
    ],
  },
  pt: {
    household: { id: 'demo', name: 'Família Souza', invite_code: '7F3A9C21B0E4D58A' },
    email: 'ana.souza@exemplo.com.br',
    items: [['Leite integral', { quantity: 2 }], ['Pão de forma'], ['Ovos caipiras'], ['Tomate-cereja'], ['Café em grãos'], ['Chocolate amargo', { mute_reminders: true }], ['Bananas', { checked: true }], ['Arroz', { checked: true }]],
    center: { latitude: -23.5614, longitude: -46.6826 },
    stores: [
      ['Mercado Fresco Pinheiros', 'Rua dos Pinheiros, 140 – São Paulo', 240, 40],
      ['Empório Orgânico', 'Rua Teodoro Sampaio, 520 – São Paulo', 480, 120],
      ['Supermercado da Vila', 'Rua Fradique Coutinho, 80 – São Paulo', 720, 260],
      ['Hortifruti & Cia', 'Rua Cardeal Arcoverde, 310 – São Paulo', 910, 330],
      ['Mercadinho Jardim', 'Rua Mourato Coelho, 30 – São Paulo', 1150, 280],
      ['Feira Coberta Pinheiros', 'Av. Pedroso de Morais, 1020 – São Paulo', 1420, 150],
    ],
  },
};

function buildFixture(language: Language) {
  const fixture = FIXTURES[language];
  const items: GroceryItem[] = fixture.items.map(([name, overrides], i) => ({
    id: `demo-${i}`,
    household_id: 'demo',
    name,
    quantity: 1,
    checked: false,
    mute_reminders: false,
    created_at: new Date(Date.UTC(2026, 10, 22, 12, 59 - i)).toISOString(),
    ...overrides,
  }));
  const { center } = fixture;
  const stores: NearbyStore[] = fixture.stores.map(([name, address, distanceMeters, bearing], i) => {
    const radians = (bearing * Math.PI) / 180;
    return {
      id: `s${i}`,
      name,
      address,
      distanceMeters,
      latitude: center.latitude + (Math.cos(radians) * distanceMeters) / 111_320,
      longitude: center.longitude + (Math.sin(radians) * distanceMeters) / (111_320 * Math.cos((center.latitude * Math.PI) / 180)),
    };
  });
  const pool: StorePool = { center, searchedAt: Date.now(), source: 'location', stores };
  const household: Household = { ...fixture.household, invite_expires_at: new Date(Date.now() + 6 * 86_400_000).toISOString() };

  const list: GroceryListState = {
    items,
    pendingItemIds: new Set(),
    status: 'synced',
    lastError: null,
    lastSyncedAt: Date.now(),
    addItem: () => true,
    toggleChecked: noop,
    toggleMute: noop,
    removeItem: noop,
    clearChecked: noop,
    refresh: asyncNoop,
    dismissError: noop,
  };

  const reminders: RemindersState = {
    loaded: true,
    settings: { ...DEFAULT_REMINDER_SETTINGS, enabled: true },
    pool,
    location: { servicesEnabled: true, foreground: 'granted', background: 'granted', preciseLocation: true },
    notifications: 'granted',
    monitoring: { kind: 'monitoring', storeCount: stores.length, changed: false },
    searching: false,
    searchError: null,
    farFromPool: false,
    updateSettings: asyncNoop,
    toggleStoreExcluded: asyncNoop,
    searchNearMe: async () => pool,
    searchByPlace: async () => pool,
    requestForeground: async () => 'granted',
    requestBackground: async () => 'granted',
    requestNotifications: async () => 'granted',
    enable: async () => ({ kind: 'monitoring', storeCount: stores.length, changed: false }),
    disable: asyncNoop,
    clearStores: asyncNoop,
    refreshPermissions: asyncNoop,
  };
  return { household, email: fixture.email, items, pool, list, reminders };
}

function parseUrl(url: string | null | undefined): { scene: Scene | null; language: Language | null } {
  const sceneMatch = url?.match(/screenshot\/(\w+)/)?.[1] as Scene | undefined;
  const languageMatch = url?.match(/[?&]lang=(fr|en|pt)/)?.[1] as Language | undefined;
  return { scene: sceneMatch && SCENES.includes(sceneMatch) ? sceneMatch : null, language: languageMatch ?? null };
}

export function ScreenshotApp() {
  const { language, setPreference } = useI18n();
  const [scene, setScene] = useState<Scene>('list');
  const data = useMemo(() => buildFixture(language), [language]);

  useEffect(() => {
    const apply = (url: string | null | undefined) => {
      const parsed = parseUrl(url);
      if (parsed.language) setPreference(parsed.language);
      if (parsed.scene) setScene(parsed.scene);
    };
    void Linking.getInitialURL().then(apply);
    const subscription = Linking.addEventListener('url', ({ url }) => apply(url));
    return () => subscription.remove();
  }, [setPreference]);

  const tab: TabKey = scene === 'list' ? 'list' : scene === 'settings' ? 'settings' : 'stores';
  const pendingCount = data.items.filter((candidate) => !candidate.checked).length;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.root}>
        {scene === 'list' ? <ListScreen household={data.household} list={data.list} remindersEnabled reduceMotion onInvite={noop} onSetupReminders={noop} /> : null}
        {scene === 'stores' || scene === 'store' ? <StoresScreen reminders={data.reminders} pendingCount={pendingCount} onOpenStore={noop} onSetupReminders={noop} /> : null}
        {scene === 'settings' ? (
          <SettingsScreen
            household={data.household}
            memberCount={4}
            email={data.email}
            reminders={data.reminders}
            onSetupReminders={noop}
            onShareInvite={noop}
            onRotateInvite={noop}
            onLeaveHousehold={noop}
            onSignOut={noop}
            onDeleteAccount={noop}
            onOpenPrivacy={noop}
            onClearStores={noop}
          />
        ) : null}
      </SafeAreaView>
      <TabBar active={tab} onChange={noop} badges={{ list: pendingCount }} />
      <StoreSheet
        store={scene === 'store' ? data.pool.stores[0] : null}
        fromNotification
        items={data.items}
        excluded={false}
        onClose={noop}
        onNavigate={noop}
        onToggleMute={noop}
        onToggleChecked={noop}
        onToggleExcluded={noop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
