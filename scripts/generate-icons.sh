#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
SOURCE="$ROOT_DIR/assets/logo.png"
TARGET_DIR="$ROOT_DIR/assets/icons"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing source logo: $SOURCE" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

sips -z 16 16 "$SOURCE" --out "$TARGET_DIR/icon16.png" >/dev/null
sips -z 32 32 "$SOURCE" --out "$TARGET_DIR/icon32.png" >/dev/null
sips -z 48 48 "$SOURCE" --out "$TARGET_DIR/icon48.png" >/dev/null
sips -z 128 128 "$SOURCE" --out "$TARGET_DIR/icon128.png" >/dev/null

echo "Generated extension icons in $TARGET_DIR"
