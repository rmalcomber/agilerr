---
title: FAQ
description: Short answers to common questions.
sidebar:
  order: 1
---

### What does Agilerr run as?

A single application. The Go backend, embedded PocketBase auth and storage, and the UI are served together from one binary in release builds.

### Do I need a separate database?

No. PocketBase is embedded. You need the binary (or the Docker image) and a persistent place for `PB_DATA_DIR`.

### Can I run it without OpenAI?

Yes. Projects, backlog, kanban, bugs, permissions, the API and MCP all work without any OpenAI configuration. AI Add is simply unavailable.

### Where does my data go?

Into `PB_DATA_DIR` on your machine. Nothing is sent anywhere unless you configure AI Add, which sends planning conversations to the endpoint you set.

### Can people sign up themselves?

No. System admins create accounts.

### Why are tasks never AI-generated?

Tasks are intended for delivery teams to define. AI Add helps with the levels above them.

### How are bugs different?

They live outside the hierarchy, on the Bugs page, and start in triage.

### Can I automate it?

Yes: the [REST API](../../integrations/rest-api/) and [MCP](../../integrations/mcp/).

### How will upgrades work?

The binary tracks its schema and binary version in the database and can apply ordered migrations. See [Versions and upgrades](../../reference/upgrades/).

### How do I support the project?

[Buy Me a Coffee](https://buymeacoffee.com/rmalcomber) or [GitHub Sponsors](https://github.com/sponsors/rmalcomber).
