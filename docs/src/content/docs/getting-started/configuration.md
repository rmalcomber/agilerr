---
title: Configuration
description: The settings you will want to change first.
sidebar:
  order: 3
---

Agilerr is configured with environment variables. For local development copy `.env.example` to `.env`. For the binary, export them before starting it. For Docker, set them under `environment:` in the compose file.

## The ones that matter first

| Variable | Why you set it |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Create the first admin user. Defaults are `admin@agilerr.local` and `change-me-now`: change the password. |
| `PB_DATA_DIR` | Where PocketBase keeps its data. Put it on persistent storage and back it up. |
| `HTTP_ADDR` | Address and port to listen on, e.g. `0.0.0.0:8090`. Leave blank for a random local port. |
| `AGILERR_API_KEY` | Key for REST and MCP access. Leave blank for a random key per run. |

## Optional

| Variable | Why you set it |
| --- | --- |
| `OPENAI_API_KEY` | Turns on [AI Add](../../guides/ai-add/). |
| `OPENAI_BASE_URL` | Point AI Add at an OpenAI-compatible endpoint. Default `https://api.openai.com`. |
| `OPENAI_MODEL` | The model AI Add uses. Default `gpt-5-mini`. |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed for browser access in development. |

The full list with defaults is in [Environment variables](../../reference/environment-variables/).

## A stable setup

```bash
export ADMIN_EMAIL=you@example.com
export ADMIN_PASSWORD='a-long-passphrase'
export HTTP_ADDR=0.0.0.0:8090
export PB_DATA_DIR=/var/lib/agilerr
export AGILERR_API_KEY="$(openssl rand -hex 24)"
./agilerr
```

:::note
`ADMIN_EMAIL` and `ADMIN_PASSWORD` seed the first admin. Once accounts exist, manage passwords from the **Users** page.
:::
