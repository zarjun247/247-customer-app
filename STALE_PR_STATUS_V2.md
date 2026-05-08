# STALE_PR_STATUS_V2

Canonical stale/open PR control for Wave 0 / Prompt 1 as of 2026-05-08.

> Do not merge stale PRs raw. Salvage unique work by rebuilding from latest main after live GitHub review.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `chore/wave0-current-main-audit-v2` |
| Base SHA inspected | `2b28e7410d40f5a02d258dfcb80b51b51666ca02` |
| Remote verification | Not verifiable: GitHub HTTPS fetch required credentials and `gh` is unavailable. |
| Validation results | `pnpm install` passed with warnings; `pnpm run check` passed; `pnpm test -- --runInBand` passed with MySQL integration skipped; `pnpm run build` passed with Vite warnings; `git diff --check` passed. |

## Classification table

| PR / group | Classification | Action | Reasoning |
| --- | --- | --- | --- |
| #66 product-master runtime gates | Already merged by superseding PR #75, based on local history | If original #66 is still open, close as superseded; do not merge raw. | Local history includes `Merge pull request #75 ... rebase-pr-#66-for-product-master-runtime-gates`. |
| #68 accounting duplicate | Needs manual review; likely close as superseded | Confirm live state. If still open and older than #69/#64/#67/#73, close as superseded unless unique work is manually extracted into a fresh branch. | Later local merges cover accounting journal batches, Tally export proof, reconciliation reports, and commercial lifecycle testing. |
| #76 | Needs manual review | Confirm live state, changed files, and conflict status. If it touches runtime/schema/migrations/payment/stock/accounting/security, rebuild from latest main or rebase before review. | Not visible in local merge history; no live GitHub state available. |
| #80 | Needs manual review | Confirm live state, changed files, and conflict status. If it overlaps #81/#82/#83 domains, rebuild from latest main or rebase before review. | Not visible in local merge history; no live GitHub state available. |
| Older duplicate barcode PRs (#46/#47 or similar) | Close as superseded | Close after confirming no unique change must be salvaged. | Barcode scan truth and rebuilt barcode production UX are already visible in local history. |
| Older payment fail-closed PRs (#62 or similar) | Close as superseded | Close after confirming later payment hardening covers intended behavior. | Payment provider fail-closed and webhook verification hardening are visible through later merges. |
| Older accounting/reconciliation duplicates | Close as superseded or rebuild from latest main | Close stale duplicates; create a new latest-main branch only for unique missing controls. | Accounting and reconciliation domains have many later merges and are high collision risk. |
| Older security/privacy duplicates | Close as superseded or active rebase only after review | Do not merge stale security branches without full review; preserve latest HTTP security, abuse protection, privacy, and session changes. | Latest local merges #79/#82/#83 are security/privacy sensitive. |

## Exact GitHub close/rebase instructions

This environment cannot close PRs directly. A maintainer with GitHub access should:

1. Open PRs #66, #68, #76, #80, plus older duplicate barcode/payment/accounting/security PRs.
2. Confirm each PR is still open and has not already been merged or closed.
3. Review changed files and conflict status.
4. For close candidates, apply `superseded` plus a domain label such as `barcode`, `payment`, `accounting`, `security`, or `product-master`.
5. Comment: `Superseded by later current-main work. Do not merge this branch raw; salvage any unique changes via a fresh branch from latest main.`
6. Close superseded PRs.
7. For PRs classified as active/rebase, require: latest-main rebase, changed-files review, no migration collision, and successful `pnpm install`, `pnpm run check`, `pnpm test -- --runInBand`, `pnpm run build`, and `git diff --check`.

## What was inspected

- Local merge history for PR numbers and domains.
- Existing stale PR/status documents.
- Current package scripts, CI workflow, migrations, and validation output.

## What was not verifiable

- Live PR open/closed state.
- Live conflict status.
- PR labels, review status, and check status.
- Whether #76/#80 contain unique changes worth salvaging.

## Next recommended prompts

1. Authenticated GitHub stale PR closure prompt.
2. Rebuild-from-latest-main prompt for any unique #76/#80 changes after changed-files review.
3. Migration-collision preflight prompt before any stale runtime PR is revived.
