# STAGING_DEPLOYMENT_STATUS

Updated: 2026-05-10.

This file defines the evidence required before a staging deployment can be treated as survivability proof. It does **not** claim that staging has been deployed or restored.

## Required deployment topology

- One immutable app artifact per commit, tagged with `RELEASE_ARTIFACT_ID` or commit SHA.
- One staging web runtime, one staging worker runtime, and one isolated staging MySQL database.
- Read-only/admin health verification path gated by staff/operator auth.
- Provider sandbox accounts only; live payment, OCR, WhatsApp/SMS, and storage credentials are not used in staging.
- Observability sinks for app health, worker queue, provider events, dead letters, and database readiness.
- Backup output location for staging drill artifacts with retention, checksum, and access control.

## Required environment classes

| Class | Purpose | Allowed evidence claim |
| --- | --- | --- |
| `preview` | Short-lived branch smoke check. | Build/deploy shape only; no provider or restore claim. |
| `staging` | Production-like rehearsal with sandbox providers and non-production data. | Deployment, rollback, degraded-mode, and restore drill evidence if measured. |
| `production` | Controlled live store only after P0 external evidence. | Live readiness only after legal, pharmacist, provider, backup, restore, and monitoring proof. |

## Required secret categories, no values

- Database connection URL for the environment class.
- Session/JWT/cookie signing material.
- Operator health/readiness token or admin auth provider.
- Payment provider sandbox credentials and webhook secret.
- OCR provider sandbox endpoint/key when OCR is enabled.
- WhatsApp/SMS/email sandbox credentials.
- Object storage endpoint, bucket, and access credentials.
- Encryption/key-management material for sensitive records.
- CI/CD deploy token and artifact registry credentials.
- Backup storage credentials and checksum signing key if used.

## Deployment verification checklist

1. `pnpm run check`, `pnpm test`, `pnpm run build`, migration verification, governance guards, and `git diff --check` are green for the artifact commit.
2. `node scripts/validate-deployment-env.mjs --env staging` passes without printing secrets.
3. Artifact ID, commit SHA, deploy URL, deployment timestamp, and operator are recorded in `PRODUCTION_EVIDENCE_REGISTER.md` or external evidence pack.
4. Liveness/readiness/health endpoints respond through the deployed URL and remain secret-free.
5. Worker queue is visible; stale running jobs and dead-letter counts are recorded.
6. Provider sandbox checks are explicitly labeled observed or pending.
7. Stock-changing and regulated-release smoke checks preserve H/H1/pharmacist gates.

## Rollback verification checklist

1. Record current artifact ID and known-good rollback artifact ID before release.
2. Verify rollback command is non-destructive and does not run database reset or restore.
3. Execute rollback only against staging unless production change approval exists.
4. Capture pre-rollback and post-rollback liveness/readiness outputs.
5. Confirm migrations are backward-compatible or rollback is blocked with a documented forward-fix plan.
6. Reconcile worker queue/dead-letter counts and provider side effects after rollback.

## Degraded mode expectations

- Payment outage: fail closed for paid status; allow manual cash/UPI only with operator approval and reconciliation.
- OCR outage: fail closed for automated inwarding; manual entry must preserve pharmacist and regulated gates.
- WhatsApp/SMS outage: do not leak PHI/PII in fallback calls or notes; order state remains source of truth.
- Queue backlog/dead-letter growth: surface degraded status, pause non-critical jobs, and require audited replay.
- DB degradation: readiness fails and stock/commercial mutations stop until database safety returns.
- Worker crash: app stays available for safe reads; async side effects require reconciliation.

## Deployment freeze rules

Freeze deploys when any P0 is open: stock invariant regression, commercial truth regression, AI governance seal failure, PHI/PII redaction failure, migration destructive-risk finding, provider webhook replay regression, restore safety refusal failure, or missing rollback target for production.
