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
