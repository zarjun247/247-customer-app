# DEPLOYMENT_RUNBOOK

Documentation-only production deployment runbook. This file describes the expected operating procedure and required checks; it does not assert that production readiness is complete.

## Scope and guardrails
- Applies to app deployment, provider configuration, worker/cron enablement, smoke verification, and rollback planning.
- Do not use this runbook to bypass CI, branch protection, migration review, security review, or store readiness sign-off.
- Do not deploy unreviewed runtime, schema, or provider changes from stale branches.
- Treat provider-disabled or provider-unconfigured modes as operational blockers for any store flow that depends on that provider.

## Target environments

| Environment | Purpose | Data posture | Provider posture | Deployment gate |
| --- | --- | --- | --- | --- |
| Local | Developer validation and docs/runbook rehearsal. | Local or disposable data only; no production secrets. | Prefer sandbox or disabled providers. | `pnpm install`, `pnpm run check`, targeted tests, and build when relevant. |
| Staging | Release candidate verification, migration rehearsal, restore drills, and provider sandbox checks. | Recent scrubbed restore or representative seed data. | Sandbox credentials or production-like non-sending endpoints. | CI green, migration rehearsal, smoke test, provider health checks, rollback plan reviewed. |
| Production | Live store operations. | Authoritative customer, product, inventory, prescription, invoice, payment, audit, and statutory records. | Live credentials only after go/no-go approval. | Merge governance complete, backups verified, restore drill current, migration plan approved, smoke test passed, on-call owner assigned. |

## Required environment variable matrix

Use exact variable names from the deployed environment where they already exist. Names below are operational categories and expected examples; confirm against `server/_core/env.ts`, provider docs, and deployment secrets before release.

