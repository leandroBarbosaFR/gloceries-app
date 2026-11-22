/**
 * Render smoke tests: every main screen mounts without crashing in the states that matter
 * for the MVP Definition of Done (permission denied, offline, empty, populated).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import type { GroceryListState } from '../../hooks/useGroceryList';
import type { RemindersState } from '../../hooks/useReminders';
import { DEFAULT_REMINDER_SETTINGS, type GroceryItem, type Household, type StorePool } from '../../lib/types';
import { HouseholdSetupScreen } from '../HouseholdSetupScreen';
import { ListScreen } from '../ListScreen';
import { ReminderSetupSheet } from '../ReminderSetupSheet';
import { SettingsScreen } from '../SettingsScreen';
import { StoreSheet } from '../StoreSheet';
import { StoresScreen } from '../StoresScreen';
import { SignInScreen } from '../WelcomeScreens';

jest.mock('../../services/geofencing', () => ({
  readDevLog: jest.fn(async () => []),
  resetReminderCooldowns: jest.fn(async () => undefined),
  simulateStoreEntry: jest.fn(async () => ({ kind: 'state-updated' })),
}));

const household: Household = { id: 'house', name: 'Famille Martin', invite_code: 'ABCDEF1234567890', invite_expires_at: '2099-01-01T00:00:00Z' };

function makeItem(id: string, overrides: Partial<GroceryItem> = {}): GroceryItem {
  return { id, household_id: 'house', name: id, quantity: 1, checked: false, mute_reminders: false, created_at: '2026-11-22T10:00:00Z', ...overrides };
}

function makeList(overrides: Partial<GroceryListState> = {}): GroceryListState {
  return {
    items: [],
    pendingItemIds: new Set(),
    status: 'synced',
    lastError: null,
    lastSyncedAt: Date.now(),
    addItem: jest.fn(() => true),
    toggleChecked: jest.fn(),
    toggleMute: jest.fn(),
    removeItem: jest.fn(),
    clearChecked: jest.fn(),
    refresh: jest.fn(async () => undefined),
    dismissError: jest.fn(),
    ...overrides,
  };
}

const pool: StorePool = {
  center: { latitude: 48.85, longitude: 2.35 },
  searchedAt: Date.now(),
  source: 'location',
  stores: [{ id: 'node-1', name: 'Biocoop Bastille', latitude: 48.853, longitude: 2.369, distanceMeters: 640, address: '12 rue de la Roquette, Paris' }],
};

function makeReminders(overrides: Partial<RemindersState> = {}): RemindersState {
  return {
    loaded: true,
    settings: DEFAULT_REMINDER_SETTINGS,
    pool: null,
    location: { servicesEnabled: true, foreground: 'undetermined', background: 'undetermined', preciseLocation: null },
    notifications: 'undetermined',
    monitoring: { kind: 'stopped', reason: 'disabled' },
    searching: false,
    searchError: null,
    farFromPool: false,
    updateSettings: jest.fn(async () => undefined),
    toggleStoreExcluded: jest.fn(async () => undefined),
    searchNearMe: jest.fn(async () => null),
    searchByPlace: jest.fn(async () => null),
    requestForeground: jest.fn(async () => 'denied' as const),
    requestBackground: jest.fn(async () => 'denied' as const),
    requestNotifications: jest.fn(async () => 'denied' as const),
    enable: jest.fn(async () => ({ kind: 'stopped', reason: 'permission-missing' }) as const),
    disable: jest.fn(async () => undefined),
    clearStores: jest.fn(async () => undefined),
    refreshPermissions: jest.fn(async () => undefined),
    ...overrides,
  };
}

const noop = () => undefined;

describe('SignInScreen', () => {
  it('enables the button only for a valid e-mail', async () => {
    await render(<SignInScreen />);
    const button = screen.getByRole('button', { name: 'Recevoir un lien par e-mail' });
    expect(button).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'marie@exemple.fr');
    expect(screen.getByRole('button', { name: 'Recevoir un lien par e-mail' })).toBeEnabled();
  });
});

describe('HouseholdSetupScreen', () => {
  it('shows a load error with retry and validates invite codes locally', async () => {
    const onRetry = jest.fn();
    await render(<HouseholdSetupScreen onReady={noop} onSignOut={noop} loadError="Connexion impossible." onRetry={onRetry} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Code d’invitation'), 'nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Rejoindre' }));
    expect(screen.getByText('Le code comporte 16 caractères (chiffres et lettres A à F).')).toBeTruthy();
  });
});

describe('ListScreen', () => {
  const baseProps = { household, remindersEnabled: false, reduceMotion: true, onInvite: noop, onSetupReminders: noop };

  it('renders the empty state', async () => {
    await render(<ListScreen {...baseProps} list={makeList()} />);
    expect(screen.getByText('Votre liste est vide')).toBeTruthy();
  });

  it('renders offline banner, pending sync marker, basket section and reminder promo', async () => {
    const list = makeList({
      status: 'offline',
      items: [makeItem('Lait', { quantity: 2 }), makeItem('Pain', { checked: true })],
      pendingItemIds: new Set(['Lait']),
    });
    await render(<ListScreen {...baseProps} list={list} />);
    expect(screen.getByText(/Hors ligne/)).toBeTruthy();
    expect(screen.getByLabelText('En attente de synchronisation')).toBeTruthy();
    expect(screen.getByText('Dans le panier · 1')).toBeTruthy();
    expect(screen.getByText('Recevoir un rappel près des magasins ?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Lait, quantité 2' }));
    expect(list.toggleChecked).toHaveBeenCalled();
  });

  it('adds an item from the composer', async () => {
    const list = makeList();
    await render(<ListScreen {...baseProps} list={list} />);
    await fireEvent.changeText(screen.getByLabelText('Nouveau produit'), 'Œufs');
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter à la liste' }));
    expect(list.addItem).toHaveBeenCalledWith('Œufs');
  });
});

describe('StoresScreen', () => {
  it('renders the first-run empty state and the address fallback', async () => {
    await render(<StoresScreen reminders={makeReminders({ searchError: 'Autorisez la localisation, ou recherchez une ville ou une adresse.' })} pendingCount={0} onOpenStore={noop} onSetupReminders={noop} />);
    expect(screen.getByText('Trouvez vos supermarchés')).toBeTruthy();
    expect(screen.getByText('Autorisez la localisation, ou recherchez une ville ou une adresse.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Chercher une ville ou une adresse' }));
    expect(screen.getByLabelText('Ville, adresse ou code postal')).toBeTruthy();
  });

  it('lists stores and the monitoring status', async () => {
    const onOpenStore = jest.fn();
    await render(
      <StoresScreen
        reminders={makeReminders({ pool, settings: { ...DEFAULT_REMINDER_SETTINGS, enabled: true }, monitoring: { kind: 'monitoring', storeCount: 1, changed: false } })}
        pendingCount={3}
        onOpenStore={onOpenStore}
        onSetupReminders={noop}
      />,
    );
    expect(screen.getByText(/Rappels actifs pour les 1 magasins/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Biocoop Bastille/ }));
    expect(onOpenStore).toHaveBeenCalledWith(pool.stores[0]);
  });
});

describe('SettingsScreen', () => {
  it('surfaces a missing "Always" permission without crashing', async () => {
    await render(
      <SettingsScreen
        household={household}
        memberCount={2}
        email="marie@exemple.fr"
        reminders={makeReminders({
          settings: { ...DEFAULT_REMINDER_SETTINGS, enabled: true },
          location: { servicesEnabled: true, foreground: 'granted', background: 'denied', preciseLocation: true },
          notifications: 'granted',
          pool,
          monitoring: { kind: 'stopped', reason: 'permission-missing' },
        })}
        onSetupReminders={noop}
        onShareInvite={noop}
        onRotateInvite={noop}
        onLeaveHousehold={noop}
        onSignOut={noop}
        onDeleteAccount={noop}
        onOpenPrivacy={noop}
        onClearStores={noop}
      />,
    );
    expect(screen.getByText('Autorisation « Toujours » manquante')).toBeTruthy();
    expect(screen.getByText('ABCD-EF12-3456-7890')).toBeTruthy();
    expect(screen.getByText('2 membres')).toBeTruthy();
  });
});

describe('StoreSheet', () => {
  it('shows pending items with mute controls when opened from a notification', async () => {
    const onToggleMute = jest.fn();
    await render(
      <StoreSheet
        store={pool.stores[0]}
        fromNotification
        items={[makeItem('Lait'), makeItem('Vin', { mute_reminders: true }), makeItem('Pain', { checked: true })]}
        excluded={false}
        onClose={noop}
        onNavigate={noop}
        onToggleMute={onToggleMute}
        onToggleChecked={noop}
        onToggleExcluded={noop}
      />,
    );
    expect(screen.getByText('À acheter · 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ignorer ce rappel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Itinéraire avec Waze' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ne plus rappeler Lait' }));
    expect(onToggleMute).toHaveBeenCalled();
  });
});

describe('ReminderSetupSheet', () => {
  it('explains before asking, then starts with the store search when none are saved', async () => {
    const reminders = makeReminders();
    await render(<ReminderSetupSheet visible reminders={reminders} onClose={noop} />);
    expect(screen.getByText('Ne repartez plus sans le lait')).toBeTruthy();
    expect(reminders.requestForeground).not.toHaveBeenCalled();
    expect(reminders.requestBackground).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Configurer' }));
    expect(screen.getByText('Vos supermarchés')).toBeTruthy();
  });

  it('offers the Settings app when "Always" was denied', async () => {
    const reminders = makeReminders({ pool, location: { servicesEnabled: true, foreground: 'granted', background: 'denied', preciseLocation: false } });
    await render(<ReminderSetupSheet visible reminders={reminders} onClose={noop} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Configurer' }));
    expect(screen.getByText('Rappels, app fermée')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir les Réglages' })).toBeTruthy();
    expect(screen.getByText(/Position exacte » est désactivée/)).toBeTruthy();
  });
});

describe('English and language switching', () => {
  const settingsProps = {
    household,
    memberCount: 1,
    email: 'mary@example.com',
    onSetupReminders: noop,
    onShareInvite: noop,
    onRotateInvite: noop,
    onLeaveHousehold: noop,
    onSignOut: noop,
    onDeleteAccount: noop,
    onOpenPrivacy: noop,
    onClearStores: noop,
  };

  it('renders the list in English when English is chosen', async () => {
    await AsyncStorage.setItem('psst:language:v1', JSON.stringify('en'));
    await render(
      <I18nProvider>
        <ListScreen household={household} list={makeList({ items: [makeItem('Milk', { quantity: 2 })] })} remindersEnabled={false} reduceMotion onInvite={noop} onSetupReminders={noop} />
      </I18nProvider>,
    );
    expect(await screen.findByText('1 item to buy')).toBeTruthy();
    expect(screen.getByText('Get reminded near stores?')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Milk, quantity 2' })).toBeTruthy();
  });

  it('switches from English to French from Settings and persists the choice', async () => {
    await AsyncStorage.setItem('psst:language:v1', JSON.stringify('en'));
    await render(
      <I18nProvider>
        <SettingsScreen {...settingsProps} reminders={makeReminders()} />
      </I18nProvider>,
    );
    expect(await screen.findByText('Settings')).toBeTruthy();
    expect(screen.getByText('1 member')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Français' }));
    expect(await screen.findByText('Réglages')).toBeTruthy();
    expect(screen.getByText('1 membre')).toBeTruthy();
    expect(JSON.parse((await AsyncStorage.getItem('psst:language:v1')) ?? 'null')).toBe('fr');
    await fireEvent.press(screen.getByRole('radio', { name: 'Português' }));
    expect(await screen.findByText('Ajustes')).toBeTruthy();
    expect(screen.getByText('1 membro')).toBeTruthy();
  });
});
