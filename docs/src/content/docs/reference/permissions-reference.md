---
title: Permissions reference
description: A matrix of what each permission allows.
sidebar:
  order: 2
---

Project permissions are stored per user and per project as these keys:

| UI name | API key | Allows |
| --- | --- | --- |
| View Projects | `view_project` | See the project and its pages |
| View Units | `view_units` | See items, bugs and comments |
| Edit Units | `edit_units` | Create, edit, move and comment on items |
| Delete Units | `delete_units` | Soft-delete items |
| Add with AI | `add_with_ai` | Use AI Add |
| Edit Projects | `edit_project` | Change project metadata |
| Edit Project Settings | `edit_project_settings` | Change project settings |
| Project Admin | `project_admin` | Everything in the project, including deleting it |

System-level:

| Permission | Allows |
| --- | --- |
| System Admin | Users, memberships, passwords, Deleted and purge, API docs, MCP docs, all project capabilities |
| Create Projects | Create new projects |

## What needs what

| Action | Needs |
| --- | --- |
| Open a project | View Projects |
| Read the backlog, bugs, comments | View Units |
| Add or edit an item, drag on the board, comment | Edit Units |
| Delete an item | Delete Units |
| Use AI Add | Add with AI |
| Edit a project's details | Edit Projects |
| Change project settings | Edit Project Settings |
| Delete a project | Project Admin |
| Purge deleted records | System Admin |
| Manage users | System Admin |
