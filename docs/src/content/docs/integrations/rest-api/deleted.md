---
title: Deleted items
description: List soft-deleted records and purge them permanently (system admin only).
sidebar:
  order: 8
---

Deleting a project or item is a **soft delete**. These routes need a **system admin** (or the API key).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/deleted` | List soft-deleted records: `{ "items": [ { "id", "kind", "title" } ] }` |
| POST | `/deleted/purge` | Permanently remove records that are already soft-deleted |

## Purge

```bash
curl -X POST http://localhost:8090/api/agilerr/deleted/purge \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"projectIds":[],"unitIds":["<unit_id>"]}'
```

Returns `{ "ok": true }`. Only records that are already soft-deleted are removed, and **a purge cannot be undone**. See [Deleting and recovery](/guides/deleting/).
