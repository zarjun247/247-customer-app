# CRITICAL_FILE_OWNERSHIP_STATUS

Status date: 2026-05-09
Branch: `chore/critical-file-ownership-codeowners-review-gates`

## Inspection summary

| Item | Status |
| --- | --- |
| Latest local main-equivalent SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| Latest visible merge at inspected SHA | `Merge pull request #107 from zarjun247/codex/create-migration-surgery-control-room` |
| Remote refresh status | Attempted to configure `origin` as `https://github.com/zarjun247/247-customer-app.git` and fetch `origin/main`, but GitHub required credentials in this container. This branch is based on the local main-equivalent checkout at the SHA above. |
| `.github/CODEOWNERS` existed before this branch | No. |
| `.github/CODEOWNERS` added/updated by this branch | Added. |
| Owner used | `@zarjun247` as the temporary repository owner, inferred from the repository path `zarjun247/247-customer-app` and public GitHub user lookup. Maintainers must confirm this account has write/admin rights before relying on Code Owner enforcement. |
| PR #104 inspected | Attempted unauthenticated GitHub API and web/search inspection. GitHub returned `404` for the API pull request endpoint and public search did not expose the PR. |
| PR #104 classification | **Rebuild/supersede from latest main unless authenticated review proves it is current, clean, docs/governance-only, and owner-valid.** Do not merge a stale CODEOWNERS PR blindly. If #104 still exists, compare it against this branch and close it as superseded unless it contains a better valid owner/team assignment. |
| Runtime code changed | No. |
| Migrations/schema changed | No. |
| Branch protection status | Not verified. Manual GitHub settings/API proof is still required. |

## CODEOWNERS status

This branch adds `.github/CODEOWNERS` with high-risk Pharmacy OS ownership rules for `@zarjun247`.

The file becomes an actual merge gate only after maintainers enable GitHub branch protection/repository ruleset enforcement for `main` with:

> Require review from Code Owners

Exact GitHub UI path:

> Settings → Branches → Branch protection rules → main → Require review from Code Owners

Do not claim Code Owner review is enforced until GitHub UI/API evidence confirms the setting is enabled and `@zarjun247` has sufficient repository permissions.

## Protected domains

The CODEOWNERS rules cover these high-risk domains:

1. Migration/schema.
2. CI/governance/scripts.
3. Stock/reservation/inventory.
4. Payment/refund/webhook.
5. Compliance/H1/Rx/legal.
6. Provider/storage/security/privacy/auth.
7. Accounting/commercial/Tally.
8. Frontend route/security.

## Exact critical paths covered

### Migration/schema

- `drizzle/*`
- `drizzle/schema.ts`

### CI/governance/scripts

- `.github/CODEOWNERS`
- `.github/workflows/*`
- `scripts/*`
- `scripts/*governance*`
- `scripts/*migration*`
- `scripts/*verify*`
- `scripts/*release*`

### Stock/reservation/inventory

- `server/services/stockInvariant*`
- `server/services/stock*`
- `server/services/reservation*`
- `server/routers/inventory*`
- `server/routers/purchase*`
- `server/routers/sales*`
- `server/routers/cart*`

### Payment/refund/webhook

- `server/services/payment*`
- `server/services/refund*`
- `server/services/creditNote*`
- `server/routers/payment*`
- `server/routers/refund*`
- `server/routers/webhook*`

### Compliance/H1/Rx/legal

- `server/services/compliance*`
- `server/services/prescription*`
- `server/services/h1*`
- `server/services/regulated*`
- `server/routers/prescription*`
- `server/routers/compliance*`
- `server/pharmacy*`
- `server/services/pharmacy*`

### Provider/storage/security/privacy/auth

- `server/services/provider*`
- `server/services/storage*`
- `server/services/privacy*`
- `server/services/auth*`
- `server/middleware/*`
- `server/_core/*`
- `server/routers/health*`
- `server/services/abuse*`
- `server/services/rateLimit*`

### Accounting/commercial/Tally

- `server/services/commercial*`
- `server/services/accounting*`
- `server/services/tally*`
- `server/services/supplier*`
- `server/routers/reports*`
- `server/routers/accounting*`

### Frontend route/security

- `client/src/routes/*`
- `client/src/App.tsx`
- `client/src/pages/admin/*`
- `client/src/pages/pharmacy*`

## Remaining gaps

- GitHub branch protection/repository rulesets were not verifiable from this container; maintainers must enable and prove `Require review from Code Owners` on `main`.
- `@zarjun247` exists as a GitHub user, but this container cannot verify repository write/admin permission. If a different maintainer team is the true owner, replace `@zarjun247` with the verified visible team/user before relying on enforcement.
- PR #104 could not be authenticated/inspected. It should not merge as-is unless maintainers prove it is current against `main`, docs/governance-only, conflict-free, and owner-valid.
- CODEOWNERS patterns are intentionally conservative but may need future expansion if critical files use naming that does not match the listed prefixes.

## Validation results

Validation completed for this governance-only branch:

- `pnpm install` passed with pnpm warnings that build scripts for `@tailwindcss/oxide` and `esbuild` were ignored.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed: 84 files passed, 1 MySQL lifecycle integration file skipped because `TEST_DATABASE_URL` was not set; 490 tests passed, 1 skipped.
- `pnpm run build` passed with existing Vite warnings for undefined analytics placeholders and chunk size.
- `node scripts/verify-migrations.mjs` passed: 49 files, 46 numbered migrations, latest `0048`, 0 blocking issues, 0 warnings.
- `git diff --check` passed.
