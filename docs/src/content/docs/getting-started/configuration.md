---
title: Configuration
description: Environment variables that control Agilerr.
sidebar:
  order: 2
---

Agilerr is configured with environment variables. Copy `.env.example` to `.env` for local development.

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed the first admin user. Set at least the password. |
| `PB_DATA_DIR` | Where PocketBase stores its data. Put this on a persistent volume. |
| `HTTP_ADDR` | Bind address and port, e.g. `0.0.0.0:8090`. Blank = random local port. |
| `AGILERR_API_KEY` | Enables API-key access for REST and MCP. Blank = random key per run. |
| `ALLOWED_ORIGINS` | Origins allowed by CORS in development. |
| `OPENAI_API_KEY` | Enables [AI Add](../../guides/ai-add/). Optional. |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoint. Default `https://api.openai.com`. |
| `OPENAI_MODEL` | Model for AI Add. Default `gpt-5-mini`. |

Agilerr works without any OpenAI configuration: AI Add is simply unavailable.
