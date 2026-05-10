# VALIDATION_COMMANDS

Updated: 2026-05-10.

## Required validation for the final 9.5 controlled-production gate

Run these commands before merge and before any controlled rollout decision:

```bash
pnpm run check
pnpm test
pnpm run build
node scripts/verify-migrations.mjs
node scripts/ci-governance-guards.mjs all
git diff --check
```

These commands validate TypeScript, unit/guard tests, production build, migration safety, governance guardrails, and patch whitespace. They do **not** prove hosted CI, production deployment, provider success, backup/restore success, legal compliance, or operational readiness.

## DB-backed concurrency proof

The DB proof command exists and is intentionally separate from the regular unit/static suite:

```bash
pnpm run test:db:concurrency
```

It requires `TEST_DATABASE_URL`. The database name must include `test`, must use a MySQL URL, must not equal `DATABASE_URL`, and must not run with `NODE_ENV=production`.

```bash
export TEST_DATABASE_URL='mysql://USER:PASSWORD@HOST:PORT/DB_NAME_WITH_test'
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
```

## Local Docker MySQL path

Use the checked-in MySQL 8.4 compose service when Docker is available:

```bash
docker compose -f docker-compose.test.yml up -d mysql-test
export TEST_DATABASE_URL='mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test'
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
docker compose -f docker-compose.test.yml down -v
```

## GitHub Actions DB proof path

`.github/workflows/concurrency-proof.yml` provisions MySQL 8.4, sets:

```bash
TEST_DATABASE_URL=mysql://247_test_user:247_test_password@127.0.0.1:3306/247_customer_app_test
```

and runs:

```bash
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
```

This workflow is the exact CI MySQL 8.4 parity proof path. It now uploads `test-db-bootstrap.log`, `mysql-concurrency-proof.log`, and `evidence-manifest.md` as a `db-concurrency-proof-<run-id>-<attempt>` artifact. To run it manually, use the `gh` commands in `HOSTED_CI_DB_PROOF_STATUS.md` or open GitHub Actions, select **DB Concurrency Proof**, choose **Run workflow**, and confirm the `mysql-concurrency-proof` job passes both DB bootstrap and concurrency proof steps.

## Proof claim rule

If `TEST_DATABASE_URL` is absent, `server/mysql-concurrency.integration.test.ts` intentionally skips and prints that DB-backed race proof is not claimed. Do not remove that warning or claim DB proof unless `pnpm run test:db:bootstrap` and `pnpm run test:db:concurrency` actually execute against MySQL and exit successfully. CI MySQL 8.4 parity run still needs observation until the hosted `DB Concurrency Proof` workflow is confirmed green and the run URL, commit SHA, logs, and artifact are archived.

## Backup/restore validation

Dry-run backup/restore checks:

```bash
node scripts/backup-db.mjs --dry-run --metadata
node scripts/restore-db-drill.mjs --dry-run --backup-file <non-production-backup.sql>
```

Dry-run commands do not prove restore success. A production launch requires a measured staging restore drill with backup ID, restore target, start/end time, verification commands, data checks, and owner signoff. Do not run destructive restore drills against production or production-looking database URLs.

## Governance/security targeted checks

```bash
pnpm test -- server/ai-governance-seal.guard.test.ts server/phi-pii-redaction-seal.guard.test.ts
```

Expected proof points:

- AI cannot approve prescriptions, provide dosage/treatment logic, substitute, or release regulated fulfillment.
- AI/OCR worker jobs are assistive-only, non-mutating, and audited.
- PHI/PII/secrets are redacted from structured logs, audit payloads, worker/provider payloads, and safe error serialization.
- Public health/readiness endpoints remain minimal and secret-free.

## Hosted CI and deployment proof requirements

Local commands are necessary but insufficient for go-live. Before controlled production, archive:

- Hosted target-branch CI status, including DB concurrency workflow run ID, commit SHA, logs, and artifact.
- Release artifact ID and commit SHA.
- Runtime URL health/readiness proof.
- Rollback proof or rehearsal notes.
- Provider sandbox/staging verification evidence.
- Staging backup/restore drill report.
- Staff access, pharmacist SOP, legal/compliance, monitoring rota, and incident commander signoffs.

## Survivability validation commands added 2026-05-10

Run these in addition to the existing release validation set:

```bash
node scripts/validate-deployment-env.mjs --env staging
node scripts/backup-db.mjs --dry-run --metadata
node scripts/restore-db-drill.mjs --dry-run --backup-file <non-production-backup.sql>
node scripts/restore-verify.mjs --backup-file <non-production-backup.sql> --checksum-file <optional.sha256>
```

The restore commands are safe planning/verification steps only. They must not be treated as measured restore success unless an isolated non-production restore has actually been executed and verified.

## 2026-05-10 multi-store runtime validation commands

Required for this sprint:

```bash
pnpm run check
pnpm test
pnpm run build
node scripts/verify-migrations.mjs
node scripts/ci-governance-guards.mjs all
git diff --check
```

Targeted guard added:

```bash
pnpm exec vitest run server/multi-store-runtime-isolation.guard.test.ts
```

## 2026-05-10 operational governance validation

The operationalization sprint adds a documentation guard that is included in the normal test suite and can also be run directly:

```bash
pnpm exec vitest run server/operational-governance.guard.test.ts
```

This guard checks that pharmacist SOPs, shift/store SOPs, escalation matrices, reconciliation/override governance, readiness classification, and training/runbook packets remain present; that AI remains assistive-only; that pharmacist/H/H1 boundaries are preserved; that escalation metadata is required; and that the docs do not convert doctrine into unsupported legal/provider/production signoff claims.

The final required validation set remains:

```bash
pnpm run check
pnpm test
pnpm run build
node scripts/verify-migrations.mjs
node scripts/ci-governance-guards.mjs all
git diff --check
```
