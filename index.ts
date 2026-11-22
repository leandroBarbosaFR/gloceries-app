// Order matters: background tasks must be defined at module scope BEFORE the React tree,
// because iOS can relaunch the app in the background (no UI) to deliver a geofence event.
import './src/services/geofencing';
import { registerRootComponent } from 'expo';
import App from './App';
import { bindSupabaseToAppState } from './src/lib/supabase';

bindSupabaseToAppState();

registerRootComponent(App);
