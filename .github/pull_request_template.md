## Summary

Describe the change clearly.

## Target Branch

PRs should normally target `dev`.

Use `stage` only for release assembly work.
Do not open normal feature PRs directly against `main`.

## Verification

- [ ] `cd backend && go test ./...`
- [ ] `cd frontend && npm run build`
- [ ] `cd website && deno task build`
- [ ] Docs updated if behavior changed

## Notes

Anything reviewers should know about rollout, risk, or follow-up work.
