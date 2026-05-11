# DEPLOYMENT_RUNTIME_STATUS

Updated: 2026-05-10.

## Scope

This document records deployment/runtime readiness surfaces added in the deployment sprint. It is not a production go-live certificate and does not assert that production has been deployed or externally verified.

## What Copilot left incomplete

- The branch did not contain registered `deploymentReadiness` or `multiStoreRuntime` tRPC routers.
- No deployment readiness tRPC surface was available from `appRouter`.
- No multi-store runtime visibility tRPC surface was available from `appRouter`.
- Runtime status documentation for deployment readiness and multi-store visibility was missing.

## Added runtime surfaces

| Surface | Access | Purpose | Safety boundary |
| --- | --- | --- | --- |
| `deploymentReadiness.liveness` | staff/admin tRPC | Minimal app liveness mirror. | Returns only safe status/timestamp metadata. |
| `deploymentReadiness.readiness` | staff/admin tRPC | Database/migration readiness mirror. | No connection strings, secrets, PHI, or PII. |
| `deploymentReadiness.health` | staff/admin tRPC | Detailed safe health report. | Uses existing redaction-safe health report. |
| `deploymentReadiness.summary` | staff/admin tRPC | Rollup of readiness, critical checks, degraded mode, and proof boundary. | Explicitly states that no production deployment proof is asserted. |
| `deploymentReadiness.providers` | staff/admin tRPC | Provider configuration visibility. | Reports configuration status only; does not claim external provider delivery proof. |
| `deploymentReadiness.workerQueue` | staff/admin tRPC | Worker queue/dead-letter/stale job visibility. | Aggregated counts only. |
| `deploymentReadiness.backupRestoreDrill` | staff/admin tRPC | Backup/restore drill commands and guardrails. | Dry-run only; no destructive restore automation. |

## Current readiness score

**Production readiness score: 72/100.**

Rationale:

- Positive: safe liveness/readiness, detailed staff-gated health, provider/worker queue status, multi-store runtime visibility, and non-destructive backup/restore drill documentation are now present.
- Negative: production deployment evidence, hosted CI observation, live provider verification, measured backup/restore drills, and real incident response drills remain blockers.

## Remaining production blockers

- Capture real deployment evidence from CI/CD and runtime URLs.
- Run and archive backup and restore drills against staging using non-production credentials.
- Verify payment, WhatsApp/SMS, maps, OCR, printer, storage, and Tally provider contracts in staging/sandbox without treating unconfigured/demo states as success.
- Observe hosted DB concurrency proof and full CI checks on the target merge commit.
- Assign owners and runbooks for incident response, worker dead-letter handling, degraded mode, and restore drills.
