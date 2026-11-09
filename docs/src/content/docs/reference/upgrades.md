---
title: Versions and upgrades
description: How the binary and database track versions.
sidebar:
  order: 5
---

## Version tracking

Agilerr stores two values in its internal `app_meta` collection: the **schema version** and the **last binary version** that opened the database. At startup it compares them with the running binary.

```bash
./agilerr version
```

prints the binary version and schema version, for example `Agilerr dev (schema 1)` for a development build.

## Migrations

The design supports ordered migrations: when a database's schema version is older than the binary's, the binary applies the missing migrations in order. At present the schema is at version 1 and there are no migrations to run.

## Upgrading

1. **Back up** your data directory (`PB_DATA_DIR`, or the Docker volume).
2. Stop Agilerr.
3. Replace the binary, or pull the new image (`docker compose pull && docker compose up -d`).
4. Start it. Check the log line for the version.

## Releases

Releases are cut from tagged commits on `main`. The release workflow verifies the tag, builds versioned binaries, publishes GitHub Release assets, pushes the Docker image and deploys the download site.

A standalone binary archive ships with `RELEASE_README.md` as its readme.
