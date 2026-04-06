# Backend Agent Guide

This directory contains the Agilerr backend service.

## Responsibilities

- Go API endpoints under `/api/agilerr/*`
- PocketBase bootstrap, schema, auth, and persistence
- permissions and project membership enforcement
- AI planning and OpenAI integration
- MCP server support over stdio and HTTP
- embedded frontend serving for release builds
- database version tracking and future migrations

## Important Files

- `main.go`: startup, bootstrap ordering, MCP CLI mode, serve wiring
- `config.go`: env loading and runtime defaults
- `schema.go`: PocketBase collection definitions
- `service.go`: route registration and main handlers
- `models.go`: DTOs, collection names, helpers
- `versioning.go`: binary/schema version state and migration entry points
- `mcp.go`: MCP server implementation
- `ai_plans.go`: AI Add planning flow

## Commands

- Run locally: `go run .`
- Print binary version: `go run . version`
- Run tests: `go test ./...`
- Build standalone binary: `go build -o agilerr .`

## Backend Conventions

- Keep business logic on the Go side; PocketBase is the embedded storage/auth layer, not the main app surface.
- Prefer extending the existing service/helper pattern instead of scattering handlers across many files.
- Schema changes should be paired with versioning or migration thinking.
- If you add a collection or structural storage change, check whether `EnsureDatabaseVersion()` should gain a migration step.
- Keep API behavior permission-aware. Hidden UI actions are not enough; backend enforcement must exist.

## Runtime Notes

- `godotenv.Load()` is used for local env loading.
- If `HTTP_ADDR` is unset, the backend generates a local high port.
- If `AGILERR_API_KEY` is unset, a random key is generated for that run.
- The release build injects `BinaryVersion` through `-ldflags`.

