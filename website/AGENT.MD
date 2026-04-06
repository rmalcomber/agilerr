# Website Agent Guide

This directory contains the public marketing site for `agilerr.app`.

## Stack

- Fresh 2
- Deno
- Vite
- Tailwind CSS

## Responsibilities

- product landing page
- download links and release artifact serving
- public-facing FAQ and quick start guidance
- donation/support entry points

## Important Files

- `routes/index.tsx`: main landing page
- `routes/_app.tsx`: metadata and app shell
- `assets/styles.css`: marketing-site styling
- `static/downloads/`: release artifacts copied by `../scripts/build-release.sh`
- `static/faq/`: screenshots used in docs and marketing
- `deno.json`: Fresh/Vite tasks plus deploy metadata

## Commands

- Dev server: `deno task dev`
- Production build: `deno task build`
- Start built server: `deno task start`
- Full checks: `deno task check`

## Website Conventions

- Keep this site distinct from the product app UI. It should sell and explain the product, not mirror the internal workspace.
- Use the Agilerr dark branding and existing logo assets.
- Download links should align with files generated into `static/downloads/`.
- Public docs here can overlap with product docs, but keep them installation-focused and externally readable.

## Release Notes

- `scripts/build-release.sh` now copies generated archives into `website/static/downloads/`.
- If download URLs or platform targets change, update both the release script and the landing page together.
