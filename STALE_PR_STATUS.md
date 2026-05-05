# STALE_PR_STATUS

- Old PRs must not be merged casually.
- PR #41 merged Prompt 12 and is treated as the authoritative integration baseline.
- PR #42 is duplicate/superseded by PR #41 and should be closed (do not merge).
- Any unique content from stale PRs must be extracted via a fresh branch from latest `main` and re-opened as a new PR.
- Next prompt remains: `feat/barcode-production-ux`.
- PR #19 is presumed superseded by later audit-unification / stock / mega-prompt PRs unless manually re-reviewed.
- Older PRs #2–#11, if still open, should be marked superseded/needs manual review unless they are clearly already merged/closed.
- Any stale PR touching old audit, stock, compliance, or router architecture must be re-reviewed against latest main before merge.
- Note: "PR #19 superseded by PR #20+ / later audit-unification, stock invariant, and mega-prompt hardening PRs unless manually re-reviewed."

## GitHub stale PR query status
- Unable to query remote PR metadata in this environment because no git remote is configured locally.
- Classification placeholders until GitHub data is available:
  - safe to close: unknown
  - needs manual review: likely PRs touching audit/stock/compliance/router architecture
  - superseded: likely older architecture PRs including presumed PR #19
  - unknown: all others pending API/CLI verification

- 2026-05-05 update: PR #44, #46, and #47 are stale/duplicate after merge of PR #48 and must not be merged directly.
