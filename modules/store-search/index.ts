import { requireOptionalNativeModule } from 'expo';

export type AppleStoreResult = {
  name: string;
  latitude: number;
  longitude: number;
  street: string;
  city: string;
  /** Stable Apple Maps place identifier (iOS 18+). */
  identifier?: string;
};

type StoreSearchNativeModule = {
  searchSupermarkets(latitude: number, longitude: number, radiusMeters: number): Promise<AppleStoreResult[]>;
};

/** Null when the native module is not compiled in (Expo Go, Android, tests). */
export const StoreSearch = requireOptionalNativeModule<StoreSearchNativeModule>('StoreSearch');
