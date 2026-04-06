# Agilerr Agent Guide

This repository contains the product app plus the public marketing site.

## Project Layout

- `backend/`: Go API, embedded PocketBase, auth, storage, AI planning, MCP, and release-time embedded frontend serving.
- `frontend/`: Preact app for the main Agilerr product UI.
- `website/`: Fresh 2 marketing site for `agilerr.app`.
- `scripts/`: release and utility scripts.
- `tools/faq-capture/`: Puppeteer screenshot tool used to capture product screenshots for docs and marketing.

## Working Rules

- Keep product app changes in `backend/` and `frontend/`.
- Keep public marketing/site work in `website/`.
- Do not treat the repo `README.md` as the release-binary README. Standalone binary packaging uses `RELEASE_README.md`.
- Be careful with generated assets:
  - `backend/web/dist/` is the embedded frontend build output.
  - `website/static/downloads/` contains release artifacts copied by `scripts/build-release.sh`.

## Common Commands

- Product frontend dev: `cd frontend && npm run dev`
- Backend dev: `cd backend && go run .`
- Backend tests: `cd backend && go test ./...`
- Product frontend build: `cd frontend && npm run build`
- Marketing site dev: `cd website && deno task dev`
- Marketing site build: `cd website && deno task build`
- Full release build matrix: `./scripts/build-release.sh`

## Release Notes

- The release build embeds the product frontend into the Go binary.
- The release build also cross-compiles archives for supported desktop/server targets.
- Binary/database version state is managed in backend startup using the internal `app_meta` collection.

