export type GroceryItem = {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  checked: boolean;
  mute_reminders: boolean;
  created_at: string;
  updated_at?: string;
};

export type GroceryItemPatch = Partial<Pick<GroceryItem, 'checked' | 'mute_reminders' | 'quantity' | 'name'>>;

export type NearbyStore = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Distance from the point used for the search, in meters. */
  distanceMeters: number;
  brand?: string;
  address?: string;
};

export type Household = {
  id: string;
  name: string;
  invite_code: string;
  invite_expires_at?: string | null;
};

export type Coordinates = { latitude: number; longitude: number };

export type Language = 'fr' | 'en' | 'pt';

export type MapsProvider = 'apple' | 'google' | 'waze';
export type MapsPreference = MapsProvider | 'ask';

export type ReminderRadius = 500 | 1000 | 2000;

export type ReminderSettings = {
  /** The user opted in to proximity reminders on this device. */
  enabled: boolean;
  radiusMeters: ReminderRadius;
  quietHoursEnabled: boolean;
  /** Quiet hours, local time, 24h clock. Range may wrap past midnight. */
  quietHoursStart: number;
  quietHoursEnd: number;
  /** Stores the user does not want reminders for (e.g. the one next to home). */
  excludedStoreIds: string[];
  mapsPreference: MapsPreference;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  radiusMeters: 1000,
  quietHoursEnabled: true,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  excludedStoreIds: [],
  mapsPreference: 'ask',
};

/** Stores discovered around a point, kept on device only. */
export type StorePool = {
  center: Coordinates;
  searchedAt: number;
  /** How the pool was built; "address" pools never feed background rotation from GPS. */
  source: 'location' | 'address';
  label?: string;
  stores: NearbyStore[];
};

/** Minimal store info carried inside a notification payload. */
export type ReminderStore = Pick<NearbyStore, 'id' | 'name' | 'latitude' | 'longitude'>;
