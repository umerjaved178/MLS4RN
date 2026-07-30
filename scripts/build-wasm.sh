#!/usr/bin/env bash
#
# Regenerate the openmls-wasm bindings from the vendored Rust source and refresh
# the committed artifacts:
#   - wasm/       Node target (CommonJS, loads synchronously)
#   - wasm-web/   Web target  (ES modules, requires `await init()` in the browser)
#
# The Rust source under openmls/ is the build-time input; the BUILT artifacts in
# wasm/ and wasm-web/ are what get committed and shipped.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRATE="$ROOT/openmls/openmls-wasm"

if [ ! -d "$CRATE" ]; then
  echo "error: vendored openmls source not found at $CRATE" >&2
  echo "It is committed under openmls/. Restore it before rebuilding." >&2
  exit 1
fi

command -v wasm-pack >/dev/null 2>&1 || {
  echo "error: wasm-pack not found. Install: https://rustwasm.github.io/wasm-pack/" >&2
  exit 1
}

build_target() {
  local target="$1" dest="$2"
  echo "==> Building openmls-wasm (target: $target)"
  wasm-pack build "$CRATE" --target "$target"
  echo "==> Refreshing ${dest#"$ROOT"/}"
  rm -rf "$dest"
  mkdir -p "$dest"
  # Copy everything EXCEPT pkg's own '*' .gitignore, which would hide the artifact.
  rsync -a --exclude='.gitignore' "$CRATE/pkg/" "$dest/"
}

build_target nodejs "$ROOT/wasm"
build_target web "$ROOT/wasm-web"

echo "==> Done. wasm/ and wasm-web/ refreshed."
