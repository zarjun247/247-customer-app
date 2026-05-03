# PRODUCTION CI STATUS

## Current baseline
- Package manager: `pnpm` (`packageManager` pinned in `package.json`).
- Install command: `pnpm install --frozen-lockfile` (lockfile present and compatible).
- Typecheck/check command: `pnpm run check` (`tsc --noEmit`).
- Test command: `pnpm test -- --runInBand` (`vitest run --runInBand`).
- Build command: `pnpm run build` (Vite client build + esbuild server bundle).
- Migration/smoke command availability: no dedicated migration smoke command existed before this PR; only `db:push` (`drizzle-kit generate && drizzle-kit migrate`) which is DB-backed.

## Existing workflow state before this PR
- No `.github/workflows/*.yml` files were present.

## Gaps addressed in this PR
- Added GitHub Actions CI workflow for pull requests and main pushes.
- Added static migration smoke guard (duplicate/invalid numbering, empties, schema existence, latest migration visibility).
- Added placeholder/fake-success production guard with explicit allowlist behavior.
- Confirmed Prompt 2 security guard coverage is included under test execution.

## Guard family coverage executed by `pnpm test -- --runInBand`
- Security/env & auth: `security-env`, `worker-security`, `storage-access`, `auth-otp`, `security-procedure`.
- Inventory/stock/compliance: `stock-invariant`, `reconciliation-truth`, `compliance-gate`, `margin-guard`.
- Audit and operations: `audit-unification`, `ops-bridge`, `ocr-purchase`, `supplier-ledger`.
- Customer/mobile/barcode/discount: `customer-mobile`, `barcode-scan`, `discount-code.foundation`.

## Remaining CI hardening gaps
- DB-backed migration smoke in ephemeral CI database is still pending.
- Branch protection rules must be enforced in GitHub repository settings (documented in `BRANCH_PROTECTION_STATUS.md`).
