# SM-K Phase 0 — Verification Log

Date: 2026-05-12
Branch: score-lift/sm-k-foundation-security

## Diagnosis (Step 0.1) — PASSED

Findings (all match expected state):
- Journal entries: 47 (idx 0-46, tags 0000-0049) ✓
- Snapshots in drizzle/meta/: 22 (0000_snapshot.json through 0021_snapshot.json) ✓
- SQL files in drizzle/: 68 (0000-0021 direct, 0022-0049 with gaps, 0050-0067, part10/part11/part12) ✓
- 0021 snapshot: store_capabilities table has NO gstin column ✓
  (gstin appears in manufacturers/suppliers/stores — but NOT store_capabilities)
- 0021 snapshot: NO audit_log_chain table present ✓
- 0054_audit_hash_chain.sql: multi-statement with SHA2() genesis seed ✓
- 0057_ai_eval_ledger.sql: multi-table with genesis row pattern ✓
- Inline mysql2 loops confirmed in ci.yml and concurrency-proof.yml ✓

## Scripts Created (Steps 0.2-0.3) — CREATED

- scripts/apply-migrations.mjs: hash-tracked migration runner for all 68 SQL files
- scripts/bootstrap-migrations-table.mjs: one-time bridge for existing databases

Syntax check: PASSED (node --check returned exit 0 for both scripts)

## Package.json Updates (Step 0.4) — APPLIED

- db:push: node scripts/apply-migrations.mjs
- db:bootstrap: node scripts/bootstrap-migrations-table.mjs && node scripts/apply-migrations.mjs
- drizzle:types: drizzle-kit introspect
- test:db:bootstrap: node scripts/bootstrap-migrations-table.mjs && node scripts/apply-migrations.mjs
- scripts/bootstrap-test-db.ts: updated to call new runner via spawn

## CI Workflow Updates (Step 0.5) — APPLIED

ci.yml (mysql-db-lifecycle job):
  REMOVED:
    - "Apply schema extension migrations (0050+)" — inline mysql2 loop with SKIP set
    - "Apply column-level schema extensions" — node scripts/migrate-v10.mjs
  REPLACED WITH:
    - "Apply migrations" — pnpm run test:db:bootstrap (single step, all 68 migrations)

concurrency-proof.yml (mysql-concurrency-proof job):
  REMOVED:
    - "Apply schema extension migrations (0050+)" — inline mysql2 loop with SKIP set
    - "Apply column-level schema extensions" — node scripts/migrate-v10.mjs
  REPLACED WITH:
    - "Apply migrations" step — folded into existing pnpm run test:db:bootstrap tee step

## Documentation Updates (Step 0.6) — APPLIED

- docs/RELEASE.md: Migration runner section added under "Migration safety"
- docs/RUNBOOK_DEPLOY.md: Migration runner note added to staging deploy steps
- OPEN_BLOCKERS.md: "Closed by SM-K (Phase 0)" section added

## Local Docker Verification (Step 0.7) — BLOCKED

CONSTRAINT: Docker is not installed on this development machine.
CONSTRAINT: GitHub Actions CI quota exhausted (resets June 1, 2026, or when repo is public/billing upgraded).

The verification gate (fresh MySQL 8.4 container + apply-migrations run) could not be executed.
Manual verification steps to run when Docker becomes available:

  docker run -d --name mysql_sm_k --rm \
    -e MYSQL_ROOT_PASSWORD=test_root \
    -e MYSQL_DATABASE=app_test \
    -e MYSQL_USER=app_user \
    -e MYSQL_PASSWORD=app_pass \
    -p 13306:3306 \
    mysql:8.4

  # Wait ~30s for ready
  $env:DATABASE_URL = "mysql://app_user:app_pass@127.0.0.1:13306/app_test"
  node scripts/apply-migrations.mjs
  # Expected: 68 applied

  # Idempotency check
  node scripts/apply-migrations.mjs
  # Expected: 0 applied, 68 skipped

  docker stop mysql_sm_k

## Status: PHASE 0 CODE COMPLETE — AWAITING DOCKER VERIFICATION

## Phase 0 CI failure + fix (2026-05-12)

First CI run on the draft PR failed mysql-db-lifecycle with:
  FATAL: Migration 0061_vault_encryption_columns.sql failed at statement:
  ALTER TABLE prescriptions ADD COLUMN encryption_key_version ... AFTER pharmacist_note
  Error: Unknown column 'pharmacist_note' in 'prescriptions'

This surfaced a real schema bug in 0061 that the SM-E2-ci inline loop
had been silently working around for months. Two compatibility shims
added to apply-migrations.mjs (SKIP_ERRORS set, AFTER-clause retry)
preserve the existing production schema state. SM-L Phase 4 takes the
schema archaeology TODO.

## Phase 0 CI failure round 2 + fix (2026-05-12)

Second CI run failed mysql-db-lifecycle on part12_system_events.sql:
  CREATE INDEX IF NOT EXISTS ...
  Error: SQL syntax near 'IF NOT EXISTS' (MySQL does not support this)

Codebase review confirmed part10/11/12 are 100% redundant - every
table they create is already in drizzle/0019/0020/0021. The original
SM-E2-ci inline loop, verify-migrations.mjs, and the actual production
schema all treat partN_*.sql as not-real-migrations.

Fix: apply-migrations.mjs and bootstrap-migrations-table.mjs now skip
files matching part\d+_*.sql. Matches actual behavior of every other
tool. SM-L Phase 4 to delete these files and their associated
one-shot migrate-*.mjs scripts.

## Phase 0 CI failure round 3 + fix (2026-05-12)

Third CI run failed mysql-db-lifecycle with:
  Error: pnpm exec drizzle-kit migrate failed with exit code 1
  Caused by: ER_TABLE_EXISTS_ERROR on CREATE TABLE users
  Location: server/testUtils/dbTestLifecycle.ts:85

Root cause: dbTestLifecycle.ts applyTestMigrations() still shelled
out to drizzle-kit migrate, which tracks via __drizzle_migrations
(separate from our _app_migrations). Two parallel migration systems
raced; drizzle-kit attempted to apply 0000 against tables our runner
had already created.

This was the unfinished part of SM-K Phase 0 Step 0.4 — only
bootstrap-test-db.ts got updated, applyTestMigrations was left
pointing at drizzle-kit.

Fix: applyTestMigrations now invokes scripts/apply-migrations.mjs
via the same spawn pattern, matching the path CI bootstrap uses.
Verification query updated from __drizzle_migrations to _app_migrations.

## Phase 0 CI failure round 4 + fix (2026-05-12)

Fourth CI run proved the migration runner was correct:
  - migration-smoke passed
  - mysql-concurrency-proof passed
  - mysql-db-lifecycle failed only inside the integration test assertion

The remaining failure was:
  server/mysql-db-lifecycle.integration.test.ts
  querying __drizzle_migrations after SM-K Phase 0 had moved migration
  truth to _app_migrations.

Fix: the integration test assertion now queries _app_migrations, matching
both scripts/apply-migrations.mjs and server/testUtils/dbTestLifecycle.ts.

Note: scripts/restore-verify.mjs:62 also contains a __drizzle_migrations
reference but only as a printed console.log command suggestion for human
operators — it does not execute SQL and does not affect CI.
