---
title: REST API
description: Automate Agilerr with an API key.
sidebar:
  order: 1
---

Agilerr exposes a REST API under **`/api/agilerr`**. System admins can browse it interactively on the **API** page in the app, which fills in real project and item ids and produces copy-ready `curl` commands.

![The interactive API docs page](../../../assets/screenshots/api.webp)

## Authentication

Send your key in the `X-API-Key` header. The key is whatever you set as `AGILERR_API_KEY`. A valid signed-in session token also works.

```bash
curl http://localhost:8090/api/agilerr/me \
  -H "X-API-Key: $AGILERR_API_KEY"
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/me` | The current user |
| POST | `/me/password` | Change your own password |
| GET | `/users` | List users |
| POST | `/users` | Create a user |
| PATCH | `/users/{userId}` | Update a user and memberships |
| POST | `/users/{userId}/reset-password` | Reset a password |
| GET | `/projects` | List projects |
| POST | `/projects` | Create a project |
| GET | `/projects/{projectId}` | The project and its item tree |
| PATCH | `/projects/{projectId}` | Update a project |
| GET | `/projects/{projectId}/suggest?q=` | Search suggestions |
| GET | `/projects/{projectId}/delete-preview` | What deleting would remove |
| DELETE | `/projects/{projectId}` | Soft delete a project |
| POST | `/projects/{projectId}/units` | Create an item |
| PATCH | `/units/{unitId}` | Update an item |
| POST | `/units/{unitId}/move` | Change an item's status |
| GET | `/units/{unitId}/delete-preview` | What deleting would remove |
| DELETE | `/units/{unitId}` | Soft delete an item |
| GET | `/units/{unitId}/comments` | List comments |
| POST | `/units/{unitId}/comments` | Add a comment |
| GET | `/deleted` | List deleted records |
| POST | `/deleted/purge` | Permanently purge records |
| POST | `/ai-plans/...` | AI Add sessions (see below) |

All paths are relative to `/api/agilerr`.

## Examples

### Create a project

```bash
curl -X POST http://localhost:8090/api/agilerr/projects \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Platform refresh","description":"Main delivery project","color":"#2563eb","tags":["platform"]}'
```

### Create an epic

```bash
curl -X POST http://localhost:8090/api/agilerr/projects/<project_id>/units \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"type":"epic","status":"todo","title":"Ship onboarding","description":"Create the onboarding experience","tags":["onboarding","mvp"]}'
```

### Create a story under a feature

```bash
curl -X POST http://localhost:8090/api/agilerr/projects/<project_id>/units \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"type":"story","parentId":"<feature_id>","status":"todo","title":"As a visitor I can sign up"}'
```

### Move an item

```bash
curl -X POST http://localhost:8090/api/agilerr/units/<unit_id>/move \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
```

### Add a comment

```bash
curl -X POST http://localhost:8090/api/agilerr/units/<unit_id>/comments \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"body":"Looks good."}'
```

## Item fields

| Field | Type | Notes |
| --- | --- | --- |
| `type` | string | `epic`, `feature`, `story`, `task`, `bug` |
| `status` | string | `triage`, `todo`, `in_progress`, `review`, `done` |
| `priority` | string | bugs only: `critical`, `high`, `medium`, `low` |
| `title` | string | required |
| `description` | string | Markdown |
| `parentId` | string | the item directly above |
| `assigneeId` | string | a user id |
| `tags` | string array | |
| `color` | string | optional colour |

## Errors

Errors return a JSON message with an HTTP status such as 400 (invalid input), 401 (no valid auth) or 403 (missing permission, for example "Edit item permission is required.").

:::tip
Use `GET /projects/{projectId}` first. It returns the whole tree with ids, which you need as `parentId` when creating children.
:::
