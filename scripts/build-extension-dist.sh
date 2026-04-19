#!/usr/bin/env bash
# Build a Chrome-ready folder (and optional zip) with real files — no symlinks
# in yaml/ or fonts/. Use this output for Chrome Web Store and GitHub Releases.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Cleaning dist/"
rm -rf dist
mkdir -p dist/fonts dist/yaml

echo "==> Copying extension sources (dereference symlinks in yaml + fonts)"
rsync -aL --delete yaml/ dist/yaml/
rsync -aL --delete fonts/ dist/fonts/

cp manifest.json background.js content.js parser.js trie.js popup.html popup.js dist/
rsync -a icons/ dist/icons/
rsync -a vendor/ dist/vendor/

echo "==> Verifying no symlinks under dist/fonts or dist/yaml"
if find dist/fonts dist/yaml -type l 2>/dev/null | grep -q .; then
  echo "ERROR: dist still contains symlinks. Fix sources or rsync." >&2
  find dist/fonts dist/yaml -type l >&2
  exit 1
fi

ZIP_NAME="${ZIP_NAME:-jyutcitzi-chrome-extension-dist.zip}"
echo "==> Writing ${ROOT}/${ZIP_NAME}"
( cd dist && zip -r -q "../${ZIP_NAME}" . )

echo "==> Done. Load unpacked from: ${ROOT}/dist"
echo "    Or upload: ${ROOT}/${ZIP_NAME}"
