# Usage Sync

Android app (React Native + Expo) that reads **per-app screen time**, shows it **hour by hour**, and pushes
daily totals into a **Google Sheet** (via a service account) — e.g. Duolingo's minutes for 23 Nov land in the
`Duolingo` row, under `Novembro`, in column `Y`, in gray font.

## Features

| | |
|---|---|
| **Filter by apps** | "Choose apps" picker with search; the selection is remembered and is also the sync list |
| **Hourly view** | One card per selected app: 24 bars (00–23h), tap a bar for its minutes; day navigator (‹ ›) |
| **Service-account credentials** | Settings → paste the JSON key or import the `.json` file. Private key is kept in Android Keystore-backed SecureStore |
| **Spreadsheet config** | Settings → spreadsheet ID/URL, tab name (`{year}` supported), month names, days to sync, "Save & test" |
| **Sync button** | Usage screen → *Sync to Sheets*. Writes minutes + gray font, reports what was written/skipped |

## How the sheet is written

Matches the layout of `Habit_Tracker.xlsx`:

* Column **B** has month headers (`Janeiro` … `Dezembro`) followed by that month's rows (`Duolingo`, `Corrida` …).
* Columns **C…AG** are days 1…31 (day *N* → column C + N − 1).
* Value = **total minutes** (integer) for that app and day, written with `spreadsheets.batchUpdate`
  (`updateCells`) touching only the **value** and **font color** (`#808080`), so fills/borders stay intact.
* The row is looked up by name (case/accent-insensitive) *inside the month's block*. Each app card has a
  **Sheet row name** field if the sheet label differs from the app name. Several apps with the same row name
  are summed (e.g. Instagram + X → `Redes sociais`).
* Safety rules: cells containing a **formula** (the category rows `Inglês`, `Atividade física`, `Concursos`)
  are never overwritten; apps with < 1 min of usage are **not written** (so a day Android no longer remembers
  can't overwrite real data with 0); missing rows/tabs are reported as *skipped*, never created.
* Re-syncing is idempotent: it overwrites the same cell with the latest total.

## Run it

This app contains a native Kotlin module (`modules/usage-stats`), so it **does not run in Expo Go** — use a
development/preview build.

```bash
npm install
npx expo install --fix            # aligns package versions with your Expo SDK
npx expo run:android              # builds + installs on a connected device/emulator (needs Android Studio SDK)

# or build an APK in the cloud:
npx eas build -p android --profile preview
```

First launch: tap **Open usage access settings** on the Usage screen and enable *Usage access* for "Usage Sync".

Tests for the logic (sheet lookup, hourly bucketing, JWT/RS256, REST calls): `npm test`
(needs Node ≥ 22.18; uses a fixture exported from your workbook).

## Google setup (one time)

1. Google Cloud Console → create/select a project → **enable the Google Sheets API**.
2. IAM & Admin → Service Accounts → create one → *Keys* → **Add key → JSON** (downloads the file).
3. Open your spreadsheet → **Share** → add the service account's `client_email` as **Editor**.
4. In the app: Settings → import the JSON, paste the spreadsheet URL, **Save & test**.

## Things to know

* **Retention:** Android keeps detailed usage events for roughly a week, so sync covers at most the last 7 days
  (setting: *Days to sync*, default 2 = today + yesterday).
* **Numbers vs. Digital Wellbeing:** usage is rebuilt from foreground-activity events; it is very close to Digital
  Wellbeing but not guaranteed identical (e.g. media playing in the background isn't "screen time").
* **Service-account key on a phone:** fine for a personal app; don't distribute a build that contains someone
  else's key. Because the key can only reach sheets explicitly shared with it, the blast radius is small.
* Only apps with a launcher icon are listed (system services are hidden).

## Layout

```
App.tsx                       tab shell (Usage | Settings)
src/screens/UsageScreen.tsx   date nav, app filter, hourly cards, sync button + result
src/screens/SettingsScreen.tsx credentials + spreadsheet config
src/components/               HourlyChart, AppPickerModal, small UI kit
src/lib/usage.ts              sessions -> per-day/per-hour buckets
src/lib/googleAuth.ts         service-account JWT -> OAuth token (no Node-only deps)
src/lib/jwtSigner.ts          RS256 signing with pure-JS jsrsasign
src/lib/sheets.ts             row/column lookup + sync planner (pure, tested)
src/lib/sheetsApi.ts          Google Sheets v4 REST client
modules/usage-stats/          Expo module (Kotlin): UsageStatsManager events -> sessions
tests/                        node:test suite + fixture from Habit_Tracker.xlsx
```
