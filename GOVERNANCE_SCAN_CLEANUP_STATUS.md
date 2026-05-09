# Governance Scan Cleanup Status

Date: 2026-05-09T10:25:00Z
Branch: `fix/governance-scan-cleanup-no-fake-green`
Inspected main SHA: `200fafcc20451cc43e8d6272588ec7e26e12d9c8`

## Main freshness note

I attempted to fetch GitHub main with `git fetch origin main --prune`, but this container cannot authenticate to the private GitHub remote: `fatal: could not read Username for 'https://github.com': No such device or address`. The latest SHA available in the workspace and used for this pass is `200fafcc20451cc43e8d6272588ec7e26e12d9c8`.

## Baseline governance scan result

Command run before edits:

```text
node scripts/ci-governance-guards.mjs all
Governance/security scan passed: no blocked patterns found.
```

Baseline finding count: **0**. No real P0/P1 runtime blocker was suppressed or reclassified in this branch.

## Findings classification table

| Scanner/check name | File | Pattern/finding | Classification | Reason | Action taken | Remaining risk |
| --- | --- | --- | --- | --- | --- | --- |
| Governance/security scan | Repository scan | No baseline findings | False-positive cleanup not required | The baseline command passed cleanly on the inspected SHA. | Kept the gate green only because it truly passed. Added rule tests and narrow rule hardening to prevent fake-green regressions. | Authenticated GitHub-main freshness was not provable from this container. |
| Provider fake-success rule | `scripts/ci-governance-guards.mjs` | `provider_unconfigured` paired with success markers such as `sent: true`, `synced: true`, `verified: true`, `printed: true`, `parsed: true`, `paid: true`, or `refunded: true` | Scanner hardening | Existing same-line checks did not prove multi-line return-object fake success would be caught. | Added return-object window checking and tests for provider, printer, OCR, payment, and refund fake success. | Static regex scanning is still not a substitute for provider contract/runtime proof. |
| Provider fail-closed states | `scripts/ci-governance-guards.mjs` | `not_configured`, `disabled`, `manual_required`, `queued`, `pending`, `failed`, `dead_letter`, `not_implemented` without success markers | Acceptable fail-closed state | These states are non-success only when not paired with success flags/statuses. | Added explicit allow/deny tests: allowed without success markers, blocked when paired with success on the same runtime result line/object. | Misleading runtime wording can still require manual review beyond regex. |
| Stock mutation rule | `scripts/ci-governance-guards.mjs` | Direct `storeSkus`/`batches` stock field mutation or stock ledger insert outside approved paths | Scanner hardening | The gate must catch direct stock mutation bypass patterns while preserving read-only health checks and test fixtures. | Added tests for direct stock mutation, stock movement audit placeholders, read-only health checks, allowed stock invariant service, and test fixtures. | Existing legacy stock paths remain outside this branch's business-logic scope unless a future scanner expansion intentionally classifies and remediates them. |
| Migration scanner | `scripts/ci-governance-guards.mjs`, `scripts/verify-migrations.mjs` | Duplicate numbered migration prefixes | Clean/current | The inspected migration tail is clean: `node scripts/verify-migrations.mjs` reports 49 SQL files, 46 numbered, latest `0048`, 0 blockers, 0 warnings. | Added a clean-tail scanner fixture test and updated stale migration-audit wording. | DB-backed migration replay was not proven without `TEST_DATABASE_URL`. |
| Runtime placeholder scanner | `scripts/ci-governance-guards.mjs` | Placeholder/mock/stub OCR or storage result returning success or placeholder URL | Scanner hardening | Placeholder runtime success must not pass as production behavior. | Added OCR/storage placeholder detection and a regression test. | Static scanning may miss semantic placeholder flows; runtime/provider tests remain required. |
| Test fixtures/docs wording | `server/ci-governance-guards.guard.test.ts` | Fake success, stock mutation, and audit placeholders in test-only paths | Test fixture | Test-only fixtures are acceptable and must not block production scans. | Strengthened test-only exclusion coverage without blanket directory suppression. | A production import of test helpers is not proven by this scanner alone. |

## Fixes made

- Hardened provider fake-success detection to catch fail-closed provider status paired with production success in a return object.
- Hardened provider proof checks for payment/refund/import/sync success without nearby proof, while avoiding generic `export` keyword false positives.
- Hardened runtime placeholder detection for OCR/storage placeholder success and placeholder URLs.
- Added focused scanner regression tests for fake provider success, fail-closed states, placeholder OCR/storage success, stock mutation, stock health reads, migration duplicate fixtures, clean migration tails, and test fixture exclusion.
- Updated stale migration-audit documentation that previously said the full governance scan failed on pre-existing provider/stock findings.

## Scanner rules changed

Rules were tightened, not disabled:

1. Provider `provider_unconfigured` and `demo_skipped` checks now inspect the current return object window rather than only one line.
2. Explicit fail-closed states are allowed only when not paired with success markers.
3. Payment/refund/import/sync success without proof no longer treats the TypeScript `export` keyword itself as provider/export proof context.
4. OCR/storage placeholder success and placeholder URLs are flagged in runtime paths.

No whole check was removed. No production directory was blanket ignored. No migration/schema file was changed.

## Real blockers remaining

No governance scan blockers remain on the inspected workspace SHA.

Environment/proof gaps that remain outside this branch:

- Authenticated fetch of GitHub latest main was not possible in this container.
- DB-backed lifecycle smoke and migration replay need `TEST_DATABASE_URL`.
- Provider runtime proof for configured external providers is not claimed by this scanner-only branch.
- Branch protection / required-check enforcement is not proven from this environment.

## Final governance scan result

```text
node scripts/ci-governance-guards.mjs all
Governance/security scan passed: no blocked patterns found.
```

## Validation results

| Command | Result |
| --- | --- |
| `pnpm install` | Passed; lockfile already up to date. Warning: build scripts for `@tailwindcss/oxide` and `esbuild` remain ignored until approved. |
| `pnpm run check` | Passed. |
| `pnpm test -- --runInBand` | Passed: 84 files passed, 2 DB suites skipped because `TEST_DATABASE_URL` is not set; 499 tests passed, 12 skipped. |
| `pnpm run build` | Passed. Warnings: unset Vite analytics placeholders, analytics script not bundled without `type="module"`, and large chunks. |
| `node scripts/verify-migrations.mjs` | Passed: 49 SQL files, 46 numbered migrations, latest `0048`, 0 blockers, 0 warnings. |
| `node scripts/ci-governance-guards.mjs all` | Passed: no blocked patterns found. |
| `git diff --check` | Passed. |
| `pnpm run test:db:smoke` | Command completed with Vitest skip because `TEST_DATABASE_URL` is not set; DB-backed proof is not claimed. |

## Remaining P0/P1/P2 risks

| Severity | Risk | Status |
| --- | --- | --- |
| P0 | Known governance scan finding on inspected workspace | None remaining. |
| P1 | Authenticated latest-main proof | Not proven due GitHub authentication failure. |
| P1 | DB-backed lifecycle / migration replay proof | Not proven until `TEST_DATABASE_URL` is supplied. |
| P1 | Real provider runtime proof | Not claimed by static scanner hardening. |
| P2 | Static scanner semantic blind spots | Reduced by focused fixtures; not eliminated. |

## Safe-to-merge assessment

Safe to merge as a scanner/test/documentation hardening PR if CI is green on authenticated GitHub main. It does not add migrations, does not change `drizzle/schema.ts`, does not change `drizzle/*.sql`, and does not modify runtime business logic.
