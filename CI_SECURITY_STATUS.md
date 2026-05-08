# CI_SECURITY_STATUS

Status date: 2026-05-08

## Governance/security scanner

This repository now includes a static governance scanner at `scripts/ci-governance-guards.mjs`.

Run locally:

```bash
node scripts/ci-governance-guards.mjs all
```

## What the scanner checks

- Merge corruption: unresolved conflict markers, unresolved production/security skip markers, and unsupported production-readiness score claims.
- Provider integrity: suspicious success wording, unconfigured/demo provider states mapped to sent/synced/verified/complete states, and provider/export sync claims without nearby proof.
- Stock mutation integrity: direct stock-table mutations outside approved stock/reservation gateways and services.
- Audit-reference integrity: unsafe numeric coercion or sentinel IDs in runtime audit-sensitive paths.
- Admin/auth route integrity: admin and pharmacy routes without visible route-level admin/staff/RBAC protection.
- Secret leakage: obvious private keys, committed environment-style secrets, API tokens, Razorpay/WhatsApp/JWT/database/S3 credentials.
- Migration integrity: duplicate Drizzle migration numbers, non-monotonic migration naming, destructive SQL without explicit documentation, and mismatch markers.
- Placeholder production safety: runtime placeholders that return success, preview-only flows marked printed, and unconfigured provider flows marked complete.

## Known limitations

- This is a static string/pattern scanner, not a type-aware data-flow analyzer.
- It intentionally ignores most test fixtures so guard tests can contain unsafe examples.
- It uses conservative allowlists for stock/reservation gateway files already present on main.
- It cannot prove that every provider response is genuine; it blocks suspicious result shapes and language that commonly hide unsafe parallel work.
- Migration edit-after-creation detection is limited to static naming/content checks because git hosting metadata is not available to the scanner.

## Current results

Current local validation for this branch completed successfully:

```bash
pnpm install
pnpm run check
pnpm test -- --runInBand
pnpm run build
node scripts/ci-governance-guards.mjs all
git diff --check
```

The scanner result was:

```bash
node scripts/ci-governance-guards.mjs all
# Governance/security scan passed: no blocked patterns found.
```

## Future prompts

- Add type-aware or AST-aware route/auth scanning once route definitions are centralized.
- Add a maintained stock gateway manifest if more canonical stock services are introduced.
- Add CI annotations for each finding category.
- Add optional advisory dependency audit reporting without making `pnpm audit` a hard gate.
