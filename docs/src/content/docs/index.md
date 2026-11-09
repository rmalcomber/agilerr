---
title: Agilerr
description: A local-first Agile Scrum board with a Go backend, embedded PocketBase and optional AI planning.
template: splash
hero:
  tagline: A local-first Agile Scrum board. One binary, no external database, REST and MCP built in.
  actions:
    - text: Get started
      link: /agilerr/getting-started/install/
      icon: right-arrow
    - text: View on GitHub
      link: '{{repo}}'
      variant: minimal
---

![The Agilerr backlog showing an epic, feature, user story and tasks](../../assets/screenshots/backlog.webp)

## What is Agilerr?

Agilerr is a self-hosted Agile board for teams that want to own their data. It runs as **one application**: a Go backend, embedded [PocketBase](https://pocketbase.io) for auth and storage, and a Preact web UI, all served together. There is no external database to run.

- A strict hierarchy: **Project → Epic → Feature → User Story → Task**.
- A separate **bug workflow** that starts in triage.
- Dashboard, backlog, kanban boards, deleted items and project settings.
- Markdown descriptions and comments, tags, mentions and assignments.
- Per-project **permissions** and system administration.
- **AI Add**: an optional planning conversation that proposes items for you to review.
- A **REST API** and an **MCP** endpoint so scripts and AI agents can work with the board.

## Explore the docs

| | |
| --- | --- |
| **[Install](/getting-started/install/)** | Binary or Docker Compose, in a few minutes. |
| **[Quick tour](/getting-started/quick-tour/)** | Sign in, make a project, plan some work. |
| **[Concepts](/concepts/hierarchy/)** | The hierarchy, statuses, bugs and permissions. |
| **[Backlog](/guides/backlog/)** | Plan the tree and filter it. |
| **[Kanban](/guides/kanban/)** | Move work between lanes. |
| **[Bugs](/guides/bugs/)** | The triage workflow. |
| **[AI Add](/guides/ai-add/)** | Optional AI-assisted planning. |
| **[Users and permissions](/guides/users-and-permissions/)** | Who can see and do what. |
| **[REST API](/integrations/rest-api/)** | Automate with `curl` and an API key. |
| **[MCP](/integrations/mcp/)** | Connect AI agents. |
| **[Environment variables](/reference/environment-variables/)** | Every setting. |
| **[Troubleshooting](/reference/troubleshooting/)** | When something looks wrong. |

Support the project: [Buy Me a Coffee](https://buymeacoffee.com/rmalcomber) or [GitHub Sponsors](https://github.com/sponsors/rmalcomber).
