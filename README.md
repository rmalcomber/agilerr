# Agilerr

Agilerr is a lean Agile Scrum board built as:

- `backend/`: Go API with embedded PocketBase for auth and storage
- `frontend/`: Preact UI with Tailwind and daisyUI

## Features

- Self-registration plus an environment-seeded admin account
- Strict hierarchy: `Project -> Epic -> Feature -> User Story -> Task`
- Project backlog tree and kanban board
- Markdown descriptions and comments
- Free-text tags with suggestions
- Mentions for users and units using markdown links
- REST endpoints for projects, units, comments, and Smart Add
- Optional OpenAI-backed Smart Add refinement flow

## Local Development

1. Copy `.env.example` to `.env` and set `ADMIN_PASSWORD`.
2. Optional: set `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`.
3. Run the backend:

```bash
cd backend
go run .
```

4. Run the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend and PocketBase APIs: `http://localhost:8090`

In dev mode the frontend is not embedded. Vite runs separately and proxies API calls to the backend.

## Release Build

Build a single production binary with the frontend embedded:

```bash
./scripts/build-release.sh
```

This produces:

- `backend/agilerr`

When started, that binary serves:

- the Agilerr frontend
- the custom REST API
- PocketBase auth/storage APIs

## Docker

```bash
cp .env.example .env
docker compose up --build
```

- App, frontend, and backend API: `http://localhost:8090`

## Important Environment Variables

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `HTTP_ADDR`
- `PB_DATA_DIR`
- `ALLOWED_ORIGINS`

## API Surface

- `GET /api/agilerr/me`
- `GET /api/agilerr/projects`
- `POST /api/agilerr/projects`
- `GET /api/agilerr/projects/{projectId}`
- `GET /api/agilerr/projects/{projectId}/suggest`
- `POST /api/agilerr/projects/{projectId}/units`
- `PATCH /api/agilerr/units/{unitId}`
- `POST /api/agilerr/units/{unitId}/move`
- `DELETE /api/agilerr/units/{unitId}`
- `GET /api/agilerr/units/{unitId}/comments`
- `POST /api/agilerr/units/{unitId}/comments`
- `POST /api/agilerr/smart-add`

All `/api/agilerr/*` endpoints require an authenticated PocketBase user token in the `Authorization` header.
