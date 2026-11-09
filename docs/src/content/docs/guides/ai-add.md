---
title: AI Add
description: Optional AI-assisted planning with human review.
sidebar:
  order: 6
---

AI Add opens a **planning conversation** that helps flesh out projects, epics, features, user stories or bugs. It is entirely optional.

## Turning it on

Set `OPENAI_API_KEY` before starting Agilerr, and optionally `OPENAI_BASE_URL` and `OPENAI_MODEL`. See [Configuration](../../getting-started/configuration/).

When it is not configured, the AI buttons in the UI are greyed out and everything else works as normal.

## Who can use it

Users need the **Add with AI** permission for the project.

## How it works

1. Start AI Add from a project or from a parent item (the sparkle button on a card, or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>).
2. Agilerr asks **one question at a time** to understand what you want.
3. It **proposes items**, which can be several siblings at once.
4. You **accept, reject or edit each proposal**. Nothing is created until you accept.
5. Accepted items are created under the context you started from.

It can support one extra generation level when enabled, and it stores a **compact planning history** against the project or parent so future sessions have context.

:::note
AI Add never generates **tasks**. Those are for your delivery team.
:::

## Privacy

Your planning conversation is sent to the OpenAI-compatible endpoint you configured. Point `OPENAI_BASE_URL` at your own gateway if you need to control where it goes. Without an API key, no data leaves your machine.

Keyboard: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> opens contextual AI Add when it is available.
