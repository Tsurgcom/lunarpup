#!/usr/bin/env bash
# Scaffold Android / iOS projects for Lunar Pup.
# Prerequisites:
#   - Rust toolchain
#   - ANDROID_HOME + NDK_HOME (+ JAVA_HOME) for Android
#   - macOS + Xcode for iOS (`tauri ios` is unavailable on Linux)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "warning: ANDROID_HOME unset — android init may fail" >&2
fi

echo "→ tauri android init"
bunx tauri android init --ci --skip-targets-install

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "→ tauri ios init"
  bunx tauri ios init --ci --skip-targets-install
else
  echo "skip: iOS init requires macOS/Xcode (tauri ios is not available on $(uname -s))"
fi

echo "done."
