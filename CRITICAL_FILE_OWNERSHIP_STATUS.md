# CRITICAL_FILE_OWNERSHIP_STATUS

Status date: 2026-05-09

## Summary

This governance-only change adds a critical-file CODEOWNERS policy for high-risk pharmacy OS areas. It does not change runtime business logic, server services, routers, client runtime files, schema, migrations, package manifests, or lockfiles.

## CODEOWNERS status

| Item | Status |
| --- | --- |
| `.github/CODEOWNERS` existed before this branch | No; repository inspection found no existing CODEOWNERS file under `.github/`. |
| `.github/CODEOWNERS` action in this branch | Added a conservative critical-file ownership map. |
| Owner used | `@zarjun247` |
| Owner confidence | Inferred from visible repository merge history and branch references. If this handle is not the active maintainer/team, replace it before enabling code-owner enforcement. |
| Branch protection enforcement | Not proven in this container. GitHub branch protection/rulesets must still enable **Require review from Code Owners** for this policy to block merges. |

## High-risk domains protected

The CODEOWNERS policy protects these deliberate-review domains:

1. Critical migration/schema truth.
2. CI and governance scripts/workflows.
3. Stock, inventory, purchase, sale, and reservation truth.
4. Payment, refund, credit note, and webhook lifecycle.
5. Compliance, H1, prescription, regulated, and pharmacy/legal safety.
6. Security, auth, privacy, provider, storage, middleware, and core server infrastructure.
7. Accounting, Tally, reporting, and commercial lifecycle.
8. Frontend route, admin, and pharmacy UI security boundaries.

## Files and patterns covered

```text
/drizzle/*
/drizzle/schema.ts
/.github/workflows/*
/scripts/*
/scripts/*governance*
/scripts/*migration*
/scripts/*verify*
/server/services/stockInvariant*
/server/services/reservation*
/server/routers/inventoryRouter*
/server/routers/purchaseRouter*
/server/routers/salesRouter*
/server/services/payment*
/server/routers/payment*
/server/services/refund*
/server/services/creditNote*
/server/services/compliance*
/server/services/prescription*
/server/services/h1*
/server/services/regulated*
/server/routers/prescription*
/server/pharmacy*
/server/services/provider*
/server/services/privacy*
/server/services/auth*
/server/middleware/*
/server/_core/*
/server/services/storage*
/server/routers/healthRouter*
/server/services/accounting*
/server/services/tally*
/server/services/commercial*
/server/routers/reportsRouter*
/client/src/routes/*
/client/src/App.tsx
/client/src/pages/admin/*
/client/src/pages/pharmacy*
```

## Files intentionally not covered

This first policy is intentionally narrow. It does not broadly own every repository file, every server router, every client component, every documentation file, every test file, every asset, or package manifests. The goal is to gate the most safety-sensitive files without creating a noisy whole-repository ownership rule.

Package manifests and lockfiles are not covered by this change because this PR is explicitly not modifying them. Maintainers may add dependency ownership in a future governance PR after deciding the correct owner/team.

## Manual GitHub setting required

After merge, repository administrators must enable code-owner enforcement for the protected branch/ruleset:

1. Open GitHub branch protection or rulesets for `main`.
2. Require pull request reviews before merging.
3. Enable **Require review from Code Owners**.
4. Confirm the required status checks are current and include governance/security scans where available.
5. Verify `@zarjun247` is a valid user/team with repository access, or replace the owner before enforcement.

Until that setting is enabled, CODEOWNERS can request reviewers but this document does not prove that GitHub will block a merge lacking code-owner approval.

## Limitations

- Live GitHub branch protection, rulesets, required status checks, and code-owner enforcement were not verifiable from this container.
- Live PR conflicts and open PR overlap were not resolved by this branch.
- CODEOWNERS pattern coverage is conservative and may need future expansion for newly added critical files.
- The policy does not replace required migration audits, stock invariant proof, payment idempotency review, pharmacist/legal review, or governance scans.

## Validation results

Validation must be reported from the branch after edits are complete:

- `pnpm install`: passed; pnpm reported the lockfile was up to date and warned that build scripts for `@tailwindcss/oxide` and `esbuild` were ignored pending `pnpm approve-builds`.
- `pnpm run check`: passed.
- `pnpm test -- --runInBand`: failed on pre-existing duplicate migration-number guards (`0045`, `0046` duplicates); this branch did not modify migrations and does not resolve migration surgery.
- `pnpm run build`: passed with existing Vite warnings about undefined analytics placeholders and large chunks.
- `git diff --check`: passed.
