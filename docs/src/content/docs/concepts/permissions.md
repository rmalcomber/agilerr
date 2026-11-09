---
title: Permissions model
description: System admins, project membership and per-project permissions.
sidebar:
  order: 3
---

Access in Agilerr has two layers.

## 1. System level

| Permission | What it allows |
| --- | --- |
| **System Admin** | Instance-wide. Manage users, project memberships and passwords, view the Deleted page and purge, and see the API and MCP docs. Has every project capability. |
| **Create Projects** | Create new projects. This is granted globally and separately from editing. |

## 2. Project level

A project is only **visible** to users who are members of it. Membership carries a set of permissions for that project:

| Permission | What it allows |
| --- | --- |
| **View Projects** | See the project and its pages. |
| **View Units** | See backlog items, bugs and comments. |
| **Edit Units** | Create and change items, comment, drag on the board. |
| **Delete Units** | Delete items. |
| **Add with AI** | Use [AI Add](../../guides/ai-add/). |
| **Edit Projects** | Change project metadata. |
| **Edit Project Settings** | Change project settings such as colours. |
| **Project Admin** | Full access to that project, including items and settings. |

## How it shows up

The UI hides actions you are not allowed to take, and the server enforces the same rules, so hiding is not the only protection. If you lack a permission the API returns a clear error such as "Edit item permission is required."

## Who does what

Only **system admins** create users, set memberships, change permissions and reset passwords. See [Users and permissions](../../guides/users-and-permissions/).

:::tip
Start people with *View Projects* and *View Units*, then add *Edit Units* for those who work the board. Reserve *Project Admin* for a few people per project.
:::
