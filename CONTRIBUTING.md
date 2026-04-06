# Contributing to Agilerr

Thanks for contributing.

This repo uses a three-branch promotion flow so multiple PRs can land in development without forcing every change straight onto the release branch.

## Branch Strategy

- `dev`: the default integration branch for feature work and normal pull requests
- `stage`: the pre-release branch where selected changes are gathered and checked together
- `main`: the protected release branch

Recommended flow:

1. Branch from `dev`
2. Open PRs back into `dev`
3. Merge approved work into `dev`
4. Promote chosen changes from `dev` into `stage`
5. Validate `stage`
6. Merge `stage` into `main`
7. Create a release tag on `main`, for example `v1.0.0`

## GitHub Settings To Apply

These are manual GitHub repo settings and cannot be fully enforced from source files alone.

1. Push the long-lived branches:

```bash
git push origin main dev stage
```

2. Set the default branch to `dev`

This makes new pull requests target `dev` by default instead of the release branch.

3. Protect `main`

- require pull requests before merging
- require status checks to pass
- block direct pushes
- restrict who can push if needed

4. Protect `stage`

- require pull requests before merging
- require status checks to pass
- block direct pushes

5. Optionally protect `dev`

- require status checks to pass
- allow direct admin intervention only if necessary

## Pull Request Expectations

- Keep PRs focused
- Include tests or build verification where applicable
- Update docs when behavior changes
- Avoid bundling unrelated frontend, backend, and website work together unless the change genuinely spans them

The repository includes a PR template to reinforce the target branch and verification steps.

## Local Setup

### Product app

Backend:

```bash
cd backend
go run .
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

### Marketing site

```bash
cd website
deno task dev
```

## Validation Commands

Backend:

```bash
cd backend
go test ./...
```

Frontend:

```bash
cd frontend
npm run build
```

Website:

```bash
cd website
deno task build
```

Release build:

```bash
./scripts/build-release.sh
```

## Release Workflow

Tagged releases come from `main`.

Example:

```bash
git checkout main
git pull
git tag v1.0.0
git push origin v1.0.0
```

The release workflow is designed to:

- verify the tag commit is reachable from `main`
- build versioned binaries
- publish GitHub Release assets
- build and push the Docker image
- download the release assets into the website
- deploy `agilerr.app` from the `website/` project

## Funding Links

- GitHub Sponsors: https://github.com/sponsors/rmalcomber
- Buy Me a Coffee: https://buymeacoffee.com/rmalcomber
