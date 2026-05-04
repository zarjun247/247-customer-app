# COMMERCIAL_FLOW_TEST_STATUS

## Test infrastructure audit
- Runner: Vitest via `pnpm test`.
- DB-backed tests: not currently wired as isolated test DB bootstrap/teardown harness was not found in repo-level test setup.
- Test DB availability: runtime DB exists for app code, but deterministic integration test database lifecycle is not present.
- Router invocation: direct router function execution is feasible, but current guard pattern is static/source-level for reliability in CI.
- Service isolation: feasible (existing guard and service tests follow this pattern).
- Limitations: no dedicated ephemeral DB fixture lifecycle (migrate/seed/rollback per test), so strongest-possible service/static integration posture is used without faking DB integration.

## Coverage summary
- Purchase -> stock -> supplier payable: guarded in `server/commercial-flow.integration.test.ts` + `server/commercial-flow.guard.test.ts`.
- Sale -> stock -> payment -> report: guarded for sale confirm/idempotency/stock + normalized report shape.
- Barcode scan lookup-only: scan block explicitly asserted non-mutating pre-confirm.
- Cancellation/return: partial via sale flow + static guard posture; full DB lifecycle remains gap.
- Stock audit correction: duplicate completion posture statically guarded in inventory router.
- Regulated/H1 posture: compliance gate + H1 register path presence guarded.
- Reservation/app/POS posture: canonical availability usage on sale path guarded.
- Report shape: `{ rows, totals, csvData }` markers asserted for migrated report endpoints.

## Missing integration gaps
- Full DB-backed commercial lifecycle assertions (purchase/sale/return/payment/report rows) remain pending dedicated test DB harness.
- Regulated release/H1 data correctness requires next prompt feat/regulated-release-prescription-vault.

## Validation results
- See command results in PR checks and local run summary.

## Next recommended prompt
`feat/regulated-release-prescription-vault`
