#!/usr/bin/env bash
# Double-click launcher for macOS (and Linux). Starts the analyzer and opens
# a browser. The .command extension makes Finder treat it as double-clickable.
#
# If macOS refuses to run it, right-click the file and choose Open, then
# confirm — that is Gatekeeper asking about an unsigned script, once.

cd "$(dirname "$0")" || exit 1

pause_then_exit() {
  echo
  read -r -p "Press Enter to close this window."
  exit "$1"
}

PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done

if [ -z "$PY" ]; then
  cat <<'MSG'

  Python 3 is not installed.

  macOS:  install from https://www.python.org/downloads/
          or run:  brew install python

  Linux:  sudo apt install python3        (Debian/Ubuntu)
          sudo dnf install python3        (Fedora)

  Then double-click this file again.
MSG
  pause_then_exit 1
fi

if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
  echo
  echo "  Your Python is too old. This needs version 3.10 or newer."
  "$PY" --version
  echo
  echo "  Install a current version from https://www.python.org/downloads/"
  pause_then_exit 1
fi

echo "Starting Chart Analyzer..."
echo
echo "Your browser will open at http://127.0.0.1:8000"
echo "Press Ctrl-C, or close this window, when you are finished."
echo

"$PY" app.py --open

echo
echo "Chart Analyzer has stopped."
pause_then_exit 0
