---
title: Comments
description: Read and add comments on items, with mentions.
sidebar:
  order: 6
---

| Method | Path | Needs | Purpose |
| --- | --- | --- | --- |
| GET | `/units/{unitId}/comments` | `viewUnits` | List comments (`{ "comments": [ … ] }`) |
| POST | `/units/{unitId}/comments` | `editUnits` | Add a comment (returns 201 `{ "comment": {…} }`) |

## Add a comment

| Field | Type | Notes |
| --- | --- | --- |
| `body` | string | Markdown |
| `mentions` | array | optional; each `{ "type": "user" or "unit", "id": "…", "label": "…" }` |

```bash
curl -X POST http://localhost:8090/api/agilerr/units/<unit_id>/comments \
  -H "X-API-Key: $AGILERR_API_KEY" -H "Content-Type: application/json" \
  -d '{"body":"Looks good.","mentions":[]}'
```

Use [suggestions](/integrations/rest-api/projects/) to find ids to mention. See [Markdown, tags and mentions](/concepts/content/).
