---
title: Install
description: Run Agilerr from a binary or with Docker Compose.
sidebar:
  order: 1
---

Agilerr runs as one application. You need no separate database: PocketBase is embedded, so you only need somewhere to keep its data directory.

## From a binary

Download the archive for your platform from [agilerr.app](https://agilerr.app), extract it and run it.

| Platform | Archive |
| --- | --- |
| Linux x64 | `agilerr-linux-amd64.tar.gz` |
| Linux ARM64 | `agilerr-linux-arm64.tar.gz` |
| macOS Apple Silicon | `agilerr-darwin-arm64.zip` |
| macOS Intel | `agilerr-darwin-amd64.zip` |
| Windows x64 | `agilerr-windows-amd64.zip` |

```bash
curl -L https://agilerr.app/downloads/agilerr-linux-amd64.tar.gz | tar xz
./agilerr
```

If `HTTP_ADDR` is not set, Agilerr picks a random local port and prints it on startup. If `AGILERR_API_KEY` is not set it generates a key for that run and prints it too. That is handy for trying it out; set both for a stable install.

## With Docker Compose

```bash
curl -O https://agilerr.app/install/docker-compose.yml
docker compose up -d
```

The compose file runs `rmalcomber/agilerr:latest` on port 8090 with a named volume for the data directory.

:::caution
Change `ADMIN_PASSWORD` and `AGILERR_API_KEY` in the compose file before exposing the service to anything other than your own machine.
:::

## Sign in

Open the address Agilerr printed (or `http://localhost:8090` for Docker) and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Next: [configuration](../configuration/).
