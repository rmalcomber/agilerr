---
title: Development
description: Run Agilerr from source, test it and build releases.
sidebar:
  order: 4
---

## Run from source

1. Copy `.env.example` to `.env` and set at least `ADMIN_PASSWORD`.
2. Start the backend:

   ```bash
   cd backend
   go run .
   ```

3. Start the product frontend in another terminal:

   ```bash
   cd frontend
   npm install
   npm run dev          # http://localhost:5173
   ```

4. The marketing site, if you need it:

   ```bash
   cd website
   deno task dev
   ```

Vite proxies `/api` and PocketBase routes to the backend, so set `HTTP_ADDR` to the address the proxy in `frontend/vite.config.ts` expects.

## Tests and builds

| Task | Command |
| --- | --- |
| Backend tests | `cd backend && go test ./...` |
| Frontend build | `cd frontend && npm run build` |
| Website build | `cd website && deno task build` |
| Full release matrix | `./scripts/build-release.sh` |

## Release build

```bash
./scripts/build-release.sh
```

Produces `output/agilerr` for quick testing, versioned archives in `output/<version>/`, and the matching files in `website/static/downloads/`. Targets: `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, `windows/amd64`.

## Docker image

```bash
docker build -t rmalcomber/agilerr:tagname .
docker push rmalcomber/agilerr:tagname
```

## Screenshots

`tools/faq-capture` drives headless Chrome against a running dev app and writes screenshots as WebP. See its README.

## Generated assets

Be careful with these:

- `backend/web/dist/` is the embedded frontend build output.
- `website/static/downloads/` holds release artifacts copied by the build script.
