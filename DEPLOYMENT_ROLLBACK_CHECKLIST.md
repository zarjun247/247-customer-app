# DEPLOYMENT_ROLLBACK_CHECKLIST

Updated: 2026-05-10.

## Pre-deployment rollback readiness

1. Record current artifact ID, target artifact ID, commit SHA, operator, and environment.
2. Confirm `node scripts/validate-deployment-env.mjs --env staging` or production equivalent passes.
3. Confirm migration verification is green and no destructive rollback assumption exists.
4. Confirm rollback target artifact is deployable without database reset or destructive restore.
5. Freeze non-critical changes during deployment window.

## Rollback execution evidence

- Rollback command or platform action ID.
- Start/end timestamps and operator.
- Pre/post liveness and readiness output.
- Worker queue/dead-letter counts before and after rollback.
- Provider webhook/retry side-effect review.
- Stock/commercial smoke result.

## Abort criteria

Abort and escalate if rollback would require dropping tables, truncating data, restoring over a live DB, bypassing regulated gates, or hiding provider/payment uncertainty.
