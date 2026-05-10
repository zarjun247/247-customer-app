# Stale PR Cleanup Plan

Conceptual stale/open PR cleanup plan as of 2026-05-10.

> Scope control: this document does not close PRs, does not edit code, and does not update existing status documents. It is a maintainer-facing plan for classifying stale PRs before any GitHub-side action.

## Audit basis and limitations

| Item | Status |
| --- | --- |
| Local branch inspected | `work` |
| Local HEAD inspected | `668e5fdc1201c0f69dfb323b138415e3cf3f46df` |
| Latest local merge context | Local history includes merged PRs through `#142` and prior hardening waves including migration surgery, production observability, DB proof governance, provider retry/refund proof, and Copilot deployment readiness. |
| Live GitHub open-state verification | Not available in this checkout: no configured git remote and `gh` is unavailable. |
| Cleanup posture | Treat all listed PRs as candidates for maintainer verification, not as commands to close. |

## Classification definitions

| Classification | Meaning | Default maintainer action |
| --- | --- | --- |
| Superseded | Later merged current-main work appears to cover the same domain. | Confirm live state, preserve discussion if needed, then close/label as superseded. |
| Rebuild from latest main | The idea may still be valid, but the branch should not merge directly. | Create a fresh branch from latest main and cherry-pick/reimplement only the proven missing behavior. |
| Close permanently | The branch is legacy/stale with no safe current-main value unless a maintainer proves otherwise. | Close after live confirmation; do not salvage code by default. |
| Useful idea but unsafe branch | The problem statement may still matter, but the branch likely carries stale assumptions, obsolete tests, or regressions. | Keep as reference only; rebuild the idea after current-main review. |
| Migration conflict risk | The PR likely touches schema or migrations and may collide with repaired migration numbering or later schema decisions. | Freeze; rebuild after migration preflight with a new reserved migration number. |

## PR cleanup ledger

| PR / group | Conceptual classification | Cleanup plan | Rationale |
| --- | --- | --- | --- |
| `#1`, `#2`, `#9`, `#10`, `#11`, `#19` | Close permanently | If any are still open, close after confirming no unique current-main requirement exists. | These are very old legacy PRs from before the current compliance, stock, payment, security, and migration hardening baseline. Direct merge risk is higher than salvage value. |
| `#44` | Superseded | Confirm it is still open, label/comment as superseded, then close. | Existing stale ledgers classify it as a stale duplicate, and much later lifecycle/security/payment/current-main work has merged. |
| `#46`, `#47` | Superseded | Close as barcode duplicates after confirming no unique scanner/label behavior remains unmerged. | Later barcode scan truth and rebuilt barcode production UX are already part of current history. |
| `#62` | Superseded | Close as payment duplicate after confirming live PR state. | Later payment fail-closed, verification, and webhook lifecycle hardening supersede the older branch. |
| `#66` | Superseded | Close the original PR if still open; do not merge the old branch. | Local history shows product-master runtime gates were rebuilt and merged through `#75`. |
| `#68` | Useful idea but unsafe branch | Do not merge raw. Close as superseded unless a maintainer identifies a specific missing accounting control to rebuild. | Accounting, journal batches, Tally export, reconciliation, refund ledger, invoice snapshots, and commercial lifecycle work have advanced substantially since this branch. |
| `#76`, `#80`, `#86` | Useful idea but unsafe branch | Freeze until live changed-files review. Rebuild only specific missing ideas from latest main. | These are not visible as merged locally and are older than many security, privacy, deployment, lifecycle, and observability merges. |
| `#88` | Migration conflict risk | Do not merge directly. Rebuild from latest main only after migration preflight. | Reservation lifecycle work is schema-sensitive and may conflict with current stock/order/reservation invariants and migration numbering. |
| `#89`, `#90` | Rebuild from latest main | Keep the best harness idea only after live diff review; rebuild tests from latest main if still useful. | MySQL concurrency proof work has since been consolidated and DB-backed proof governance has merged, so old harness branches may be duplicative or stale. |
| `#91` | Rebuild from latest main | If still relevant, salvage only schema-free observability/healthcheck ideas onto latest main. | Production observability and operational visibility have advanced through later merges, so direct merge is unsafe even if the idea remains useful. |
| `#94` | Migration conflict risk | Freeze and rebuild after migration sequencing is confirmed. | Pharmacy legal/compliance operations are likely persistence-heavy and must not reuse stale migration assumptions. |
| `#95` | Migration conflict risk | Freeze and rebuild from latest main if provider runtime enforcement still has missing requirements. | Provider runtime enforcement likely touches schema/runtime gates and must be sequenced behind current migration truth. |
| `#96` | Migration conflict risk | Freeze and rebuild only after confirming required persistence changes and migration number reservation. | Offline degradation/recovery can affect operational state, queues, and persistence; stale branch merge could conflict with current reliability work. |
| Any older barcode/payment/accounting/security/privacy duplicate not listed above | Superseded | Close after live confirmation unless a maintainer identifies a precise missing control. | Current main includes later domain-specific hardening; raw stale branches can revert safer behavior. |
| Any open PR touching `drizzle/schema.ts` or `drizzle/*.sql` | Migration conflict risk | Block raw merge, run migration preflight, then rebuild from latest main with reserved numbering. | Migration collision risk remains high for stale branches, especially those created before migration surgery and subsequent runtime hardening. |
| Any open PR with unresolved conflicts against latest main | Rebuild from latest main | Prefer a fresh branch over conflict resolution on the stale branch. | Latest main should win by default; conflict resolution must not silently revert newer compliance, stock, order, audit, security, or provider behavior. |

## Recommended cleanup order

1. **Verify live state first.** In GitHub, confirm whether each listed PR is still open, closed, or already merged.
2. **Close clear superseded/legacy PRs first.** Start with `#1`, `#2`, `#9`, `#10`, `#11`, `#19`, `#44`, `#46`, `#47`, `#62`, and the original `#66` if still open.
3. **Freeze migration-risk PRs.** Apply a `schema-freeze` or equivalent label/comment to `#88`, `#94`, `#95`, `#96`, and any PR touching `drizzle/schema.ts` or `drizzle/*.sql`.
4. **Triage unsafe-but-useful branches.** Review `#68`, `#76`, `#80`, `#86`, `#89`, `#90`, and `#91` only for ideas/tests, not for direct merge.
5. **Rebuild only from current main.** For any useful idea, create a new branch from latest main and reimplement the smallest safe slice.
6. **Validate before merge.** Require the current validation set for every rebuilt PR, including typecheck, tests, build, migration verification where applicable, and diff hygiene.

## Maintainer comment templates

### Superseded / close permanently

```text
Closing as superseded by later current-main work. Please do not merge this stale branch directly; it may revert newer compliance, stock, order, payment, security, migration, or observability hardening.
```

### Useful idea but unsafe branch

```text
Keeping this PR only as historical reference. The idea may be useful, but the branch is stale relative to current main. Rebuild the smallest required change from latest main instead of resolving this branch directly.
```

### Migration conflict risk

```text
Schema/migration freeze: do not merge this branch directly. Rebuild from latest main after migration preflight and use the next reserved migration number.
```

## Non-actions explicitly preserved

- No PRs were closed.
- No existing docs were edited.
- No code was changed.
- `CURRENT_MAIN_TRUTH.md`, `OPEN_BLOCKERS.md`, and `VALIDATION_COMMANDS.md` were not modified.