| Category | Local | Staging | Production | Required validation |
| --- | --- | --- | --- | --- |
| DB | Local database URL/host/user/password/schema. | Dedicated staging DB credentials. | Production DB credentials with least privilege and backup coverage. | Connectivity, migration user permissions, current schema version, backup inclusion. |
| JWT/session | Local development secret. | Non-production strong secret. | Rotated production secret in secret manager. | No default/empty secret; session cookie domain and secure flags appropriate. |
| OAuth/app ID | Local callback/app IDs. | Staging callback/app IDs. | Production app IDs and redirect URIs. | Callback URL match, app ID ownership, secret rotation plan. |
| Storage | Local filesystem or disposable bucket. | Staging bucket/prefix. | Production bucket/prefix for prescriptions, invoices, reports, and generated labels if retained. | Read/write/list/delete policy rehearsal, encryption, lifecycle, backup coverage. |
| Payment/Razorpay | Disabled or sandbox keys. | Sandbox keys and webhook secret. | Live `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and webhook secret where payment/webhook is enabled. | Provider enabled state is explicit; no fake success; webhook signature verification passes. |
| SMS | Disabled or sandbox sender. | Sandbox/test sender. | Approved production sender and credentials. | OTP/notification send path verified; fail-closed behavior documented for critical OTP. |
| WhatsApp | Disabled or sandbox token. | Test business account/webhook token. | Approved business account token, phone ID, webhook verify token. | Webhook verification, template approval, failure alerting. |
| Printer | Optional local printer or disabled queue. | Test label printer host/port/name. | Store printer host/port/name and fallback queue behavior. | Label dry run, printer offline behavior, reprint SOP. |
| ERP/Tally | Disabled or test export path. | Staging export path/company mapping. | Production company/export config. | Export dry run, checksum/run audit, duplicate export guard. |
| Worker/cron | Disabled unless needed for local test. | Enabled after migration smoke. | Enabled only after app smoke and provider health pass. | Heartbeat, queue/backlog, retry policy, idempotency posture. |
| OTP rate limit backend | In-memory or local backend. | Shared staging rate-limit backend if configured. | Durable/shared production backend where horizontally scaled. | Rate-limit state shared across instances; bypass attempts logged. |

## Install, validation, and build commands

Run these from the repository root before deploying a release candidate:

```bash
pnpm install
pnpm run check
pnpm test -- --runInBand
pnpm run build
```

## Deployment sequence

1. **Pull latest main**
   - Start from the latest protected `main` after approved PRs are merged.
   - Rebase or recreate the release branch; do not deploy from stale PR branches.
2. **Verify CI**
   - Confirm the release commit has green CI on the hosting provider.
   - Confirm files changed are reviewed against merge governance and parallel branch risk.
3. **Review migrations**
   - Confirm migration files, if any, have unique numbers and match schema changes.
   - Confirm no reserved migration conflict exists.
   - Confirm migration backup and rollback policy are approved before execution.
4. **Run migrations**
   - Run migrations in staging first against a restore or representative database.
   - Run production migrations during the approved deployment window only after backup confirmation.
5. **Deploy application artifact**
   - Deploy the exact CI-built artifact or reproducible commit.
   - Keep previous artifact available for immediate rollback.
6. **Run smoke test**
   - Verify app boot, login/session, DB read/write, product lookup, stock read, POS sale dry run in staging or controlled production test mode, storage read/write, and provider config status.
   - Verify critical healthcheck requirements listed in `PRODUCTION_HEALTHCHECK_STATUS.md`.
7. **Enable worker/cron**
   - Enable workers only after application smoke and migration checks pass.
   - Verify worker heartbeat, queue lag, reservation expiry processing, notification retries, and payment webhook processing.
8. **Verify provider health**
   - Payment/Razorpay: config present, webhook verification passes, sandbox/live mode is correct.
   - SMS/WhatsApp: credentials present, template/sender approval verified, test sends where allowed.
   - Printer: test label prints or queues with clear failure reason.
   - ERP/Tally: export config present and dry-run export path verified.
9. **Record deployment evidence**
   - Record commit hash, migration set, backup ID, smoke test results, provider health results, and rollback owner.

## Rollback sequence

1. **App rollback**
   - Roll back to the prior known-good application artifact/commit.
   - Keep worker/cron disabled during rollback unless the rollback owner confirms idempotent retry safety.
2. **Migration rollback policy**
   - Prefer forward-fix migrations for already-applied production schema changes.
   - Do not run destructive down migrations in production unless explicitly rehearsed, backed up, and approved.
   - If a migration is partially applied or failed, freeze writes where needed, capture DB state, and follow DBA-approved remediation.
3. **Feature-flag/provider-disable plan**
   - Disable non-critical providers before rolling back the app if provider failure is the incident trigger.
   - Payment/SMS/WhatsApp/printer/ERP integrations must fail closed for critical flows and expose operator-visible degraded status.
   - Document which features are temporarily disabled and how pending jobs/webhooks will be reconciled after recovery.
4. **Post-rollback verification**
   - Confirm app availability, DB connectivity, worker state, pending queue state, payment reconciliation, stock invariants, and audit log continuity.

## Production go/no-go checklist

- [ ] Latest protected `main` is the release base.
- [ ] CI is green for the exact release commit.
- [ ] Migration list reviewed; no duplicate/conflicting migration number; no unexpected schema drift.
- [ ] Fresh production backup completed and restore drill is recent enough for the release risk.
- [ ] `pnpm install`, `pnpm run check`, `pnpm test -- --runInBand`, and `pnpm run build` passed in the release environment or CI.
- [ ] Environment variables/secrets validated for DB, session, OAuth/app ID, storage, payment, SMS, WhatsApp, printer, ERP/Tally, worker/cron, and OTP rate limit backend.
- [ ] Smoke test passed in staging and production deployment window test scope.
- [ ] Worker/cron enablement plan approved.
- [ ] Provider health verified or explicit provider-disable decision approved.
- [ ] Monitoring alerts and on-call ownership active.
- [ ] Backup/restore owner and rollback owner named.
- [ ] Store go-live checklist completed for the store being activated.
- [ ] Remaining risks are documented; no unproven production-ready claim is made.
