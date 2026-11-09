---
title: Projects
description: List, create, read, update and delete projects.
sidebar:
  order: 4
---

| Method | Path | Needs | Purpose |
| --- | --- | --- | --- |
| GET | `/projects` | member (admins see all) | List the projects you can see |
| POST | `/projects` | system admin or *create projects* | Create a project |
| GET | `/projects/{projectId}` | `viewProject` | The project and its whole item tree |
| PATCH | `/projects/{projectId}` | `editProjectSettings` / `editProject` / `projectAdmin` | Update a project |
| GET | `/projects/{projectId}/suggest?q=` | `viewUnits` | Search suggestions for mentions |
| GET | `/projects/{projectId}/delete-preview` | `projectAdmin` | What deleting would remove |
| DELETE | `/projects/{projectId}` | `projectAdmin` | Soft delete |

## Create

```bash
curl -X POST http://localhost:8090/api/agilerr/projects \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Platform refresh","description":"Main delivery project","color":"#2563eb","tags":["platform"]}'
```

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | required |
| `description` | string | |
| `color` | string | |
| `tags` | string array | |
| `unitColors` | object | default colours per item type |
| `statusColors` | object | colours per status |

Returns **201** `{ "project": {…} }`. The creator becomes a project admin.

## Read

`GET /projects/{projectId}` returns:

```json
{ "project": {}, "units": [], "comments": [], "users": [], "tags": [] }
```

Use it first: the `units` list holds every id you need as a `parentId`.

## Suggestions

`GET /projects/{projectId}/suggest?q=onb` returns lists of matching items, tags and users, each as `{ "id": "…", "label": "…" }`.

## Deleting

`GET …/delete-preview` returns `{ "preview": { "id", "kind", "title", "childTitles": [], "totalDeleted" } }`. `DELETE` soft-deletes the project and its items; they stay recoverable until [purged](/integrations/rest-api/deleted/). See [Deleting and recovery](/guides/deleting/).
