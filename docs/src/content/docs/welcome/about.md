---
title: About
description: What Agilerr is, who it is for and why it exists.
sidebar:
  order: 1
---

Agilerr is a **local-first Agile Scrum board** for people and small teams who want to plan work without handing their data to a hosted service. It is one program: download it, run it, and you have a board.

## Why it exists

Most boards are either a large hosted product or a pile of services you have to run yourself. Agilerr aims for the middle: a real hierarchy (epics down to tasks), a proper bug workflow, permissions that mean something, and an API and MCP endpoint so scripts and AI agents can use the same board as people, all from a single binary with an embedded database.

## Principles

- **Own your data.** Everything lives in a data directory on your machine or volume.
- **One thing to run.** Go backend, embedded PocketBase and the web UI ship together.
- **Plan with structure.** Epics, features, stories and tasks, with bugs kept separate.
- **AI is optional.** AI Add proposes; you review. Nothing is sent anywhere unless you configure it.
- **Small and fast.** In the spirit of the [Floppy Rule](https://malcomber.com/floppy-rule/).

## Status

Agilerr is in **beta**: it is in daily use, but anything can change between `0.x` releases. The current release is [v{{version}}](/releases/v{{version}}/). Source and issues are on [GitHub]({{repo}}); the project's own site is [agilerr.app](https://agilerr.app).
