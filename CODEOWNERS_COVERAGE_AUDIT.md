# CODEOWNERS Coverage Audit

Status date: 2026-05-09
Branch: `chore/branch-protection-codeowners-enforcement-proof`

## Executive conclusion

`.github/CODEOWNERS` exists and statically covers the requested high-risk Pharmacy OS domains with `@zarjun247` as owner. However, CODEOWNERS coverage is only advisory until GitHub branch protection or rulesets require Code Owner review for `main`.

## CODEOWNERS file status

| Item | Status |
| --- | --- |
| CODEOWNERS file exists | Yes: `.github/CODEOWNERS` |
| Owners used | `@zarjun247` |
| Owner validity verified through GitHub permissions | No; repository permissions were not inspectable without authentication. |
| Coverage changed by this branch | No CODEOWNERS changes were required; existing coverage matched the requested high-risk path list. |
| GitHub Code Owner review enforcement proven | No. Branch protection API returned `401 Unauthorized`; GitHub CLI was unavailable. |

## High-risk path coverage table

| Domain | Required paths | Covered in `.github/CODEOWNERS`? | Owner |
| --- | --- | --- | --- |
| Migration/schema | `drizzle/*`, `drizzle/schema.ts` | Yes | `@zarjun247` |
| CI/governance/scripts | `.github/workflows/*`, `scripts/*` | Yes; also covers CODEOWNERS plus governance/migration/verify/release script patterns | `@zarjun247` |
| Stock/reservation/inventory | `server/services/stock*`, `server/services/stockInvariant*`, `server/services/reservation*`, `server/routers/inventory*`, `server/routers/purchase*`, `server/routers/sales*`, `server/routers/cart*` | Yes | `@zarjun247` |
| Payment/refund/webhook | `server/services/payment*`, `server/services/refund*`, `server/services/creditNote*`, `server/routers/payment*`, `server/routers/refund*`, `server/routers/webhook*` | Yes | `@zarjun247` |
| Compliance/H1/Rx/legal | `server/services/compliance*`, `server/services/prescription*`, `server/services/h1*`, `server/services/regulated*`, `server/routers/prescription*`, `server/routers/compliance*`, `server/services/pharmacy*`, `server/pharmacy*` | Yes | `@zarjun247` |
| Provider/storage/security/privacy/auth | `server/services/provider*`, `server/services/storage*`, `server/services/privacy*`, `server/services/auth*`, `server/middleware/*`, `server/_core/*`, `server/services/abuse*`, `server/services/rateLimit*` | Yes; also covers `server/routers/health*` | `@zarjun247` |
| Accounting/commercial/Tally | `server/services/commercial*`, `server/services/accounting*`, `server/services/tally*`, `server/services/supplier*`, `server/routers/reports*`, `server/routers/accounting*` | Yes | `@zarjun247` |
| Frontend route/security | `client/src/routes/*`, `client/src/App.tsx`, `client/src/pages/admin/*`, `client/src/pages/pharmacy*` | Yes | `@zarjun247` |

## Missing coverage

No missing coverage was found for the explicit path list in the mission. This audit did not prove that every future high-risk path is covered; new runtime domains must add CODEOWNERS rules as they are introduced.

## Manual owner replacement guidance

If `@zarjun247` is not the correct production code owner or lacks write/admin access, replace it with a real GitHub team or maintainer account before enforcing Code Owner review. Recommended production pattern:

```text
# Example only; replace with real write-access teams before use.
/drizzle/* @zarjun247/pharmacy-platform-owners
/drizzle/schema.ts @zarjun247/pharmacy-platform-owners
/server/services/payment* @zarjun247/pharmacy-platform-owners @zarjun247/security-owners
/server/services/compliance* @zarjun247/pharmacy-platform-owners @zarjun247/compliance-owners
.github/workflows/* @zarjun247/platform-owners
scripts/* @zarjun247/platform-owners
```

Do not add nonexistent teams or owners to CODEOWNERS; invalid owners create false confidence and may fail GitHub validation.

## Enforcement requirements

For CODEOWNERS to become a hard gate on `main`, GitHub must prove all of the following:

1. `main` is protected by a branch protection rule or ruleset.
2. Pull requests are required before merge.
3. At least one approval is required.
4. **Require review from Code Owners** is enabled.
5. Stale approvals are dismissed when new commits are pushed.
6. Required status checks and branch freshness are enforced.
7. Direct push, force push, and branch deletion are blocked or restricted to a documented emergency path.

## Changes made in this audit branch

- Created `BRANCH_PROTECTION_ENFORCEMENT_PROOF.md` to record verification evidence, unverified settings, manual setup steps, and remaining risks.
- Created this `CODEOWNERS_COVERAGE_AUDIT.md` to document high-risk path coverage and enforcement limitations.
- Added light pointers to merge governance and current-main truth documents.
- Did not change `.github/CODEOWNERS`, runtime code, server services/routers, client runtime files, schema, migrations, package manifests, or lockfiles.
