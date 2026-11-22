# Geofencing — design, limitations, and what needs a physical iPhone

## How it works

```
index.ts ── imports ──▶ src/services/geofencing.ts   (TaskManager.defineTask at module scope)
                              │
          iOS region event ──▶ task ──▶ serialized queue ──▶ processGeofenceEvent()  (src/domain/geofenceEngine.ts, pure + unit-tested)
                                                                  │
            ┌──────────────── loadState / settings / store pool / list snapshot (AsyncStorage)
            ├──────────────── fetchFreshItems (Supabase, 8 s timeout, falls back to snapshot)
            └──────────────── presentReminder (one grouped local notification)
```

* **No continuous GPS.** iOS region monitoring (Core Location) wakes the app on boundary crossings only.
  The only position requests are: (1) the store search the user triggers, (2) the cached
  `getLastKnownPositionAsync` on app foreground (never powers up GPS), and (3) a single
  Wi-Fi/cell-accuracy fix when the user leaves the *anchor* region (rotation, below).
* **≤ 19 regions** (iOS limit is 20 per app): the 18 stores nearest to the user + 1 anchor.
* **Dynamic rotation.** The store pool holds up to 80 supermarkets within 5 km of the search point.
  When the pool is larger than 18, an exit-only *anchor* region centered on the user is registered
  (radius = half the distance to the farthest monitored store, clamped 1–5 km). Leaving it
  re-selects the 18 stores now closest, in the background. Rotation is throttled to once per 2 min.
* **No background network calls to Overpass.** Store discovery is user-triggered only. When the
  user is > 4 km from the searched area, the Magasins tab shows a "Actualiser" banner.

## False-positive protections

| Problem | Mitigation |
|---|---|
| `requestStateForRegion` (run by expo-location at every registration and every relaunch) emits *Enter* for regions you're already inside | Persisted per-region presence; only an observed `outside → inside` transition counts. Presence is seeded from the last known position at registration. When no position is known, a 90 s grace window ignores entries. |
| iOS can call `didEnterRegion` multiple times | Same state machine: `inside → inside` is ignored. |
| With `notifyOnExit: false` a region stays "inside" forever and later entries are silently dropped (bug in the starter) | All store regions use `notifyOnExit: true`. |
| Re-registering regions on every list edit (starter) caused synthetic events | Regions are re-registered only when the selection signature changes (anchor center rounded to ~100 m, radius to 100 m). |
| Driving past several stores | Global cooldown: max 1 reminder per 45 min. |
| Same store repeatedly | Per-store cooldown 24 h (persisted, survives restarts). |
| Store next to home/work | Per-store "Rappels pour ce magasin" switch (excluded stores are not monitored). |
| Night | Quiet hours 22 h–7 h (default on, user-controllable). |
| Nothing to buy / everything muted | No notification and the cooldown is not consumed. |

## Background list staleness (documented limitation)

The task first tries to fetch the list from Supabase (session restored from AsyncStorage, 8 s
timeout). If that fails (no network, expired refresh token, iOS kills the task), it uses the local
snapshot written whenever the list changes in the foreground.

* A family member's edits made while this phone was offline **may be missing** from the reminder.
* If the snapshot is older than **7 days** and the network fetch fails, the reminder is skipped
  rather than showing a possibly obsolete list.
* Tapping the notification always opens the store sheet with the **live** list.

## iOS limitations to communicate honestly

* Region monitoring requires **"Toujours"** authorization. With "Lorsque l'app est active" only,
  no background reminders are possible (the UI says so and offers Settings).
* Accuracy is typically 100 m to several hundred meters; entry can be delayed by a few minutes,
  more in dense urban areas or with Wi-Fi off. With **"Position exacte" disabled**, reliability drops
  sharply (warning shown in Settings and setup).
* Low Power Mode, Background App Refresh off, airplane mode, or a force-quit app can delay or
  suppress events. (iOS does relaunch a force-quit app for region events on recent iOS versions,
  but this must be confirmed on device.)
* Apple recommends regions ≥ 100–200 m; the minimum here is 200 m (user choices: 500 m / 1 km / 2 km).
* iOS gives the background task roughly 10–30 s. The network fetch is capped at 8 s and rotation
  position at 10 s.
* The simulator can replay locations (Features ▸ Location) but does **not** reproduce real-world
  timing, accuracy, or wake-from-terminated behavior. Final validation must be on a physical iPhone.

## Things that MUST be verified on a physical iPhone (not verified yet)

1. The task runs when the app is backgrounded **and** when it was terminated.
2. `startGeofencingAsync` called from inside the task (rotation) re-registers regions correctly.
3. `fetchItemsForReminder` succeeds in the background with a restored session.
4. Notification actions: "Itinéraire" opens the app on the store sheet, "Ignorer" does not open it.
5. Cold start from a notification tap routes to the store sheet (`getLastNotificationResponse`).
6. Native app detection for Google Maps / Waze (`LSApplicationQueriesSchemes`).
7. Battery impact over a normal day with reminders on.

See `docs/QA_CHECKLIST.md` for the step-by-step protocol.
