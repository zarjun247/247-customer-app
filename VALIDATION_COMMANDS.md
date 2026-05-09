VALIDATION COMMANDS (Canonical)

Install:
- pnpm install

Lint/Typecheck:
- pnpm run check

Test:
- pnpm test
- Windows-safe: pnpm test (vitest) — avoid --runInBand on vitest versions that do not support it
- DB-backed concurrency proof (requires TEST_DATABASE_URL):
  - pnpm run test:db:bootstrap
  - pnpm run test:db:concurrency

Build:
- pnpm run build

Migrations:
- node scripts/verify-migrations.mjs

Governance scans:
- node scripts/ci-governance-guards.mjs all
- node scripts/repo-governance-audit.mjs

Stock truth scans:
- node scripts/ci-governance-guards.mjs all
- (specific guards under server/*.guard.test.ts run via pnpm test)

OCR safety scans:
- pnpm test server/ocr-production-safety.test.ts

Accounting validations:
- Manual review + run relevant tests when present

Windows-safe commands notes:
- All scripts use Node-based scanning (no ripgrep dependency)
- Avoid shell-only constructs in test/guards; prefer Node.js scanners

Expected success criteria:
- All commands exit 0
- Governance scanners produce no blocked findings
- Build artifacts produced without errors

Known temporary skips:
- DB-backed concurrency tests skipped when TEST_DATABASE_URL missing — state: "DB-backed concurrency proof still not claimed." (explicit)

Exact pass/fail meaning:
- PASS: command exit code 0 and scanner/test assertions satisfied
- FAIL: non-zero exit code or governance findings > 0
