# MERGE_GOVERNANCE_STATUS

Documentation-only CI and merge governance note for the current parallel production-hardening workstream.

## Purpose
- Reduce merge conflicts and production risk while many backend/domain branches are active.
- Ensure migration numbering, runtime ownership, and readiness claims are reviewed before merge.
- Require a final merge-captain pass after accepted PRs land.

## Parallel branch merge order

Recommended order for currently parallel branches, subject to maintainer review and CI status:

1. Branches with **no runtime/migration changes** and low conflict risk, such as documentation-only runbooks.
2. Cross-cutting safety foundations with broad downstream impact:
   - idempotency + invoice numbering race safety
   - payment provider fail-closed / non-payment provider fail-closed behavior
   - WhatsApp notification safety
   - product master runtime gates
3. Schema/statutory/data model branches, one at a time with migration review:
   - H1 statutory schema
   - prescription vault consent
   - refund ledger
   - accounting journal batches
   - immutable invoice snapshot
4. Domain workflows that depend on the above contracts:
   - supplier ageing/reconciliation
   - OCR invoice exception workflow
   - reports/audit reconciliation
   - Tally export proof
5. UI/admin/UX branches after API contracts stabilize:
   - admin route/cockpit UI
   - barcode UX rebased
6. Final merge-captain PR after all accepted PRs merge, rebased on latest `main`, with full CI and smoke/migration review.

If two PRs touch the same runtime modules, the later PR must rebase after the earlier accepted PR merges and repeat validation.

## Stale PR warning

- Do **not** merge stale PR #46 or PR #47 directly.
- Rebase/recreate stale work on latest protected `main`, review changed files, rerun CI, and re-check migrations before considering merge.

## Per-PR requirements

Every PR must include and reviewers must verify:

- [ ] CI green for the exact commit being merged.
- [ ] Migrations checked, including whether migrations were added or intentionally absent.
- [ ] No conflicting migration number and no reserved migration violation.
- [ ] Files changed reviewed against parallel ownership and do-not-touch lists.
- [ ] Runtime code ownership reviewed when touching shared services/routers/schema/client flows.
- [ ] Security/provider fail-closed posture reviewed for integrations.
- [ ] Rollback or forward-fix plan documented for schema/runtime risk.
- [ ] Tests added or explicitly not needed with rationale.
- [ ] Safe-to-merge assessment included without unsupported production-ready claims.

## Migration governance

- Only one migration-numbering branch should merge at a time unless maintainers explicitly coordinate renumbering.
- Migration files must match schema changes and migration metadata expectations.
- Reserved migration slots must be honored.
- Destructive migrations require explicit backup/restore and rollback review.
- Documentation-only branches must not add migrations.

## Final merge-captain PR

After all accepted PRs have merged:

- [ ] Create/rebase final merge-captain branch from latest protected `main`.
- [ ] Resolve integration conflicts across runtime, schema, docs, tests, and generated artifacts.
- [ ] Run full install/check/test/build validation.
- [ ] Review all migration numbers and final schema state.
- [ ] Run smoke tests against staging or restored staging data.
- [ ] Confirm monitoring, healthcheck, backup/restore, deployment, and go-live runbooks are current.
- [ ] Publish final safe-to-merge assessment with remaining risks.

## Merge-blocking examples

- CI red or missing for the merge commit.
- Duplicate/conflicting migration number.
- PR touches prohibited files without explicit scope approval.
- Provider failure path can fake success for critical flows.
- Store-scoped operation falls back to an unsafe default store.
- Production-ready claim is made without evidence.
