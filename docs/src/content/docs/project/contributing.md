---
title: Contributing
description: Branch flow, pull requests and funding.
sidebar:
  order: 2
---

Contributions are welcome. The repository's `CONTRIBUTING.md` is the source of truth; this is the summary.

## Branches

| Branch | Role |
| --- | --- |
| `dev` | the default integration branch for feature work and normal pull requests |
| `stage` | pre-release branch where selected changes are gathered and checked together |
| `main` | the protected release branch |

Flow: branch from `dev` → open a PR into `dev` → promote chosen changes to `stage` → validate → merge `stage` into `main` → tag a release such as `v1.0.0`.

## Pull requests

- Keep them focused.
- Include tests or build verification where applicable.
- Update docs when behaviour changes (these docs live in `docs/`).
- Avoid bundling unrelated frontend, backend and website work together.

## Working on the docs

```bash
cd docs
npm install
npm run dev
npm run build     # also fails on broken internal links
```

Pages are Markdown in `docs/src/content/docs/`. Screenshots live in `docs/src/assets/screenshots/`.

## Funding

- [GitHub Sponsors](https://github.com/sponsors/rmalcomber)
- [Buy Me a Coffee](https://buymeacoffee.com/rmalcomber)
