# Physical-device QA checklist (iPhone)

Use a **development build** (`eas build --profile development` or `npx expo run:ios --device`).
Expo Go is not supported (background location + task manager).

Prerequisites: two iPhones (A and B), two e-mail addresses, `supabase/schema.sql` applied, one or
more supermarkets reachable on foot/by car. In development builds, **Réglages › Outils de test**
offers "Simuler l'entrée dans le magasin le plus proche" and an event journal.

Record for each line: ✅ / ❌, iOS version, date, notes.

## 1. Onboarding & auth
- [ ] Fresh install: 3-page onboarding, "Passer" works, VoiceOver reads each page.
- [ ] **No permission prompt** appears during onboarding or sign-in.
- [ ] E-mail OTP: code received (6+ digits), wrong code → French error, "Renvoyer" works, rate-limit message in French.
- [ ] Kill and relaunch: session persists.

## 2. Household & invites
- [ ] A creates a household; Réglages shows a code `XXXX-XXXX-XXXX-XXXX` and its expiry.
- [ ] B joins with the code typed in lower case with spaces → success.
- [ ] Invalid code → "Ce code d'invitation est invalide ou a expiré."
- [ ] 11 wrong codes in 15 min → "Trop de tentatives".
- [ ] A rotates the code → old code fails for a third user, new code works; B stays a member.
- [ ] Member count updates on A after B joins (on foreground).

## 3. Family sync
- [ ] A adds "Lait" → appears on B in < 2 s.
- [ ] B checks it → A updates; B mutes an item → A shows "Rappels désactivés".
- [ ] Airplane mode on A: add/check/delete items → instant UI, cloud icon on pending rows, offline banner.
- [ ] Meanwhile B edits other items. A back online → A's changes reach B, B's changes appear on A, no duplicates.
- [ ] Kill A while offline with pending edits → relaunch offline → list + pending edits still shown → go online → synced.
- [ ] Lock A for 10 min, unlock → list refreshed (Realtime reconnect + foreground refresh).
- [ ] "Tout retirer" removes checked items on both phones.

## 4. Stores
- [ ] "Rechercher autour de moi": foreground permission prompt with the French string; list sorted by distance.
- [ ] Refuse location → French message + address search works (no permission needed).
- [ ] Address search "Lyon" → stores around Lyon.
- [ ] Airplane mode → clear error, no crash.
- [ ] Store sheet: Plans / Google Maps / Waze open the native app when installed, web otherwise.

## 5. Reminder setup (permissions)
- [ ] Toggle in Réglages opens the explanation sheet; nothing is requested before tapping a button.
- [ ] Foreground → "Toujours" → Notifications, in that order, each with French copy.
- [ ] Refuse "Toujours" → explanation + "Ouvrir les Réglages"; returning with "Toujours" set → "J'ai modifié le réglage" completes.
- [ ] Refuse notifications → same recovery path.
- [ ] "Position exacte" off → warning shown.
- [ ] Réglages › État shows "Actifs · N magasins surveillés".

## 6. Geofence behavior (the critical part)
For each: note distance at which the alert fired and delay.
- [ ] App in background, walk/drive from > 1.5 km into 1 km of a store → **exactly one** notification titled
      "Psst ! <magasin> est tout près" listing pending items (muted/checked items excluded).
- [ ] Same with the app **terminated** (swiped away).
- [ ] Same with phone locked for > 30 min before entering.
- [ ] Two stores close together → only one notification within 45 min.
- [ ] Leave and re-enter the same store within 24 h → no second notification.
- [ ] Enabling reminders while already inside a store zone → **no** immediate notification.
- [ ] Editing the list while inside a zone → no notification.
- [ ] All items checked or muted → no notification.
- [ ] Store excluded from the store sheet → no notification for it.
- [ ] 22 h–7 h with quiet hours on → no notification; off → notification.
- [ ] B adds an item while A is in the background and online → A's notification includes it (fresh fetch).
- [ ] Same with A offline → notification uses A's last snapshot (documented limitation).
- [ ] Travel > 5 km with > 18 stores in the pool → regions rotate (dev journal shows `rotated`), alerts fire for the new nearby stores.
- [ ] Travel to another city → "Vous semblez loin des magasins enregistrés" banner.

## 7. Notification interaction
- [ ] Tap notification (app in background) → store sheet with live pending items and map buttons.
- [ ] Tap notification (app terminated) → same (cold start).
- [ ] Long-press → "Itinéraire" opens the app; with a preferred app set in Réglages, opens that maps app directly.
- [ ] Long-press → "Ignorer" dismisses without opening the app.
- [ ] Mute an item from the store sheet → removed from future reminders, still on the list.

## 8. Opt-out, privacy, account
- [ ] Toggle off reminders → no more notifications (verify by re-entering a zone after 24 h or with dev "Réinitialiser les délais").
- [ ] Revoke "Toujours" in iOS Settings → Réglages shows "Autorisation « Toujours » manquante"; no crash.
- [ ] "Effacer les magasins enregistrés" → store list empty, monitoring stopped.
- [ ] Sign out → reminders stop on this phone; local data cleared.
- [ ] Quit household (last member) → household deleted server-side.
- [ ] Delete account → can no longer sign in to old data; B's household still exists with shared items.

## 9. Robustness & accessibility
- [ ] Denied location + denied notifications + offline at first launch → app usable, no crash.
- [ ] VoiceOver: every button labelled in French; checkboxes announce state.
- [ ] Largest Dynamic Type size: no clipped primary actions.
- [ ] Reduce Motion on → no item animations.
- [ ] One full day with reminders on: battery usage for Psst! in iOS Settings › Battery is negligible.

## Not automated yet
- `supabase/tests/rls.test.sql` (pgTAP) requires `supabase start` (Docker) + `supabase test db`.
- No UI/E2E tests (consider Maestro for flows 1–4).
