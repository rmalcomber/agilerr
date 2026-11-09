---
title: Users
description: Create and manage users and their project memberships (system admin only).
sidebar:
  order: 3
---

All user routes need a **system admin** (or the API key).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/users` | List users with their memberships, plus all projects |
| POST | `/users` | Create a user |
| PATCH | `/users/{userId}` | Update a user and memberships |
| POST | `/users/{userId}/reset-password` | Issue a new temporary password |

## Create or update

Create and update take the same body:

```json
{
  "email": "sam@example.com",
  "name": "Sam",
  "systemAdmin": false,
  "createProjects": true,
  "memberships": [
    { "projectId": "<project_id>", "permissions": { "viewProject": true, "viewUnits": true, "editUnits": true } }
  ]
}
```

```bash
curl -X POST http://localhost:8090/api/agilerr/users \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"sam@example.com","name":"Sam","systemAdmin":false,"createProjects":false,"memberships":[]}'
```

Creating returns **201** with `{ "user": {…}, "temporaryPassword": "…" }`. The new account must change that password on first sign-in. Updating returns `{ "user": {…} }`.

## Reset a password

`POST /users/{userId}/reset-password` has no body and returns `{ "temporaryPassword": "…" }`.

See [Users and permissions](/guides/users-and-permissions/) for the same thing in the UI.
