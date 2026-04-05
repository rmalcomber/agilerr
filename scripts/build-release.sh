#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
EMBED_DIR="$BACKEND_DIR/web/dist"
OUTPUT_DIR="$ROOT_DIR/output"
OUTPUT_BIN="$OUTPUT_DIR/agilerr"
WEBSITE_DOWNLOADS_DIR="$ROOT_DIR/website/static/downloads"
RELEASE_README="$ROOT_DIR/RELEASE_README.md"
VERSION="${AGILERR_VERSION:-$(git -C "$ROOT_DIR" describe --tags --always --dirty 2>/dev/null || echo dev)}"
RELEASE_DIR="$OUTPUT_DIR/$VERSION"
TARGETS=(
  "linux amd64 tar.gz"
  "linux arm64 tar.gz"
  "darwin amd64 zip"
  "darwin arm64 zip"
  "windows amd64 zip"
)

rm -rf "$EMBED_DIR"
rm -rf "$RELEASE_DIR"
rm -rf "$WEBSITE_DOWNLOADS_DIR"
mkdir -p "$EMBED_DIR"
mkdir -p "$OUTPUT_DIR"
mkdir -p "$RELEASE_DIR"
mkdir -p "$WEBSITE_DOWNLOADS_DIR"

pushd "$FRONTEND_DIR" >/dev/null
npm ci
npm run build
popd >/dev/null

cp -R "$FRONTEND_DIR/dist/." "$EMBED_DIR/"

build_target() {
  local goos="$1"
  local goarch="$2"
  local archive_format="$3"
  local binary_name="agilerr"

  if [[ "$goos" == "windows" ]]; then
    binary_name="agilerr.exe"
  fi

  local artifact_base="agilerr-${goos}-${goarch}"
  local staging_dir="$RELEASE_DIR/$artifact_base"
  local staged_binary="$staging_dir/$binary_name"

  mkdir -p "$staging_dir"

  pushd "$BACKEND_DIR" >/dev/null
  CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" \
    go build -tags embedui -ldflags "-X 'main.BinaryVersion=$VERSION'" -o "$staged_binary" .
  popd >/dev/null

  cp "$RELEASE_README" "$staging_dir/README.md"

  pushd "$RELEASE_DIR" >/dev/null
  if [[ "$archive_format" == "zip" ]]; then
    zip -rq "${artifact_base}.zip" "$artifact_base"
  else
    tar -czf "${artifact_base}.tar.gz" "$artifact_base"
  fi
  popd >/dev/null

  rm -rf "$staging_dir"
}

for target in "${TARGETS[@]}"; do
  # shellcheck disable=SC2086
  build_target $target
done

pushd "$BACKEND_DIR" >/dev/null
go build -tags embedui -ldflags "-X 'main.BinaryVersion=$VERSION'" -o "$OUTPUT_BIN" .
popd >/dev/null

echo "Built Agilerr $VERSION"
echo "Local binary: $OUTPUT_BIN"
echo "Release archives:"
find "$RELEASE_DIR" -maxdepth 1 -type f | sort

cp "$RELEASE_DIR"/* "$WEBSITE_DOWNLOADS_DIR/"

echo "Website downloads:"
find "$WEBSITE_DOWNLOADS_DIR" -maxdepth 1 -type f | sort
