# Open PR closure comment templates

Use these exact templates when closing or redirecting stale open PRs. Do not merge stale branches directly into `main`.

## Template 1 — Superseded

Closing this PR as superseded by later merged production-hardening work.

Do not merge this stale branch into main.
Any valuable leftover idea should be extracted later through a fresh branch from latest main.

## Template 2 — Rebuild required

This PR contains useful intent but is not safe to merge raw because main has moved materially.

Please rebuild the useful parts from latest main in a fresh branch.
Do not merge this branch directly.

## Template 3 — Migration conflict

This PR touches schema/migrations and must not merge until migration number reservation and latest-main migration verification are complete.

Rebuild from latest main and reserve the next migration number before opening a new PR.

## Template 4 — Duplicate

Closing this PR as duplicate/superseded.

The domain is now handled by a newer PR or merged main.
Do not resolve conflicts or merge this branch.
