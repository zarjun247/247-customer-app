# Release & Deployment Reference

This document covers branch protection, PR governance, CI gates, migration safety, deployment procedure, rollback, launch go/no-go criteria, and controlled rollout rules.

See also: [OPERATIONS.md](./OPERATIONS.md) §Backup and recovery, [STATUS.md](./STATUS.md), [RUNBOOK_DEPLOY.md](./RUNBOOK_DEPLOY.md).

**SM-C release automation (added 2026-05-12):**
- `.github/workflows/release.yml` — uses `googleapis/release-please-action@v4` to auto-generate changelogs and version bumps from conventional commits on `main`.
- `.github/workflows/sbom.yml` — generates `sbom.cyclonedx.json` on every push/PR to `main`. Artifact retained 90 days.
- `.github/workflows/docker-build.yml` — builds Docker image and runs Trivy scan (HIGH/CRITICAL exit-code 1). Rootless multi-stage image (`node:20.18.0-alpine`).
- `.github/workflows/staging-deploy.yml` — dry-run by default; real deploy requires GitHub `staging` Environment approval. See [RUNBOOK_DEPLOY.md](./RUNBOOK_DEPLOY.md).
- `.github/workflows/backup-drill.yml` — weekly Sunday 03:00 UTC. Mock mode unless `BACKUP_DRILL_ENABLED=true` secret is set.
- `.github/workflows/restore-drill.yml` — monthly first-of-month 04:00 UTC. Uses `scripts/restore-drill-runner.mjs`.

---

## Branch protection rules

- `main` is a protected branch. No direct pushes. All changes require a PR.
- PRs to `main` require at least one approval before merge.
- All CI checks must pass before merge is allowed.
- Force-push to `main` is forbidden.
- Merge commits are required (no squash-merge that loses commit history, unless explicitly approved).

**GitHub branch protection is enforced.** The CI governance guards (`scripts/ci-governance-guards.mjs`) verify that branch protection rules are configured correctly. Running `node scripts/ci-governance-guards.mjs all` is one of the six mandatory CI gates.

---

## PR governance

Every PR to `main` must:

1. **Describe what changed:** files modified, why, and the impact on the system.
2. **Pass all 6 CI gates** (see §CI gates).
3. **Include migration context** if any `drizzle/` files changed: migration number, what schema changed, rollback plan.
4. **Not bundle unrelated changes.** One concern per PR unless the dependency is unavoidable.
5. **Not touch the denylist:** `server/services/stockInvariant.ts`, `server/services/commercialLifecycle.ts`, `server/services/reservationService.ts` must not be modified without explicit architecture review.
6. **Not introduce fake test stubs or placeholder implementations** that would cause a CI-green-but-broken-in-production state.

**No `--no-verify`:** Bypassing CI hooks is prohibited. If a hook fails, fix the underlying issue.

**Parallel execution branches** follow the pattern `roadmap/<mp>-<description>`. Each terminal (A, B, C...) has non-overlapping file scope. Before opening a PR from a parallel branch, verify that no other parallel branch has modified the same files.

---

## CI gates

Every PR and release candidate must pass all six of these commands with exit code 0:

```bash
pnpm run check          # TypeScript type-check (tsc --noEmit)
pnpm test               # Vitest test suite
pnpm run build          # Vite (client) + esbuild (server) build
node scripts/verify-migrations.mjs    # Migration sequence and conflict check
node scripts/ci-governance-guards.mjs all  # Branch protection and governance checks
git diff --check        # No trailing whitespace or merge conflict markers
```

**Pre-existing test failures (as of 2026-05-11):** 12 test suites fail on `main` due to pre-existing issues (ReferenceError: describe is not defined; `.mjs` static import from `.ts`; NODE_ENV=production env-gate artifacts). These are documented in OPEN_BLOCKERS.md and are NOT introduced by new PRs. Any new test failure not on the pre-existing list is a blocking issue.

**Docs gate (MP3+):**
```bash
node scripts/verify-docs-structure.mjs   # Asserts 5 living docs + ADR + DPDP scaffolds exist
```

---

## Migration safety

### Migration runner (SM-K, replaces drizzle-kit migrate)

`drizzle/meta/_journal.json` tracks only migrations 0000–0049. Migrations 0050+ and the three `partN_*.sql` files are bespoke hand-authored multi-statement SQL that drizzle-kit cannot represent. Running `drizzle-kit migrate` would silently skip these files.

**DO NOT run `drizzle-kit generate` or `drizzle-kit migrate` against any shared database.** They will produce destructive migrations because the journal is incomplete and snapshots stop at 0021.

The custom runner (`scripts/apply-migrations.mjs`) is the authoritative migration executor:

