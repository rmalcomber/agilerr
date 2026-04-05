#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
EMBED_DIR="$BACKEND_DIR/web/dist"
OUTPUT_DIR="$ROOT_DIR/output"
OUTPUT_BIN="$OUTPUT_DIR/agilerr"

rm -rf "$EMBED_DIR"
mkdir -p "$EMBED_DIR"
mkdir -p "$OUTPUT_DIR"

pushd "$FRONTEND_DIR" >/dev/null
npm ci
npm run build
popd >/dev/null

cp -R "$FRONTEND_DIR/dist/." "$EMBED_DIR/"

pushd "$BACKEND_DIR" >/dev/null
go build -tags embedui -o "$OUTPUT_BIN" .
popd >/dev/null

echo "Built release binary at $OUTPUT_BIN"
