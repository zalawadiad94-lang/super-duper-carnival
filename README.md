# Sitekhata

Contractor khata for construction sites — you'll get, you'll give, labour,
material, and bills. A TanStack Start + React web app; books are saved on the
device (localStorage).

## Android app (APK)

`Sitekhata.apk` (repo root, also served from `public/`) is the full app in an
Android WebView shell. It works offline — the web bundle and fonts are inside
the APK. Android 7.0 (API 24) or newer.

Install: copy the APK to the phone, open it, and allow "Install unknown apps"
for the app you opened it from.

### Rebuilding the APK

```sh
npm install
# Debian/Ubuntu Android build tools (no Android Studio or Gradle needed):
sudo apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23
npm run build:apk
```

This runs `scripts/build-apk.sh`, which:

1. Builds the web app with `apk/vite.config.ts` into
   `android-app/app/src/main/assets/www` (client-only; the SSR root and the
   "download the APK" banner are swapped out for the phone).
2. Compiles `android-app/.../MainActivity.java`, dexes it, packages resources
   and assets, aligns, and signs.

**Signing key:** the script signs with `android-app/sitekhata-release.keystore`
(password `sitekhata`, override with `SITEKHATA_KEYSTORE` /
`SITEKHATA_KEYSTORE_PASS`) and creates one if it is missing. The keystore is
not committed. Keep a copy: Android only installs an update over the existing
app — keeping its saved books — when the new APK is signed with the same key.

With Android Studio / the Android SDK you can instead run `npm run build:apk-web`
and build `android-app/` with Gradle.

## PC app (Sitekhata.exe) and phone ↔ PC sync

`Sitekhata.exe` (repo root) is the same app for Windows 10/11 (64-bit). One
file, no installer: double-click it. It opens in its own window (Edge
WebView2, built into Windows; falls back to an Edge app window).

The PC app is the **sync hub**. It keeps the master copy of the books in
`%APPDATA%\Sitekhata\books.json` (with a daily copy in `backups\`, last 30
days) and listens on the Wi-Fi on port 47615.

To connect the phone: on the PC open *Phone & PC sync* (top bar, or firm name
→ Phone & PC sync). It shows the PC address and a 6-digit pairing code. On the
phone: firm name → Phone & PC sync → type both → Connect. Windows may ask to
allow network access the first time: choose Allow (private networks).

After that both stay in step automatically whenever the phone and PC are on
the same Wi-Fi (or the phone's hotspot) and Sitekhata is open on the PC —
every change, every 10 seconds, and when the app is opened. Offline, each
keeps working and catches up later. Each record keeps its newest change;
deletions sync too (`src/lib/sync-merge.ts`, engine in `src/lib/sync.ts`,
server in `desktop/main.go`).

Rebuild: `npm run build:exe` (needs Go 1.22+; cross-compiles from Linux or
macOS). Windows SmartScreen warns about unsigned apps: *More info → Run
anyway*.

## Web app

```sh
npm install
npm run dev     # http://localhost:8080
npm run build
```
