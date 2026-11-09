---
title: Troubleshooting
description: Common problems and what to check.
sidebar:
  order: 6
---

## I do not know which port it is on

If `HTTP_ADDR` was not set, Agilerr picked a random local port and printed it on startup. Look at the console output, or set `HTTP_ADDR` (for example `0.0.0.0:8090`) so it is stable.

## My API key stopped working

If `AGILERR_API_KEY` was not set, a new key is generated on every run. Set it explicitly. The **API** page (system admin) always shows the current key.

## I cannot sign in

Use `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the first time Agilerr started with an empty data directory. Accounts are created by admins; there is no public sign-up. If a new account is marked for first-use rotation you must set a new password before you can do anything else.

## I cannot see a project

Projects are visible only to members. Ask a system admin to add you on the **Users** page with at least *View Projects* and *View Units*.

## A button is missing or greyed out

The UI hides actions you lack permission for. The AI buttons are greyed out when `OPENAI_API_KEY` is not set, or when you do not have *Add with AI*.

## AI Add does nothing

Check `OPENAI_API_KEY`, `OPENAI_BASE_URL` and `OPENAI_MODEL`, that the endpoint is reachable from the Agilerr host, and that you have the *Add with AI* permission.

## I lost my data after restarting in Docker

You need a volume on `/app/pb_data`. The published compose file defines `agilerr_data`. If you used a different command, mount a volume or a host folder there.

## Everything is gone after I moved the binary

PocketBase data lives in `PB_DATA_DIR`, which defaults to `./pb_data` relative to where you start the binary. Start from the same folder or set `PB_DATA_DIR` to an absolute path.

## A 403 from the API

A message such as "Edit item permission is required." means the user or key lacks that permission. Use `X-API-Key` for a full-access key, or check the user's membership.

## Reporting a bug

Open an issue on [GitHub]({{repo}}/issues). Include the version (`./agilerr version`), how you run Agilerr and what you expected.
