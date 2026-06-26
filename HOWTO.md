# Release process

This fork exists only to bump dependencies progressively (to patch CVEs ahead of
parse-community/node-apn). Its sole consumer is the austv server, which pins it from
GitHub by **branch**: `github:stage88/node-apn#rel/vX.Y.Z`. There are no npm publishes,
git tags, or GitHub releases — the `rel/*` branch *is* the release.

## 1. Sync upstream into master (only when you need their changes)
Upstream: https://github.com/parse-community/node-apn
1. In GitHub, compare upstream's latest release with its master; review what changed.
2. Open a PR bringing upstream master into this fork's `master`, and merge it.

## 2. Cut a release
The `rel/*` branches chain from each other (each new one is the previous one plus a
bump commit); the dep bumps live only on this chain and are NOT merged back to master.

1. Branch from the previous release branch, e.g.
   `git switch rel/v10.8.0 && git switch -c rel/v10.9.0`
2. Merge master in to pick up any upstream sync: `git merge master`
3. Bump the version in `package.json`.
4. Refresh deps + lockfile: `rm -rf node_modules package-lock.json && npm run update-deps`
5. Run `npm test`; fix any issues.
6. Commit and push the branch.
7. Point austv-server's `package.json` at the new branch (`#rel/v10.9.0`).
