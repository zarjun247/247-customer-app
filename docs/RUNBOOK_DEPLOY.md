# Deploy Runbook

Staging-to-production deployment SOP. All steps are executed by a human operator with the platform owner and incident commander on standby. No automated deploys to production — every production deploy requires explicit operator action and manual approval through the GitHub `production` environment.

See also: [RELEASE.md](./RELEASE.md), [RUNBOOK_INCIDENTS.md](./RUNBOOK_INCIDENTS.md), [OPERATIONS.md](./OPERATIONS.md) §Backup and recovery.

---

## Environments

| Environment | URL pattern | Approval required |
|-------------|-------------|-------------------|
| Staging | TBD — set via `STAGING_URL` secret | GitHub Environment `staging` — requires reviewer |
| Production | TBD — set via `PRODUCTION_URL` secret | GitHub Environment `production` — requires reviewer + incident commander |

---

## Pre-deploy checks

Run these before triggering any deploy. All must pass.

```bash
# 1. TypeScript
pnpm run check

# 2. Tests (including guard suites)
pnpm test

# 3. Build
pnpm run build

# 4. Migration verification (no conflicts, no gaps)
pnpm run migrations:verify

# 5. CI governance guards
node scripts/ci-governance-guards.mjs all

# 6. SBOM
pnpm run sbom:generate
# Expected: sbom.cyclonedx.json created, no error

# 7. SLO coverage
pnpm run slo:coverage
# Expected: all critical paths present in SLO_COVERAGE.md

# 8. Provider contracts
pnpm run contract:verify
# Expected: all 5 providers PASS (mock mode)

# 9. Deployment env validation
node scripts/validate-deployment-env.mjs --env staging
# Expected: exit 0 with no MISSING_REQUIRED_* errors
```

If any command fails: **HALT** and resolve the failure before proceeding.

---

## Staging deploy steps

### Trigger (dry-run first)

1. Navigate to GitHub Actions → **Staging Deploy** workflow.
2. Click **Run workflow** → set `dry_run = true` → confirm.
3. Expected output:
   ```
   DRY RUN: would deploy commit <sha> to staging environment
   DRY RUN: would run: pnpm run build && docker push && apply migrations
   ```
4. Review the dry-run log. If output is as expected, proceed to real deploy.

### Real staging deploy

1. Click **Run workflow** → set `dry_run = false`.
2. The workflow requires manual approval in the `staging` GitHub Environment.
3. Reviewer approves — workflow proceeds:
   - Runs `validate-deployment-env.mjs`, `migrations:verify`, `deployment-readiness-check.mjs`
   - Builds Docker image (if DOCKER_REGISTRY is set)
   - Applies migrations against staging DB via `pnpm run db:push` (custom runner, not drizzle-kit)
   - Starts the application
4. After workflow completes, run staging smoke tests (see §Smoke tests).

> **Migration runner note (SM-K):** `pnpm run db:push` now executes `scripts/apply-migrations.mjs`,
> which applies all 68+ SQL files idempotently. On first deploy after SM-K, run
> `pnpm run db:bootstrap` instead (runs bootstrap + apply) to pre-populate the `_app_migrations`
> tracking table for existing databases. **Do NOT run `drizzle-kit migrate`** — it only knows
> about migrations 0000–0049 and will skip the rest.

---

## Smoke tests in staging

Run these commands against staging. Replace `<staging-url>` with the actual URL.

```bash
# Liveness
curl -s https://<staging-url>/health/live
# Expected: {"status":"ok"} HTTP 200

# Readiness
curl -s https://<staging-url>/health/ready
# Expected: {"status":"ready","checks":{...}} HTTP 200

# Migrations applied
# Expected: migrations section shows all 63 migrations applied (0000 through 0063)

# Worker heartbeat
# Open admin UI → Runtime → verify worker_jobs heartbeat within last 60s

# Provider health
curl -s https://<staging-url>/api/admin/runtime/detail \
  -H "Cookie: <staff session cookie>"
# Expected: all providers show "healthy" or "unknown" (not "unhealthy")
```

If any smoke test fails: **HALT**, investigate, do NOT proceed to production.

---

## Production deploy steps

Production deploys are manual and require:
- CI green on the release commit
- Staging smoke tests passed
- DPDP review complete (see `docs/DPDP_OPERATIONS.md`)
- Incident commander on standby

### Steps

1. Create a backup immediately before deploying:
   ```
   # TBD: trigger backup via your DB provider tooling or RDS snapshot
   # Record: backup ID, timestamp, operator
   ```

2. Navigate to GitHub Actions → **Staging Deploy** workflow (same workflow, different approval).
   - Alternatively, trigger via `RELEASE_CHANNEL=production` — TBD when wired.
   - The `production` GitHub Environment requires manual approval from the platform owner + incident commander.

3. Apply migrations (forward-apply only; never destructive in production):
   ```bash
   # Verify first (dry-run)
   pnpm run migrations:verify
   # Expected: "Migration sequence is valid" with count = 63 (or current max)
   ```

4. Deploy application artifact:
   ```bash
   # TBD: docker pull + restart, or your platform's deploy command
   # Record: commit SHA, docker image tag, deploy start time, operator
   ```

5. Run production smoke tests (same as staging, against production URL):
   ```bash
   curl -s https://<production-url>/health/live
   curl -s https://<production-url>/health/ready
   ```
   Expected: both return 200.

6. Enable workers:
   - Confirm worker heartbeat in admin UI before enabling new order processing.

---

## Post-deploy verification checkpoints

### 5-minute checkpoint

- `/health/live` → 200
- `/health/ready` → 200
- Worker heartbeat active
- Zero new dead letters

### 30-minute checkpoint

- `/metrics` → `stock_anomaly_count` = 0
- Payment webhook success rate ≥ 99%
- No new P0/P1 incident alerts

### 24-hour checkpoint

- Daily reconciliation completed by store manager
- SLO events present for all critical paths
- Dead-letter count not growing

---

## Rollback procedure

1. **Declare rollback:** notify incident commander and platform owner.
2. **Freeze** regulated operations: pharmacist-in-charge confirms no Rx dispensing during rollback window.
3. **Execute:** roll back to the prior known-good artifact:
   ```bash
   # TBD: docker pull <prior-image-tag> && restart
   # Record: rollback target SHA, rollback start time, operator
   ```
4. **Verify:** `/health/ready` returns 200 within 2 minutes of rollback.
5. **Reconcile:** all orders/payments/stock changes during the failed deploy window.
6. **Record:** rollback timeline, affected order count, reconciliation status.

**Migration rollback policy:** Never run destructive down-migrations in production. Use forward-fix migrations in a new PR. If a migration partially applied, freeze writes and contact the DBA.

---

## Communication template

**During outage (status page / Slack):**
```
[247 Pharmacy — Service Notice]
Date/Time: <ISO timestamp>
Status: Investigating / Degraded / Resolved
Impact: <e.g., "Payment processing delayed, orders may be delayed">
Next update: <in X minutes>
Contact: <incident commander name>
```

**Post-resolution:**
```
[247 Pharmacy — Service Restored]
Date/Time: <ISO timestamp>
Duration: <X minutes>
Impact: <affected features>
Root cause: <brief>
Actions taken: <brief>
Post-mortem: <link when available>
```
