# FAQ Capture Tool

Small Puppeteer utility for capturing Agilerr FAQ screenshots from the local dev app.

## What it does

- opens `http://localhost:5173`
- signs in with the admin user
- discovers the first visible project
- captures a set of configured pages
- converts each screenshot to `.webp` with `convert`

## Requirements

- local frontend running on `http://localhost:5173`
- local backend running and reachable through the Vite proxy
- `convert` available on `PATH`

## Usage

```bash
cd tools/faq-capture
npm run capture
```

Optional overrides:

```bash
AGILERR_BASE_URL=http://localhost:5173 \
AGILERR_ADMIN_EMAIL=admin@agilerr.local \
AGILERR_ADMIN_PASSWORD=change-me-now \
npm run capture
```

Output goes to `tools/faq-capture/output/`.

The capture list is defined in `capture.config.json`.
