# STAGING_DRILL_CHECKLIST

Updated: 2026-05-10.

## Drill scope

Run these drills only on staging or isolated restore databases. Label each result as observed proof, simulated proof, or pending.

## Required drills

| Drill | Expected behavior | Fail-closed expectation | Manual fallback |
| --- | --- | --- | --- |
| Payment provider outage | Payment remains pending/failed; no paid state without settlement. | Yes | Cash/UPI with cashier + pharmacist approval and reconciliation. |
| OCR outage | OCR ingestion stops safely; exceptions are visible. | Yes | Manual entry preserving H/H1/pharmacist review. |
| WhatsApp/SMS outage | Notifications fail visibly; order truth remains in app. | No for reads, yes for PHI | Operator call using minimal non-PHI script. |
| Queue backlog | Backlog and stale jobs are visible. | Partial | Pause non-critical jobs and prioritize payment/refund retries. |
| Dead-letter growth | Dead-letter counts rise and require review. | Yes for replay | Audited replay only after root-cause review. |
| DB connection degradation | Readiness fails and unsafe mutations stop. | Yes | Store downtime/hold queue; no offline stock mutations. |
| Worker crash | Async processing stops visibly. | Partial | Restart worker and reconcile provider side effects. |
| Deployment rollback | Previous artifact restored without DB reset. | Yes during rollback | Freeze changes until post-rollback smoke passes. |

## Required restore drill commands

1. `node scripts/backup-db.mjs --dry-run --metadata`
2. `node scripts/restore-db-drill.mjs --dry-run --backup-file <non-production-backup.sql>`
3. `node scripts/restore-verify.mjs --backup-file <non-production-backup.sql> --checksum-file <optional.sha256>`

Attach actual executed restore transcript separately only after running against an isolated non-production database.