```bash
# Apply all pending migrations (production deploy)
DATABASE_URL=mysql://... pnpm run db:push

# Bootstrap an existing database (one-time, on first deploy after SM-K)
DATABASE_URL=mysql://... pnpm run db:bootstrap
```

`drizzle-kit` remains installed for TypeScript schema type generation only:
```bash
pnpm run drizzle:types
```

New migrations must be authored as raw SQL files in `drizzle/` with the next available number (0068, 0069, …). The runner applies files in lexical order, idempotently, with SHA-256 hash tracking in `_app_migrations`.

### Numbering rules

- Migration files live in `drizzle/` and follow the pattern `NNNN_description.sql` (zero-padded 4-digit sequence).
- No two migrations may share the same number. `verify-migrations.mjs` enforces this.
- Do not reuse or renumber a migration that has been applied to any environment.

### Review requirements before running in production

- Confirm the migration adds or alters — it does not destructively drop columns or tables without an explicit, reviewed rollback plan.
- Confirm the migration is idempotent where possible (e.g., `IF NOT EXISTS`, `IF EXISTS`).
- Confirm a fresh production backup exists immediately before running the migration.
- Confirm the migration has been rehearsed on staging with a restore-like dataset.
- Confirm the rollback path is documented (forward-fix preferred over destructive down-migration in production).

### Forbidden migration patterns (without dedicated review)

- `DROP TABLE` or `DROP COLUMN` on tables with live production data without a data-loss-accepted signoff and a restore proof.
- `ALTER TABLE ... MODIFY COLUMN` that narrows a data type (truncation risk).
- Adding a `NOT NULL` column without a `DEFAULT` value to a table with live rows.
- Adding a `UNIQUE` constraint to a column/set that has existing duplicates (see OPEN_BLOCKERS.md: supplier invoice duplicate backfill).

---

## Deployment runbook

### Target environments

| Environment | Purpose | Data posture | Provider posture |
|-------------|---------|-------------|-----------------|
| Local | Developer validation. | Local or disposable data only; no production secrets. | Prefer sandbox or disabled providers. |
| Staging | Release candidate verification, migration rehearsal, restore drills, provider sandbox checks. | Recent scrubbed restore or representative seed data. | Sandbox credentials or non-sending endpoints. |
| Production | Live store operations. | Authoritative records. | Live credentials only after go/no-go approval. |

### Deployment sequence

1. **Pull latest main:** Start from the latest protected `main` after approved PRs are merged.
2. **Verify CI:** Confirm the release commit has green CI on the hosting provider. Confirm files changed are reviewed.
3. **Review migrations:** Confirm migration files have unique numbers and match schema changes. Confirm no reserved migration conflict. Confirm migration backup and rollback policy are approved.
4. **Run migrations on staging first:** Against a restore or representative database. Capture output and duration.
5. **Deploy application artifact:** Deploy the exact CI-built artifact or reproducible commit. Keep previous artifact available for immediate rollback.
6. **Run smoke test:** Verify app boot, login/session, DB read/write, product lookup, stock read, storage read/write, and provider config status.
7. **Enable workers/cron:** Only after application smoke and migration checks pass. Verify worker heartbeat, queue lag, reservation expiry processing, notification retries, and payment webhook processing.
8. **Verify provider health:** Payment/Razorpay, SMS/WhatsApp, printer, ERP/Tally.
9. **Record deployment evidence:** Commit hash, migration set, backup ID, smoke test results, provider health results, rollback owner.

### Environment variable matrix

Key variable categories (confirm exact names against `server/_core/env.ts`):

| Category | Required validation |
|----------|-------------------|
| DB (`DATABASE_URL` or host/user/password/schema) | Connectivity, migration user permissions, current schema version, backup inclusion. |
| JWT/session secret | No default/empty secret; session cookie domain and secure flags set correctly. |
| OAuth/app IDs | Callback URL match, app ID ownership, secret rotation plan. |
| Storage (S3-compatible) | Read/write/list/delete policy, encryption, lifecycle, backup coverage. |
| Payment (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, webhook secret) | Provider enabled state explicit; no fake success; webhook signature verification passes. |
| SMS | OTP/notification send path verified; fail-closed behavior documented for critical OTP. |
| WhatsApp | Webhook verification, template approval, failure alerting. |
| Printer | Test label prints or queues; printer offline behavior; reprint SOP. |
| ERP/Tally | Export dry run, checksum/run audit, duplicate export guard. |
| Workers/cron | Heartbeat, queue/backlog, retry policy, idempotency. |
| OTP rate limit backend | State shared across instances; bypass attempts logged. |

**OTel env vars (optional, for observability):** `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`. All default to no-op if unset.

