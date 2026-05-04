# STALE_PR_STATUS

## Policy rule
Stale PRs must **not** be merged into `main`; extract valuable work only through a fresh branch from latest `main`.

## 2026-05-04 reconciliation status
- GitHub live execution status: blocked in this local environment (no `origin` remote configured, `gh` CLI unavailable).
- Therefore, PR closure actions below are recorded as the required reconciliation runbook to execute on connected GitHub.

## Required stale PR audit ledger

| PR | Title | Classification | Action taken | Reason |
|---|---|---|---|---|
| #41 | Prompt 12 product master/migration | A (merged truth) | verify as merged on GitHub | establishes Prompt 12 completion baseline |
| #42 | duplicate/conflicted product master/migration branch | B (duplicate) | close as superseded by #41 with standard comment | duplicate of merged Prompt 12 work |
| #2 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #3 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #4 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #5 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #6 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #7 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #8 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #9 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #10 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #11 | legacy stale PR | E (manual verification required) | pending GitHub diff audit, then close if superseded | remote metadata not available locally |
| #19 | older audit-unification era PR | D (unsafe/stale candidate) | verify diff against current main, close unless unique extractable delta exists | likely superseded by later production-hardening chain |

## Unique material requiring future extraction
- None confirmed yet from PR #2–#11 or #19 because GitHub diff content is unavailable in this environment.
- If unique material is discovered, extract through a fresh branch from latest `main` only (no stale-branch merge).

## Required close comments
- For PR #42:
  - "Closing this PR as superseded.

    The Product Master Normalization + Real Store Migration work has already been merged via PR #41.

    Do not resolve or merge this duplicate branch.
    Next production prompt remains:
    feat/barcode-production-ux"
- For fully superseded stale PRs:
  - "Closing as superseded by later merged production-hardening PRs.
    Do not merge this stale branch into main."
