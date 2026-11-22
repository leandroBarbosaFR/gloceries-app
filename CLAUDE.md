# Psst! — project rules (read before making changes)

You are a senior Expo/React Native, TypeScript, Supabase/Postgres and iOS Core Location engineer. This repository is a runnable MVP starter, not a production-complete app.

## Product intent
A FREE shared family grocery list. When a family member enters a configurable geofence (default 1 km) around a nearby supermarket, their iPhone sends ONE useful reminder listing outstanding products. They can navigate via Apple Maps, Google Maps or Waze. Items remain pending until checked off. Users may mute an individual item. No prices or ads in v1. Future revenue will come from clearly labelled local supermarket placements, with separate opt-in for marketing notifications.

## Non-negotiable engineering rules
- TypeScript strict. No one-character variable names (except `i` for indices); use descriptive variable names.
- Never ship Supabase service_role/secret keys in client code. All user data through authenticated RLS.
- Avoid polling GPS continuously. Use iOS region monitoring (geofencing) and update up to 18-20 relevant regions as needed.
- Do not request Always location permission on onboarding. First explain a clear benefit; permission only when user enables geofence alerts. Always provide disable and deletion controls.
- Geofencing tasks MUST be defined at module scope, not inside a React component.
- Implement notifications with per-store cooldown, user controls, and no per-item notification spam.
- All app-facing copy must exist in French, English AND Brazilian Portuguese (`src/i18n/fr.ts` is the typed source, `en.ts` and `pt.ts` must match; iOS permission strings in `locales/`). Never hard-code UI text in components. Keep code variable names in clear English.
- Use Expo SDK-compatible package versions: `npx expo install --fix`, verify with `npx expo-doctor`.
- Accessibility, loading/error states, offline behavior, and privacy matter more than effects/animations.
- Don't assume a location/notification works in Expo Go: test with a development build and a physical iPhone.
- Do not build ad targeting or share location history with supermarkets.

## Existing foundation
- `index.ts`: entry point; imports `src/services/geofencing.ts` (module-scope task) BEFORE the React tree.
- `App.tsx`: root routing only (config → onboarding → OTP sign-in → household → `MainShell`).
- `src/domain/`: pure, unit-tested logic — geofence engine/state machine, cooldowns, region selection + anchor rotation, notification text, offline queue/realtime merge, invites, errors. Keep React Native imports out of this folder.
- `src/services/`: side effects (Supabase API, Overpass, notifications, permissions, maps, AsyncStorage keys). `geofencing.ts` owns region registration and the TaskManager task.
- `src/hooks/`: `useGroceryList` (cache + offline queue + Realtime), `useReminders` (settings, store pool, permissions, monitoring), `useHousehold`, `useSession`, `useReminderNotifications`.
- `src/components/` + `src/theme/tokens.ts`: design system. `src/screens/`: screens and sheets.
- `supabase/schema.sql`: idempotent schema, RLS, RPCs (create/join/rotate invite with expiry + rate limits, leave, delete account). `supabase/tests/rls.test.sql`: pgTAP.
- Docs: `docs/GEOFENCING.md` (design + iOS limitations), `docs/QA_CHECKLIST.md` (physical-device protocol), `docs/PRIVACY_POLICY.md` (draft).
- Verify with: `npm run typecheck`, `npm test`, `npx expo-doctor`.

## Immediate priorities
1. Install dependencies, typecheck and fix any Expo SDK 58 compatibility errors; never blindly downgrade packages.
2. Improve app structure: move App.tsx into typed screens/hooks/components; add a real design system.
3. Make family sync robust (Realtime + reconnect refresh, optimistic updates, network errors, store local cache, offline queue if feasible).
4. Make geofencing robust: permissions, saved preference sync, dynamic region selection, cooldown persistence, open notification destination, user-controlled muting, false-positive avoidance, test cases. Explicitly document iOS limitations and background sync staleness.
5. Implement good onboarding explaining foreground and Always location permissions, and a non-geolocation fallback.
6. Add tests for geofence event logic and a physical-device QA checklist.
7. Security review: invite expiration/rotation, RPC rate limiting, delete account/data flow, privacy policy, App Store permission strings, RLS tests.
8. Configure EAS development and TestFlight build with actual bundle identifier and Apple Developer team.

## Definition of Done for MVP
Two different iPhones can join the same household, add/check/mute items and see changes; they can discover nearby supermarkets and opt in to proximity alerts; on a physical device an entry event triggers at most one helpful grouped notification; tapping it opens the relevant store and a map provider; user can opt out; no crash in permission denied/offline scenarios. Typecheck, doctor, tests and TestFlight build should pass before claiming completion.
