# CI_SECURITY_STATUS

Status date: 2026-05-08
Scope: CI, repository governance, security-scan, and static unsafe-merge guardrails only. No runtime business logic, client runtime files, migrations, package versions, payment/provider logic, product-master gates, or stock lifecycle logic were intentionally changed.

## Workflows inspected

- `.github/workflows/ci.yml` was inspected. Existing jobs were `check`, `test`, `build`, `migration-smoke`, `security-env-guards`, and `placeholder-guards`.

## Jobs added or updated

- Added `governance-security-scans` to `.github/workflows/ci.yml`.
- The new job performs:
  - `pnpm install --frozen-lockfile`.
  - Lockfile integrity check with `pnpm install --frozen-lockfile --offline`.
  - Migration/static unsafe-merge scan with `node scripts/ci-governance-guards.mjs all`.
  - Advisory dependency audit with `pnpm audit --audit-level high || echo ...`.

## Guard tests inspected

Existing guard coverage inspected included:

- `server/migration-smoke.guard.test.ts` for migration smoke.
- `server/placeholder-production.guard.test.ts` for placeholder/scaffold production guardrails.
- `server/security-env.guard.test.ts`, `server/worker-security.guard.test.ts`, `server/storage-access.guard.test.ts`, `server/auth-otp.guard.test.ts`, and `server/security-procedure.guard.test.ts` for security guardrails.
- `server/admin-route-cockpit.guard.test.ts` for centralized admin route protection.
- `server/stock-invariant.guard.test.ts` and `server/stock-truth-10.guard.test.ts` for direct stock mutation guardrails.
- `server/payment-gateway.guard.test.ts`, `server/connectors.failclosed.test.ts`, `server/refund-reconciliation.guard.test.ts`, `server/accounting-tally-production.guard.test.ts`, and `server/whatsapp-notification-safety.guard.test.ts` for payment/non-payment provider fake-success and fail-closed guardrails.
- `server/h1-register-correctness.guard.test.ts` and `server/audit-unification.guard.test.ts` for unsafe H1 numeric casts and `entityId: 0` audit fallback checks.

## Guard tests/scripts added or updated

- Added `scripts/ci-governance-guards.mjs`.
- Added `server/ci-governance-guards.guard.test.ts` proving the scanner catches:
  - Merge conflict markers.
  - Fake/provider success text.
  - Provider-unconfigured success claims.
  - Unsafe H1 `Number(...)`/`entityId: 0` patterns.
  - Direct `/admin` route bypass outside centralized `AdminRoutes`.
  - Direct stock mutation outside documented invariant gateways.
  - Duplicate migration numbers.

## Dependency/security scans added

- Lockfile integrity is enforced with frozen install and offline frozen install in CI.
- High-confidence secret/PII scan is included in `scripts/ci-governance-guards.mjs` for obvious committed secrets such as AWS keys, private key blocks, and high-entropy assigned secrets.
- `pnpm audit --audit-level high` is added as an advisory step. It intentionally does not fail CI yet because current audit output contains existing advisories that require dependency-owner triage and package version updates outside this governance-only scope.

## Known limitations

- GitHub branch protection requires manual repository settings and is not proven enabled by this PR.
- True MySQL migration execution smoke requires non-production MySQL credentials and is deferred to the MySQL lifecycle branch; this PR only enforces lightweight repository-level migration checks.
- The global `50mb` JSON body limit still exists in server bootstrap and is emitted as a scanner warning, not fixed here, because runtime body-limit changes are out of scope.
- Direct stock mutation scanning has documented existing invariant/gateway exceptions so this CI-only PR does not alter active stock lifecycle runtime code.
- Advisory dependency audit currently reports vulnerabilities; upgrading package versions was intentionally not done in this PR because the user prohibited package version changes unless clearly required and approved for CI/security tooling.

## Validation results

Latest local validation in this PR:

- `pnpm install` completed successfully.
- `pnpm run check` was run and failed on pre-existing TypeScript errors in `server/connectors.ts` around fetch header typing; this PR did not modify that runtime file.
- `pnpm test -- --runInBand` completed successfully.
- `pnpm run build` completed successfully.
- `git diff --check` completed successfully.
- `node scripts/ci-governance-guards.mjs all` completed successfully with the documented warning for global `50mb` JSON body limit.
- `pnpm audit --audit-level high` was run separately and failed with existing advisories, including high/critical findings; it remains advisory in CI pending dependency-owner triage.

## Files changed

- `.github/workflows/ci.yml`
- `scripts/ci-governance-guards.mjs`
- `server/ci-governance-guards.guard.test.ts`
- `CI_SECURITY_STATUS.md`
- `BRANCH_PROTECTION_ENFORCEMENT_STATUS.md`
- `MERGE_GOVERNANCE_STATUS.md`

## Branch protection enforcement status

Branch protection is **not claimed as enabled** by this PR. See `BRANCH_PROTECTION_ENFORCEMENT_STATUS.md` for manual repository-owner steps and proof gaps.
