# Agilerr

Agilerr is a local-first Agile Scrum board that runs as a single application.

This release package includes:

- the Agilerr web UI
- the Go API
- embedded PocketBase auth and storage

There is no separate database service to install for a normal local setup.

## Quick Start

1. Extract the archive.
2. Open a terminal in the extracted folder.
3. Run the binary:

```bash
./agilerr
```

On Windows:

```powershell
.\agilerr.exe
```

If no port is configured, Agilerr generates a local port automatically and prints it on startup.

## First Login

Default admin login:

- Email: `admin@agilerr.local`
- Password: `change-me-now`

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before first run if you want different bootstrap credentials.

## Recommended Environment Variables

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `HTTP_ADDR`
- `PB_DATA_DIR`
- `AGILERR_API_KEY`

Optional AI settings:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

## Example Local Run

```bash
export ADMIN_PASSWORD="change-me-now"
export HTTP_ADDR="127.0.0.1:5040"
./agilerr
```

## Data Storage

Agilerr stores its embedded PocketBase data in:

- `./pb_data` by default

To move that location:

```bash
export PB_DATA_DIR="/path/to/agilerr-data"
./agilerr
```

Back up that directory if you want to preserve projects, users, comments, and planning history.

## AI Add

AI Add is optional.

Without `OPENAI_API_KEY`, the app still works normally for:

- projects
- backlog
- kanban
- bugs
- permissions
- API and MCP access

When `OPENAI_API_KEY` is set, Agilerr can help generate project metadata, epics, features, stories, and bug planning proposals.

## API Access

Agilerr supports:

- user auth tokens
- `X-API-Key` using `AGILERR_API_KEY`

System admins can view the built-in API and MCP documentation pages in the app.

## Docker

If you prefer containers, use the published Docker Compose file instead of this binary package.

Placeholder URL:

- `https://agilerr.app/install/docker-compose.yml`

## Support

- Product site: `https://agilerr.app`
- Docs / FAQ: `https://agilerr.app/docs`

