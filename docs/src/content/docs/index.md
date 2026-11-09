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
    - text: See the features
      link: /agilerr/welcome/features/
      variant: minimal
---

![The Agilerr backlog showing an epic, feature, user story and tasks](../../assets/screenshots/backlog.webp)

## What is Agilerr?

Agilerr is a self-hosted Agile board for teams that want to own their data. It runs as **one application**: a Go backend, embedded [PocketBase](https://pocketbase.io) for auth and storage, and a Preact web UI, all served together. There is no external database to run.

- **A strict hierarchy.** Project → Epic → Feature → User Story → Task.
- **A separate bug workflow** that starts in triage.
- **Plan and track.** Dashboard, backlog, kanban boards, deleted items and project settings.
- **Write properly.** Markdown descriptions and comments, tags, mentions and assignments.
- **Share safely.** Per-project permissions and system administration.
- **AI Add**, an optional planning conversation that proposes items for you to review.
- **Automate.** A REST API and an MCP endpoint so scripts and AI agents can work with the board.

![The Agilerr kanban board](../../assets/screenshots/kanban.webp)

## At a glance

| | |
|---|---|
| Delivery | {{metric.size}} |
| Platforms | {{metric.platforms}} |
| Dependencies you need | {{metric.dependencies}} |
| Current release | [v{{version}}](/releases/v{{version}}/) (beta) |
| Integrations | REST API (7 resources) and MCP (3 tools) |

See [how it is built](/reference/architecture/) and the [release notes](/releases/).

## Where to next?

- New here? Read [about Agilerr](/welcome/about/) and the [feature tour](/welcome/features/).
- Ready to try it? Follow [Install](/getting-started/install/) and the [quick tour](/getting-started/quick-tour/).
- Learning the model? See the [hierarchy](/concepts/hierarchy/), [statuses](/concepts/statuses/) and [permissions](/concepts/permissions/).
- Automating? Use the [REST API](/integrations/rest-api/) or connect an agent over [MCP](/integrations/mcp/).
- Looking for a setting? Browse the [environment variables](/reference/environment-variables/) or [troubleshooting](/reference/troubleshooting/).
- Want to know what is coming? See the [roadmap](/roadmap/) and the [release notes](/releases/).

:::note[Beta software]
Agilerr is in beta. It works and is used, but features, the API and the data layout may change between releases. Back up your data directory before upgrading: see [Versions and upgrades](/reference/upgrades/). Source and issues live on [GitHub]({{repo}}).
:::

Support the project: [Buy Me a Coffee](https://buymeacoffee.com/rmalcomber) or [GitHub Sponsors](https://github.com/sponsors/rmalcomber).
