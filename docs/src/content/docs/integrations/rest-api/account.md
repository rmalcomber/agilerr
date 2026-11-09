---
title: Account
description: The current user, password changes and the API docs config.
sidebar:
  order: 2
---

Routes for the signed-in user. Any authenticated caller can use them, including accounts that must change their password first.

## `GET /me`

Returns the current user and their project memberships.

```bash
curl http://localhost:8090/api/agilerr/me -H "X-API-Key: $AGILERR_API_KEY"
```

The response is `{ "user": {…}, "memberships": [ … ] }`, where each membership holds a `projectId` and its `permissions`.

## `POST /me/password`

Change your own password.

| Field | Type | Notes |
| --- | --- | --- |
| `oldPassword` | string | current password |
| `newPassword` | string | new password |

Returns `{ "ok": true }`.

## `GET /docs-config`

Feeds the in-app API and MCP pages.

```json
{ "configured": true, "headerName": "X-API-Key", "apiKey": "…", "apiKeyMasked": "…", "openAIConfigured": false }
```

:::danger[The key is in this response]
`apiKey` is the real API key, and the route is open to **any signed-in user**, not only system admins, even though the in-app API page is shown to admins only. Treat every signed-in account as able to read the key.
:::
