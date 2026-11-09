---
title: Environment variables
description: Every setting, its default and what it does.
sidebar:
  order: 1
---

| Variable | Default | Description |
| --- | --- | --- |
| `ADMIN_EMAIL` | `admin@agilerr.local` | Email of the seeded admin user. |
| `ADMIN_PASSWORD` | `change-me-now` | Password of the seeded admin user. Change it. |
| `HTTP_ADDR` | random local port | Address to listen on, e.g. `0.0.0.0:8090`. If unset, Agilerr generates a port in the 20000 to 59999 range and prints it. |
| `PB_DATA_DIR` | `./pb_data` | Where PocketBase stores its data. |
| `AGILERR_API_KEY` | random per run | Key for REST and MCP access, sent as `X-API-Key`. If unset, a random key is generated and printed at startup. |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080` | Comma-separated origins allowed for browser access in development. |
| `OPENAI_API_KEY` | empty | Enables AI Add. |
| `OPENAI_BASE_URL` | `https://api.openai.com` | OpenAI-compatible endpoint. |
| `OPENAI_MODEL` | `gpt-5-mini` | Model used by AI Add. |

## Notes

- A **generated** `HTTP_ADDR` or `AGILERR_API_KEY` is logged at startup, so check the console output the first time you run.
- Set `HTTP_ADDR` and `AGILERR_API_KEY` explicitly for any install you intend to keep, otherwise they change on every start.
- Never commit your real `.env`. The repository ships `.env.example` only.
