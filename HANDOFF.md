# HANDOFF — PR #155 from Copilot to Claude Code

**Branch:** mega-sprint1/transactional-refund-event
**PR:** https://github.com/zarjun247/247-customer-app/pull/155
**Reason:** Copilot rate-limited at ~75% session usage mid-verification.

## What this WIP commit contains

- Silent-swallow fix on seven cross-platform guard tests:
    server/store-isolation.guard.test.ts
    server/stock-truth-certification.guard.test.ts
    server/stock-invariant.guard.test.ts
    server/stock-truth-10.guard.test.ts
    server/ocr-exception-workflow.test.ts
    server/mega-stock-reservation-truth.guard.test.ts
    server/audit-unification.guard.test.ts
- Test-shim fix on server/services/appendCommercialEventWithDb.test.ts
  (mock now matches drizzle insert(...).values(...) shape).
- server/routers/purchaseRouter.ts restored byte-for-byte to origin/main
  (TEST_INJECT_QTY_BEFORE debug comment is gone).
- Salvaged evidence Copilot collected before the rate limit:
    evidence/main-suite-results.json     — bisect of 12 failing suites
                                            against origin/main (raw form).
    evidence/guards-missing-checks-2.json — proof each converted guard
                                            fails when its watched file is
                                            missing and passes when restored.
    evidence/pr155-full-test.log          — full pnpm test output BEFORE
                                            the silent-swallow fixes.

## What Claude Code must finish to close PR #155

1. Translate evidence/main-suite-results.json into
   evidence/pr155-prexisting-bisect.txt in this exact format:

     server/foo.test.ts                  | main: FAIL | branch: FAIL | pre-existing
     server/bar.guard.test.ts            | main: PASS | branch: FAIL | INTRODUCED BY #155

   Any row marked "INTRODUCED BY #155" is a hard blocker.

2. For every pre-existing row, append to OPEN_BLOCKERS.md under a new
   section "## Pre-existing test failures observed during PR #155".

3. Re-run the full test suite on this branch (with the silent-swallow
   fixes now applied) and capture to evidence/pr155-full-test-final.log.

4. Verify all five gates:
     git diff main -- server/routers/purchaseRouter.ts        # must be empty
     pnpm run check                                            # exit 0
     pnpm run build                                            # exit 0
     node scripts/verify-migrations.mjs                        # exit 0
     node scripts/ci-governance-guards.mjs all                 # exit 0
     git diff --check                                          # exit 0

5. Post a final PR comment summarizing bisect outcome, post-fix vitest
   summary line, and links to evidence/ artifacts.

## Hard constraints for the resume session

- No changes to server/services/stockInvariant.ts (MP5 territory).
- No changes to server/routers/purchaseRouter.ts beyond the restore.
- No starting sale confirmation atomic rewrite.
- No new *_STATUS.md / *_TRUTH.md / *_AUDIT.md / *_PROOF.md files at root.
- No declaring merge-ready in writing — the human decides from the data.

## Session complete (Claude Code, 2026-05-11)

All five PR #155 closeout tasks (A-F) complete. PR moved from draft to
ready-for-review. Human approval pending before merge. Next branch in
roadmap is roadmap/mp1-runtime-incident-command — DO NOT start that
work in this session. Wait for human to merge #155 first.
