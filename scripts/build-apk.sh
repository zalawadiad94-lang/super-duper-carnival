#!/usr/bin/env bash
# Build Sitekhata.apk without Gradle, using the Android build tools packaged by
# Debian/Ubuntu:
#
#   sudo apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23
#
# Steps: build the web app into android-app/app/src/main/assets/www, compile
# MainActivity, dex it, package resources + assets, align, sign.
#
# Signing key: $SITEKHATA_KEYSTORE (default android-app/sitekhata-release.keystore)
# with password $SITEKHATA_KEYSTORE_PASS (default "sitekhata"). A new key is
# created if the file is missing. Keep the keystore: Android only installs an
# update over the existing app when it is signed with the same key.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$PWD
APP=$ROOT/android-app/app
OUT=$ROOT/apk-build
PACKAGE=com.sitekhata.app
VERSION_CODE=11
VERSION_NAME=2.9
MIN_SDK=24
TARGET_SDK=34
SDK=${ANDROID_SDK_DEB:-/usr/lib/android-sdk}
ANDROID_JAR=$(ls "$SDK"/platforms/android-*/android.jar | sort -V | tail -1)
KEYSTORE=${SITEKHATA_KEYSTORE:-$ROOT/android-app/sitekhata-release.keystore}
KEYPASS=${SITEKHATA_KEYSTORE_PASS:-sitekhata}

for tool in aapt dalvik-exchange zipalign apksigner javac keytool; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

echo "==> Building web app"
npx vite build --config apk/vite.config.ts

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

# The source manifest leaves package/version/SDK to the build (Gradle style).
sed -e "s#<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">#<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\" package=\"$PACKAGE\" android:versionCode=\"$VERSION_CODE\" android:versionName=\"$VERSION_NAME\">\n    <uses-sdk android:minSdkVersion=\"$MIN_SDK\" android:targetSdkVersion=\"$TARGET_SDK\" />#" \
  "$APP/src/main/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"

echo "==> Generating R.java"
aapt package -f -m -J "$OUT/gen" -M "$OUT/AndroidManifest.xml" -S "$APP/src/main/res" -I "$ANDROID_JAR"

echo "==> Compiling Java"
javac --release 8 -nowarn -classpath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$APP/src/main/java" "$OUT/gen" -name '*.java') 2> >(grep -v "source value 8 is obsolete\|target value 8 is obsolete\|suppress this warning\|^warning: \[options\]\|^[0-9] warnings\?$" >&2)

echo "==> Dexing"
dalvik-exchange --dex --min-sdk-version=$MIN_SDK --output="$OUT/dex/classes.dex" "$OUT/classes"

echo "==> Packaging"
aapt package -f -M "$OUT/AndroidManifest.xml" -S "$APP/src/main/res" -A "$APP/src/main/assets" \
  -I "$ANDROID_JAR" -F "$OUT/unsigned.apk" -0 woff2
(cd "$OUT/dex" && aapt add "$OUT/unsigned.apk" classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo "==> Creating signing key $KEYSTORE"
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -alias sitekhata \
    -keyalg RSA -keysize 2048 -validity 10000 -storepass "$KEYPASS" -keypass "$KEYPASS" \
    -dname "CN=Sitekhata, O=Sitekhata, C=IN"
fi

echo "==> Signing"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KEYPASS" --ks-key-alias sitekhata \
  --min-sdk-version $MIN_SDK --out "$ROOT/Sitekhata.apk" "$OUT/aligned.apk"
apksigner verify --min-sdk-version $MIN_SDK "$ROOT/Sitekhata.apk"

echo "==> Done: $ROOT/Sitekhata.apk ($(du -h "$ROOT/Sitekhata.apk" | cut -f1))"