### Pre-deployment validation commands

```bash
pnpm install
pnpm run check
pnpm test -- --runInBand
pnpm run build
```

---

## Staging deployment proof requirements

Before claiming a deployment is "staging-proven", the following evidence must be attached:

| Evidence item | Required content |
|--------------|-----------------|
| Artifact ID | CI build ID, commit SHA, branch, timestamp. |
| Health/readiness output | `/health/live` and `/health/ready` returning 200, captured with timestamp. |
| Smoke test results | Login, DB read/write, product lookup, stock read, provider config status output. |
| Migration output | Migration execution log with before/after schema versions. |
| Rollback proof | Rollback action ID, pre/post readiness, timeline. |
| Provider sandbox matrix | Each provider: configured/disabled, test transaction ID or explicit disable decision. |

---

## Rollback procedure

1. **Declare rollback scope:** Application release, provider integration, worker queue, store rollout, or full traffic stop.
2. **Freeze:** New regulated and payment-affecting operations if rollback could duplicate, lose, or misstate commercial/stock truth.
3. **Execute:** Use the last approved deployment artifact and documented rollback command from the release record.
4. **Verify:** Health/readiness, migration compatibility, provider webhook handling, queues, and staff login.
5. **Reconcile:** All orders/refunds/provider events during the rollback window.
6. **Record:** Timeline, owner, evidence, follow-up blockers.

**Migration rollback policy:** Prefer forward-fix migrations for already-applied production schema changes. Do not run destructive down migrations in production unless explicitly rehearsed, backed up, and approved. If a migration is partially applied or failed, freeze writes where needed, capture DB state, and follow DBA-approved remediation.

**Post-rollback checklist:**
- App availability confirmed.
- DB connectivity confirmed.
- Worker state confirmed (heartbeat normal).
- Pending queue state reviewed.
- Payment reconciliation complete.
- Stock invariants confirmed (no negative rows).
- Audit log continuity confirmed.

---

## Launch go/no-go matrix

**Current decision (as of 2026-05-11): NO-GO for live controlled production.**

All P0 blockers below must have closure evidence before the first real customer/pharmacy operation.

| Gate | GO requirement | Status |
|------|---------------|--------|
| Software validation | All six CI gates pass on release commit. | Must be verified per release. |
| Hosted CI | Target branch checks archived; DB concurrency workflow observed with logs and artifact. | Not yet evidenced in repo. |
| Deployment proof | Staging artifact ID, runtime URL, health/readiness proof, rollback proof. | Not evidenced. |
| Provider verification | Payment, WhatsApp/SMS, maps, OCR, printer, storage, Tally/export verified in sandbox/staging or explicitly disabled. | Not evidenced. |
| Backup/restore | Measured staging restore drill with data verification and owner signoff. | Not evidenced. |
| Staff access | Named launch staff, roles, store assignments, no shared admins. | Not evidenced. |
| Pharmacist SOP | Written pharmacist-in-charge signoff for regulated workflows. | Not evidenced. |
| Legal/compliance | Written review or leadership-approved written launch exception. | Not evidenced. |
| Monitoring ownership | Primary/secondary owners and escalation rota for launch period. | Not evidenced. |
| Manual fallback | Staff-trained fallback for payment, stock, prescription, delivery, and outage scenarios. | Not evidenced. |
| Emergency stop/rollback | Rehearsed procedure with owner and timeline. | Not evidenced. |

**First live launch rules (after P0 closure):**
- Maximum 1 live store for first 7 operating days.
- Expansion to 2 stores: allowed only after 7 consecutive days with no P0 incident, no unreconciled provider settlement variance, no unreviewed stock exception older than 24 hours, no open H/H1/pharmacist gate breach.
- Expansion beyond 2 stores: requires a new scale-readiness review, provider stability evidence, restore drill recency check, monitoring coverage review, and supplier invoice duplicate backfill decision.

---

## Controlled rollout checklist

### Pre-launch checklist

| Item | Required evidence | Owner |
|------|-----------------|-------|
| Release validation | All 6 CI gates + `docs:verify` pass on release commit. | Engineering lead. |
| Hosted CI | Archived target-branch workflow results; DB concurrency workflow observed if available. | Engineering lead. |
| Staging deploy | Artifact ID, URL, health/readiness output, smoke test, rollback proof. | Release owner. |
| Provider verification | Sandbox/staging matrix for all providers. | Integration owner. |
| Backup/restore | Measured staging restore drill report with timings, backup ID, verification commands, signoff. | Restore owner. |
| Staff access | Named users, roles, store assignments, MFA/session policy, removal path. | Operations lead. |
| Pharmacist SOP | Signed SOP for regulated medicines, prescription review, H/H1/X release, substitutions, exceptions, fallback. | Pharmacist-in-charge. |
| Legal/compliance | Written review or written launch exception from accountable leadership. | Compliance owner. |
| Monitoring rota | Primary/secondary owners for metrics, dead letters, refunds, reconciliation, stock, security, incidents. | Incident commander. |
| Manual fallback | Printed/digital fallback procedure tested by launch staff. | Store manager. |
| Emergency stop | Kill-switch/degraded-mode/rollback procedure rehearsed and documented. | Incident commander. |

