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

## Web app

```sh
npm install
npm run dev     # http://localhost:8080
npm run build
```
