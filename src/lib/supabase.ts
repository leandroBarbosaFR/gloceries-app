import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Guards against obviously wrong configuration, including accidentally shipping a secret key. */
function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(globalThis.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export const isConfigured = Boolean(
  supabaseUrl && supabaseKey && !supabaseUrl.includes('YOUR_PROJECT') && !supabaseKey.includes('YOUR_') && !looksLikeSecretKey(supabaseKey),
);
export const isSecretKeyMisconfiguration = Boolean(supabaseKey && looksLikeSecretKey(supabaseKey));

// Publishable/anon key only. NEVER put a service_role or secret key in a mobile application.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', isConfigured ? supabaseKey! : 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE: the e-mail link returns a one-time ?code= to psst://auth-callback (no tokens in the URL).
    flowType: 'pkce',
  },
});

/**
 * Supabase recommends pausing token auto-refresh while backgrounded on React Native.
 * Background tasks still get a valid session: getSession() refreshes on demand.
 */
let appStateBound = false;
export function bindSupabaseToAppState(): void {
  if (appStateBound) return;
  appStateBound = true;
  const onChange = (state: AppStateStatus | string | null | undefined) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };
  onChange(AppState.currentState);
  AppState.addEventListener('change', onChange);
}