### Required staff training before live access

- Store scope and no shared admin account rule.
- Prescription and H/H1/X gate behavior.
- Stock exception capture, quarantine, FEFO deviation, manual reason policy.
- Payment/refund provider status interpretation and reconciliation workflow.
- Dead-letter, failed notification, failed OCR, provider retry review process.
- Manual fallback for sales, dispensing, delivery, refund, and reconciliation interruption.
- PHI/PII handling, screenshot/export restrictions, breach escalation.
- Emergency stop, rollback, degraded-mode, incident reporting flow.

### Daily launch controls (first 14 days)

1. **Daily reconciliation review:** Compare orders, provider events, refunds, journal/reversal entries, cash/manual settlements, and delivery completion. Escalate any unreconciled payment/refund variance before the next operating day.
2. **Daily stock exception review:** Review negative stock rows, quarantined/blocked/expired batches, FEFO deviations, cancelled reservations, reservation expiries, manual stock adjustments. No exception may remain unowned for more than 24 hours.
3. **Refund/dead-letter review:** Review provider dead letters, worker dead letters, retry schedules, failed refund webhooks, duplicate settlement attempts.
4. **Prescription/H/H1 review:** Pharmacist reviews all regulated gate exceptions and verifies H1/statutory records.
5. **Security/access review:** Check failed login patterns, suspicious access, staff role changes, store assignment drift.
6. **Launch notes:** Record daily outcome, incidents, unresolved items, expansion decision.

---

## Production wave gates

### Wave 1 — First store, first 7 days

- Single store only.
- Pharmacist and incident commander on call for all operating hours.
- Daily reconciliation, stock exception, and dead-letter review.
- No expansion allowed until day-7 go/no-go review passes.

### Wave 2 — Second store or days 8–14

- Allowed only after clean Wave 1 (no open P0 incidents, reconciliation variance resolved, stock exceptions resolved).
- Multi-store operator drill completed before enabling second store.
- Second store has its own onboarding checklist signed off (see [OPERATIONS.md](./OPERATIONS.md) §Store onboarding checklist).
- Provider dead-letter and worker queue store isolation must be evidenced or first-class `storeId` added to those tables.

### Wave 3 — Scale beyond 2 stores

- New scale-readiness review required.
- Provider stability evidence attached.
- Restore drill completed within last 30 days.
- Monitoring coverage reviewed and extended.
- Supplier invoice duplicate backfill decision documented.
- Legal/compliance approval for expanded scope.

---

## Production dependency policy

### Dependency change process

1. Open a dedicated PR for dependency changes unless strictly incidental to an approved feature PR.
2. State why the dependency is needed (runtime or dev-only), and which production surface it affects.
3. Include exact package names, current and target versions, and whether the update is direct or transitive.
4. Include `pnpm install`, `pnpm run check`, `pnpm test`, `pnpm run build`, `node scripts/verify-migrations.mjs`, `git diff --check`, and `pnpm audit` results.
5. For runtime dependencies: include focused regression evidence for the affected feature area.
6. Do not bundle unrelated upgrades.

### Security patch policy

| Severity | Policy |
|----------|--------|
| Critical runtime | P0. Patch immediately or record explicit owner-approved risk acceptance. |
| High runtime | P0/P1 depending on reachability. Patch before launch unless security owner accepts risk with evidence. |
| High/critical dev/build tool | P1. Patch before launch if it can affect build artifacts, CI, or release integrity. |
| Moderate runtime | P1 unless proven unreachable. Patch on the next dependency hardening cycle. |
| Low/defense-in-depth | P2. |

### Major upgrade rule

No major version upgrade in a general hardening or feature PR without an explicit dedicated upgrade plan. React, Vite, TypeScript, Drizzle, Razorpay, AWS SDK, Express, auth/session, payment libraries require their own PR with rollback plan and focused regression evidence.

### Lockfile policy

- `pnpm-lock.yaml` is production evidence and must be committed with any dependency change.
- `pnpm install --frozen-lockfile` must pass in CI.
- Lockfile-only changes require the same review seriousness as `package.json` changes.
- The `packageManager` field in `package.json` is the single source of truth for pnpm version.
