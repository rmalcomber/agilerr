---
title: Statuses and priorities
description: The five statuses and four bug priorities.
sidebar:
  order: 2
---

## Statuses

Every item has one of five statuses:

| Status | Meaning |
| --- | --- |
| `triage` | Newly raised and not yet validated. Bugs start here. |
| `todo` | Accepted and waiting to be worked. |
| `in_progress` | Being worked on. |
| `review` | Waiting for review or acceptance. |
| `done` | Finished. |

The kanban lanes shown are **Todo**, **In Progress**, **Review** and **Done**. Bugs also use **Triage**.

## Priorities

Priority applies to **bugs**:

| Priority | Meaning |
| --- | --- |
| `critical` | Drop everything. |
| `high` | Fix soon. |
| `medium` | Normal. |
| `low` | When there is time. |

## Changing status

- Drag a card to another lane on the [Kanban](../../guides/kanban/) board, or
- edit the item and pick a status, or
- call `POST /api/agilerr/units/{id}/move` with `{"status": "in_progress"}` (see the [REST API](../../integrations/rest-api/)).
