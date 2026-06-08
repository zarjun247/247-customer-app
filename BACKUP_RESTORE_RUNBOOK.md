# Backup & Restore Runbook

Backup and restore SOPs for 247 Pharmacy OS. Every procedure includes exact commands, expected output, and escalation triggers.

See also: [OPERATIONS.md](./OPERATIONS.md) §Backup and recovery, [RUNBOOK_DEPLOY.md](./RUNBOOK_DEPLOY.md) §Rollback.

---

## RPO / RTO targets

| Environment | RPO target | RTO target |
|-------------|------------|------------|
| Staging | 24 hours (rehearsal data) | 4 hours |
| Production | 15 minutes (PITR) | 1 hour (app + DB service) |

These targets must be measured during staging restore drills and approved before production launch.

---

## Backup schedule

| Backup type | Schedule | Retention | Owner |
|-------------|----------|-----------|-------|
| Production full DB backup | Daily at 02:00 IST | 30 days | Platform owner |
| Production incremental/PITR | Every 15 min (or continuous) | 7–14 days | Platform owner |
| Pre-deployment snapshot | Immediately before every production migration | Until next stable backup | Release owner |
| Staging backup | Daily or before migration rehearsal | 7 days | Platform owner |

---

## Backup verification (weekly automated drill)

The backup drill workflow runs every Sunday at 03:00 UTC via `.github/workflows/backup-drill.yml`.

### To view drill results:

```bash
node scripts/backup-drill-runner.mjs --dry-run
# Expected output:
#   [backup-drill] MOCK MODE — BACKUP_DRILL_ENABLED is false
#   [backup-drill] Outcome: completed
#   [backup-drill] Evidence: evidence/backup-drill-<id>-OK.json
```

### To run a real drill (requires BACKUP_DRILL_ENABLED=true):

```bash
BACKUP_DRILL_ENABLED=true \
BACKUP_SOURCE_DB_URL="mysql://..." \
BACKUP_TARGET_DB_URL="mysql://..." \
node scripts/backup-drill-runner.mjs --kind logical_dump
# Expected: Outcome: completed, Rows verified: >0
```

Required: BACKUP_DRILL_ENABLED=true, BACKUP_SOURCE_DB_URL, BACKUP_TARGET_DB_URL. Set via GitHub Secrets — never in code.

---

## Object storage backup

The following buckets must be backed up daily:
- Prescription images: versioning enabled, cross-region replication where available.
- Invoice PDFs: versioning enabled, statutory retention minimum 7 years.
- Reports and exports: daily inventory or documented regeneration policy.

Verify backup coverage by checking the S3 bucket versioning and replication status in the AWS console. Contact the platform owner if versioning is disabled.

---

## Restore procedure

> NEVER perform a restore drill against the production database. Always use a staging/test target.

### Step 1 — Declare drill scope

Record:
- Restore point (backup ID, timestamp)
- Target environment (staging URL, DB name)
- Operator name and start time
- Incident commander or drill owner

### Step 2 — Freeze target staging environment

```bash
# Disable workers in staging:
# Set OUTBOX_DISPATCH_ENABLED=false in staging env
# Set RESERVATION_EXPIRY_SWEEP to disabled
# Confirm no active webhooks are being received during restore
```

### Step 3 — Restore database

```bash
# Using MySQL restore (example — adapt to your provider tooling):
mysql -h <staging-db-host> -u <user> -p <staging-db> < backup-<date>.sql
# Record: start time, end time, exit code, any errors

# Or using the restore drill runner (wires audit logging):
RESTORE_DATABASE_URL="mysql://<user>:<pass>@<host>/<staging-db>" \
RESTORE_BACKUP_FILE="backup-<date>.sql" \
node scripts/restore-drill-runner.mjs
# Expected output:
#   [restore-drill-runner] Starting restore drill (id=restore-...)
#   [restore-drill-runner] Outcome: success (Xms)
```

### Step 4 — Restore object storage

Restore prescription and invoice artifacts from S3 backup to staging bucket. Use the AWS CLI:

```bash
aws s3 sync s3://<backup-bucket>/<prefix> s3://<staging-bucket>/<prefix>
# Verify: check that prescription images are accessible via presigned URLs
```

### Step 5 — Reconfigure staging secrets

After restore, replace production provider credentials with staging/sandbox values:
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` → sandbox keys
- `WHATSAPP_WEBHOOK_SECRET` → staging value
- `JWT_SECRET` → staging value (never production)

### Step 6 — Run migrations (if rehearsing post-restore upgrade)

```bash
pnpm run migrations:verify
# Expected: "Migration sequence is valid" — confirms all migrations are present
```

If new migrations need to be applied:
```bash
# Apply via drizzle-kit against staging DB
# Record: migration numbers applied, start/end time
```

### Step 7 — Run verification checklist

```bash
RESTORE_DATABASE_URL="mysql://..." RESTORE_BACKUP_FILE="backup-<date>.sql" node scripts/restore-verify.mjs
# Expected: exit 0 with read-only verification plan

node scripts/deployment-readiness-check.mjs
# Expected: all checks pass
```

Manual verification steps (pharmacist or platform owner):
- [ ] Users: staff/customer/admin can log in
- [ ] Products: master records present, duplicates reviewed
- [ ] Stock ledger: no negative invariant violations
- [ ] Sales/orders: order headers and line items present
- [ ] Prescriptions: files accessible (presigned URLs work)
- [ ] Payments/refunds: captured payments match provider records
- [ ] Audit logs: chain continuity intact (`pnpm run verify:ai-eval-chain`)

### Step 8 — Measure and record RPO/RTO

```
Restore point: <backup timestamp>
Recovery start: <operator start time>
Recovery complete: <time when /health/ready returned 200>
Elapsed RPO: <minutes from backup to restore point>
Elapsed RTO: <minutes from start to ready>
```

Compare against targets in §RPO/RTO targets above.

### Step 9 — Document findings and clean up

- Record blockers, permission errors, slow steps, missing data.
- Assign remediation owner and target date.
- Clean up drill environment (drop test DB, invalidate staging sessions).
- Write restore drill evidence to `evidence/restore-drill-<date>.json`.

---

## Monitoring backup health

Signs that backups need immediate attention:
- Backup job does not complete within 4 hours of scheduled start.
- Backup size decreases > 20% from prior week (data loss risk).
- PITR logs gap > 30 minutes.
- Object storage replication lag > 1 hour.

Escalate to platform owner immediately if any of these conditions are detected.

---

## Off-site replica policy

- Production DB backups must be stored in a different AWS region from the primary (e.g., primary `ap-south-1` → replica `ap-south-2`).
- Prescription image bucket: cross-region replication required before production launch.
- Access to backup storage requires the platform owner role — no shared credentials.

All off-site replica configuration must be documented before the first production launch (see OPEN_BLOCKERS.md).
