# CURRENT_MAIN_TRUTH_V2


## 2026-05-09 migration sequence collision surgery update

- Branch `fix/migration-sequence-collision-surgery` repairs latest local main-equivalent migration prefix collisions discovered after PRs #85/#87/#97/#98/#99.
- Corrected numbered migration tail is now `0045_provider_webhook_events.sql`, `0046_commercial_event_ledger.sql`, `0047_worker_jobs.sql`, and `0048_rbac_staff_session_governance.sql`; next reserved migration number is `0049`.
- No parallel schema PR may merge without reading `MIGRATION_AUDIT_STATUS.md` first. Open PRs adding stale duplicate migration numbers must be rebuilt from latest main-equivalent history. PRs #94/#95/#96 style migrations must use `0049` or later; duplicated stale PRs must not merge raw.
- Fresh/existing DB migration proof is not claimed here because no `TEST_DATABASE_URL` or existing database URL is configured in this container.

Canonical current-main audit for Wave 0 / Prompt 1 as of 2026-05-08.

> This is a docs/control and static-inspection pass only. It does not implement runtime feature changes and does not certify production readiness.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `chore/wave0-current-main-audit-v2` |
| Base SHA inspected | `2b28e7410d40f5a02d258dfcb80b51b51666ca02` |
| Latest local main-equivalent merge visible | `Merge pull request #83 from zarjun247/codex/add-privacy-and-consent-handling-features` |
| Remote-main refresh attempt | Attempted `git fetch origin main --prune`, `git checkout -B main origin/main`, and `git pull --rebase origin main`; fetch/pull failed because HTTPS GitHub auth was unavailable in this environment (`could not read Username for 'https://github.com': No such device or address`). |
| Remote/open PR verification | Not verifiable from this container: no authenticated GitHub CLI and GitHub HTTPS fetch requires credentials. |
| Audit type | Documentation/control + static inspection only. |

## Latest merged PRs visible in local history

The following merge commits are visible from the inspected local main-equivalent history:

| PR | Local merge subject | Local merge SHA |
| --- | --- | --- |
| #83 | Add privacy and consent handling features | `2b28e7410d40f5a02d258dfcb80b51b51666ca02` |
| #81 | Audit and improve database indexes | `d4e2b77` |
| #82 | Add API abuse protection for high-risk routes | `a4fb273` |
| #77 | Add MySQL database lifecycle for testing | `cf6514d` |
| #79 | Add HTTP security hardening middleware | `f17335a` |
| #78 | Create provider contract matrix and guards | `a3605ae` |
| #75 | Rebase PR #66 for product master runtime gates | `2f2b5eb` |
| #74 | Create current-main truth and stale PR control docs | `6d91e4d` |
| #73 | Add commercial lifecycle test harness | `924e319` |
| #71 | Create runbooks for deployment and monitoring | `e906b89` |
| #72 | Add credit-note lifecycle integration | `8353f55` |
| #67 | Add reconciliation reports and hygiene guards | `8fec710` |
| #70 | Implement immutable invoice snapshots | `677d7d0` |
| #69 | Add balanced journal batch functionality | `9fdf521` |
| #63 | Harden payment verification and webhook | `3781d26` |
| #65 | Harden WhatsApp notification behavior | `7221641` |
| #64 | Implement Tally export audit and safety features | `270fbba` |
| #60 | Implement OCR purchase exception workflow | `530dddb` |
| #61 | Rebuild barcode production UX on latest main | `17a4d38` |
| #58 | Implement supplier ledger ageing reconciliation | `fd97b3b` |

## Open PRs visible from GitHub

Open PR state is **not verifiable** in this environment. The repository remote requires GitHub credentials for HTTPS fetch, and `gh` is not installed. This audit therefore classifies PRs from local merge history plus existing repository control documents, not from live GitHub state.

## Conflicted/stale PRs to treat as unsafe until refreshed

