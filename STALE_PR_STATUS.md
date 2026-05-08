# STALE_PR_STATUS

Canonical stale/open PR control ledger as of 2026-05-08.

> **Environment note:** this branch could inspect local git history but could not query live GitHub PR metadata because the checkout has no configured git remote and GitHub CLI/auth is unavailable. The classifications below therefore follow the requested stale-PR policy and locally visible merge history unless a maintainer verifies newer GitHub state.

## 1. Current classification summary

| PR | Classification | Action | Reason / control note |
| --- | --- | --- | --- |
| `#44` | Superseded / close | Close or label `superseded` after maintainer confirmation | Expected stale duplicate after later accepted work. Do not merge directly into current main. |
| `#46` | Superseded barcode duplicate / close | Close or label `superseded, barcode-duplicate` after maintainer confirmation | Barcode duplicate expected to be superseded by later barcode/mainline work. Do not merge directly. |
| `#47` | Superseded barcode duplicate / close | Close or label `superseded, barcode-duplicate` after maintainer confirmation | Barcode duplicate expected to be superseded by later barcode/mainline work. Do not merge directly. |
| `#62` | Superseded payment fail-closed duplicate / close | Close or label `superseded, payment-duplicate` after maintainer confirmation | Payment fail-closed work is expected to have already merged via a later PR; merging this branch can revert newer payment behavior. |
| `#66` | Active / conflicted if still open | Rebase/resolve separately; do not close as stale | Product-master runtime gates are still an active domain if not merged. Latest main wins on conflicts except for exact product-master gate ownership. |
| `#68` | Superseded accounting duplicate / close | Close or label `superseded, accounting-duplicate` after maintainer confirmation | Accounting work is expected to be superseded by later accounting/reconciliation/commercial-lifecycle merges. Do not merge directly. |
| Other open PRs touching current domains | Needs review | Compare against latest main before merge | Any branch touching runtime, schema, payment, barcode, accounting, stock, reservations, privacy/session, or provider contracts must be reviewed against current main. |
| PRs with unresolved conflicts against latest main | Blocked / conflicted | Rebase from latest main and rerun validation | Never resolve conflicts by reverting newer main behavior. |
| Old duplicate branches without unique current-main changes | Do not merge | Close or recreate from latest main | Salvage only unique changes via fresh branch from latest main. |

## 2. Category ledger

### Active

- `#66` product-master runtime gates, if still open and not merged. Resolve/rebase separately; do not close unless GitHub proves the exact product-master runtime-gate scope was already superseded by a later accepted PR.

### Blocked / conflicted

- Any open branch with merge conflicts against current main.
- Any branch touching `drizzle/schema.ts` or migrations while another migration-heavy branch is active, unless explicitly coordinated.
- Any branch whose conflict resolution drops later merged behavior from PR `#73` or other newer main commits.

### Superseded / close

- `#44` superseded / close.
- `#46` superseded barcode duplicate / close.
- `#47` superseded barcode duplicate / close.
- `#62` superseded payment fail-closed duplicate / close because payment fail-closed already merged via later PR according to current control expectations.
- `#68` superseded accounting duplicate / close.

### Needs review

- Any open PR not listed above that changes runtime services, server routers, client runtime files, migrations, schema, payment, barcode, accounting, stock, reservation, security, provider, privacy, or deployment behavior.
- Any docs PR that changes readiness scores or launch claims must cite current-main evidence and must not claim production is 10/10.

### Do not merge

- Stale duplicate PRs listed as close candidates until manually confirmed and closed.
- Any branch that reintroduces fake validation, placeholder provider success, unsafe default store fallback, migration conflicts, or stale production-readiness claims.
- Any conflict-resolution PR that wins by reverting latest main instead of rebasing the older branch correctly.

## 3. Exact GitHub close / label instructions

Because this environment does not provide a remote or authenticated GitHub tooling, this PR does **not** close PRs directly. A maintainer should perform these GitHub-side actions after confirming live state:

1. Open each stale candidate: `#44`, `#46`, `#47`, `#62`, and `#68`.
2. Confirm it is still open and has not already been merged or closed.
3. Confirm there are no unique changes that must be salvaged.
4. Apply labels such as `superseded`, plus a domain label like `barcode-duplicate`, `payment-duplicate`, or `accounting-duplicate` where appropriate.
5. Comment: `Superseded by later current-main work. Do not merge directly; salvage unique changes via a fresh branch from latest main if needed.`
6. Close the PR.
7. For `#66`, do not close as stale. Rebase/resolve conflicts against latest main and rerun the required validation commands.

## 4. Current stale-PR rule

- Never merge stale duplicate branches.
- Recreate useful work from latest main instead of merging stale branch histories.
- Latest main wins unless the active branch owns the exact domain and its changes are deliberately being accepted.
