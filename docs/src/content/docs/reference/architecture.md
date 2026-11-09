---
title: Architecture and development
description: How the pieces fit and how to run them locally.
sidebar:
  order: 2
---

| Folder | Contents |
| --- | --- |
| `backend/` | Go API, PocketBase bootstrap, permissions, AI flows, MCP, embedded frontend serving |
| `frontend/` | Preact product app |
| `website/` | Fresh 2 marketing site for agilerr.app |
| `scripts/` | Release scripts |
| `tools/faq-capture/` | Puppeteer tool that captures the screenshots used in these docs |

## Run in development

```bash
cp .env.example .env     # set ADMIN_PASSWORD
cd backend && go run .
cd frontend && npm install && npm run dev   # http://localhost:5173
```

In development the frontend is not embedded; Vite proxies API calls to the backend.

## Release build

```bash
./scripts/build-release.sh
```

Builds `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64` and `windows/amd64`, with the frontend embedded in each binary.

## Upgrades

The binary stores its schema version and last binary version in database metadata, so future releases can apply ordered migrations when the database is older than the binary.

## Updating these docs

Screenshots come from `tools/faq-capture` (see its README) and live in `docs/src/assets/screenshots/`. Contributions: see `CONTRIBUTING.md`.