| PR / domain | Current classification | Rationale |
| --- | --- | --- |
| #66 product-master runtime gates | Already merged by superseding PR #75, based on local history | Do not merge the original #66 branch raw if it is still open; close as superseded after confirming live GitHub state. |
| #68 accounting duplicate | Needs manual review; likely close as superseded if still open | Later accounting/reconciliation work is visible via #69, #64, #67, #58, and commercial lifecycle proof via #73. Do not merge raw. |
| #76 unknown/stale between #75 and #77 | Needs manual review | Not visible in local merge history and live PR state could not be checked. If still open, rebase from latest main and verify domain ownership before review. |
| #80 unknown/stale between #79 and #81/#82 | Needs manual review | Not visible in local merge history and live PR state could not be checked. If still open, rebase from latest main and verify it does not collide with #81/#82/#83. |
| Older barcode PRs (#46/#47 or similar) | Close as superseded after live confirmation | Barcode production UX was rebuilt in #61 and barcode scan truth already exists; stale branches risk reverting newer behavior. |
| Older payment PRs (#62 or similar) | Close as superseded after live confirmation | Payment verification/webhook hardening was merged in #63; stale branches must not be merged raw. |
| Older accounting/security duplicates | Close as superseded or rebuild from latest main | Later current-main work covers accounting batches, Tally proof, reconciliation reports, security middleware, abuse guards, and privacy/session foundations. |

## Current package scripts

From `package.json`:

| Script | Command |
| --- | --- |
| `dev` | `NODE_ENV=development tsx watch server/_core/index.ts` |
| `build` | `vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` |
| `start` | `NODE_ENV=production node dist/index.js` |
| `check` | `tsc --noEmit` |
| `format` | `prettier --write .` |
| `test` | `vitest run` |
| `db:push` | `drizzle-kit generate && drizzle-kit migrate` |
| `test:db:bootstrap` | `tsx scripts/bootstrap-test-db.ts` |
| `test:db:smoke` | `vitest run server/mysql-db-lifecycle.integration.test.ts` |


## Branch protection status (2026-05-09)

- Branch protection enforcement requirements are now implemented in repository documentation at `BRANCH_PROTECTION_ENFORCEMENT_STATUS.md`.
- GitHub-side branch protection remains **pending manual settings proof** from repository administrators because this environment has no `origin` remote, no `gh` CLI, and no authenticated GitHub branch-protection API access.
- The branch-protection proof pack is required before race-mode, multi-store beta, or unsupervised production claims because stale PRs and duplicate migration-prefix PRs must be blocked at the merge gate.
- Current doctrine: docs-only governance PRs may run in parallel, but schema/migration PRs must pause until migration-number surgery is complete and branch protection requires the migration uniqueness checks.

- Local validation on this proof branch currently exposes the migration-collision P0: duplicate `0045` and `0046` migration prefixes are present in the checkout, causing migration uniqueness guards to fail. This docs-only PR intentionally does not edit migration SQL; migration surgery remains a separate required fix.

## Current CI workflow files

| Workflow file | Jobs inspected |
| --- | --- |
| `.github/workflows/ci.yml` | `check`, `test`, `build`, `migration-smoke`, `security-env-guards`, `placeholder-guards`, `mysql-db-lifecycle` |

## Validation results

| Command | Result | Notes / warnings | Classification |
| --- | --- | --- | --- |
| `pnpm install` | Passed | Lockfile was up to date. pnpm emitted a Node `[DEP0169] url.parse()` deprecation warning and an ignored-build-scripts warning for `@tailwindcss/oxide` and `esbuild`. | Pre-existing/environmental warning; docs-only PR did not add dependencies. |
| `pnpm run check` | Passed | TypeScript check completed with no errors. | Clean for this audit branch. |
| `pnpm test -- --runInBand` | Passed | 77 test files passed, 1 integration file skipped; 405 tests passed, 1 skipped. MySQL lifecycle integration skipped because `TEST_DATABASE_URL` was not set. OAuth test emitted expected missing `OAUTH_SERVER_URL` log while passing. | Environment-limited skip; no introduced runtime changes. |
| `pnpm run build` | Passed | Vite warned that analytics placeholder env variables are not defined and that a JS chunk exceeds 500 kB. | Pre-existing build warnings; docs-only PR did not alter runtime bundle. |
| `git diff --check` | Passed | No whitespace errors reported after markdown files were created. | Clean for this audit branch. |

## Known build/typecheck/test warnings

- `pnpm install`: Node deprecation warning for `url.parse()` and pnpm ignored-build-scripts warning for `@tailwindcss/oxide` and `esbuild`.
- `pnpm test -- --runInBand`: `server/mysql-db-lifecycle.integration.test.ts` skipped without `TEST_DATABASE_URL`; OAuth phone-session test logs missing `OAUTH_SERVER_URL` but passes.
- `pnpm run build`: unset `%VITE_ANALYTICS_ENDPOINT%` and `%VITE_ANALYTICS_WEBSITE_ID%` placeholders in `client/index.html`, non-module analytics script warning, and large chunk warning.

## Production readiness score by area

Conservative scores for the inspected main-equivalent SHA:

| Area | Score | Conservative read |
| --- | ---: | --- |
| Code maturity | 7.4 / 10 | Broad domain coverage exists, but runtime hardening waves are still needed. |
| Proof maturity | 6.1 / 10 | Unit/guard coverage is substantial; live CI, external provider proof, deployment proof, and DB lifecycle proof remain incomplete in this environment. |
| Security | 6.2 / 10 | Security guardrails, HTTP hardening, privacy/session work, and abuse guards exist; live penetration/secret/session evidence remains pending. |
| Compliance | 6.4 / 10 | Prescription/H1/privacy/accounting controls are represented; legal/SOP and live audit evidence still required. |
| Inventory truth | 7.0 / 10 | Stock invariant, reservation, barcode, batch, and invoice sequence foundations are present; race/load proof remains limited. |
| Commercial lifecycle truth | 6.8 / 10 | Commercial lifecycle tests, refunds, credit notes, invoices, journals, supplier ageing, reconciliation, and Tally proof exist; live end-to-end reconciliation still needed. |
| AI readiness | 4.3 / 10 | OCR/AI decision tables and guardrails exist; AI must remain read-only/reviewer-assisted and not dispense or approve. |
| Investor demo readiness | 8.0 / 10 | Suitable for supervised, caveated demo flows only. |
| Controlled pilot readiness | 6.5 / 10 | Possible only with limited scope, manual fallback, and close operator monitoring. |
| Multi-store beta readiness | 5.2 / 10 | Not ready until live DB lifecycle, deployment, observability, security, and migration governance evidence improves. |
| Unsupervised production readiness | 3.8 / 10 | Not ready for unsupervised, high-concurrency production operation. |

## What was inspected

- Git history and current SHA.
- Package scripts and dependency manifest.
- CI workflow configuration.
- Drizzle migration filenames, numeric order, metadata journal, and destructive-operation scan.
- `drizzle/schema.ts` table declarations by static inspection.
- Existing status/control documents for stale PR context.
- Required validation commands listed above.

## What was not verifiable

- Live GitHub open PR list, conflict labels, branch freshness, and current protected-main SHA.
- Live CI status for GitHub Actions.
- GitHub branch protection settings.
- Provider credentials, real payment settlement, SMS/WhatsApp provider behavior, S3 storage, or production secrets.
- Live MySQL migration execution without `TEST_DATABASE_URL`.
- Production deployment, backup/restore proof, observability telemetry, and real-store UAT evidence.

## Next recommended prompts

1. **GitHub-side stale PR closure pass:** with authenticated GitHub access, close or label #66/#68/#76/#80 and older duplicates according to `STALE_PR_STATUS_V2.md`.
2. **Migration governance repair/proof prompt:** decide whether migration gaps 0030/0031/0033 are intentional historical skips or should be documented in metadata; do not renumber without maintainer approval.
3. **DB lifecycle proof prompt:** run `pnpm run test:db:bootstrap` and `pnpm run test:db:smoke` against a clean MySQL 8.4 instance.
4. **Deployment proof prompt:** capture production build, healthcheck, environment, backup/restore, and smoke-test evidence without feature changes.
5. **Runtime hardening prompts:** proceed only in safe parallel domains defined in `PARALLEL_EXECUTION_CONTROL.md`.

## Migration surgery control pointer

- `MIGRATION_SURGERY_CONTROL_ROOM.md` is the active control room for the duplicate-prefix migration blocker.
- Schema PR freeze is active until migration surgery lands and the migration audit is green on latest main.
- Use the control room before reviewing any PR that touches `drizzle/schema.ts` or `drizzle/*.sql`.

## Dependency security patch truth — 2026-05-09

Branch `fix/dependency-supply-chain-security-patch` starts from checked-out SHA `200fafcc20451cc43e8d6272588ec7e26e12d9c8`; remote GitHub main freshness could not be verified because credentials were unavailable in the container. The branch changes dependency manifests, lockfile, CI pnpm version pinning, and dependency-security documentation only. It does not change runtime business logic, server routers/services, Drizzle schema, SQL migrations, or migration files.

After the patch, `pnpm audit` still fails truthfully with 0 critical, 2 high, and 3 moderate advisories. The remaining high advisories are lodash-family transitive findings that require a separate Recharts/streamdown-Mermaid upgrade decision or upstream package releases; this branch must not be represented as security green.
