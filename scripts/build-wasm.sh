#!/usr/bin/env bash
#
# Regenerate the openmls-wasm (nodejs target) bindings from the vendored Rust
# source and refresh the committed wasm/ artifact.
#
# The Rust source under openmls/ is gitignored (build-time input only); the
# BUILT artifact in wasm/ is what gets committed and shipped.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRATE="$ROOT/openmls/openmls-wasm"
DEST="$ROOT/wasm"

if [ ! -d "$CRATE" ]; then
  echo "error: vendored openmls source not found at $CRATE" >&2
  echo "It is gitignored (build-time only). Restore it before rebuilding." >&2
  exit 1
fi

command -v wasm-pack >/dev/null 2>&1 || {
  echo "error: wasm-pack not found. Install: https://rustwasm.github.io/wasm-pack/" >&2
  exit 1
}

echo "==> Building openmls-wasm (target: nodejs)"
wasm-pack build "$CRATE" --target nodejs

echo "==> Refreshing committed artifact at wasm/"
rm -rf "$DEST"
mkdir -p "$DEST"
# Copy everything EXCEPT pkg's own '*' .gitignore, which would hide the artifact.
rsync -a --exclude='.gitignore' "$CRATE/pkg/" "$DEST/"

echo "==> Done. wasm/ refreshed."
