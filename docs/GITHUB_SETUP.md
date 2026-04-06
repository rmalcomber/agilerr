# GitHub Setup

Use this checklist when wiring the repository to GitHub for collaborative development and automated releases.

## 1. Push the long-lived branches

The repo is prepared for this branch model:

- `dev`
- `stage`
- `main`

Push them:

```bash
git push origin main dev stage
```

## 2. Set the default branch to `dev`

Recommended:

- keep `main` as the protected release branch
- use `dev` as the default branch so new pull requests target `dev` automatically

That is the easiest way to avoid normal PRs going straight at the release branch.

## 3. Protect `main`

Recommended GitHub branch protection settings:

- require a pull request before merging
- require status checks to pass
- require branches to be up to date before merging
- block force pushes
- block deletions

## 4. Protect `stage`

Recommended:

- require a pull request before merging
- require status checks to pass
- block force pushes

Use `stage` as the release assembly branch where selected work from `dev` is checked together before promotion to `main`.

## 5. Optional protection for `dev`

Recommended:

- require status checks to pass
- optionally allow maintainers to bypass in emergencies

## 6. Docker Hub secrets

The release workflow expects these repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

The token should be a Docker Hub access token, not your password.

## 7. Deno Deploy setup

The website workflow is configured for the Deno Deploy project:

- org: `rmalcomber`
- app/project: `agilerr`

To make GitHub Actions deployment work cleanly:

1. Confirm the Deno Deploy project exists
2. Link the GitHub repository to the Deno Deploy project
3. Allow GitHub Actions deployments for that project
4. Ensure the repository can request OIDC tokens in Actions

The workflow already declares:

- `permissions.id-token: write`

So the remaining setup is mainly on the GitHub and Deno Deploy side.

## 8. Release process

Recommended release path:

1. Merge feature work into `dev`
2. Promote selected work from `dev` to `stage`
3. Validate `stage`
4. Merge `stage` into `main`
5. Create a version tag on `main`

Example:

```bash
git checkout main
git pull
git tag v1.0.0
git push origin v1.0.0
```

That tag triggers the release workflow, which will:

- verify the tag commit is on `main`
- build binary archives
- publish GitHub Release assets
- build and push the Docker image
- download the release assets into the website
- deploy the website
