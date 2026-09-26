#!/usr/bin/env bash
# Build Sitekhata.exe (Windows, 64-bit) — the PC app and phone-sync hub.
#
# Needs Go 1.22+ and Node. Cross-compiles from Linux/macOS or builds on Windows.
#   1. Build the web app (same bundle as the APK) and copy it into desktop/web
#   2. Windows resources (icon, version, DPI manifest) from desktop/winres
#   3. go build -H windowsgui (no console window)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD

echo "==> Building web app"
npx vite build --config apk/vite.config.ts
rm -rf desktop/web
mkdir -p desktop/web
cp -r android-app/app/src/main/assets/www/. desktop/web/

echo "==> Windows resources"
(cd desktop && go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --arch amd64)

echo "==> Compiling Sitekhata.exe"
(cd desktop && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui -s -w" -o "$ROOT/Sitekhata.exe" .)
echo "==> Done: $ROOT/Sitekhata.exe ($(du -h "$ROOT/Sitekhata.exe" | cut -f1))"
