# DEPLOYMENT_SURVIVABILITY_STATUS

Updated: 2026-05-10.

## Current status

Survivability infrastructure is now defined in code, scripts, and operator checklists, but real staging deployment, rollback, and restore evidence remains **pending** until measured artifacts are attached.

## Evidence systems added

| System | Path | Status | Claim boundary |
| --- | --- | --- | --- |
| Staging deployment status | `STAGING_DEPLOYMENT_STATUS.md` | Added | Defines topology/checklists only. |
| Deployment env validation | `scripts/validate-deployment-env.mjs` | Added | Validates shape without printing secrets. |
| Restore verification dry-run | `scripts/restore-verify.mjs` | Added | Computes checksum and prints read-only checks; does not restore. |
| Failure exercise matrix | `deploymentReadiness.failureExercises` | Added | Exercise plan only; no outage proof. |
| Operator checklists | `DAILY_RUNTIME_REVIEW.md`, `DEPLOYMENT_ROLLBACK_CHECKLIST.md`, `STAGING_DRILL_CHECKLIST.md` | Added | Runbook evidence capture templates. |

## Rollback acceptance criteria

- Known-good artifact is recorded before deployment.
- Rollback does not reset or restore databases.
- Health/readiness passes after rollback.
- Worker queue and provider dead-letter deltas are reconciled.
- No stock invariant, commercial ledger, H/H1/pharmacist, PHI/PII, or AI governance gate is bypassed.

## Restore acceptance criteria

- Restore target is isolated non-production.
- Backup file checksum is captured and, when available, matches the checksum file.
- Restore command transcript, duration, and exit status are attached externally.
- Read-only verification queries pass after restore.
- Application smoke check passes against the restored database.
- Stock/commercial reconciliation checks show no negative stock or ledger imbalance introduced by restore.

## Remaining survivability gaps

- No hosted staging deploy URL, artifact ID, or runtime transcript is attached.
- No measured rollback rehearsal is attached.
- No measured restore drill against isolated staging MySQL is attached.
- No provider outage simulation transcript is attached.
- No named 24/7 monitoring rota or incident commander signoff is attached.
