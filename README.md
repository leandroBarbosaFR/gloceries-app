# Psst! — liste de courses familiale avec rappels de proximité (iOS, Expo SDK 58)

Free shared family grocery list. When a family member passes within ~1 km of a supermarket, their
iPhone shows **one** grouped reminder of what's left to buy, with directions via Plans, Google Maps
or Waze. No prices, no ads in v1.

> Status: MVP. Typecheck, unit tests, `expo-doctor`, Metro bundle and a simulator Release build pass.
> **Background geofencing, notifications and multi-device sync have NOT been validated on a physical
> iPhone yet** — see `docs/QA_CHECKLIST.md`.

## Stack
React Native 0.88 · Expo SDK 58 · TypeScript 6 (strict) · Supabase (Auth OTP, Postgres + RLS, Realtime) ·
expo-location + expo-task-manager (iOS region monitoring) · expo-notifications · EAS Build.

## Project structure
```
index.ts                     entry: defines the geofence task (module scope) before the React tree
App.tsx                      root routing: config → onboarding → sign-in → household → main shell
src/domain/                  pure, unit-tested business logic (no React Native imports)
  geofenceEngine.ts          one geofence event → state update / grouped notification / rotation
  reminderPolicy.ts          transitions, cooldowns, quiet hours, registration grace
  regions.ts                 nearest-18 selection + anchor region, signature, coverage
  notificationContent.ts     French grouped notification text + payload parsing
  listSync.ts                offline queue coalescing, optimistic view, realtime merge
  invite.ts, maps.ts, errors.ts, geo.ts
src/services/                side effects: Supabase API, store search, notifications, permissions, storage
modules/store-search/        local Expo module (Swift): supermarket search with Apple MapKit
  geofencing.ts              TaskManager task, region (re)registration, persisted state
src/hooks/                   useSession, useHousehold, useGroceryList, useReminders, …
src/components/              design system (AppText, Button, TextField, Section/Row, Sheet, TabBar…)
src/screens/                 Welcome/Onboarding/SignIn, HouseholdSetup, List, Stores, Settings, sheets
src/theme/tokens.ts          colors (soft green / warm white), iOS type scale, spacing, radii
supabase/schema.sql          idempotent schema, RLS, RPCs (invites, rate limits, account deletion)
supabase/tests/rls.test.sql  pgTAP RLS tests
docs/                        GEOFENCING.md, QA_CHECKLIST.md, PRIVACY_POLICY.md (draft)
```

## Setup (Mac)
Prerequisites: Node 22+, Xcode 26+, CocoaPods, an Apple Developer account, a Supabase project, an Expo account.

1. **Environment** — `.env.local` (git-ignored) with the **publishable** key only:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   The app refuses to start with a `service_role`/`sb_secret_` key.
2. **Database** — Supabase Dashboard › SQL Editor › paste and run `supabase/schema.sql` (safe to re-run).
3. **Auth** — Authentication › Providers › Email: enabled. Authentication › URL Configuration ›
   Redirect URLs: add `psst://auth-callback`. Users sign in by tapping the link in the e-mail on
   their iPhone (PKCE, works with Supabase's default template). Once a custom SMTP is configured,
   you can also add `{{ .Token }}` to the "Magic link or OTP" template: the app accepts the code too.
   Supabase's default sender is heavily rate-limited and may only deliver to your project's team
   members — set up custom SMTP (e.g. Resend, Brevo, Postmark) before inviting other testers.
   **Google sign-in** (Supabase OAuth + PKCE, opened in an iOS auth sheet):
   Google Cloud Console › APIs & Services › OAuth consent screen (External, app name, support e-mail,
   scopes `openid email profile`) › Credentials › Create OAuth client ID › **Web application**, with the
   authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`. Paste the client ID and
   secret into Supabase › Authentication › Sign In / Providers › Google.
   **Sign in with Apple** (native, required by App Store guideline 4.8 because Google is offered):
   enable the "Sign in with Apple" capability on the App ID (EAS does it when building with
   `ios.usesAppleSignIn`), then Supabase › Providers › Apple › enable, **Client IDs = the bundle identifier**.
   Accounts with the same verified e-mail are linked automatically by Supabase.
4. **Languages** — French, English and Brazilian Portuguese (`src/i18n/fr.ts` is the typed source; `en.ts` and `pt.ts` must match).
   Users choose Automatique / Français / English / Português in Settings (or FR/EN/PT on the welcome screens).
   iOS permission prompts are localized from `locales/fr.json`, `locales/en.json` and `locales/pt-BR.json`.
5. **Install & check**
   ```bash
   npm install
   npm run typecheck && npm test && npx expo-doctor
   ```
5. **Run on a physical iPhone** (Expo Go is NOT supported):
   ```bash
   npx expo run:ios --device           # local build, needs the iPhone connected/paired
   # or with EAS:
   npx eas-cli@latest login
   npx eas-cli@latest init             # writes extra.eas.projectId into app.json
   npx eas-cli@latest device:create    # register the iPhone (internal distribution)
   npx eas-cli@latest build --platform ios --profile development
   npx expo start --dev-client
   ```
   Before building for a device, set `ios.bundleIdentifier` in `app.json` (currently the placeholder
   `com.example.psstcourses`) to an identifier owned by your Apple Developer team.

## Scripts
| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict, no unused locals/params) |
| `npm test` | Jest unit tests for `src/domain` |
| `npm run doctor` | `expo-doctor` |
| `supabase test db` | pgTAP RLS tests (requires Supabase CLI + Docker) |

## Key decisions
- **Geofencing**: see `docs/GEOFENCING.md` (transition-based state machine, ≤ 19 regions, anchor rotation,
  cooldowns 24 h per store / 45 min global, quiet hours, background list freshness).
- **Sync**: client-generated UUIDs + idempotent upsert; persisted offline queue with coalescing;
  Realtime payloads applied incrementally; full refresh on (re)subscribe, foreground and network recovery.
- **Permissions**: nothing requested at onboarding. Location "when in use" on first store search;
  "Toujours" + notifications only inside the reminder setup flow, each step explained first.
- **Fallback without location**: the list works fully; stores can be searched by city/address (Apple geocoder).
- **Security**: households/memberships writable only via `SECURITY DEFINER` RPCs; invite codes expire
  after 7 days and can be rotated; join/create/rotate are rate-limited per user; account deletion RPC.

## Known limitations / next steps
- Store search uses Apple MapKit via the local native module `modules/store-search` (free, no key; POI category `foodMarket`, so it can include small grocers). OpenStreetMap Overpass public mirrors are only a fallback (often saturated). Review Apple's MapKit terms regarding on-device caching of search results before release.
- Background reminders may use a stale list if the phone was offline (documented, bounded to 7 days).
- One household per user in the UI (schema supports several).
- The `fetch` UIBackgroundMode is added automatically by `expo-task-manager`; it is unused.
- Push notifications are not used (reminders are local); no analytics.
- Privacy policy is a draft (`docs/PRIVACY_POLICY.md`) and must be reviewed and hosted before App Store submission.
- No UI/E2E tests yet.
